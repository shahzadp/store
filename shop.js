/* ==========================================================================
   Alex Store — Shop All page
   Lists the entire catalog with category filters, straight from SQLite.
   ========================================================================== */

let allProducts = [];
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

/** Builds the category pills, in first-appearance order. */
function renderFilters() {
  const categories = ['All', ...new Set(allProducts.map((p) => p.category))];
  const box = document.getElementById('filters');

  box.innerHTML = categories
    .map(
      (category) =>
        `<button class="filter" type="button" data-category="${Store.escapeHtml(category)}"
                 aria-pressed="${category === activeCategory}">${Store.escapeHtml(category)}</button>`,
    )
    .join('');
}

document.getElementById('filters').addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;

  activeCategory = button.dataset.category;
  document.querySelectorAll('.filter').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.category === activeCategory));
  });
  render();
});

async function start() {
  await Store.init();

  allProducts = Catalog.listProducts();
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