/* ==========================================================================
   Sticky header offsets

   The header is sticky and the hero is sized against these offsets, so the
   chrome's real height has to be published as CSS variables rather than
   assumed. There used to be a sticky announcement bar above the header; it is
   now a first-visit voucher (see voucher.js), so `.announce` is normally
   absent and the announced height is zero — but the measuring stays, because
   a future bar, a wrapped header or a font swap still has to be caught.

   These have to be measured, not hardcoded -- and measured continuously. The
   header wraps differently depending on the viewport, and a one-shot
   measurement taken at first paint can miss a later reflow. A ResizeObserver
   catches every later change: font loading, injected copy, and an admin-edited
   setting all change the height too.
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

// Original name, kept because common.js calls it after the catalog resolves.
// That explicit call is the one that actually matters: see the note below on
// why ResizeObserver is not the primary mechanism.
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
// reflow (font swap, an admin-edited setting). It is kept as a safety net
// rather than relied upon because RO only fires when the document is actually
// painted -- it stays completely silent in a background iframe, where a forced
// height change produced zero callbacks. The explicit syncStickyOffsets() call
// after the catalog resolves is what makes this deterministic.
if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver(syncStickyOffsets);
  const announce = document.querySelector('.announce');
  const header = document.querySelector('.header');
  if (announce) observer.observe(announce);
  if (header) observer.observe(header);
}