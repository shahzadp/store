/* ==========================================================================
   Search
   SPLADE-tiny — a sparse lexical expansion model. Product vectors are
   precomputed in the admin panel and shipped in catalog.sql; visitors
   only embed their own query. Ranks by dot product against the
   precomputed vectors.
   ========================================================================== */

// jsDelivr's `+esm` build is used rather than `dist/transformers.web.js`:
// the raw dist file imports "onnxruntime-web" as a bare specifier, which a
// browser cannot resolve. `+esm` rewrites those to CDN URLs.
const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm';

const Search = (() => {
  let extractorPromise = null;
  let extractor = null;
  let loadError = null;

  /* ----------------------------------------------------------- loading */

  function loadExtractor(onProgress) {
    if (extractorPromise) return extractorPromise;

    extractorPromise = (async () => {
      const { pipeline, env } = await import(TRANSFORMERS_CDN);

      env.allowLocalModels = false;
      env.useBrowserCache = true;

      extractor = await pipeline('feature-extraction', Catalog.SEARCH_MODEL, {
        dtype: 'fp32',
        device: 'wasm',
        progress_callback: (info) => {
          if (onProgress && info && info.status === 'progress' && info.file) {
            onProgress(info.file, info.loaded, info.total);
          }
        },
      });

      return extractor;
    })().catch((err) => {
      loadError = err;
      extractorPromise = null;
      throw err;
    });

    return extractorPromise;
  }

  function isModelLoaded() {
    return Boolean(extractor);
  }

  /* --------------------------------------------------------- embeddings */

  async function embed(texts, onProgress) {
    const pipe = await loadExtractor(onProgress);

    const out = [];
    const batchSize = 8;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const tensor = await pipe(batch, { pooling: 'mean', normalize: true });
      const [rows, dims] = tensor.dims;
      const data = tensor.data;

      for (let r = 0; r < rows; r++) {
        out.push(new Float32Array(data.slice(r * dims, (r + 1) * dims)));
      }

      if (onProgress) onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }

    return out;
  }

  /* ------------------------------------------------------------ ranking */

  /** Dot product. SPLADE vectors are sparse and non-negative. */
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

  return { rank, embed, isModelLoaded, loadExtractor };
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

    const ticket = ++sequence;

    if (loading) return;
    loading = true;

    const onProgress = (file, loaded, total) => {
      if (ticket !== sequence) return;
      const pct = total ? Math.round((loaded / total) * 100) : 0;
      setStatus(Search.isModelLoaded() ? 'Embedding…' : `Loading model — ${pct}%`);
    };

    try {
      const rows = await Search.rank(query, onProgress);
      if (ticket !== sequence) return;
      render(rows);
    } catch (err) {
      if (ticket === sequence) {
        results.innerHTML = '<li class="search__empty">Search unavailable.</li>';
        setStatus('The model could not be loaded.');
      }
    } finally {
      loading = false;
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
