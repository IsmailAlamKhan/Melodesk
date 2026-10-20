// Runs before first paint (loaded synchronously from index.html) so the window opens in the
// right theme, density and direction instead of flashing the defaults. It only reads the
// localStorage mirror written by src/appearance/store.ts; the app re-applies everything once
// React has started.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('melodesk.appearance') || '{}');
    var root = document.documentElement;
    var theme = p.theme || 'system';
    if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    root.dataset.theme = theme;
    root.dataset.density = p.density || 'comfortable';
    var lang = p.language && p.language !== 'system' ? p.language : navigator.language || 'en';
    var rtl = /^(ar|he|fa|ur|ps|sd|ug|yi|dv|ckb)(-|$)/i.test(lang) || lang === 'ar-XB';
    root.dir = p.direction === 'rtl' || (p.direction !== 'ltr' && rtl) ? 'rtl' : 'ltr';
    root.lang = lang;
    if (p.accent && p.accent.kind === 'custom' && /^#[0-9a-f]{6}$/i.test(p.accent.hex)) {
      root.style.setProperty('--color-accent', p.accent.hex);
    }
  } catch (e) {
    /* defaults apply */
  }
})();
