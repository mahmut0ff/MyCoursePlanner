// Prerendered pages only (scripts/prerender.mjs puts this tag in place of the
// app's module script). The page is already readable, so the app boots on the
// visitor's first input instead of competing with CSS and fonts for the first
// paint. Links are real <a> and work before boot; a tap on a <button> is
// remembered and replayed by main.tsx. External file because the CSP has no
// 'unsafe-inline' for scripts.
(function () {
  var entry = document.currentScript && document.currentScript.getAttribute('data-entry');
  if (!entry) return;
  var events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'mousemove'];
  var opts = { capture: true, passive: true };
  var started = false;
  function boot() {
    if (started) return;
    started = true;
    events.forEach(function (e) { removeEventListener(e, boot, opts); });
    var s = document.createElement('script');
    s.type = 'module';
    s.crossOrigin = '';
    s.src = entry;
    document.head.appendChild(s);
  }
  events.forEach(function (e) { addEventListener(e, boot, opts); });
  addEventListener('click', function (e) {
    if (window.__booted) return;
    var b = e.target && e.target.closest && e.target.closest('button');
    if (b) window.__bootClick = [].indexOf.call(document.querySelectorAll('button'), b);
  }, true);
})();
