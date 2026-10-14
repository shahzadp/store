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
  let loadError = null;

  /* ----------------------------------------------------------- loading */

  function loadEngine(onProgress) {
    if (enginePromise) return enginePromise;

    enginePromise = (async () => {
      if (onProgress) onProgress('Loading engine');
      const mod = await import(TERNLIGHT_ENGINE);

      // The default export is wasm-bindgen's init(): it fetches and
      // instantiates tern_engine_bg.wasm (~10 MB raw, ~7 MB gzipped).
      if (onProgress) onProgress('Downloading engine (~7 MB)');
      await mod.default();

      engine = mod;
      if (onProgress) onProgress(null);
      return mod;
    })().catch((err) => {
      loadError = err;
      enginePromise = null;
      throw err;
    });

    return enginePromise;
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
   */
  async function rank(query, onProgress) {
    const products = Catalog.listProducts();
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (loadError) return [];
    if (!Catalog.indexIsComplete()) return [];

    try {
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
    } catch (err) {
      console.warn('Semantic search unavailable:', err);
      loadError = err;
      return [];
    }
  }

  return { rank, embed, isModelLoaded, loadEngine };
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
                <span class="search__bar" aria-hidden="true"><span style="width:${strength}%"></span></span>
              </span>
            </a>
          </li>`;
      })
      .join('');

    setStatus(`${rows.length} match${rows.length === 1 ? '' : 'es'} by meaning.`);
  }

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
      setStatus(message);
    };

    try {
      const rows = await Search.rank(query, onProgress);
      if (ticket !== sequence || queued) return;
      render(rows);
    } catch (err) {
      if (ticket === sequence) {
        results.innerHTML = '<li class="search__empty">Search unavailable.</li>';
        setStatus('The model could not be loaded.');
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
