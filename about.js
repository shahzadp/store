/* ==========================================================================
   Alex Store — About
   The store-fact tiles are filled from the live catalog so they can never
   drift out of date. The personal copy is plain text in about.html.
   ========================================================================== */

async function start() {
  await Store.init();

  const products = Catalog.listProducts();
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const threshold = Number(Catalog.getSetting('free_delivery_over_paisa'));
  const inStock = products.filter((p) => p.in_stock).length;

  const facts = [
    { value: String(products.length), label: 'products in the catalog' },
    { value: String(categories.length), label: 'categories, kept deliberately small' },
    {
      value: Number.isFinite(threshold) && threshold > 0 ? Store.formatPrice(threshold) : '—',
      label: 'free delivery threshold',
    },
    { value: String(inStock), label: 'currently available to order' },
  ];

  document.getElementById('about-facts').innerHTML = facts
    .map(
      (fact) => `
        <div class="fact">
          <div class="fact__value">${Store.escapeHtml(fact.value)}</div>
          <div class="fact__label">${Store.escapeHtml(fact.label)}</div>
        </div>`,
    )
    .join('');

  document.getElementById('about-cats').textContent = categories.length
    ? categories.join(' · ')
    : '—';
}

start().catch((err) => {
  console.error('About page failed to load:', err);
  document.getElementById('about-facts').innerHTML =
    `<p class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</p>`;
});

initDrawer();
searchDialog();