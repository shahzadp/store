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

/** Locale that renders each currency the way sellers there expect. */
const CURRENCY_LOCALE = {
  PKR: 'en-PK', // "Rs 7,800.00"
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'de-DE',
};

/** Formats integer minor units as currency, e.g. 780000 -> Rs 7,800.00 */
function formatPrice(cents, currency) {
  const code = currency || 'USD';
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[code] || 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`;
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

/* ------------------------------------------------------------------- menu */

const MOBILE_BREAKPOINT = 820;

function initMenu() {
  const button = document.querySelector('[data-menu-toggle]');
  const nav = document.getElementById('mobile-nav');
  if (!button || !nav) return;

  const isMobile = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;

  function open() {
    nav.classList.add('nav--open');
    document.body.classList.add('nav-open');
    button.setAttribute('aria-expanded', 'true');
    document.querySelector('.nav-backdrop')?.removeAttribute('hidden');
  }

  function close() {
    nav.classList.remove('nav--open');
    document.body.classList.remove('nav-open');
    button.setAttribute('aria-expanded', 'false');
    document.querySelector('.nav-backdrop')?.setAttribute('hidden', '');
    button.focus();
  }

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') close();
    else open();
  });

  // Close button inside the drawer, and the tap-outside backdrop.
  nav.querySelector('[data-menu-close]')?.addEventListener('click', close);
  document.querySelector('.nav-backdrop')?.addEventListener('click', close);

  // Following an in-page link should close the drawer, not leave it covering
  // the section that just scrolled into view.
  nav.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => close());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') close();
  });

  // Rotating or resizing past the breakpoint must not strand the open drawer
  // over the desktop layout.
  window.addEventListener('resize', () => {
    if (!isMobile() && button.getAttribute('aria-expanded') === 'true') close();
  });
}

initMenu();

start().catch((err) => {
  console.error('Catalog failed to load:', err);
  renderError(err.message);
});