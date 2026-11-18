/* ==========================================================================
   Alex Store — All Products page
   Lists the entire catalog with category filters, straight from SQLite.
   ========================================================================== */

let allProducts = [];
let categories = [];
let activeCategory = 'All';
let activeSort = 'featured';

const SORTERS = {
  'featured': null, // catalog order
  'price-asc': (a, b) => a.price_cents - b.price_cents,
  'price-desc': (a, b) => b.price_cents - a.price_cents,
  'name': (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
};

function visibleProducts() {
  const filtered =
    activeCategory === 'All'
      ? [...allProducts]
      : allProducts.filter((p) => p.category === activeCategory);

  const sorter = SORTERS[activeSort];
  return sorter ? filtered.sort(sorter) : filtered;
}

function render() {
  const list = document.getElementById('products');
  const visible = visibleProducts();

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

/** Honours ?sort= so a sorted view can be shared or reloaded. */
function readSortFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('sort');
  return Object.prototype.hasOwnProperty.call(SORTERS, requested)
    ? requested
    : 'featured';
}

function writeUrlParams() {
  // Keep the address bar honest so the view can be shared or reloaded.
  const url = new URL(window.location);
  if (activeCategory === 'All') url.searchParams.delete('category');
  else url.searchParams.set('category', activeCategory);
  if (activeSort === 'featured') url.searchParams.delete('sort');
  else url.searchParams.set('sort', activeSort);
  history.replaceState(null, '', url);
}

document.getElementById('filters').addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;

  activeCategory = button.dataset.category;
  writeUrlParams();

  document.querySelectorAll('.filter').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.category === activeCategory));
  });
  render();
});

document.getElementById('sort').addEventListener('change', (event) => {
  activeSort = event.target.value;
  writeUrlParams();
  render();
});

async function start() {
  await Store.init();

  allProducts = Catalog.listProducts();
  activeCategory = readCategoryFromUrl();
  activeSort = readSortFromUrl();
  document.getElementById('sort').value = activeSort;
  renderFilters();
  render();
  Store.initShare();
}

start().catch((err) => {
  console.error('Catalog failed to load:', err);
  const list = document.getElementById('products');
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = `<li class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</li>`;
});

initDrawer();
searchDialog();
Search.prefetch();