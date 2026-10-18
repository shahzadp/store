/* ==========================================================================
   Shared storefront helpers â€” used by index.html and shop.html.
   The store trades in PKR only.
   ========================================================================== */

const Store = (() => {
  const CURRENCY = 'PKR';
  const LOCALE = 'en-PK'; // renders as "Rs 7,800"

  let storeName = 'Alex Store';
  let whatsappNumber = '923288304524';

  // Delivery, as a percentage of the order. One value, read from the catalog
  // so this page and the Android app cannot disagree about what delivery
  // costs. 0 means "show no delivery pricing at all".
  let deliveryPercent = 0;
  let deliveryPercentLow = 0;
  let deliveryThresholdPaisa = 100000;

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

  /**
   * The price shown next to the price itself: what this would cost WITH
   * delivery added, struck through, so the main price is unchanged but the
   * delivery saving is visible. Returns "" when delivery_percent is unset, so
   * a catalog with no delivery pricing renders exactly as it always did.
   */
  function deliveryIncluded(paisa) {
    const pct = paisa < deliveryThresholdPaisa ? deliveryPercentLow : deliveryPercent;
    if (!pct) return null;
    return Math.round(paisa * (1 + pct / 100));
  }

  /**
   * A product's price as HTML: the struck-through delivery-included figure
   * (when there is one) followed by the unchanged price. Returned as markup
   * rather than text because `.product__price` and `.product-detail__price`
   * style the two differently; everything interpolated is escaped here so
   * callers may pass it straight into an innerHTML template.
   */
  function priceHtml(paisa) {
    const now = `<span class="price__now">${escapeHtml(formatPrice(paisa))}</span>`;
    const incl = deliveryIncluded(paisa);
    if (incl === null) return now;
    const was = formatPrice(incl);
    return (
      `<span class="price__was" title="Including delivery"` +
      ` aria-label="${escapeHtml(`${was} including delivery`)}">${escapeHtml(was)}</span>` +
      now
    );
  }

  /** wa.me deep link with a prefilled message. */
  function whatsappLink(message) {
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function generalLink() {
    return whatsappLink(`Hi ${storeName}! I have a question about your products.`);
  }

  /**
   * The WhatsApp order message for one product.
   *
   * `selections` is an optional array of `{ label, on, desc, price_cents }`
   * add-ons (e.g. a cold drink). Every add-on is stated either way â€” "Cold
   * drink (500ml): yes" or "Cold drink (500ml): no" â€” so an unmarked option is
   * an explicit answer rather than a silence the shop has to interpret. A
   * surcharge, when there is one, is stated on that same line and NOT folded
   * into the price above: the page price never changes with a choice.
   */
  function productLink(product, selections) {
    const lines = [
      `Hi ${storeName}! I'd like to order:`,
      '',
      `*${product.name}*`,
      `${product.category} â€” ${formatPrice(product.price_cents)}`,
    ];

    // Only ask about the detail if there is any, and keep it to one extra line.
    if (product.description) lines.push(product.description);

    for (const { label, on, desc, price_cents } of selections || []) {
      if (!label) continue;
      const name = desc ? `${label} (${desc})` : label;
      if (on && price_cents > 0) lines.push(`${name}: yes (+ ${formatPrice(price_cents)})`);
      else lines.push(`${name}: ${on ? 'yes' : 'no'}`);
    }

    lines.push('', 'Is it available?');

    return whatsappLink(lines.join('\n'));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /**
   * Escapes `text`, then wraps the word "WhatsApp" so it can be tinted
   * green while the rest of the phrase keeps its own colour. Input is
   * escaped first, so callers may pass raw catalog values.
   */
  function highlightWhatsApp(text) {
    return escapeHtml(text).replace(/WhatsApp/g, '<span class="wa-word">WhatsApp</span>');
  }

  /**
   * The shareable address of a product. Relative so it resolves correctly
   * whether the page is served from the site root or a subpath; absolute
   * URLs are built from it at share time by `shareUrl()`.
   */
  function productUrl(product) {
    const slug = typeof product === 'string' ? product : product.slug;
    return `./product.html?slug=${encodeURIComponent(slug)}`;
  }

  /** Absolute, canonical URL for a product â€” what gets copied on share. */
  function shareUrl(product) {
    return new URL(productUrl(product), window.location.href).href;
  }

  /**
   * Share control. Copies the product's absolute URL rather than opening a
   * platform share sheet, so it behaves identically on desktop and mobile
   * and is testable. `navigator.share` is deliberately not used: it is
   * mobile-only and its title/body cannot be asserted.
   */
  function shareButton(product, extraClass = '') {
    const name = typeof product === 'string' ? '' : escapeHtml(product.name);

    // The visible label ("Share link") has to appear inside the accessible
    // name, so it is used as the prefix rather than being buried mid-string.
    const label = name ? `Share link: ${name}` : 'Share link';

    return `<button class="share ${extraClass}" type="button" data-share-slug="${escapeHtml(product.slug)}"
              aria-label="${escapeHtml(label)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.6" aria-hidden="true">
                <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path>
              </svg>
              <span class="share__label">Share link</span>
            </button>`;
  }

  /**
   * Wires every [data-share-slug] button in the document. Uses the async
   * Clipboard API, falling back to a hidden textarea for browsers that
   * refuse it (non-secure origins, older Safari).
   */
  function initShare() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-share-slug]');
      if (!button) return;

      const product = Catalog.listProducts().find((p) => p.slug === button.dataset.shareSlug);
      if (!product) return;

      const url = shareUrl(product);
      const label = button.querySelector('.share__label');
      const original = label ? label.textContent : '';

      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        // Fallback for insecure contexts / denied clipboard permission.
        const scratch = document.createElement('textarea');
        scratch.value = url;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.appendChild(scratch);
        scratch.select();
        try {
          copied = document.execCommand('copy');
        } catch {
          copied = false;
        }
        scratch.remove();
      }

      button.classList.toggle('share--done', copied);
      if (label) label.textContent = copied ? 'Link copied' : 'Copy failed';

      setTimeout(() => {
        button.classList.remove('share--done');
        if (label) label.textContent = original;
      }, 2000);
    });
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
    const detail = productUrl(product);

    const media = product.image_url
      ? `<img class="product__img" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : `<div class="product__img placeholder" style="background:${escapeHtml(product.tint || '#D9CCEA')}" aria-hidden="true"></div>`;

    // The card opens the product's own page; WhatsApp stays a distinct,
    // explicit action rather than being what an image click happens to do.
    //
    // The image link is aria-hidden and removed from the tab order: it points
    // at the same place as the title link directly beneath it, and when a
    // product has no image it wraps an aria-hidden tint block, which left the
    // link with no accessible name at all â€” Lighthouse flagged every one of
    // them as a nameless link. One link per destination is also kinder to
    // screen reader users than announcing the same target twice.
    return `
      <li>
        <article class="product">
          <a class="product__link" href="${escapeHtml(detail)}" aria-hidden="true" tabindex="-1">${media}</a>
          <div class="cat">${escapeHtml(product.category)}</div>
          <h3 class="product__name"><a href="${escapeHtml(detail)}">${escapeHtml(product.name)}</a></h3>
          ${product.description
            ? `<p class="product__desc">${escapeHtml(product.description)}</p>`
            : ''}
          <div class="product__price">${priceHtml(product.price_cents)}</div>
          <div class="product__actions">
            <a class="btn btn-solid btn-buy" href="${escapeHtml(href)}" target="_blank" rel="noopener"
               ${product.in_stock ? '' : 'aria-disabled="true"'}>
              <span class="btn__label">${product.in_stock ? highlightWhatsApp('Buy on WhatsApp') : 'Sold out'}</span>
            </a>
            ${shareButton(product)}
          </div>
        </article>
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

    // Delivery is a percentage of the order, read from the catalog so this
    // page and the Android app format the same number.
    deliveryPercent = Number(Catalog.getSetting('delivery_percent')) || 0;
    deliveryPercentLow = Number(Catalog.getSetting('delivery_percent_low')) || 0;
    deliveryThresholdPaisa = Number(Catalog.getSetting('delivery_threshold_paisa')) || 100000;

    // The free-delivery offer used to be a sticky bar at the top of every
    // page. It is now announced once, as a claimable voucher (voucher.js),
    // and stated quietly in the footer. The figure still comes from the
    // catalog, so it cannot drift from the app's.
    const threshold = Number(Catalog.getSetting('free_delivery_over_paisa'));
    const deliveryNote =
      Catalog.getSetting('voucher_title') ||
      (Number.isFinite(threshold) && threshold > 0
        ? `Free delivery over ${formatPrice(threshold)}`
        : '');
    document.querySelectorAll('[data-delivery-note]').forEach((el) => {
      if (deliveryNote) {
        el.textContent = deliveryNote;
        el.removeAttribute('hidden');
      } else {
        el.remove();
      }
    });

    // Removing the bar changed the sticky chrome's height; re-measure so the
    // header docks to the top. sticky.js is not loaded on every page, hence
    // the guard.
    if (typeof syncStickyOffsets === 'function') syncStickyOffsets();

    return { storeName, whatsappNumber, deliveryPercent };
  }

  return {
    init,
    formatPrice,
    deliveryIncluded,
    priceHtml,
    whatsappLink,
    generalLink,
    productLink,
    escapeHtml,
    productCard,
    collectionCard,
    productUrl,
    shareUrl,
    shareButton,
    initShare,
    highlightWhatsApp,
  };
})();