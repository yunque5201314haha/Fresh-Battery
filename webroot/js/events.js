/* ─── 事件绑定：替代 HTML 内联事件 ─── */
(function initEvents() {
  /* action 映射表 */
  const ACTIONS = {
    svcStop:          () => { popBtn(document.querySelector('[data-action="svcStop"]')); svcStop(); },
    svcRestart:       () => { popBtn(document.querySelector('[data-action="svcRestart"]')); svcRestart(); },
    refreshStatus:    () => { popBtn(document.querySelector('[data-action="refreshStatus"]')); refreshStatus(); },
    openChargingPage: () => openChargingPage(),
    saveConfig:       (el) => { popBtn(el); saveConfig(); },
    applyNow:         (el) => { popBtn(el); applyNow(); },
    applyOplus:       (el) => { popBtn(el); applyOplus(); },
    loadLog:          (el) => { popBtn(el); loadLog(); },
    clearLog:         () => clearLog(),
    onChgGateToggle:  () => onChgGateToggle(),
    onCapSpoofToggle: () => onCapSpoofToggle(),
    onCapSpoofSlider: (el) => onCapSpoofSlider(el),
    onTempSpoofToggle:() => onTempSpoofToggle(),
    onTempSpoofSlider:(el) => onTempSpoofSlider(el),
    onCcSpoofToggle:  () => onCcSpoofToggle(),
    onCcSpoofSlider:  (el) => onCcSpoofSlider(el),
    onStatusSpoofToggle:() => onStatusSpoofToggle(),
    onChgUnlockToggle:() => onChgUnlockToggle(),
    onDebugToggle:    () => onDebugToggle(),
    onBypassToggle:   () => onBypassToggle(),
    onCurrLimitToggle:() => onCurrLimitToggle(),
    onCurrSlider:     (el) => onCurrSlider(el),
    onTempSlider:     (el) => onTempSlider(el),
    onMmiToggle:      () => onMmiToggle(),
    onPlcToggle:      () => onPlcToggle(),
    onPlugToggle:     () => onPlugToggle(),
    onCompToggle:     () => onCompToggle(),
    onCompWifiToggle: () => onCompWifiToggle(),
    onCompAudioToggle:() => onCompAudioToggle(),
    onCpuToggle:      (el) => { cfg.cpu = el.checked ? 1 : 0; },
    onFrlogToggle:    () => onFrlogToggle(),
    onLogAutoToggle:  (el) => { _logAutoRefresh = el.checked; if (el.checked) startLogAutoRefresh(); else stopLogAutoRefresh(); },
    setPreset:        (el) => { const t = parseInt(el.dataset.temp, 10); if (!isNaN(t)) setPreset(t); },
    adjPlugInterval:  (el) => adjPlug('interval', parseInt(el.dataset.delta, 10) || 0),
    adjPlugLevel:     (el) => adjPlug('level', parseInt(el.dataset.delta, 10) || 0),
    openUrl:          (el) => openUrl(el.dataset.url || ''),
  };

  /* 统一事件委托 */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const fn = ACTIONS[action];
    if (fn) fn(el);
  });

  /* checkbox/range 事件委托 */
  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset.action) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el);
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset.action) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el);
  });

  /* 充电门控子开关事件委托 */
  document.addEventListener('change', e => {
    const el = e.target.closest('.chg-gate-switch input');
    if (el && typeof onChgSpoofChg === 'function') onChgSpoofChg(el);
  });
})();

/* ─── 日志自动刷新 ─── */
let _logAutoRefresh = false;
let _logAutoTimer = null;

function startLogAutoRefresh() {
  stopLogAutoRefresh();
  _logAutoTimer = setInterval(() => {
    if (_logAutoRefresh && document.getElementById('page-log').classList.contains('active')) {
      loadLog();
    }
  }, 3000);
}

function stopLogAutoRefresh() {
  if (_logAutoTimer) { clearInterval(_logAutoTimer); _logAutoTimer = null; }
}
