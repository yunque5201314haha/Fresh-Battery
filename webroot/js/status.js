/* ─── Status refresh ─── */
let _initDone = false;
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
    `grep '^POWER_SUPPLY_TEMP=' /sys/class/power_supply/battery/uevent 2>/dev/null | cut -d= -f2 | tr -d '\r\n'; printf '${SEP}'; ` +
    `grep '^POWER_SUPPLY_CYCLE_COUNT=' /sys/class/power_supply/battery/uevent 2>/dev/null | cut -d= -f2 | tr -d '\r\n'; printf '${SEP}'; ` +
    `grep '^POWER_SUPPLY_VOLTAGE_NOW=' /sys/class/power_supply/battery/uevent 2>/dev/null | cut -d= -f2 | tr -d '\r\n'; printf '${SEP}'; ` +
    `grep '^POWER_SUPPLY_STATUS=' /sys/class/power_supply/battery/uevent 2>/dev/null | cut -d= -f2 | tr -d '\r\n'; printf '${SEP}'; ` +
    `grep '^POWER_SUPPLY_CAPACITY=' /sys/class/power_supply/battery/uevent 2>/dev/null | cut -d= -f2 | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/battery/current_now 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat /sys/class/oplus_chg/battery/chip_soc 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat '${PIDFILE}' 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    (_initDone ? `printf ''; printf '${SEP}'; printf ''` : `getprop ro.product.model 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; grep '^version=' '${MODDIR}/module.prop' 2>/dev/null | cut -d= -f2 | tr -d '\r\n'`) +
    `; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/usb/present 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/usb/online 2>/dev/null | tr -d '\r\n'; printf '${SEP}'; ` +
    `cat /sys/class/power_supply/ac/online 2>/dev/null | tr -d '\r\n'`,
    8000
  );
  const _p = raw.split('||S||');
  const [tempRaw, cycleRaw, voltRaw, statusRaw, capacityRaw, currRaw, chipSocRaw, pidRaw, model, ver, usbPresentRaw, usbOnlineRaw, acOnlineRaw] =
    [_p[0]||'', _p[1]||'', _p[2]||'', _p[3]||'', _p[4]||'', _p[5]||'', _p[6]||'', _p[7]||'', _p[8]||'', _p[9]||'', _p[10]||'', _p[11]||'', _p[12]||''];

  /* ── 温度 ── */
  const tempVal = parseInt(tempRaw || '-1');
  const tempC   = tempVal >= 0 ? tempVal / 10 : -1;
  document.getElementById('m-batt').innerHTML = (tempC >= 0 ? tempC.toFixed(1) : '--') + '<sup>°C</sup>';
  /* tile-sec("电池实测") 的曲线记录真实温度历史 */
  if (tempC > 0) pushBatt(tempC);
  /* tile-pri("伪装写入") 的曲线记录目标温度（_initDone 后 cfg 已加载） */
  if (_initDone) pushTemp(cfg.target_temp);
  const pg = document.getElementById('page-status');
  if (pg && tempC > 0) {
    const isDark = document.documentElement.classList.contains('theme-dark') ||
      (!document.documentElement.classList.contains('theme-light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if      (tempC >= 40) pg.style.background = 'linear-gradient(180deg,' + (isDark ? '#2a1008' : '#fff2e8') + ' 0%,var(--clr-background) 200px)';
    else if (tempC >= 35) pg.style.background = 'linear-gradient(180deg,' + (isDark ? '#2a1a08' : '#fff8f0') + ' 0%,var(--clr-background) 200px)';
    else                  pg.style.background = '';
  }

  /* ── 充电状态（与 C 端 is_charging 对齐） ── */
  const chgStatus = (statusRaw || '').trim();
  const statusChg = chgStatus === 'Charging' || chgStatus === 'Full';
  const usbPresent = parseInt(usbPresentRaw || '0') === 1;
  const usbOnline  = parseInt(usbOnlineRaw  || '0') === 1;
  const acOnline   = parseInt(acOnlineRaw   || '0') === 1;
  const charging   = statusChg && (usbPresent || usbOnline || acOnline);
  const bc = document.getElementById('badge-chg');
  if (charging) { bc.textContent = '充电中'; bc.className = 'status-chip charging'; document.body.classList.add('charging'); }
  else          { bc.textContent = '未充电'; bc.className = 'status-chip'; document.body.classList.remove('charging'); }


  /* ── 电量 ── */
  const soc     = parseInt(capacityRaw || '-1');
  const chipSoc = parseInt(chipSocRaw  || '-1');
  document.getElementById('soc-disp-num').textContent = soc >= 0 ? soc : '--';
  document.getElementById('soc-disp').textContent     = soc >= 0 ? soc : '--';
  document.getElementById('soc-real').textContent     = chipSoc >= 0 ? chipSoc : '--';
  const socRealRow = document.getElementById('soc-real')?.closest('.soc-detail-row');
  if (socRealRow) socRealRow.style.display = _deviceBrand === 'xiaomi' ? 'none' : '';
  updateSocRing(soc >= 0 ? soc : 0);

  /* ── 电压 µV → mV ── */
  const voltUv = parseInt(voltRaw || '0');
  const voltMv = voltUv > 0 ? Math.round(voltUv / 1000) : null;
  document.getElementById('b-volt').textContent = voltMv ? voltMv : '--';

  /* ── 电流 µA → mA ── */
  const currMaRaw = parseInt(currRaw || '0');
  const currMa = currMaRaw;
  document.getElementById('b-curr').textContent = currMa;

  /* ── 功率 W ── */
  const watt = (voltMv && currMa) ? ((voltMv / 1000) * Math.abs(currMa) / 1000).toFixed(2) : null;
  document.getElementById('b-watt').textContent = watt ? watt : '--';
  const cellCurr = document.getElementById('cell-curr');
  if (cellCurr) cellCurr.classList.toggle('charging-hi', charging && currMa > 0);

  /* ── 循环 ── */
  const cycle = parseInt(cycleRaw || '-1');
  document.getElementById('b-cycle').textContent = cycle >= 0 ? cycle : '--';

  /* ── 伪装温度：直接从 cfg 读，不依赖 sysfs ── */
  if (_initDone) document.getElementById('m-target').innerHTML = cfg.target_temp + '<sup>°C</sup>';

  /* ── 进程状态 ── */
  if (pidRaw) {
    const pid = pidRaw.trim().split(/\s+/)[1] || '';
    document.getElementById('proc-pid').textContent = pid ? 'PID ' + pid : '—';
    const dot = document.getElementById('proc-dot'), st = document.getElementById('proc-status');
    if (pid) {
      dot.className = 'pid-dot ok'; st.textContent = '运行中'; st.className = 'pid-badge';
    } else {
      dot.className = 'pid-dot err'; st.textContent = '离线'; st.className = 'pid-badge off';
    }
  }
  if (model) document.getElementById('i-model').textContent = model;
  if (ver) document.getElementById('about-ver').textContent = ver + ' · 作者：石板上回荡的';
  /* 同步充电开启状态 */
  if (_initDone && typeof syncChgGateList === 'function') syncChgGateList();
  } finally { _refreshing = false; }
}

/* ─── 充电控制子页 ─── */
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

/* ─── 品牌检测（运行时一次性） ─── */
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

  /* 打招呼 */
  const el = document.getElementById('greeting-text');
  if (el) {
    if (name) {
      el.textContent = '尊贵的 ' + name + ' 用户，你好';
    } else if (_deviceBrand !== 'unknown') {
      el.textContent = '';
    }
    /* unknown 且无商业名：不显示，避免用代号 */
  }

  /* 阴阳页 */
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

/* ─── MMI 伪旁路（OPPO/一加/真我） ─── */
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

/* 伪插拔调节 */
const PLUG_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; /* 0=关 */
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
  /* oplus 面板 */
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
