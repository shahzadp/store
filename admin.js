/* ==========================================================================
   Alex Store — catalog admin
   Edits a local SQLite copy (db.js) and exports catalog.sql to publish.
   ========================================================================== */

const TINTS = ['#D9CCEA', '#E8DDF2', '#CFC3E3', '#E3D6EE'];

const $ = (sel) => document.querySelector(sel);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** The store trades in PKR only. */
function formatPrice(paisa) {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 2,
    }).format(paisa / 100);
  } catch {
    return `Rs ${(paisa / 100).toFixed(2)}`;
  }
}

/** "7800.00" / "Rs 7,800" / "7800" -> 780000. Returns null when unparseable. */
function parsePriceToCents(input) {
  const cleaned = String(input).replace(/[^0-9.]/g, '');
  if (!cleaned || (cleaned.match(/\./g) || []).length > 1) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function status(message, kind = '') {
  const el = $('#status');
  el.textContent = message;
  el.className = `status ${kind}`;
}

/* ---------------------------------------------------------------- listing */

function renderList(products) {
  const list = $('#product-list');

  if (!products.length) {
    list.innerHTML = '<p class="muted">No products yet. Add the first one above.</p>';
    return;
  }

  list.innerHTML = products
    .map((p) => {
      const price = formatPrice(p.price_cents);
      const thumb = p.image_url
        ? `<img class="row__thumb" src="${escapeHtml(p.image_url)}" alt="">`
        : `<div class="row__thumb" style="background:${escapeHtml(p.tint || '#D9CCEA')}"></div>`;
      const badge = p.in_stock
        ? '<span class="badge">In stock</span>'
        : '<span class="badge badge--out">Sold out</span>';

      return `
        <div class="row" data-id="${p.id}">
          ${thumb}
          <div class="row__main">
            <div class="row__name">${escapeHtml(p.name)}</div>
            ${p.description ? `<div class="row__desc">${escapeHtml(p.description)}</div>` : ''}
            <div class="row__meta">${escapeHtml(p.category)} · ${escapeHtml(price)} · sort ${p.sort_order} · /${escapeHtml(p.slug)}</div>
          </div>
          ${badge}
          <div class="row__actions">
            <button class="btn btn-ghost" type="button" data-edit="${p.id}">Edit</button>
            <button class="btn btn-danger" type="button" data-delete="${p.id}">Delete</button>
          </div>
        </div>`;
    })
    .join('');
}

function refresh() {
  renderList(Catalog.listProducts());
  updateDraftNote();
}

function updateDraftNote() {
  const note = $('#draft-note');
  if (Catalog.hasDraft()) {
    note.textContent = 'You have unpublished local edits.';
    note.className = 'draft-note draft-note--active';
  } else {
    note.textContent = 'In sync with the published catalog.';
    note.className = 'draft-note';
  }
}

/* ------------------------------------------------------------------ form */

function resetForm() {
  $('#product-form').reset();
  $('#f-id').value = '';
  $('#f-stock').checked = true;
  $('#form-title').textContent = 'Add a product';
  $('#submit-btn').textContent = 'Add product';
  $('#cancel-btn').hidden = true;
  highlightTint('');
}

$('#product-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const priceCents = parsePriceToCents($('#f-price').value);
  if (priceCents === null) {
    status('Price must be a number like 7800.00', 'err');
    return;
  }

  const payload = {
    name: $('#f-name').value,
    description: $('#f-description').value,
    category: $('#f-category').value,
    price_cents: priceCents,
    slug: $('#f-slug').value,
    image_url: $('#f-image').value,
    tint: $('#f-tint').value,
    in_stock: $('#f-stock').checked,
    sort_order: Number($('#f-sort').value) || 0,
  };

  const id = $('#f-id').value;
  const result = id ? Catalog.updateProduct(Number(id), payload) : Catalog.createProduct(payload);

  if (!result.ok) {
    status(Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join('; '), 'err');
    return;
  }

  status(id ? 'Saved' : 'Product added', 'ok');
  resetForm();
  refresh();
});

$('#cancel-btn').addEventListener('click', resetForm);

/* ------------------------------------------------------------ collections */

function renderCollections() {
  const list = document.getElementById('collection-list');
  const items = Catalog.listCollections();

  if (!items.length) {
    list.innerHTML = '<p class="muted">No collections yet. Add the first one above.</p>';
    return;
  }

  list.innerHTML = items
    .map((c) => {
      const thumb = c.image_url
        ? `<img class="row__thumb" src="${escapeHtml(c.image_url)}" alt="">`
        : `<div class="row__thumb" style="background:${escapeHtml(c.tint || '#D9CCEA')}"></div>`;
      return `
        <div class="row" data-cid="${c.id}">
          ${thumb}
          <div class="row__main">
            <div class="row__name">${escapeHtml(c.title)}</div>
            <div class="row__meta">sort ${c.sort_order} · /${escapeHtml(c.slug)}</div>
          </div>
          <div class="row__actions">
            <button class="btn btn-ghost" type="button" data-cedit="${c.id}">Edit</button>
            <button class="btn btn-danger" type="button" data-cdelete="${c.id}">Delete</button>
          </div>
        </div>`;
    })
    .join('');
}

function resetCollectionForm() {
  $('#collection-form').reset();
  $('#c-id').value = '';
  $('#c-title').textContent = 'Add a collection';
  $('#c-submit').textContent = 'Add collection';
  $('#c-cancel').hidden = true;
  highlightTint('');
}

$('#collection-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const payload = {
    title: $('#c-title-field').value,
    description: $('#c-description').value,
    slug: $('#c-slug').value,
    image_url: $('#c-image').value,
    tint: $('#c-tint').value,
    sort_order: Number($('#c-sort').value) || 0,
  };

  const id = $('#c-id').value;
  const result = id
    ? Catalog.updateCollection(Number(id), payload)
    : Catalog.createCollection(payload);

  if (!result.ok) {
    status(Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join('; '), 'err');
    return;
  }

  status(id ? 'Collection saved' : 'Collection added', 'ok');
  resetCollectionForm();
  renderCollections();
  updateDraftNote();
});

$('#c-cancel').addEventListener('click', resetCollectionForm);

$('#collection-list').addEventListener('click', (event) => {
  const editId = event.target.dataset.cedit;
  const deleteId = event.target.dataset.cdelete;
  if (!editId && !deleteId) return;

  const id = Number(editId || deleteId);

  if (deleteId) {
    const title = event.target.closest('.row').querySelector('.row__name').textContent;
    if (!confirm(`Delete "${title}"? This only affects your local copy until you publish.`)) return;
    Catalog.deleteCollection(id);
    status('Deleted', 'ok');
    renderCollections();
    updateDraftNote();
    return;
  }

  const collection = Catalog.listCollections().find((c) => c.id === id);
  if (!collection) return;

  $('#c-id').value = collection.id;
  $('#c-title-field').value = collection.title;
  $('#c-description').value = collection.description || '';
  $('#c-slug').value = collection.slug;
  $('#c-image').value = collection.image_url || '';
  $('#c-tint').value = collection.tint || '';
  $('#c-sort').value = collection.sort_order;

  $('#c-title').textContent = `Edit "${collection.title}"`;
  $('#c-submit').textContent = 'Save changes';
  $('#c-cancel').hidden = false;
  highlightTint(collection.tint);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* -------------------------------------------------------- product list ops */

$('#product-list').addEventListener('click', (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (!editId && !deleteId) return;

  const id = Number(editId || deleteId);

  if (deleteId) {
    const name = event.target.closest('.row').querySelector('.row__name').textContent;
    if (!confirm(`Delete "${name}"? This only affects your local copy until you publish.`)) return;
    Catalog.deleteProduct(id);
    status('Deleted', 'ok');
    refresh();
    return;
  }

  const product = Catalog.listProducts().find((p) => p.id === id);
  if (!product) return;

  $('#f-id').value = product.id;
  $('#f-name').value = product.name;
  $('#f-description').value = product.description || '';
  $('#f-category').value = product.category;
  $('#f-price').value = (product.price_cents / 100).toFixed(2);
  $('#f-slug').value = product.slug;
  $('#f-sort').value = product.sort_order;
  $('#f-image').value = product.image_url || '';
  $('#f-tint').value = product.tint || '';
  $('#f-stock').checked = Boolean(product.in_stock);

  $('#form-title').textContent = `Edit "${product.name}"`;
  $('#submit-btn').textContent = 'Save changes';
  $('#cancel-btn').hidden = false;
  highlightTint(product.tint);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* -------------------------------------------------------------- settings */

$('#save-settings').addEventListener('click', () => {
  Catalog.setSetting('store_name', $('#s-name').value.trim() || 'Alex Store');
  Catalog.setSetting('whatsapp', $('#s-wa').value.replace(/[^0-9]/g, ''));
  status('Details saved locally', 'ok');
  updateDraftNote();
});

/* --------------------------------------------------------------- publish */

$('#export').addEventListener('click', () => {
  const blob = new Blob([Catalog.toSql()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'catalog.sql';
  link.click();
  URL.revokeObjectURL(url);
  status('Downloaded catalog.sql — replace the repo copy and push', 'ok');
});

$('#discard').addEventListener('click', async () => {
  if (!confirm('Discard local edits and reload the published catalog?')) return;
  Catalog.clearDraft();
  status('Reloading…');
  window.location.reload();
});

/* --------------------------------------------------------------- swatches */

function fillSwatches(boxId) {
  const box = document.getElementById(boxId);
  box.innerHTML = TINTS.map(
    (tint) =>
      `<button class="swatch" type="button" data-tint="${tint}" style="background:${tint}" aria-pressed="false" aria-label="Use ${tint}"></button>`,
  ).join('');

  box.addEventListener('click', (event) => {
    const tint = event.target.dataset.tint;
    if (!tint) return;
    const input = box.dataset.target;
    document.getElementById(input).value =
      document.getElementById(input).value === tint ? '' : tint;
    highlightTint(document.getElementById(input).value);
  });
}

function highlightTint(value) {
  document.querySelectorAll('.swatch').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.tint === value));
  });
}

fillSwatches('swatches');
fillSwatches('c-swatches');

/* ------------------------------------------------------- search index */

function indexNote() {
  const note = $('#index-note');
  const count = Catalog.listProducts().length;

  if (Catalog.indexIsComplete()) {
    note.textContent = `Index is current — ${count} products embedded. Download catalog.sql to publish it.`;
    note.className = 'draft-note';
  } else {
    note.textContent = `No current index — ${count} products need embedding before semantic search can run.`;
    note.className = 'draft-note draft-note--active';
  }
}

$('#build-index').addEventListener('click', async () => {
  const button = $('#build-index');
  const out = $('#index-status');
  const products = Catalog.listProducts();

  if (!products.length) {
    out.textContent = 'No products to index.';
    out.className = 'status err';
    return;
  }

  button.disabled = true;
  out.className = 'status';

  // Name and description are what a shopper would search by; category gives
  // the model a little more context to match against.
  const texts = products.map(
    (p) => `${p.name}. ${p.category}. ${p.description || ''}`.trim(),
  );

  try {
    out.textContent = 'Loading model (~130 MB, one time)…';
    const vectors = await Search.embed(texts, (done, total) => {
      out.textContent = `Embedding ${done}/${total}…`;
    });

    Catalog.replaceVectors(
      products.map((p, i) => ({ slug: p.slug, vector: vectors[i] })),
    );

    out.textContent = `Indexed ${products.length} products.`;
    out.className = 'status ok';
    indexNote();
    updateDraftNote();
  } catch (err) {
    console.error(err);
    out.textContent = `Could not build index: ${err.message}`;
    out.className = 'status err';
  } finally {
    button.disabled = false;
  }
});

$('#refresh').addEventListener('click', () => {
  refresh();
  renderCollections();
  indexNote();
});

/* ------------------------------------------------------------------- boot */

(async function init() {
  status('Loading catalog…');
  try {
    await Catalog.init();
    $('#s-name').value = Catalog.getSetting('store_name') || 'Alex Store';
    $('#s-wa').value = Catalog.getSetting('whatsapp') || '';
    refresh();
    renderCollections();
    indexNote();
    status(Catalog.hasDraft() ? 'Loaded local draft' : 'Loaded published catalog', 'ok');
  } catch (err) {
    status(`Could not load: ${err.message}`, 'err');
    $('#product-list').innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
})();