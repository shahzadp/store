/* ==========================================================================
   Shared storefront helpers — used by index.html and shop.html.
   The store trades in PKR only.
   ========================================================================== */

const Store = (() => {
  const CURRENCY = 'PKR';
  const LOCALE = 'en-PK'; // renders as "Rs 7,800"

  let storeName = 'Alex Store';
  let whatsappNumber = '923288304524';

  /** Formats integer paisa as PKR, e.g. 780000 -> "Rs 7,800". */
  function formatPrice(paisa) {
    try {
      return new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency: CURRENCY,
        maximumFractionDigits: 2,
      }).format(paisa / 100);
    } catch {
      return `Rs ${(paisa / 100).toFixed(2)}`;
    }
  }

  /** wa.me deep link with a prefilled message. */
  function whatsappLink(message) {
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function generalLink() {
    return whatsappLink(`Hi ${storeName}! I have a question about your products.`);
  }

  function productLink(product) {
    return whatsappLink(
      `Hi ${storeName}! I'd like to order:\n\n` +
        `*${product.name}*\n` +
        `${product.category} — ${formatPrice(product.price_cents)}\n\n` +
        `Is it available?`,
    );
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Editorial card. Collections aren't for sale, so this is never a link. */
  function collectionCard(collection) {
    const media = collection.image_url
      ? `<img class="collection-card__media" src="${escapeHtml(collection.image_url)}" alt="" loading="lazy">`
      : `<div class="collection-card__media" style="background:${escapeHtml(collection.tint || '#D9CCEA')}" aria-hidden="true"></div>`;

    return `
      <article class="collection-card">
        ${media}
        <div class="collection-card__body">
          <h3 class="collection-card__title">${escapeHtml(collection.title)}</h3>
          ${collection.description
            ? `<p class="collection-card__text">${escapeHtml(collection.description)}</p>`
            : ''}
        </div>
      </article>`;
  }

  function productCard(product) {
    const href = productLink(product);
    const price = formatPrice(product.price_cents);

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

  /** Boots SQLite and wires up the store-wide bits every page needs. */
  async function init() {
    await Catalog.init();

    storeName = Catalog.getSetting('store_name') || storeName;
    whatsappNumber = Catalog.getSetting('whatsapp') || whatsappNumber;

    document.title = storeName;
    document.querySelectorAll('[data-whatsapp-general]').forEach((el) => {
      el.setAttribute('href', generalLink());
    });

    // Stored in paisa, same as product prices, so the banner and the catalog
    // can never drift apart on units.
    const threshold = Number(Catalog.getSetting('free_delivery_over_paisa'));
    document.querySelectorAll('[data-free-delivery]').forEach((el) => {
      el.textContent =
        Number.isFinite(threshold) && threshold > 0
          ? `Free delivery on orders over ${formatPrice(threshold)} · Order on WhatsApp`
          : 'Order on WhatsApp';
    });

    return { storeName, whatsappNumber };
  }

  return {
    init,
    formatPrice,
    whatsappLink,
    generalLink,
    productLink,
    escapeHtml,
    productCard,
    collectionCard,
  };
})();