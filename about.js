/* ==========================================================================
   Alex Store — About page bootstrap
   The page is static copy; this only boots the shared pieces.
   ========================================================================== */

// The catalog has to be initialised even though this page renders no
// product list: Store.init() is what fills in the footer's delivery note and
// rewrites every [data-whatsapp-general] href. Without it the page renders,
// but with a dead WhatsApp link and no delivery note.
Store.init().catch((err) => {
  console.error('Store init failed:', err);
});

initDrawer();
searchDialog();
Search.prefetch();