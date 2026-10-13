/* ==========================================================================
   Search
   Two modes:

   Text (default) — instant, no download. Matches against product
   name, category and description.

   Semantic (opt-in) — embeds the query with paraphrase-albert-small-v2
   running in the browser (ONNX via Transformers.js), then ranks by
   cosine similarity against precomputed vectors stored in SQLite.

   The model is ~42 MB (768-dim) — the smallest retrieval-trained
   embedding model that runs in browser WASM. It is never loaded
   until the visitor explicitly asks for semantic search, and it is
   then cached in IndexedDB — so the cost is once per browser, not
   per search. (bekko-embedding-v1-a8m is the multilingual
   alternative: 124 MB but covers 100+ languages; ALBERT-small is
   English-only.)
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

      // WASM is the safe denominator: WebGPU ONNX support is spotty
      // across browsers, and the model is small enough that WASM is fine.
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

  /** Cosine similarity. Both sides are already L2-normalised. */
  function similarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  /** Plain substring ranking. Always available, always instant. */
  function keywordRank(products, query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return products
      .map((product) => {
        const haystack = `${product.name} ${product.category} ${product.description || ''}`.toLowerCase();
        const score = terms.reduce(
          (total, term) => (haystack.includes(term) ? total + 1 : total),
          0,
        );
        return { product, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * mode: 'keyword' (default, instant) or 'semantic' (loads the model).
   * Returns rows of { product, score, mode, reason? }.
   */
  async function rank(query, mode = 'keyword', onProgress) {
    const products = Catalog.listProducts();
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (mode === 'keyword') {
      return keywordRank(products, trimmed).map((row) => ({ ...row, mode: 'keyword' }));
    }

    // Semantic was requested but the published index is missing or was
    // built with a different model — search against noise is worse than
    // an honest text match.
    if (loadError) {
      return keywordRank(products, trimmed).map((row) => ({ ...row, mode: 'keyword', reason: 'model-failed' }));
    }
    if (!Catalog.indexIsComplete()) {
      return keywordRank(products, trimmed).map((row) => ({ ...row, mode: 'keyword', reason: 'no-index' }));
    }

    try {
      const [queryVector] = await embed([trimmed], onProgress);
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
      return keywordRank(products, trimmed).map((row) => ({ ...row, mode: 'keyword', reason: 'model-failed' }));
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
  const toggle = document.getElementById('search-semantic');

  let lastQuery = '';
  let sequence = 0;
  let semanticWanted = false;
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

    // Raw cosine on short text is not a calibrated confidence score, so it is
    // shown as a bar relative to the best hit rather than a percentage.
    const floor = Math.min(...rows.map((r) => r.score));
    const top = rows[0].score || 1;
    const span = top - floor || 1;

    results.innerHTML = rows
      .slice(0, 8)
      .map(({ product, score, mode, reason }, index) => {
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

    const first = rows[0];
    if (first.mode === 'keyword') {
      setStatus(
        first.reason === 'no-index'
          ? 'Text matches — the semantic index is not published yet.'
          : first.reason === 'model-failed'
            ? 'Text matches — the embedding model could not be loaded.'
            : `${rows.length} text match${rows.length === 1 ? '' : 'es'}.`,
      );
    } else {
      setStatus(`${rows.length} match${rows.length === 1 ? '' : 'es'} by meaning.`);
    }
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

    // Text mode is the default and never touches the model.
    if (!semanticWanted) {
      render(await Search.rank(query, 'keyword'));
      return;
    }

    // Semantic mode: load the model on demand, with visible progress.
    if (loading) return; // a load is already in flight; its result will re-render
    loading = true;
    toggle.classList.add('search__semantic--loading');

    const onProgress = (file, loaded, total) => {
      if (ticket !== sequence) return;
      const pct = total ? Math.round((loaded / total) * 100) : 0;
      setStatus(Search.isModelLoaded() ? 'Embedding…' : `Loading model — ${pct}%`);
    };

    try {
      const rows = await Search.rank(query, 'semantic', onProgress);
      if (ticket !== sequence) return;
      render(rows);
    } catch (err) {
      if (ticket === sequence) {
        render(await Search.rank(query, 'keyword'));
        setStatus('Text matches — the embedding model could not be loaded.');
      }
    } finally {
      loading = false;
      toggle.classList.remove('search__semantic--loading');
      toggle.setAttribute('aria-pressed', String(semanticWanted));
    }
  }

  function toggleSemantic() {
    semanticWanted = !semanticWanted;
    toggle.setAttribute('aria-pressed', String(semanticWanted));

    if (semanticWanted && !Search.isModelLoaded()) {
      setStatus('Semantic search on — the model downloads once, then is cached.');
    }
    if (lastQuery) run();
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

  if (toggle) {
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', toggleSemantic);
  }

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
