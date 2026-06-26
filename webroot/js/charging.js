/* ─── 左滑手势（配置页 ↔ 充电详情）─── */
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

/* ─── Init ─── */
(async () => {
  /* 立即显示 UI，不让用户白屏等待 */
  document.body.style.opacity = '1';

  if (typeof ksu !== 'undefined' && ksu.fullScreen) ksu.fullScreen(true);
  await loadConfig();
  await Promise.all([refreshStatus(), detectDevice()]);
  /* 等待 @material/web 组件注册完成，避免淡入时出现未升级的裸元素闪烁；
     但最多等 1.5s——没网络/CDN 加载失败时也要正常显示界面 */
  const whenComponentsReady = Promise.all([
    customElements.whenDefined('md-filled-button'),
    customElements.whenDefined('md-outlined-button'),
  ]);
  const timeout = new Promise(r => setTimeout(r, 1500));
  await Promise.race([whenComponentsReady, timeout]);
  _initDone = true;
  applyChargingPanel();
  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(() => {
    if (document.getElementById('page-charging').classList.contains('active')) refreshChargingPage();
  }, 4000);
})();
