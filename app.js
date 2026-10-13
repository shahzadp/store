/* ==========================================================================
   Alex Store — storefront
   The catalog is a SQLite database running in the browser (see db.js).
   Orders are handed off to WhatsApp; nothing is transacted on this site.
   ========================================================================== */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Formats integer cents as currency, e.g. 2800 -> $28.00 */
function formatPrice(cents, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/** wa.me deep link with a prefilled order message. */
function whatsappLink(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function productCard(product, storeName, whatsappNumber) {
  const price = formatPrice(product.price_cents, product.currency);
  const href = whatsappLink(
    whatsappNumber,
    `Hi ${storeName}! I'd like to order:\n\n` +
      `*${product.name}*\n` +
      `${product.category} — ${price}\n\n` +
      `Is it available?`,
  );

  const media = product.image_url
    ? `<img class="product__img" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `<div class="product__img placeholder" style="background:${escapeHtml(product.tint || '#D9CCEA')}" aria-hidden="true"></div>`;

  return `
    <li>
      <div class="product">
        <a class="product__link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${media}</a>
        <div class="cat">${escapeHtml(product.category)}</div>
        <div class="product__name">${escapeHtml(product.name)}</div>
        <div class="product__price">${escapeHtml(price)}</div>
        <a class="btn btn-solid btn-buy" href="${escapeHtml(href)}" target="_blank" rel="noopener"
           ${product.in_stock ? '' : 'aria-disabled="true"'}>
          ${product.in_stock ? 'Buy on WhatsApp' : 'Sold out'}
        </a>
      </div>
    </li>`;
}

function render(products, storeName, whatsappNumber) {
  const list = document.getElementById('products');
  list.setAttribute('aria-busy', 'false');

  if (!products.length) {
    list.innerHTML = '<li class="catalog-status">No products in the catalog yet.</li>';
    return;
  }

  list.innerHTML = products
    .map((p) => productCard(p, storeName, whatsappNumber))
    .join('');
}

function renderError(message) {
  const list = document.getElementById('products');
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = `<li class="catalog-status">Catalog unavailable: ${escapeHtml(message)}</li>`;
}

/* ------------------------------------------------------------------- boot */

async function start() {
  await Catalog.init();

  const storeName = Catalog.getSetting('store_name') || 'Alex Store';
  const whatsappNumber = Catalog.getSetting('whatsapp') || '923288304524';

  document.title = storeName;

  const general = whatsappLink(whatsappNumber, `Hi ${storeName}! I have a question about your products.`);
  document.querySelectorAll('[data-whatsapp-general]').forEach((el) => {
    el.setAttribute('href', general);
  });

  render(Catalog.listProducts(), storeName, whatsappNumber);

  if (Catalog.hasDraft()) {
    console.info('Showing a local draft catalog — published catalog.sql is unchanged.');
  }
}

function initMenu() {
  const button = document.querySelector('[data-menu-toggle]');
  const nav = document.getElementById('mobile-nav');
  if (!button || !nav) return;

  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('nav--open', !open);
  });
}

initMenu();

start().catch((err) => {
  console.error('Catalog failed to load:', err);
  renderError(err.message);
});