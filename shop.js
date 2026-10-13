/* ==========================================================================
   Alex Store — All Products page
   Lists the entire catalog with category filters, straight from SQLite.
   ========================================================================== */

let allProducts = [];
let categories = [];
let activeCategory = 'All';

function render() {
  const list = document.getElementById('products');
  const visible =
    activeCategory === 'All'
      ? allProducts
      : allProducts.filter((p) => p.category === activeCategory);

  list.setAttribute('aria-busy', 'false');
  list.innerHTML = visible.length
    ? visible.map(Store.productCard).join('')
    : '<li class="catalog-status">Nothing in this category yet.</li>';

  const noun = visible.length === 1 ? 'item' : 'items';
  document.getElementById('count').textContent =
    `${visible.length} ${noun}`;
}

/** Builds the category pills, alphabetically for a stable order. */
function renderFilters() {
  categories = ['All', ...[...new Set(allProducts.map((p) => p.category))].sort((a, b) => a.localeCompare(b))];
  const box = document.getElementById('filters');

  box.innerHTML = categories
    .map(
      (category) =>
        `<button class="filter" type="button" data-category="${Store.escapeHtml(category)}"
                 aria-pressed="${category === activeCategory}">${Store.escapeHtml(category)}</button>`,
    )
    .join('');
}

/** Honours ?category= so a Collections card can deep-link into a filter. */
function readCategoryFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('category');
  if (!requested) return 'All';

  const match = allProducts.find((p) => p.category === requested);
  return match ? match.category : 'All';
}

document.getElementById('filters').addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;

  activeCategory = button.dataset.category;

  // Keep the address bar honest so the filter can be shared or reloaded.
  const url = new URL(window.location);
  if (activeCategory === 'All') url.searchParams.delete('category');
  else url.searchParams.set('category', activeCategory);
  history.replaceState(null, '', url);

  document.querySelectorAll('.filter').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.category === activeCategory));
  });
  render();
});

async function start() {
  await Store.init();

  allProducts = Catalog.listProducts();
  activeCategory = readCategoryFromUrl();
  renderFilters();
  render();
}

start().catch((err) => {
  console.error('Catalog failed to load:', err);
  const list = document.getElementById('products');
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = `<li class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</li>`;
});

initDrawer();
searchDialog();