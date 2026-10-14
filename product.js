/* ==========================================================================
   Alex Store — single product
   Reads ?slug= and renders that product's details. The URL is the canonical,
   shareable address: pasting it anywhere loads the same product.
   ========================================================================== */

const view = document.getElementById('product-view');
const crumbs = document.getElementById('crumbs');

function currentSlug() {
  return new URLSearchParams(window.location.search).get('slug');
}

/**
 * Keeps the document metadata in step with the product so that a pasted
 * link previews sensibly in WhatsApp, Slack or a browser tab. og:* tags are
 * created on demand — the static HTML only carries the generic pair.
 */
function syncMeta(product) {
  const price = Store.formatPrice(product.price_cents);
  const summary = [product.name, product.category, price, product.description]
    .filter(Boolean)
    .join(' — ');

  document.title = `${product.name} — ${Store.formatPrice(product.price_cents)} · Alex Store`;

  // og:* tags are created on demand; the static HTML only ships a generic
  // description.
  const setMeta = (attr, key, content) => {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);

    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }

    el.setAttribute('content', content);
  };

  setMeta('name', 'description', summary);
  setMeta('property', 'og:title', product.name);
  setMeta('property', 'og:description', summary);
  setMeta('property', 'og:type', 'product');
  setMeta('property', 'og:url', Store.shareUrl(product));

  // Only advertise an image when the catalog actually has one; a placeholder
  // tint is not a URL and would produce a broken preview.
  if (product.image_url) {
    setMeta('property', 'og:image', new URL(product.image_url, window.location.href).href);
  }
}

function renderCrumbs(product) {
  crumbs.innerHTML = `
    <a href="./">Home</a>
    <span aria-hidden="true">/</span>
    <a href="./shop.html">Products</a>
    ${product
      ? `<span aria-hidden="true">/</span><span aria-current="page">${Store.escapeHtml(product.name)}</span>`
      : ''}`;
}

function renderNotFound() {
  renderCrumbs(null);
  view.innerHTML = `
    <div class="product-detail product-detail--missing">
      <h1 class="product-detail__name">We couldn&rsquo;t find that product</h1>
      <p class="product-detail__desc">
        The link may be out of date, or the product may have been removed
        from the catalog.
      </p>
      <p><a class="btn btn-solid" href="./shop.html">Browse all products</a></p>
    </div>`;
}

function render(product) {
  const price = Store.formatPrice(product.price_cents);
  const media = product.image_url
    ? `<img class="product-detail__img" src="${Store.escapeHtml(product.image_url)}" alt="${Store.escapeHtml(product.name)}">`
    : `<div class="product-detail__img placeholder" style="background:${Store.escapeHtml(product.tint || '#D9CCEA')}" aria-hidden="true"></div>`;

  view.innerHTML = `
    <div class="product-detail">
      <div class="product-detail__media">${media}</div>

      <div class="product-detail__body">
        <div class="cat">${Store.escapeHtml(product.category)}</div>
        <h1 class="product-detail__name">${Store.escapeHtml(product.name)}</h1>

        <div class="product-detail__price">${Store.escapeHtml(price)}</div>

        ${product.description
          ? `<p class="product-detail__desc">${Store.escapeHtml(product.description)}</p>`
          : '<p class="product-detail__desc product-detail__desc--empty">No description for this product yet.</p>'}

        <div class="product-detail__actions">
          <a class="btn btn-solid" href="${Store.escapeHtml(Store.productLink(product))}"
             target="_blank" rel="noopener" ${product.in_stock ? '' : 'aria-disabled="true"'}>
            ${product.in_stock ? Store.highlightWhatsApp('Buy on WhatsApp') : 'Sold out'}
          </a>
          ${Store.shareButton(product, 'share--lg')}
        </div>

        <p class="product-detail__note">
          Share the link above to send this exact product to someone.
        </p>
      </div>
    </div>`;

  renderCrumbs(product);
  syncMeta(product);
}

async function start() {
  await Store.init();

  const slug = currentSlug();
  const product = slug
    ? Catalog.listProducts().find((p) => p.slug === slug)
    : null;

  if (!product) renderNotFound();
  else render(product);

  Store.initShare();
}

start().catch((err) => {
  console.error('Product failed to load:', err);
  view.innerHTML = `<p class="catalog-status">Catalog unavailable: ${Store.escapeHtml(err.message)}</p>`;
});

initDrawer();
searchDialog();
Search.prefetch();