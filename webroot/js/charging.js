(function initSwipeGesture() {
  let startX = 0, startY = 0, pointerId = null, decided = false, isHoriz = false;
  const THRESHOLD = 50;
  const main = document.getElementById('main');

  function relevant() {
    return document.getElementById('page-config').classList.contains('active') ||
           document.getElementById('page-charging').classList.contains('active');
  }

  main.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (!relevant()) return;
    pointerId = e.pointerId; startX = e.clientX; startY = e.clientY;
    decided = false; isHoriz = false;
  });

  main.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided = true;
      isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (isHoriz) {
        try { main.setPointerCapture(pointerId); } catch(_) {}
      }
    }
  });

  main.addEventListener('pointerup', e => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!decided || !isHoriz) return;
    const dx = e.clientX - startX;
    if (dx < -THRESHOLD && document.getElementById('page-config').classList.contains('active'))   openChargingPage();
    if (dx >  THRESHOLD && document.getElementById('page-charging').classList.contains('active')) closeChargingPage();
  });

  main.addEventListener('pointercancel', e => { if (e.pointerId === pointerId) pointerId = null; });
})();

(async () => {
  /* 立即显示 UI，不让用户白屏等待 */
  document.body.style.opacity = '1';

  if (typeof ksu !== 'undefined' && ksu.fullScreen) ksu.fullScreen(true);
  await loadConfig();
  if (typeof refreshStyleCache === 'function') refreshStyleCache();
  if (typeof themeRefreshStyleCache === 'function') themeRefreshStyleCache();
  await Promise.all([refreshStatus(), detectDevice()]);
  _initDone = true;
  applyChargingPanel();
  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(() => {
    if (document.getElementById('page-charging').classList.contains('active')) refreshChargingPage();
  }, 4000);
})();
