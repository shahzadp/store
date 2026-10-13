/* ==========================================================================
   Alex Store — homepage
   Catalog rendering lives in common.js; the drawer lives in drawer.js.
   ========================================================================== */

initDrawer();

async function start() {
  await Store.init();

  const list = document.getElementById('products');
  const products = Catalog.listProducts();

  list.setAttribute('aria-busy', 'false');
  list.innerHTML = products.length
    ? products.map(Store.productCard).join('')
    : '<li class="catalog-status">No products in the catalog yet.</li>';

  if (Catalog.hasDraft()) {
    console.info('Showing a local draft catalog — published catalog.sql is unchanged.');
  }
}

start().catch((err) => {
  console.error('Catalog failed to load:', err);
  const list = document.getElementById('products');
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = `<li class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</li>`;
});