/* ==========================================================================
   Sticky header offsets
   The announcement bar sticks to the top of the viewport; the header docks
   immediately below it. Both heights are measured in JS because the bar
   wraps to two lines on narrow screens, which would otherwise leave a gap
   or overlap at a hardcoded offset.
   ========================================================================== */

function syncStickyOffsets() {
  const announce = document.querySelector('.announce');
  if (!announce) return;

  const height = Math.round(announce.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--announce-h', `${height}px`);
}

// Fonts and late layout shifts change the bar's height after first paint.
syncStickyOffsets();
window.addEventListener('resize', syncStickyOffsets);
window.addEventListener('load', syncStickyOffsets);

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(syncStickyOffsets);
}