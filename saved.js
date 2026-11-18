/* ==========================================================================
   Alex Store — Saved page
   The saved list lives in this browser (localStorage); this page renders the
   matching products. Removing via the heart on a card re-renders the page so
   the grid and the count never disagree.
   ========================================================================== */

const list = document.getElementById('saved-products');
const empty = document.getElementById('saved-empty');
const count = document.getElementById('saved-count');
const clearButton = document.getElementById('saved-clear');

function render() {
  const saved = Store.savedProducts();

  list.setAttribute('aria-busy', 'false');
  list.innerHTML = saved.map(Store.productCard).join('');
  list.hidden = saved.length === 0;
  empty.hidden = saved.length !== 0;
  clearButton.hidden = saved.length === 0;

  count.textContent = saved.length
    ? `${saved.length} ${saved.length === 1 ? 'product' : 'products'}`
    : '';

  // A cleared-out list also collapses the two-step "Clear all" button.
  if (saved.length === 0) resetClear();

  Store.updateSavedBadges();
}

function resetClear() {
  clearButton.textContent = 'Clear all';
  clearButton.setAttribute('aria-pressed', 'false');
}

// Re-render on every heart toggle on this page. common.js handles the toggle
// itself; this listener only keeps the grid in step with it.
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-save-slug]')) return;
  // Let common.js flip the list in localStorage first.
  queueMicrotask(render);
});

// Two-step clear: first tap arms the button, second tap empties the list.
// No modal, no accidental wipe.
clearButton.addEventListener('click', () => {
  if (clearButton.getAttribute('aria-pressed') === 'true') {
    Store.clearSaved();
    render();
    return;
  }
  clearButton.textContent = 'Tap again to clear';
  clearButton.setAttribute('aria-pressed', 'true');
});

async function start() {
  await Store.init();
  render();
  Store.initShare();
}

start().catch((err) => {
  console.error('Saved page failed to load:', err);
  if (list) {
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = `<li class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</li>`;
  }
});

initDrawer();
searchDialog();
Search.prefetch();
