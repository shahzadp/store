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
    <span aria-hidden="true">&gt;</span>
    <a href="./shop.html">Products</a>
    ${product
      ? `<span aria-hidden="true">&gt;</span><span aria-current="page">${Store.escapeHtml(product.name)}</span>`
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
  const media = product.image_url
    ? `<img class="product-detail__img" src="${Store.escapeHtml(product.image_url)}" alt="${Store.escapeHtml(product.name)}">`
    : `<div class="product-detail__img placeholder" style="background:${Store.escapeHtml(product.tint || '#D9CCEA')}" aria-hidden="true"></div>`;

  const specs = Catalog.specPairs(product.specs);

  // Selectable add-ons (e.g. a cold drink with a size and a surcharge). The
  // choice — and any surcharge — is carried into the WhatsApp message and never
  // changes the price shown on the page. Nothing is ticked to begin with, so
  // the buyer opts in rather than out.
  const options = Catalog.optionPairs(product.options);

  const optionsBox = options.length
    ? `<fieldset class="product-options">
         <legend class="product-options__legend">Add-ons</legend>
         ${options
           .map(
             (option) => `
           <label class="option">
             <input type="checkbox"
                    data-option-key="${Store.escapeHtml(option.key)}"
                    data-option-label="${Store.escapeHtml(option.label)}"
                    data-option-desc="${Store.escapeHtml(option.desc || '')}"
                    data-option-price="${Number(option.price_cents) || 0}">
             <span class="option__label">${Store.escapeHtml(option.label)}</span>
             ${optionMeta(option)}
           </label>`,
           )
           .join('')}
       </fieldset>`
    : '';

  const specsBox = specs.length
    ? `<aside class="product-detail__box product-detail__box--specs" aria-labelledby="specs-heading">
         <h2 class="product-detail__box-title" id="specs-heading">Specifications</h2>
         <dl class="specs">
           ${specs
             .map(
               ([label, value]) => `
             <div class="specs__row">
               <dt class="specs__label">${Store.escapeHtml(label)}</dt>
               <dd class="specs__value">${Store.escapeHtml(value)}</dd>
             </div>`,
             )
             .join('')}
         </dl>
       </aside>`
    : '';

  // The long-form copy when there is any, otherwise the one-line description,
  // so the box is never empty on a product that has not been given details.
  //
  // `stripRefundPolicy` first, because catalog.json carries the policy note on
  // the end of every product's `details` — db.js appends it there for the app,
  // which has no other place to show it. The site renders it from the same
  // constant instead, as its own line below the copy, so a shopper does not
  // read the same sentence twice and the note is not buried in the prose.
  const full = Catalog.stripRefundPolicy(product.details || product.description);
  // The refund condition, and nothing more than this sentence: it is a line of
  // small print under the copy, not a second description. The rest of the
  // policy - the refund window, who pays the return, how refunds are paid - is
  // on the About page, which is where a shopper goes when they care. This is the
  // same sentence db.js's toJson() appends to `details` for the app.
  const policyNote = Catalog.REFUND_POLICY.note
    ? `
      <p class="product-detail__policy">${Store.escapeHtml(Catalog.REFUND_POLICY.note)}</p>`
    : '';
  const fullBox = `
    <section class="product-detail__box product-detail__box--full" aria-labelledby="full-heading">
      <h2 class="product-detail__box-title" id="full-heading">Full description</h2>
      <div class="product-detail__copy">
        ${
          full
            ? `<p>${Store.escapeHtml(full)}</p>`
            : '<p class="product-detail__desc--empty">No description for this product yet.</p>'
        }
      </div>${policyNote}
    </section>`;

  view.innerHTML = `
    <div class="product-detail">
      <div class="product-detail__main">
        <div class="product-detail__media">${media}</div>

        <div class="product-detail__body">
          <div class="cat">${Store.escapeHtml(product.category)}</div>
          <h1 class="product-detail__name">${Store.escapeHtml(product.name)}</h1>

          <div class="product-detail__price">${Store.priceHtml(product.price_cents)}</div>

          ${optionsBox}

          <div class="product-detail__actions">
            <a class="btn btn-solid" id="buy-link" href="${Store.escapeHtml(Store.productLink(product))}"
               target="_blank" rel="noopener" ${product.in_stock ? '' : 'aria-disabled="true"'}>
              <span class="btn__label">${product.in_stock ? Store.highlightWhatsApp('Buy on WhatsApp') : 'Sold out'}</span>
            </a>
            ${Store.shareButton(product, 'share--lg')}
          </div>
        </div>
      </div>

      ${specsBox}
      ${fullBox}
    </div>`;

  renderCrumbs(product);
  syncMeta(product);
  wireOptions(product);
}

/**
 * The small print beside an add-on's name: its size and any surcharge, e.g.
 * "500ml · + Rs 100". Empty when the option carries neither, so a plain add-on
 * looks exactly as it did before.
 */
function optionMeta(option) {
  const parts = [];
  if (option.desc) parts.push(Store.escapeHtml(option.desc));
  const cents = Number(option.price_cents) || 0;
  if (cents > 0) parts.push(`+ ${Store.escapeHtml(Store.formatPrice(cents))}`);
  return parts.length ? `<span class="option__meta">${parts.join(' · ')}</span>` : '';
}

/**
 * Keeps the buy link's WhatsApp message in step with the add-ons. Every option
 * is stated either way ("Cold drink (500ml): yes"/"no"), so an unticked box is
 * an explicit answer rather than a silence; a chosen surcharge is stated on the
 * line as "(+ Rs 100)". The link stays a real anchor whose href is merely
 * updated, so middle-click and copy-link still behave.
 */
function wireOptions(product) {
  const box = view.querySelector('.product-options');
  const link = view.querySelector('#buy-link');
  if (!box || !link) return;

  const sync = () => {
    const selections = [...box.querySelectorAll('input[data-option-key]')].map((input) => ({
      label: input.dataset.optionLabel,
      on: input.checked,
      desc: input.dataset.optionDesc || '',
      price_cents: Number(input.dataset.optionPrice) || 0,
    }));
    link.href = Store.productLink(product, selections);
  };

  box.addEventListener('change', sync);
  sync();
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