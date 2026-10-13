/* ==========================================================================
   Semantic search
   Embeds the query with bekko-embedding-v1-a8m running entirely in the
   browser (ONNX via Transformers.js), then ranks products by cosine
   similarity against precomputed vectors stored in SQLite.

   The model is ~130 MB, so it is NOT loaded until the visitor actually runs
   a search. Everything else on the page loads without it. If the model
   cannot be loaded at all, search silently falls back to keyword matching so
   the feature is never a dead end.
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

  function loadExtractor() {
    if (extractorPromise) return extractorPromise;

    extractorPromise = (async () => {
      const { pipeline, env } = await import(TRANSFORMERS_CDN);

      env.allowLocalModels = false;
      env.useBrowserCache = true;

      extractor = await pipeline('feature-extraction', Catalog.SEARCH_MODEL, {
        dtype: 'fp32',
        device: 'wasm',
      });

      return extractor;
    })().catch((err) => {
      // Remember the failure so we do not retry a 130 MB download on every keystroke.
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
    const pipe = await loadExtractor();

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

  /** Cosine similarity. Both sides are already L2-normalised. */
  function similarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  /** Plain substring ranking, used when the model is unavailable. */
  function keywordRank(products, query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return products
      .map((product) => {
        const haystack = `${product.name} ${product.category} ${product.description || ''}`.toLowerCase();
        const score = terms.reduce((total, term) => (haystack.includes(term) ? total + 1 : total), 0);
        return { product, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  async function rank(query) {
    const products = Catalog.listProducts();
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Distinguish "nobody has built the index yet" from "the model failed to
    // load" — the fix is different, so the message should be too.
    const fallback = (reason) =>
      keywordRank(products, trimmed).map((row) => ({ ...row, mode: 'keyword', reason }));

    if (loadError) return fallback('model-failed');
    if (!Catalog.indexIsComplete()) return fallback('no-index');

    try {
      const [queryVector] = await embed([trimmed]);
      const index = Catalog.getVectors();

      return products
        .map((product) => {
          const entry = index.get(product.slug);
          if (!entry || entry.vector.length !== queryVector.length) return null;
          return { product, score: similarity(queryVector, entry.vector), mode: 'semantic' };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn('Semantic search unavailable, using keyword match:', err);
      loadError = err;
      return fallback('model-failed');
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

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `search__status ${kind}`;
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

    // Warm the model on the very first query so the wait is explained up front.
    setStatus(Search.isModelLoaded() ? 'Searching…' : 'Loading search model (~130 MB, one time)…');

    const rows = await Search.rank(query);

    // A slower earlier keystroke must not overwrite a newer result.
    if (ticket !== sequence) return;

    if (!rows.length) {
      results.innerHTML = '<li class="search__empty">No matches.</li>';
      setStatus('', '');
      return;
    }

    // Raw cosine on short text is not a calibrated confidence score, so it is
    // shown as a bar relative to the best hit rather than a percentage.
    const top = rows[0].score || 1;
    const floor = Math.min(...rows.map((r) => r.score));
    const span = top - floor || 1;

    results.innerHTML = rows
      .slice(0, 8)
      .map(({ product, score, mode }, index) => {
        const price = Store.formatPrice(product.price_cents);
        const strength = mode === 'keyword' ? 100 : Math.round(((score - floor) / span) * 100);
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

    const mode = rows[0].mode;
    if (mode === 'keyword') {
      setStatus(
        rows[0].reason === 'no-index'
          ? 'Showing text matches — the search index has not been published yet.'
          : 'Showing text matches — the embedding model could not be loaded.',
      );
    } else {
      setStatus(`${rows.length} match${rows.length === 1 ? '' : 'es'} by meaning.`);
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