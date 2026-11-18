/* ==========================================================================
   Shared storefront helpers — used by index.html and shop.html.
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
   * add-ons (e.g. a cold drink). Every add-on is stated either way — "Cold
   * drink (500ml): yes" or "Cold drink (500ml): no" — so an unmarked option is
   * an explicit answer rather than a silence the shop has to interpret. A
   * surcharge, when there is one, is stated on that same line and NOT folded
   * into the price above: the page price never changes with a choice.
   */
  function productLink(product, selections) {
    const lines = [
      `Hi ${storeName}! I'd like to order:`,
      '',
      `*${product.name}*`,
      `${product.category} — ${formatPrice(product.price_cents)}`,
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

  /** Absolute, canonical URL for a product — what gets copied on share. */
  function shareUrl(product) {
    return new URL(productUrl(product), window.location.href).href;
  }

  /**
   * Share control. On platforms with a share sheet (every modern phone, most
   * desktop browsers) the product's absolute URL goes straight into it, with
   * the platform deciding where — WhatsApp, Messages, anywhere. Everywhere
   * else, and when the sheet itself fails, it copies the URL to the clipboard
   * with a visible "Link copied" confirmation, so no tap is ever a dead end.
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

      // The platform share sheet, where there is one. A dismissal
      // (AbortError) is a choice, not a failure — nothing to report. Any
      // other error falls through to the clipboard path below.
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: product.name,
            text: `${product.name} — ${formatPrice(product.price_cents)} · ${storeName}`,
            url,
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }

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

  /* ==========================================================================
     Saved for later + recently viewed — on-device, no account, no server.

     localStorage is the only persistence the storefront has, and both lists
     below are exactly that: two arrays of slugs under versioned keys. Anything
     unrecognised (private mode, a corrupt value, a disabled store) reads as an
     empty list rather than throwing, because a broken wishlist must never take
     the shop down with it.
     ========================================================================== */

  const SAVED_KEY = 'alexstore.saved.v1';
  const RECENT_KEY = 'alexstore.recent.v1';
  const RECENT_MAX = 6;

  function readSlugList(key) {
    try {
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }

  function writeSlugList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // Private mode / disabled storage: the list just does not persist.
    }
  }

  function savedList() {
    return readSlugList(SAVED_KEY);
  }

  function isSaved(slug) {
    return savedList().includes(slug);
  }

  /** Adds or removes the slug. Newest save sits first. Returns the new state. */
  function toggleSaved(slug) {
    const list = savedList();
    const index = list.indexOf(slug);
    if (index >= 0) list.splice(index, 1);
    else list.unshift(slug);
    writeSlugList(SAVED_KEY, list);
    return index < 0;
  }

  function clearSaved() {
    writeSlugList(SAVED_KEY, []);
  }

  /** Saved slugs resolved against the catalog, in save order, missing dropped. */
  function savedProducts() {
    if (typeof Catalog === 'undefined' || !Catalog.listProducts) return [];
    const wanted = new Map(savedList().map((slug) => [slug, true]));
    if (!wanted.size) return [];
    const bySlug = new Map(Catalog.listProducts().map((p) => [p.slug, p]));
    return savedList().map((slug) => bySlug.get(slug)).filter(Boolean);
  }

  /** Records a product view, most-recent first, capped — the home row. */
  function recordProductView(slug) {
    const list = readSlugList(RECENT_KEY).filter((s) => s !== slug);
    list.unshift(slug);
    writeSlugList(RECENT_KEY, list.slice(0, RECENT_MAX));
  }

  /** Recently viewed products, most recent first, missing entries dropped. */
  function recentlyViewedProducts() {
    if (typeof Catalog === 'undefined' || !Catalog.listProducts) return [];
    const bySlug = new Map(Catalog.listProducts().map((p) => [p.slug, p]));
    return readSlugList(RECENT_KEY).map((slug) => bySlug.get(slug)).filter(Boolean);
  }

  /** Keeps every saved-count badge on the page in step with the list. */
  function updateSavedBadges() {
    const count = savedList().length;
    document.querySelectorAll('[data-saved-count]').forEach((el) => {
      el.textContent = String(count);
      el.hidden = count === 0;
    });
  }

  /** Syncs one save toggle (or all of them) to [data-save-slug] buttons. */
  function syncSaveButtons(slug) {
    const list = savedList();
    document.querySelectorAll('[data-save-slug]').forEach((button) => {
      if (slug && button.dataset.saveSlug !== slug) return;
      const saved = list.includes(button.dataset.saveSlug);
      button.setAttribute('aria-pressed', String(saved));
      button.classList.toggle('save-fab--saved', saved);
      const label = button.dataset.saveLabel;
      if (label) {
        button.setAttribute('aria-label', saved ? `Remove ${label} from saved` : `Save ${label} for later`);
      }
    });
  }

  /**
   * Wires every save toggle on the page, now and for markup added later, and
   * keeps tabs/windows in agreement through the `storage` event. Called once
   * from init().
   */
  function initSaved() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-save-slug]');
      if (!button) return;
      toggleSaved(button.dataset.saveSlug);
      syncSaveButtons(button.dataset.saveSlug);
      updateSavedBadges();
    });

    window.addEventListener('storage', (event) => {
      if (event.key === SAVED_KEY) {
        syncSaveButtons(null);
        updateSavedBadges();
      }
    });

    updateSavedBadges();
  }

  /**
   * The save toggle used on cards, the quick view and the product page.
   * `inline` renders it as a plain action button instead of a floating disc
   * over the image.
   */
  function saveFab(product, { inline = false } = {}) {
    const saved = isSaved(product.slug);
    const name = escapeHtml(product.name);
    const label = saved ? `Remove ${name} from saved` : `Save ${name} for later`;

    return `<button class="save-fab${saved ? ' save-fab--saved' : ''}${inline ? ' save-fab--inline' : ''}"
             type="button" data-save-slug="${escapeHtml(product.slug)}" data-save-label="${name}"
             aria-pressed="${saved}" aria-label="${label}">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
               <path d="M12 20.3s-7.2-4.6-9.5-9.2A5.4 5.4 0 0 1 12 6.3a5.4 5.4 0 0 1 9.5 4.8C19.2 15.7 12 20.3 12 20.3Z"></path>
             </svg>
           </button>`;
  }

  /* ==========================================================================
     Quick view — the product in a modal, so the grid does not have to be
     navigated away from to answer "what is this and what does it cost".
     ========================================================================== */

  let quickViewReturnFocus = null;

  function quickViewMarkup(product) {
    const media = product.image_url
      ? `<img class="quickview__img" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">`
      : `<div class="quickview__img quickview__img--placeholder" style="background:${escapeHtml(product.tint || '#D9CCEA')}" aria-hidden="true"></div>`;

    const buy = product.in_stock
      ? `<a class="btn btn-solid" href="${escapeHtml(productLink(product))}" target="_blank" rel="noopener">
           <span class="btn__label">${highlightWhatsApp('Buy on WhatsApp')}</span>
         </a>`
      : `<span class="btn btn-solid" aria-disabled="true"><span class="btn__label">Sold out</span></span>`;

    return `
      <div class="quickview__media">${media}</div>
      <div class="quickview__body">
        <div class="cat">${escapeHtml(product.category)}</div>
        <h3 class="quickview__name">${escapeHtml(product.name)}</h3>
        <div class="quickview__price">${priceHtml(product.price_cents)}</div>
        ${product.description
          ? `<p class="quickview__desc">${escapeHtml(product.description)}</p>`
          : ''}
        <div class="quickview__actions">
          ${buy}
          ${saveFab(product, { inline: true })}
        </div>
        <a class="quickview__details" href="${escapeHtml(productUrl(product))}">View full details &rarr;</a>
      </div>`;
  }

  function openQuickView(slug) {
    const product =
      typeof Catalog !== 'undefined' && Catalog.listProducts
        ? Catalog.listProducts().find((p) => p.slug === slug)
        : null;
    if (!product) return;

    const dialog = document.getElementById('quickview-dialog');
    const body = document.getElementById('quickview-body');
    if (!dialog || !body) return;

    body.innerHTML = quickViewMarkup(product);
    quickViewReturnFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('quickview-open');

    const close = dialog.querySelector('[data-quickview-close]');
    if (close) close.focus();
  }

  function closeQuickView() {
    const dialog = document.getElementById('quickview-dialog');
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.classList.remove('quickview-open');

    if (quickViewReturnFocus && typeof quickViewReturnFocus.focus === 'function') {
      quickViewReturnFocus.focus();
    }
    quickViewReturnFocus = null;
  }

  /** Delegated triggers + the three ways out (backdrop, button, Escape). */
  function initQuickView() {
    document.addEventListener('click', (event) => {
      const open = event.target.closest('[data-quickview-slug]');
      if (open) {
        event.preventDefault();
        openQuickView(open.dataset.quickviewSlug);
        return;
      }
      if (event.target.closest('[data-quickview-close]')) closeQuickView();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeQuickView();
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
    // link with no accessible name at all — Lighthouse flagged every one of
    // them as a nameless link. One link per destination is also kinder to
    // screen reader users than announcing the same target twice.
    return `
      <li>
        <article class="product">
          <a class="product__link" href="${escapeHtml(detail)}" aria-hidden="true" tabindex="-1">${media}</a>
          ${saveFab(product)}
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
            <div class="product__actions-row">
              <button class="quickview-btn" type="button" data-quickview-slug="${escapeHtml(product.slug)}"
                      aria-label="Quick view: ${escapeHtml(product.name)}">Quick view</button>
              ${shareButton(product, 'share--row')}
            </div>
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

    // Save toggles, the badge and quick view all work off delegated clicks and
    // localStorage, so any page that renders cards gets them for free.
    initSaved();
    initQuickView();

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
    savedList,
    isSaved,
    toggleSaved,
    clearSaved,
    savedProducts,
    recordProductView,
    recentlyViewedProducts,
    saveFab,
    openQuickView,
    closeQuickView,
    initSaved,
    initQuickView,
    updateSavedBadges,
  };
})();