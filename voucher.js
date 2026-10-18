/* ==========================================================================
   Free-delivery voucher

   The free-delivery offer used to be a sticky bar at the top of every page.
   It is now a voucher: announced once, celebrated with confetti when it is
   claimed, and never shown again on that browser.

   Zero dependencies, like the rest of this site. The confetti is a canvas
   drawn by hand rather than a library.

   WHY localStorage AND NOT A COOKIE OR SERVER
   There is no server. localStorage is the only thing that survives a reload,
   and "seen once" only has to be true for this browser. The version in the
   key means a future change to the voucher can be shown afresh rather than
   being suppressed by a stale flag.

   WHY IT WAITS FOR THE CATALOG
   The wording, the code and the terms all come from the catalog, so the
   voucher cannot drift from the Android app's copy. Calling Catalog.init()
   here would race the page's own Store.init(), so this waits for readiness
   instead — the same thing search.js does.
   ========================================================================== */

const VOUCHER_KEY = 'alexstore.voucher.v1';

/** A short, dependency-free confetti burst on `canvas`. */
function voucherConfetti(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const COLORS = ['#6B4B8F', '#25D366', '#D9CCEA', '#E3D6EE', '#CFC3E3', '#F2C94C'];
  const COUNT = 150;
  const MAX_LIFE = 155; // frames — about 2.5s at 60fps
  const GRAVITY = 0.22;

  const pieces = Array.from({ length: COUNT }, () => ({
    x: width / 2 + (Math.random() - 0.5) * width * 0.6,
    y: height * 0.4 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 10,
    vy: -6 - Math.random() * 10,
    size: 4 + Math.random() * 7,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.32,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  const paint = (alphaAt) => {
    ctx.clearRect(0, 0, width, height);
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alphaAt;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx.restore();
    }
  };

  // Respect a stated preference for less motion: leave a single still burst,
  // then clear it, rather than animating.
  const calm =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm) {
    paint(1);
    setTimeout(() => ctx.clearRect(0, 0, width, height), 1100);
    return;
  }

  let frame = 0;
  const tick = () => {
    frame += 1;
    for (const p of pieces) {
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
    }
    paint(Math.max(0, 1 - frame / MAX_LIFE));
    if (frame < MAX_LIFE) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, width, height);
  };
  requestAnimationFrame(tick);
}

(async function startVoucher() {
  const host = document.getElementById('voucher');
  if (!host) return;

  // Wait (bounded) for the page's own Store.init() to open the catalog.
  for (let i = 0; i < 60 && !Catalog.isReady(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!Catalog.isReady()) return;

  let alreadySeen = false;
  try {
    alreadySeen = localStorage.getItem(VOUCHER_KEY) === 'claimed';
  } catch {
    // Storage blocked (private mode, disabled cookies). Treat it as unseen so
    // the offer still shows — it just may show again next time.
  }
  if (alreadySeen) return;

  const title = Catalog.getSetting('voucher_title');
  if (!title) return; // nothing configured, so nothing to announce

  const desc = Catalog.getSetting('voucher_description') || '';
  const code = Catalog.getSetting('voucher_code') || '';
  const terms = Catalog.getSetting('voucher_terms') || '';

  const titleEl = document.getElementById('voucher-title');
  const descEl = document.getElementById('voucher-desc');
  const codeEl = document.getElementById('voucher-code');
  const termsEl = document.getElementById('voucher-terms');
  const claimedEl = document.getElementById('voucher-claimed');
  const claimBtn = host.querySelector('[data-voucher-claim]');
  const dismissBtn = host.querySelector('[data-voucher-dismiss]');
  const canvas = host.querySelector('[data-voucher-confetti]');

  titleEl.textContent = title;
  descEl.textContent = desc;
  descEl.hidden = !desc;
  if (code) {
    codeEl.textContent = code;
    codeEl.hidden = false;
  }
  if (terms) {
    termsEl.textContent = terms;
    termsEl.hidden = false;
  }

  const lastFocus = document.activeElement;
  let closed = false;

  const remember = () => {
    try {
      localStorage.setItem(VOUCHER_KEY, 'claimed');
    } catch {
      /* storage unavailable; the offer simply may repeat */
    }
  };

  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };

  function close() {
    if (closed) return;
    closed = true;
    host.setAttribute('hidden', '');
    document.body.classList.remove('voucher-open');
    document.removeEventListener('keydown', onKey);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function claim() {
    remember();
    voucherConfetti(canvas);
    claimBtn.disabled = true;
    dismissBtn.hidden = true;
    claimBtn.querySelector('.btn__label').textContent = 'Claimed';
    claimedEl.hidden = false;
    setTimeout(close, 1900);
  }

  claimBtn.addEventListener('click', claim);
  dismissBtn.addEventListener('click', () => {
    remember();
    close();
  });
  host.addEventListener('click', (event) => {
    if (event.target === host) close(); // click on the dimmed backdrop
  });
  document.addEventListener('keydown', onKey);

  // Let the page paint before covering it; a dialog over a blank page reads as
  // a broken site rather than an offer.
  setTimeout(() => {
    if (closed) return;
    host.removeAttribute('hidden');
    document.body.classList.add('voucher-open');
    claimBtn.focus();
  }, 650);
})();
