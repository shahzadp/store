/* ==========================================================================
   Sticky header offsets

   The announcement bar sticks to the top of the viewport; the header docks
   immediately below it. Both heights are published as CSS variables because
   the bar wraps to two lines on narrow screens, which would otherwise leave
   a gap or an overlap at a hardcoded offset.

   These have to be measured, not hardcoded -- and measured continuously.
   The bar's text is injected by Store.init() and wraps differently depending
   on that text and the viewport: at 390px wide it settles on two lines and
   54px, but a one-shot measurement taken at first paint sees the empty bar at
   35px. The hero, sized against --sticky-h, then overran the viewport by
   exactly that 19px, and on scroll the header docked 35px down under a 54px
   bar so it slid beneath the announcement text. A ResizeObserver catches
   every later change for the same reason: font loading, the injected copy,
   and an admin-edited delivery threshold all change the height too.
   ========================================================================== */

function stickyOffsets() {
  const announce = document.querySelector('.announce');
  const header = document.querySelector('.header');

  const announceHeight = announce ? Math.round(announce.getBoundingClientRect().height) : 0;
  const headerHeight = header ? Math.round(header.getBoundingClientRect().height) : 0;

  const root = document.documentElement.style;
  root.setProperty('--announce-h', `${announceHeight}px`);
  root.setProperty('--sticky-h', `${announceHeight + headerHeight}px`);
}

// Original name, kept because common.js calls it after it rewrites the
// announcement bar. That explicit call is the one that actually matters:
// see the note below on why ResizeObserver is not the primary mechanism.
function syncStickyOffsets() {
  stickyOffsets();
}

stickyOffsets();

// Fonts and late layout shifts change the bar's height after first paint.
window.addEventListener('resize', stickyOffsets);
window.addEventListener('load', stickyOffsets);

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(stickyOffsets);
}

// Secondary net, not the primary mechanism. ResizeObserver catches any later
// reflow (font swap, an admin-edited delivery threshold). It is kept as a
// safety net rather than relied upon because RO only fires when the document
// is actually painted -- it stays completely silent in a background iframe,
// where a forced 54px -> 66px change produced zero callbacks. The explicit
// syncStickyOffsets() call after the text is written is what makes this
// deterministic.
if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver(syncStickyOffsets);
  const announce = document.querySelector('.announce');
  const header = document.querySelector('.header');
  if (announce) observer.observe(announce);
  if (header) observer.observe(header);
}