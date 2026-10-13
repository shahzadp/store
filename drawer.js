/* ==========================================================================
   Mobile drawer — shared by index.html and shop.html.
   ========================================================================== */

const MOBILE_BREAKPOINT = 820;

function initDrawer() {
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
  }

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') close();
    else open();
  });

  nav.querySelector('[data-menu-close]')?.addEventListener('click', close);
  document.querySelector('.nav-backdrop')?.addEventListener('click', close);

  // Following a link should close the drawer rather than leave it covering
  // the page. Same-page fragments must close it explicitly; full navigations
  // reload the document anyway, so they only need this for browsers that
  // restore the bfcache with the class still on <body>.
  nav.querySelectorAll('a').forEach((link) => {
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