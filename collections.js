/* ==========================================================================
   Alex Store — Collections page
   Editorial groupings read from their own `collections` table. Not products:
   no prices, no Buy buttons, no link to the product catalog.
   ========================================================================== */

async function start() {
  await Store.init();

  const box = document.getElementById('collections');
  const collections = Catalog.listCollections();

  box.setAttribute('aria-busy', 'false');
  box.innerHTML = collections.length
    ? collections.map(Store.collectionCard).join('')
    : '<p class="catalog-status">No collections yet.</p>';

  const noun = collections.length === 1 ? 'collection' : 'collections';
  document.getElementById('count').textContent = `${collections.length} ${noun}`;
}

start().catch((err) => {
  console.error('Collections failed to load:', err);
  const box = document.getElementById('collections');
  box.setAttribute('aria-busy', 'false');
  box.innerHTML = `<p class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</p>`;
});

initDrawer();
searchDialog();