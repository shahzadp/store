/* ==========================================================================
   Search
   ternlight — a 1.58-bit BitNet-style sentence encoder distilled from
   all-MiniLM-L6-v2. Model, tokenizer and inference engine live in one
   WebAssembly module, so there is nothing to fetch beyond that single
   `.wasm`. Product vectors are precomputed in the admin panel and shipped
   in catalog.sql; visitors only embed their own query and rank it by dot
   product against those vectors.
   ========================================================================== */

// The `pkg-web` build is used rather than the package's default entry:
// that one wraps the bundler target, which imports the `.wasm` as an ESM
// asset and needs Vite/webpack to resolve. `pkg-web` fetches the sibling
// `tern_engine_bg.wasm` relative to `import.meta.url`, so a plain
// `<script type="module">` on a static host can load it with no build step.
const TERNLIGHT_ENGINE =
  'https://cdn.jsdelivr.net/npm/@ternlight/base@0.1.1/pkg-web/tern_engine.js';

const Search = (() => {
  let enginePromise = null;
  let engine = null;

  // A ~10 MB download that gets interrupted — routine on mobile — must not
  // kill search for the rest of the page session. Count consecutive failures
  // so a genuine outage stops retrying, and let an explicit retry reset it.
  let failures = 0;
  const MAX_FAILURES = 3;

  /* ----------------------------------------------------------- loading */

  function loadEngine(onProgress) {
    if (enginePromise) return enginePromise;
    if (failures >= MAX_FAILURES) {
      return Promise.reject(new Error('Model download failed repeatedly'));
    }

    enginePromise = (async () => {
      if (onProgress) onProgress('Loading model…');
      const mod = await import(TERNLIGHT_ENGINE);

      // The default export is wasm-bindgen's init(): it fetches and
      // instantiates tern_engine_bg.wasm, which carries the model weights
      // and the tokenizer (~10 MB raw, ~7 MB gzipped).
      if (onProgress) onProgress('Downloading model (~7 MB) — first search only');
      await mod.default();

      engine = mod;
      failures = 0;
      if (onProgress) onProgress(null);
      return mod;
    })().catch((err) => {
      failures++;
      // Drop the memo so the next attempt starts a genuinely fresh download
      // rather than re-awaiting a promise that has already rejected.
      enginePromise = null;
      throw err;
    });

    return enginePromise;
  }

  /** Clear the failure count so the next search retries from scratch. */
  function resetFailures() {
    failures = 0;
  }

  function isModelLoaded() {
    return Boolean(engine);
  }

  /* --------------------------------------------------------- embeddings */

  /**
   * ternlight's `embed()` is synchronous once the engine is up and returns
   * a 384-dim L2-normalised Float32Array, so there is nothing to pool or
   * normalise on this side. Text is capped at 128 tokens (~95 words)
   * inside the engine; product blurbs are well under that.
   */
  async function embed(texts, onProgress) {
    const mod = await loadEngine(onProgress);

    const out = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(mod.embed(texts[i]));
      if (onProgress) onProgress(null);
    }

    return out;
  }

  /* ------------------------------------------------------------ ranking */

  /**
   * IDF over the indexed documents, one weight per vocabulary slot.
   /**
   * Cosine similarity. ternlight embeddings are already L2-normalised, so
   * this is just a dot product — no sqrt, no division.
   */
  function similarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  /**
   * Semantic ranking. Returns rows of { product, score }.
   *
   * Engine load failures are deliberately NOT swallowed — the dialog retries
   * them. Swallowing used to strand the visitor behind a dead search box.
   */
  async function rank(query, onProgress) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Wait for the catalog. On a cold cache the visitor can open search
    // before sql.js and catalog.sql have finished loading, and querying the
    // database before then throws — that used to surface as "The model could
    // not be loaded", even though nothing was wrong with the model. Bounded
    // so a catalog that never arrives cannot leave this hanging.
    for (let i = 0; i < 60; i++) {
      if (Catalog.isReady()) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!Catalog.isReady()) return [];
    if (!Catalog.indexIsComplete()) return [];

    const products = Catalog.listProducts();
    const [queryVector] = await embed([trimmed], onProgress);
    const index = Catalog.getVectors();

    return products
      .map((product) => {
        const entry = index.get(product.slug);
        if (!entry || entry.vector.length !== queryVector.length) return null;
        return { product, score: similarity(queryVector, entry.vector) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Warm the engine on an idle callback so the first search doesn't sit on
   * a ~10 MB download. Deferred rather than immediate: it must not compete
   * with the page's own resources, and visitors who never search should not
   * pay for it. Skipped when the browser asks for data saving, when
   * offline, and when no search index is published — there is nothing to
   * rank against without one.
   *
   * Racing this against `run()` is safe: both go through `loadEngine`, which
   * memoises the in-flight promise, so whoever starts second just awaits the
   * same download.
   */
  async function prefetch() {
    const connection = navigator.connection;
    if (connection && connection.saveData) return;
    if (!navigator.onLine) return;

    // Wait for the catalog. prefetch() is called at module scope, so an idle
    // callback can easily fire before Catalog.init() has resolved — asking
    // indexIsComplete() then throws on an unopened database. Bounded so a
    // catalog that never loads cannot spin here.
    for (let i = 0; i < 40; i++) {
      if (Catalog.isReady()) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (!Catalog.isReady()) return;

    const warm = () => {
      // Nothing to rank against without a published index, so don't spend
      // ~10 MB on a storefront that has no products indexed yet.
      if (!Catalog.indexIsComplete()) return;

      loadEngine().catch(() => {
        // Best-effort. If this fails, the first real search retries and
        // surfaces the error in the dialog where the user can see it.
      });
    };

    // Deferred so the download never competes with the page's own work.
    if (typeof requestIdleCallback !== 'function') warm();
    else requestIdleCallback(warm, { timeout: 4000 });
  }

  return { rank, embed, isModelLoaded, loadEngine, prefetch, resetFailures };
})();

/* ==========================================================================
   Search dialog
   ========================================================================== */

const SEARCH_SHORTCUT = 'k';

function searchDialog() {
  const dialog = document.getElementById('search-dialog');
  if (!dialog) return;

  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  const form = document.getElementById('search-form');

  let lastQuery = '';
  let sequence = 0;
  let loading = false;
  let queued = false;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `search__status ${kind}`;
  }

  function render(rows) {
    if (!rows.length) {
      results.innerHTML = '<li class="search__empty">No matches.</li>';
      setStatus('');
      return;
    }

    const floor = Math.min(...rows.map((r) => r.score));
    const top = rows[0].score || 1;
    const span = top - floor || 1;

    results.innerHTML = rows
      .slice(0, 8)
      .map(({ product, score }, index) => {
        const price = Store.formatPrice(product.price_cents);
        const strength = Math.round(((score - floor) / span) * 100);
        const meta = index === 0 ? 'best match' : '';

        return `
          <li class="search__row">
            <a class="search__hit" href="./shop.html?q=${encodeURIComponent(product.name)}">
              <span class="search__thumb" style="background:${Store.escapeHtml(product.tint || '#D9CCEA')}"></span>
              <span class="search__body">
                <span class="search__name">${Store.escapeHtml(product.name)}</span>
                <span class="search__cat">${Store.escapeHtml(product.category)} · ${Store.escapeHtml(price)}</span>
              </span>
              <span class="search__score">
                ${meta ? `<span class="search__best">${meta}</span>` : ''}
                <span class="search__meter" aria-hidden="true"><span style="width:${strength}%"></span></span>
              </span>
            </a>
          </li>`;
      })
      .join('');

    setStatus(`${rows.length} match${rows.length === 1 ? '' : 'es'} by meaning.`);
  }

  /**
   * First search on a cold cache spends real time downloading the engine —
   * measured at ~160 s on a slow link — so the results area must say so
   * rather than sitting empty and looking broken. The engine reports no
   * progress events, so this is an indeterminate indicator.
   */
  function renderLoading(message) {
    results.innerHTML = `
      <li class="search__loading" role="status" aria-live="polite">
        <span class="search__spinner" aria-hidden="true"></span>
        <span class="search__loading-text">${Store.escapeHtml(message)}</span>
      </li>`;
  }

  /** Terminal state: retry by hand, so nobody has to close and reopen. */
  function renderRetry() {
    results.innerHTML = `
      <li class="search__retry">
        <span>Could not reach the model. Check your connection and try again.</span>
        <button class="search__retry-btn" type="button" id="search-retry">Try again</button>
      </li>`;

    document.getElementById('search-retry').addEventListener('click', () => {
      Search.resetFailures();
      run();
    });
  }

  // A dropped 10 MB download is common on mobile and usually clears on the
  // next attempt, so retry a couple of times automatically rather than
  // showing a message the visitor has to dismiss and start again.
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY = 1200;

  async function run() {
    const query = input.value.trim();
    lastQuery = query;

    if (!query) {
      results.innerHTML = '';
      setStatus('');
      return;
    }

    // A request landing mid-search must not bump `sequence`: that would
    // invalidate the in-flight run while `loading` blocks this one from
    // starting, so nothing would ever render — which is exactly what
    // happens if the visitor keeps typing while the model downloads.
    // Queue it instead; the in-flight run hands over below.
    if (loading) {
      queued = true;
      return;
    }

    const ticket = ++sequence;
    loading = true;

    const onProgress = (message) => {
      if (ticket !== sequence || !message) return;
      renderLoading(message);
      setStatus('');
    };

    try {
      for (let attempt = 0; ; attempt++) {
        // Shown immediately, before the engine is even asked for.
        if (!Search.isModelLoaded()) {
          renderLoading(
            attempt
              ? 'Connection lost — downloading the model again…'
              : 'Loading model… this happens once per browser',
          );
          setStatus('');
        }

        try {
          const rows = await Search.rank(query, onProgress);
          if (ticket !== sequence || queued) return;
          render(rows);
          return;
        } catch (err) {
          console.warn('Search attempt failed:', err);
          if (ticket !== sequence) return;
          if (attempt < MAX_ATTEMPTS - 1) {
            // Clear the backstop so this retry really re-downloads.
            Search.resetFailures();
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          renderRetry();
          return;
        }
      }
    } finally {
      loading = false;
      if (queued) {
        queued = false;
        run();
      }
    }
  }

  function open() {
    dialog.removeAttribute('hidden');
    document.body.classList.add('search-open');
    input.focus();
    input.select();
    if (lastQuery) run();
  }

  function close() {
    dialog.setAttribute('hidden', '');
    document.body.classList.remove('search-open');
    document.querySelector('[data-search-open]')?.focus();
  }

  document.querySelectorAll('[data-search-open]').forEach((button) => {
    button.addEventListener('click', open);
  });

  document.querySelectorAll('[data-search-close]').forEach((button) => {
    button.addEventListener('click', close);
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run();
  });

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 220);
  });

  document.addEventListener('keydown', (event) => {
    const isOpen = !dialog.hasAttribute('hidden');

    if ((event.key === SEARCH_SHORTCUT || event.key.toUpperCase() === SEARCH_SHORTCUT) &&
        (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      isOpen ? close() : open();
      return;
    }

    if (event.key === 'Escape' && isOpen) close();
  });
}
