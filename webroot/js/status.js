let _initDone = false;
/* DOM 缓存：减少重复 getElementById */
const $ = (id, cache) => {
  if (cache && cache[id]) return cache[id];
  const el = document.getElementById(id);
  if (cache) cache[id] = el;
  return el;
};
const _dom = {};
/* 缓存 computed style 值避免重复触发重排 */
let _cachedPrimary = '', _cachedSecondary = '', _cachedIsDark = false;
function refreshStyleCache() {
  const el = document.documentElement;
  const cs = getComputedStyle(el);
  _cachedPrimary = (cs.getPropertyValue('--clr-primary').trim() || '#6750A4');
  _cachedSecondary = (cs.getPropertyValue('--clr-secondary').trim() || '#625B71');
  _cachedIsDark = el.classList.contains('theme-dark') ||
    (!el.classList.contains('theme-light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
let _debounceTimer = null;
function debounce(fn, ms) {
  if (_debounceTimer) { clearTimeout(_debounceTimer); }
  _debounceTimer = setTimeout(() => { _debounceTimer = null; fn(); }, ms);
}
async function svcStop() {
  await exec(`kill -9 $(awk '/^MAIN/{print $2}' '${PIDFILE}' 2>/dev/null) 2>/dev/null; true`);
  setTimeout(refreshStatus, 800);
}

async function svcRestart() {
  await exec(`kill -9 $(awk '/^MAIN/{print $2}' '${PIDFILE}' 2>/dev/null) 2>/dev/null; sleep 1; sh '${MODDIR}/service.sh' &`);
  setTimeout(refreshStatus, 2000);
}

let _refreshing = false;
async function refreshStatus() {
  if (_refreshing) return;
  _refreshing = true;
  try {
  const SEP = '||S||';
  const raw = await exec(
    `cat /sys/class/power_supply/battery/uevent 2>/dev/null; printf '${SEP}'; ` +
    `cat /sys/class/oplus_chg/battery/chip_soc 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat '${PIDFILE}' 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    (_initDone ? `printf ''; printf '${SEP}'; printf ''` : `getprop ro.product.model 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; grep '^version=' '${MODDIR}/module.prop' 2>/dev/null | cut -d= -f2 | tr -d '\r\n'`) +
    `; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/usb/present 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/usb/online 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/ac/online 2>/dev/null | tr -d '\r\n'`,
    8000
  );
  const _p = raw.split(SEP);
  const uev = parseUevent(_p[0]||'');
  const tempRaw     = uev['POWER_SUPPLY_TEMP'] || '';
  const cycleRaw    = uev['POWER_SUPPLY_CYCLE_COUNT'] || '';
  const voltRaw     = uev['POWER_SUPPLY_VOLTAGE_NOW'] || '';
  const statusRaw   = uev['POWER_SUPPLY_STATUS'] || '';
  const capacityRaw = uev['POWER_SUPPLY_CAPACITY'] || '';
  const currRaw     = uev['POWER_SUPPLY_CURRENT_NOW'] || '';
  const chipSocRaw  = _p[1]||'';
  const pidRaw      = _p[2]||'';
  const model       = _p[3]||'';
  const ver         = _p[4]||'';
  const usbPresentRaw = _p[5]||'';
  const usbOnlineRaw  = _p[6]||'';
  const acOnlineRaw   = _p[7]||'';

  const tempVal = parseInt(tempRaw || '-1');
  const tempC   = tempVal >= 0 ? tempVal / 10 : -1;
  $('m-batt', _dom).innerHTML = (tempC >= 0 ? tempC.toFixed(1) : '--') + '<sup>°C</sup>';
  if (tempC > 0) pushBatt(tempC);
  if (_initDone) pushTemp(cfg.target_temp);
  const pg = $('page-status', _dom);
  if (pg && tempC > 0) {
    if      (tempC >= 40) pg.style.background = 'linear-gradient(180deg,' + (_cachedIsDark ? '#2a1008' : '#fff2e8') + ' 0%,var(--clr-background) 200px)';
    else if (tempC >= 35) pg.style.background = 'linear-gradient(180deg,' + (_cachedIsDark ? '#2a1a08' : '#fff8f0') + ' 0%,var(--clr-background) 200px)';
    else                  pg.style.background = '';
  }

  const chgStatus = (statusRaw || '').trim();
  const statusChg = chgStatus === 'Charging' || chgStatus === 'Full';
  const usbPresent = parseInt(usbPresentRaw || '0') === 1;
  const usbOnline  = parseInt(usbOnlineRaw  || '0') === 1;
  const acOnline   = parseInt(acOnlineRaw   || '0') === 1;
  const charging   = statusChg && (usbPresent || usbOnline || acOnline);
  const bc = $('badge-chg', _dom);
  if (charging) { bc.textContent = '充电中'; bc.className = 'status-chip charging'; document.body.classList.add('charging'); }
  else          { bc.textContent = '未充电'; bc.className = 'status-chip'; document.body.classList.remove('charging'); }

  const soc     = parseInt(capacityRaw || '-1');
  const chipSoc = parseInt(chipSocRaw  || '-1');
  $('soc-disp-num', _dom).textContent = soc >= 0 ? soc : '--';
  $('soc-disp', _dom).textContent     = soc >= 0 ? soc : '--';
  $('soc-real', _dom).textContent     = chipSoc >= 0 ? chipSoc : '--';
  const socRealRow = $('soc-real', _dom)?.closest('.soc-detail-row');
  if (socRealRow) socRealRow.style.display = _deviceBrand === 'xiaomi' ? 'none' : '';
  updateSocRing(soc >= 0 ? soc : 0);

  const voltUv = parseInt(voltRaw || '0');
  const voltMv = voltUv > 0 ? Math.round(voltUv / 1000) : null;
  $('b-volt', _dom).textContent = voltMv ? voltMv : '--';

  const currMaRaw = parseInt(currRaw || '0');
  const currMa = currMaRaw;
  $('b-curr', _dom).textContent = currMa;

  const watt = (voltMv && currMa) ? ((voltMv / 1000) * Math.abs(currMa) / 1000).toFixed(2) : null;
  $('b-watt', _dom).textContent = watt ? watt : '--';
  const cellCurr = $('cell-curr', _dom);
  if (cellCurr) cellCurr.classList.toggle('charging-hi', charging && currMa > 0);

  const cycle = parseInt(cycleRaw || '-1');
  $('b-cycle', _dom).textContent = cycle >= 0 ? cycle : '--';

  if (_initDone) $('m-target', _dom).innerHTML = cfg.target_temp + '<sup>°C</sup>';

  if (pidRaw) {
    const pid = pidRaw.trim().split(/\s+/)[1] || '';
    $('proc-pid', _dom).textContent = pid ? 'PID ' + pid : '—';
    const dot = $('proc-dot', _dom), st = $('proc-status', _dom);
    if (pid) {
      dot.className = 'pid-dot ok'; st.textContent = '运行中'; st.className = 'pid-badge';
    } else {
      dot.className = 'pid-dot err'; st.textContent = '离线'; st.className = 'pid-badge off';
    }
  }
  if (model) $('i-model', _dom).textContent = model;
  if (ver) $('about-ver', _dom).textContent = ver + ' · 作者：石板上回荡的';
  if (_initDone && typeof syncChgGateList === 'function') debounce(syncChgGateList, 50);
  } finally { _refreshing = false; }
}

function openChargingPage() {
  applyChargingPanel();
  switchSlide('charging', 'left');
  refreshChargingPage();
}
function closeChargingPage() {
  switchSlide('config', 'right');
}

async function stopService() {
  const pidRaw = await exec(`cat '${PIDFILE}' 2>/dev/null`);
  const pid = (pidRaw || '').trim().split(/\s+/)[1] || '';
  if (pid) await exec(`kill -9 ${pid} 2>/dev/null`);
  await exec(`printf '' > '${PIDFILE}' 2>/dev/null`);
  setTimeout(refreshStatus, 800);
}

let _deviceBrand = '';   /* xiaomi / oplus / unknown */
let _deviceName  = '';   /* 商业机型名 */

async function detectDevice() {
  const [brand, mktname, dispname, oemname, model] = await Promise.all([
    exec(`getprop ro.product.brand 2>/dev/null`),
    exec(`getprop ro.product.marketname 2>/dev/null`),
    exec(`getprop ro.product.display 2>/dev/null`),
    exec(`getprop ro.vendor.oplus.market.name 2>/dev/null`),
    exec(`getprop ro.product.model 2>/dev/null`),
  ]);
  const b = (brand || '').trim().toLowerCase();
  /* 优先取包含空格或中文的（商业名），纯字母数字的通常是代号 */
  const candidates = [oemname, mktname, dispname, model]
    .map(s => (s || '').trim())
    .filter(Boolean);
  const name = candidates.find(s => /[\u4e00-\u9fa5]/.test(s) || /\s/.test(s)) || candidates[0] || '';
  _deviceName = name;

  if (b === 'xiaomi' || b === 'redmi' || b === 'poco') {
    _deviceBrand = 'xiaomi';
  } else if (b === 'oppo' || b === 'oneplus' || b === 'realme' || b === 'oplus') {
    _deviceBrand = 'oplus';
  } else {
    _deviceBrand = 'unknown';
  }

  const el = document.getElementById('greeting-text');
  if (el) {
    if (name) {
      el.textContent = '尊贵的 ' + name + ' 用户，你好';
    } else if (_deviceBrand !== 'unknown') {
      el.textContent = '';
    }
    /* unknown 且无商业名：不显示，避免用代号 */
  }

  applyChargingPanel();
}

function applyChargingPanel() {
  const mi     = document.getElementById('chg-panel-mi');
  const oplus  = document.getElementById('chg-panel-oplus');
  const unk    = document.getElementById('chg-panel-unknown');
  const dbg    = document.getElementById('sw-debug');
  if (!mi) return;
  const isDebug = dbg && dbg.checked;
  if (isDebug) {
    mi.style.display    = '';
    oplus.style.display = '';
    unk.style.display   = 'none';
  } else if (_deviceBrand === '') {
    /* 还在检测中，三个都隐藏，未识别面板显示检测中 */
    mi.style.display    = 'none';
    oplus.style.display = 'none';
    unk.style.display   = '';
    const msg = document.getElementById('chg-unknown-msg');
    if (msg) msg.textContent = '正在识别设备品牌…';
  } else {
    mi.style.display    = _deviceBrand === 'xiaomi'  ? '' : 'none';
    oplus.style.display = _deviceBrand === 'oplus'   ? '' : 'none';
    unk.style.display   = _deviceBrand === 'unknown' ? '' : 'none';
    const msg = document.getElementById('chg-unknown-msg');
    if (msg) msg.textContent = '未能识别设备品牌\n充电控制功能不可用';
  }
}

function onDebugToggle() {
  const dbg = document.getElementById('sw-debug');
  const miLabel    = document.querySelector('#chg-panel-mi .section-label');
  const oplusLabel = document.getElementById('oplus-label');
  if (dbg && dbg.checked) {
    if (miLabel)    miLabel.textContent    = '小米 / 红米';
    if (oplusLabel) oplusLabel.textContent = 'OPPO / 一加 / 真我';
  } else {
    if (miLabel)    miLabel.textContent    = '充电绕过';
    if (oplusLabel) oplusLabel.textContent = '充电绕过';
  }
  applyChargingPanel();
}

function onMmiToggle() {
  const sw = document.getElementById('sw-mmi');
  const ic = document.getElementById('mmi-icon');
  if (ic) ic.style.background = sw.checked
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
}

function onPlcToggle() {
  const sw = document.getElementById('sw-plc');
  const ic = document.getElementById('plc-icon');
  if (ic) ic.style.background = sw.checked
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
}

function onCompToggle() {
  setTimeout(() => {
    const sw = document.getElementById('sw-comp');
    const ic = document.getElementById('comp-icon');
    const detail = document.getElementById('comp-detail');
    const on = sw && sw.checked;
    if (ic) ic.style.background = on
      ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
      : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
    if (detail) detail.classList.toggle('open', on);
    if (!on) {
      const wifiSw  = document.getElementById('sw-comp-wifi');
      const audioSw = document.getElementById('sw-comp-audio');
      if (wifiSw)  wifiSw.checked  = false;
      if (audioSw) audioSw.checked = false;
    }
  }, 0);
}

function onCompWifiToggle() {
  cfg.comp_wifi = document.getElementById('sw-comp-wifi').checked ? 1 : 0;
}

function onCompAudioToggle() {
  cfg.comp_audio = document.getElementById('sw-comp-audio').checked ? 1 : 0;
}
function onPlugToggle() {
  setTimeout(() => {
    const sw = document.getElementById('sw-plug');
    const detail = document.getElementById('plug-detail');
    const ic = document.getElementById('plug-icon');
    const on = sw && sw.checked;
    if (detail) { detail.classList.toggle('open', on); }
    if (ic) ic.style.background = on
      ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
      : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
    /* 关闭时把间隔写0，C端轮询到0不执行伪插拔 */
    if (!on) { cfg.plug_interval = 0; syncPlugUI(); }
    else if (cfg.plug_interval === 0) { cfg.plug_interval = 1; syncPlugUI(); }
  }, 0);
}

/* 伪插拔间隔列表 */
const PLUG_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
function adjPlug(key, delta) {
  if (key === 'interval') {
    let idx = PLUG_INTERVALS.indexOf(cfg.plug_interval);
    if (idx === -1) idx = 1;  /* fallback to 1min */
    const ni = Math.max(1, Math.min(PLUG_INTERVALS.length - 1, idx + delta));
    cfg.plug_interval = PLUG_INTERVALS[ni];
    const el = document.getElementById('plug-interval-val');
    if (el) el.textContent = cfg.plug_interval === 0 ? '关' : cfg.plug_interval + 'min';
  } else {
    cfg.plug_level = Math.max(5, Math.min(100, cfg.plug_level + delta));
    const el = document.getElementById('plug-level-val');
    if (el) el.textContent = cfg.plug_level + '%';
  }
}

function syncPlugUI() {
  const el1 = document.getElementById('plug-interval-val');
  const el2 = document.getElementById('plug-level-val');
  const sw  = document.getElementById('sw-plug');
  const detail = document.getElementById('plug-detail');
  const on = cfg.plug_interval > 0;
  if (sw) sw.checked = on;
  if (detail) { detail.classList.toggle('open', on); }
  const ic = document.getElementById('plug-icon');
  if (ic) ic.style.background = on
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
  if (el1) el1.textContent = cfg.plug_interval > 0 ? cfg.plug_interval + 'min' : '1min';
  if (el2) el2.textContent = cfg.plug_level + '%';
}

async function applyOplus() {
  readForm();
  if (cfg.oplus_comp) {
    await exec(`setprop persist.sys.oplus.wifi.sla.game_high_temperature ${cfg.comp_wifi ? '1' : '0'} 2>/dev/null; setprop ro.oplus.audio.thermal_control ${cfg.comp_audio ? '0' : '1'} 2>/dev/null; true`);
  }
  await saveConfig();
}

async function refreshChargingPage() {
  /* 同步 mi 面板的开关状态到 cfg */
  const swCl = document.getElementById('sw-currlimit');
  const swBp = document.getElementById('sw-bypass');
  if (swCl) swCl.checked = !!cfg.currlimit;
  if (swBp) swBp.checked = !!cfg.bypass;
  const ciChg = document.getElementById('curr-icon-chg');
  if (ciChg) ciChg.style.background = cfg.currlimit
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
  const bpIcon = document.getElementById('bypass-icon');
  if (bpIcon) bpIcon.style.background = cfg.bypass
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
  if (_deviceBrand === 'oplus') {
    const sw = document.getElementById('sw-mmi');
    if (sw) { sw.checked = !!cfg.mmi_bypass; onMmiToggle(); }
    const swPlc = document.getElementById('sw-plc');
    if (swPlc) { swPlc.checked = !!cfg.plc_charge; onPlcToggle(); }
    const swComp = document.getElementById('sw-comp');
    if (swComp) { swComp.checked = !!cfg.oplus_comp; onCompToggle(); }
    syncPlugUI();
  }
}

function socColor(pct) {
  if (pct >= 60) return '#4CAF50';
  if (pct >= 30) return '#FF9800';
  return '#F44336';
}
function updateSocRing(pct) {
  const circ = 314.16;
  const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const arc = $('soc-ring-arc', _dom);
  const fill = $('soc-fill', _dom);
  if (!arc && !fill) return;
  const col = socColor(pct);
  if (arc) { arc.style.strokeDashoffset = offset.toFixed(2); arc.style.stroke = col; }
  if (fill) { fill.style.width = Math.min(pct,100) + '%'; fill.style.background = col; }
}

const battHistory = [];
function pushBatt(v) {
  if (typeof v === 'number' && v > 0) { battHistory.push(v); if (battHistory.length > 30) battHistory.shift(); }
  drawBattSparkline();
}
function drawBattSparkline() {
  const c = document.getElementById('sparkline-batt'); if (!c) return;
  const W = c.offsetWidth || 120, H = 28, dpr = window.devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  if (battHistory.length < 2) { ctx.clearRect(0,0,W,H); return; }
  const mn = Math.min(...battHistory)-1, mx = Math.max(...battHistory)+1;
  const pts = battHistory.map((v,i) => ({ x: i/(battHistory.length-1)*W, y: H-(v-mn)/(mx-mn)*(H-6)-3 }));
  const pr = _cachedSecondary;
  ctx.beginPath(); ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, H); ctx.closePath();
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, pr+'55'); g.addColorStop(1, pr+'00');
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=1; i<pts.length; i++) {
    const mx2 = (pts[i-1].x + pts[i].x)/2;
    ctx.bezierCurveTo(mx2,pts[i-1].y, mx2,pts[i].y, pts[i].x,pts[i].y);
  }
  ctx.strokeStyle = pr; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
}

function parseUevent(raw) {
  const m = {};
  raw.split('\n').forEach(l => {
    const i = l.indexOf('=');
    if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  });
  return m;
}
