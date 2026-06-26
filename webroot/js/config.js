/* ─── Config I/O — extend global cfg with disguise defaults ─── */
Object.assign(cfg, {
  chg_gate:0, cap_spoof:0, cap_spoof_val:80, cap_spoof_chg:0, temp_spoof:0, temp_spoof_val:34, temp_spoof_chg:0,
  cc_spoof_val:10, cc_spoof_chg:0, status_spoof:0, status_spoof_chg:0, chg_unlock:0, chg_unlock_chg:0,
  bypass_chg:0, currlimit_chg:0, mmi_chg:0, plc_chg:0, plug_chg:0, oplus_comp_chg:0
});

async function loadConfig() {
  const SEP = '||FB||';
  const keys = ['目标温度','服务开关','循环伪装','CPU频率解锁','电量挂载','MI伪旁路充电','电流限制','最大电流','O伪旁路充电','伪插拔间隔','伪插拔电量','伪Osys旁路充电','组件控制','WiFi高温加速','音频热控',
    '充电开启','电量伪装','电量伪装值','温度伪装','温度伪装值','循环伪装值','充放状态伪装','亮屏充电限制',
    '电量伪装充电','温度伪装充电','循环伪装充电','充放状态充电','亮屏充电充电',
    'MI旁路充电','电流限制充电','O旁路充电','Osys旁路充电','伪插拔充电','组件控制充电'];
  const grepCmds = keys.map(k =>
    `grep -m1 "^${k}=" '${CFG}' 2>/dev/null | cut -d= -f2 | tr -d '\r\n'`
  ).join(`; printf '${SEP}'; `);
  const raw = await exec(`[ -f '${CFG}' ] || { echo '目标温度=34'; echo '服务开关=0'; echo '循环伪装=0'; echo 'CPU频率解锁=0'; echo '电量挂载=0'; echo 'MI伪旁路充电=0'; echo '电流限制=0'; echo '最大电流=22000'; echo 'O伪旁路充电=0'; echo '伪插拔间隔=0'; echo '伪插拔电量=80'; echo '伪Osys旁路充电=0'; echo '组件控制=0'; echo 'WiFi高温加速=0'; echo '音频热控=0'; echo '充电开启=0'; echo '电量伪装=0'; echo '电量伪装值=80'; echo '温度伪装=0'; echo '温度伪装值=34'; echo '循环伪装值=10'; echo '充放状态伪装=0'; echo '亮屏充电限制=0'; echo '电量伪装充电=0'; echo '温度伪装充电=0'; echo '循环伪装充电=0'; echo '充放状态充电=0'; echo '亮屏充电充电=0'; echo 'MI旁路充电=0'; echo '电流限制充电=0'; echo 'O旁路充电=0'; echo 'Osys旁路充电=0'; echo '伪插拔充电=0'; echo '组件控制充电=0'; } > '${CFG}'; printf '${SEP}'; ` + grepCmds, 10000);
  const parts = raw.split(SEP);
  const v = i => (parts[i] || '').trim();
  const vi = i => parseInt(v(i), 10);
  const vb = i => v(i) === '1' ? 1 : 0;
  const t = vi(1); if (t>=30&&t<=38) cfg.target_temp = t;
  cfg.svc         = vb(2);
  cfg.cc          = vb(3);
  cfg.cpu         = vb(4);
  cfg.cap         = vb(5);
  cfg.bypass      = vb(6);
  cfg.currlimit   = vb(7);
  const cm = vi(8); if (cm>=500&&cm<=22000) cfg.currma = cm;
  cfg.mmi_bypass  = vb(9);
  const pi = vi(10); if (pi>=0&&!isNaN(pi)) cfg.plug_interval = pi;
  const pl = vi(11); if (pl>0&&pl<=100) cfg.plug_level = pl;
  cfg.plc_charge  = vb(12);
  cfg.oplus_comp  = vb(13);
  cfg.comp_wifi   = vb(14);
  cfg.comp_audio  = vb(15);
  /* 公共页伪装功能 */
  cfg.chg_gate      = vb(16);
  cfg.cap_spoof     = vb(17);
  const csv = vi(18); if (csv>=0&&csv<=100) cfg.cap_spoof_val = csv;
  cfg.temp_spoof    = vb(19);
  const tsv = vi(20); if (tsv>=0&&tsv<=100) cfg.temp_spoof_val = tsv;
  const ccv = vi(21); if (ccv>=0) cfg.cc_spoof_val = ccv;
  cfg.status_spoof  = vb(22);
  cfg.chg_unlock    = vb(23);
  cfg.cap_spoof_chg   = vb(24);
  cfg.temp_spoof_chg  = vb(25);
  cfg.cc_spoof_chg    = vb(26);
  cfg.status_spoof_chg = vb(27);
  cfg.chg_unlock_chg  = vb(28);
  cfg.bypass_chg      = vb(29);
  cfg.currlimit_chg   = vb(30);
  cfg.mmi_chg         = vb(31);
  cfg.plc_chg         = vb(32);
  cfg.plug_chg        = vb(33);
  cfg.oplus_comp_chg  = vb(34);
  setPreset(cfg.target_temp);
  drawGauge(cfg.target_temp);
  ['svc','cc','cpu','cap','bypass','currlimit'].forEach(f => {
    const inp = document.getElementById('sw-' + f);
    if (inp) inp.checked = !!cfg[f];
  });
  const mmiSw = document.getElementById('sw-mmi');
  if (mmiSw) { mmiSw.checked = !!cfg.mmi_bypass; onMmiToggle(); }
  const plcSw = document.getElementById('sw-plc');
  if (plcSw) { plcSw.checked = !!cfg.plc_charge; onPlcToggle(); }
  const compSw = document.getElementById('sw-comp');
  if (compSw) { compSw.checked = !!cfg.oplus_comp; onCompToggle(); }
  const wifiSw = document.getElementById('sw-comp-wifi');
  const audioSw = document.getElementById('sw-comp-audio');
  if (wifiSw) wifiSw.checked = !!cfg.comp_wifi;
  if (audioSw) audioSw.checked = !!cfg.comp_audio;
  syncPlugUI();
  applyMasterUI(!!cfg.svc);
  updateWallChip(cfg.target_temp);
  /* 公共页 UI 同步 */
  syncPublicUI();
}


function readForm() {
  const sv = +document.getElementById('temp-slider').value;
  if (sv>=30&&sv<=38) cfg.target_temp = sv;
  ['svc','cc','cpu','cap','bypass','currlimit'].forEach(f => {
    cfg[f] = document.getElementById('sw-'+f)?.checked ? 1 : 0;
  });
  const cs = document.getElementById('curr-slider');
  if (cs) cfg.currma = Math.max(500, Math.min(22000, +cs.value));
  const swMmi = document.getElementById('sw-mmi');
  const swPlc = document.getElementById('sw-plc');
  if (swMmi) cfg.mmi_bypass  = swMmi.checked ? 1 : 0;
  const compSwR = document.getElementById('sw-comp');
  if (compSwR) cfg.oplus_comp = compSwR.checked ? 1 : 0;
  if (swPlc) cfg.plc_charge  = swPlc.checked ? 1 : 0;
  const swWifi = document.getElementById('sw-comp-wifi');
  const swAudio = document.getElementById('sw-comp-audio');
  if (swWifi) cfg.comp_wifi = swWifi.checked ? 1 : 0;
  if (swAudio) cfg.comp_audio = swAudio.checked ? 1 : 0;
  const elChgGate = document.getElementById('sw-chg-gate');
  if (elChgGate) cfg.chg_gate = elChgGate.checked ? 1 : 0;
  const elCap = document.getElementById('sw-cap-spoof');
  if (elCap) cfg.cap_spoof = elCap.checked ? 1 : 0;
  const capSv = document.getElementById('cap-spoof-slider');
  if (capSv) cfg.cap_spoof_val = +capSv.value;
  const elTemp = document.getElementById('sw-temp-spoof');
  if (elTemp) cfg.temp_spoof = elTemp.checked ? 1 : 0;
  const tempSv = document.getElementById('temp-spoof-slider');
  if (tempSv) cfg.temp_spoof_val = +tempSv.value;
  const elCc = document.getElementById('sw-cc-spoof');
  if (elCc) cfg.cc = elCc.checked ? 1 : 0;
  const ccSv = document.getElementById('cc-spoof-slider');
  if (ccSv) cfg.cc_spoof_val = +ccSv.value;
  const elStatus = document.getElementById('sw-status-spoof');
  if (elStatus) cfg.status_spoof = elStatus.checked ? 1 : 0;
  const elUnlock = document.getElementById('sw-chg-unlock');
  if (elUnlock) cfg.chg_unlock = elUnlock.checked ? 1 : 0;
  /* 充电模式专属标记（仅在DOM中存在时读取，避免展开列表收起后丢失） */
  const rChk = id => { const e = document.getElementById(id); return e ? (e.checked ? 1 : 0) : null; };
  const m = (v, k) => { if (v !== null) cfg[k] = v; };
  m(rChk('sw-cap-spoof-chg'),   'cap_spoof_chg');
  m(rChk('sw-temp-spoof-chg'),  'temp_spoof_chg');
  m(rChk('sw-cc-spoof-chg'),    'cc_spoof_chg');
  m(rChk('sw-status-spoof-chg'),'status_spoof_chg');
  m(rChk('sw-chg-unlock-chg'),  'chg_unlock_chg');
  m(rChk('sw-bypass-chg'),      'bypass_chg');
  m(rChk('sw-currlimit-chg'),   'currlimit_chg');
  m(rChk('sw-mmi-chg'),         'mmi_chg');
  m(rChk('sw-plc-chg'),         'plc_chg');
  m(rChk('sw-plug-chg'),        'plug_chg');
  m(rChk('sw-comp-chg'),        'oplus_comp_chg');
}

async function saveConfig() {
  readForm();
  const TMP = CFG + '.tmp';
  const pi = cfg.plug_interval == null ? 0 : cfg.plug_interval;
  const pl = cfg.plug_level   == null ? 80 : cfg.plug_level;
  const cfgLines = [
    '目标温度=' + cfg.target_temp,
    '服务开关=' + cfg.svc,
    '循环伪装=' + cfg.cc,
    'CPU频率解锁=' + cfg.cpu,
    '电量挂载=' + cfg.cap,
    'MI伪旁路充电=' + cfg.bypass,
    '电流限制=' + cfg.currlimit,
    '最大电流=' + cfg.currma,
    'O伪旁路充电=' + cfg.mmi_bypass,
    '伪插拔间隔=' + pi,
    '伪插拔电量=' + pl,
    '伪Osys旁路充电=' + cfg.plc_charge,
    '组件控制=' + cfg.oplus_comp,
    'WiFi高温加速=' + cfg.comp_wifi,
    '音频热控=' + cfg.comp_audio,
    '充电开启=' + cfg.chg_gate,
    '电量伪装=' + cfg.cap_spoof,
    '电量伪装值=' + cfg.cap_spoof_val,
    '温度伪装=' + cfg.temp_spoof,
    '温度伪装值=' + cfg.temp_spoof_val,
    '循环伪装值=' + cfg.cc_spoof_val,
    '充放状态伪装=' + cfg.status_spoof,
    '亮屏充电限制=' + cfg.chg_unlock,
    '电量伪装充电=' + cfg.cap_spoof_chg,
    '温度伪装充电=' + cfg.temp_spoof_chg,
    '循环伪装充电=' + cfg.cc_spoof_chg,
    '充放状态充电=' + cfg.status_spoof_chg,
    '亮屏充电充电=' + cfg.chg_unlock_chg,
    'MI旁路充电=' + cfg.bypass_chg,
    '电流限制充电=' + cfg.currlimit_chg,
    'O旁路充电=' + cfg.mmi_chg,
    'Osys旁路充电=' + cfg.plc_chg,
    '伪插拔充电=' + cfg.plug_chg,
    '组件控制充电=' + cfg.oplus_comp_chg
  ].join('\n');
  const escaped = cfgLines.replace(/'/g, "'\\''");
  const cmd = "printf '%s\\n' '" + escaped + "' > '" + TMP + "' && mv -f '" + TMP + "' '" + CFG + "' && chmod 666 '" + CFG + "'";
  await exec(cmd, 10000);
}


async function applyNow() {
  readForm();
  await saveConfig();
  const ua = cfg.currma * 1000;
  /* 挂载操作立即执行，不依赖 daemon 重启 */
  await exec(`(
    ${cfg.cc
      ? `mkdir -p '${MODDIR}/fake' && printf '${cfg.cc_spoof_val || 10}\\n' > '${FAKE_CC}' && chmod 444 '${FAKE_CC}' && { [ -e '${CC1}' ] && mount --bind '${FAKE_CC}' '${CC1}'; } && { [ -e '${CC2}' ] && mount --bind '${FAKE_CC}' '${CC2}'; }`
      : `umount -l '${CC1}'; umount -l '${CC2}'`} 2>/dev/null
    ${cfg.cap ? `mount --bind '${CHIP_SOC}' '${BAT_CAP}'` : `umount -l '${BAT_CAP}'`} 2>/dev/null
    ${cfg.cap_spoof
      ? `mkdir -p '${MODDIR}/fake' && printf '%s\\n' '${cfg.cap_spoof_val}' > '${MODDIR}/fake/fakecap' && chmod 444 '${MODDIR}/fake/fakecap' && mount --bind '${MODDIR}/fake/fakecap' '${BAT_CAP}'`
      : `umount -l '${BAT_CAP}'`} 2>/dev/null
    ${cfg.temp_spoof
      ? `mkdir -p '${MODDIR}/fake' && printf '%s\\n' '$((cfg.temp_spoof_val * 10))' > '${MODDIR}/fake/faketemp' && chmod 444 '${MODDIR}/fake/faketemp' && for f in /sys/class/power_supply/battery/temp /sys/class/oplus_chg/battery/temp /sys/class/oplus_chg/battery/batt_temp /sys/class/oplus_chg/battery/temp_level; do [ -e "$f" ] && mount --bind '${MODDIR}/fake/faketemp' "$f"; done`
      : `for f in /sys/class/power_supply/battery/temp /sys/class/oplus_chg/battery/temp /sys/class/oplus_chg/battery/batt_temp /sys/class/oplus_chg/battery/temp_level; do umount -l "$f" 2>/dev/null; done`} 2>/dev/null
    ${cfg.status_spoof
      ? `mkdir -p '${MODDIR}/fake' && printf 'Discharging\\n' > '${MODDIR}/fake/fakestatus' && chmod 444 '${MODDIR}/fake/fakestatus' && mount --bind '${MODDIR}/fake/fakestatus' '/sys/class/power_supply/battery/status'`
      : `umount -l '/sys/class/power_supply/battery/status'`} 2>/dev/null
    echo ${cfg.cpu?1:0} > '${CPU_LMT}' 2>/dev/null
    ${cfg.bypass ? `for f in /sys/class/power_supply/battery/constant_charge_current_max /sys/class/power_supply/battery/fast_charge_current /sys/class/power_supply/usb/input_current_limit /sys/class/power_supply/usb/current_max /sys/class/power_supply/ac/input_current_limit /sys/class/oplus_chg/usb/hw_current_max; do [ -w "$f" ] && echo 500000 > "$f"; done; for v in /proc/oplus-votable/FCC/force_active /proc/oplus-votable/ICL/force_active /proc/oplus-votable/WIRED_CURR_CTRL/force_active; do [ -w "$v" ] && echo 1 > "$v"; done` : `for v in /proc/oplus-votable/FCC/force_active /proc/oplus-votable/ICL/force_active /proc/oplus-votable/WIRED_CURR_CTRL/force_active; do [ -w "$v" ] && echo 0 > "$v"; done`} 2>/dev/null
    ${cfg.currlimit ? `for f in /sys/class/power_supply/battery/constant_charge_current_max /sys/class/power_supply/battery/fast_charge_current /sys/class/power_supply/usb/input_current_limit /sys/class/power_supply/usb/current_max /sys/class/power_supply/ac/input_current_limit /sys/class/oplus_chg/usb/hw_current_max; do [ -w "$f" ] && echo ${ua} > "$f"; done; for v in /proc/oplus-votable/FCC/force_active /proc/oplus-votable/ICL/force_active /proc/oplus-votable/WIRED_CURR_CTRL/force_active; do [ -w "$v" ] && echo 1 > "$v"; done` : `for v in /proc/oplus-votable/FCC/force_active /proc/oplus-votable/ICL/force_active /proc/oplus-votable/WIRED_CURR_CTRL/force_active; do [ -w "$v" ] && echo 0 > "$v"; done`} 2>/dev/null
    true
  ) &`, 12000);
  /* 服务开关：开 → 杀旧进程后重启 daemon；关 → 杀进程并清空 pids */
  if (cfg.svc) {
    exec(`(kill -9 $(awk '/^MAIN/{print $2}' '${PIDFILE}' 2>/dev/null) 2>/dev/null; sleep 0.5; sh '${MODDIR}/service.sh') &`);
    setTimeout(refreshStatus, 2200);
  } else {
    await exec(`kill -9 $(awk '/^MAIN/{print $2}' '${PIDFILE}' 2>/dev/null) 2>/dev/null; printf '' > '${PIDFILE}' 2>/dev/null; true`);
    setTimeout(refreshStatus, 800);
  }
}

/* ─── 公共页 UI 同步 — 各伪装功能独立控制 ─── */
function syncPublicUI() {
  /* 充电开启 */
  const chgGateSw = document.getElementById('sw-chg-gate');
  if (chgGateSw) chgGateSw.checked = !!cfg.chg_gate;
  updateSpoofIcon('chg-gate-icon', cfg.chg_gate);
  syncChgGateList();

  /* 各伪装功能的开关和滑块同步 */
  const syncSw = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  syncSw('sw-cap-spoof', cfg.cap_spoof);
  syncSw('sw-temp-spoof', cfg.temp_spoof);
  syncSw('sw-cc-spoof', cfg.cc);
  syncSw('sw-status-spoof', cfg.status_spoof);
  syncSw('sw-chg-unlock', cfg.chg_unlock);

  /* 滑块 */
  const capSl = document.getElementById('cap-spoof-slider');
  if (capSl) { capSl.value = cfg.cap_spoof_val; syncSlider(capSl); }
  const tempSl = document.getElementById('temp-spoof-slider');
  if (tempSl) { tempSl.value = cfg.temp_spoof_val; syncSlider(tempSl); }
  const ccSl = document.getElementById('cc-spoof-slider');
  if (ccSl) { ccSl.value = cfg.cc_spoof_val; syncSlider(ccSl); }

  /* 值显示 */
  const capVal = document.getElementById('cap-spoof-val');
  if (capVal) capVal.textContent = cfg.cap_spoof_val + '%';
  const tempVal = document.getElementById('temp-spoof-val');
  if (tempVal) tempVal.textContent = cfg.temp_spoof_val + '°C';
  const ccVal = document.getElementById('cc-spoof-val');
  if (ccVal) ccVal.textContent = cfg.cc_spoof_val;

  /* 各伪装功能的展开/折叠 */
  toggleDisguiseBody('cap-spoof-body', cfg.cap_spoof);
  toggleDisguiseBody('temp-spoof-body', cfg.temp_spoof);
  toggleDisguiseBody('cc-spoof-body', cfg.cc);

  /* icon 颜色 */
  updateSpoofIcon('cap-spoof-icon', cfg.cap_spoof);
  updateSpoofIcon('temp-spoof-icon', cfg.temp_spoof);
  updateSpoofIcon('cc-spoof-icon', cfg.cc);
  updateSpoofIcon('status-spoof-icon', cfg.status_spoof);
  updateSpoofIcon('chg-unlock-icon', cfg.chg_unlock);
}

function toggleDisguiseBody(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open', !!on);
}

function updateSpoofIcon(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.background = on
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
}

/* ─── 充电开启 toggle — 展开列表只显示已开启的功能 ─── */
function onChgGateToggle() {
  cfg.chg_gate = document.getElementById('sw-chg-gate').checked ? 1 : 0;
  updateSpoofIcon('chg-gate-icon', cfg.chg_gate);
  syncChgGateList();
}

/* 充电开启展开列表 — 只显示已开启的功能，每项可选"充电专属" */
function syncChgGateList() {
  const body = document.getElementById('chg-gate-body');
  const list = document.getElementById('chg-gate-list');
  const sw = document.getElementById('sw-chg-gate');
  const on = sw && sw.checked;
  const status = document.getElementById('chg-gate-status');
  if (status) {
    const chg = document.body.classList.contains('charging');
    status.textContent = chg ? '当前：充电中' : '当前：未充电';
  }
  if (!body || !list) return;
  body.classList.toggle('open', !!on);
  if (!on) return;

  const items = [];
  if (cfg.cap_spoof)    items.push({ id:'sw-cap-spoof-chg', name:'电量伪装', detail: cfg.cap_spoof_val + '%', chg: cfg.cap_spoof_chg });
  if (cfg.temp_spoof)   items.push({ id:'sw-temp-spoof-chg', name:'电池温度伪装', detail: cfg.temp_spoof_val + '°C', chg: cfg.temp_spoof_chg });
  if (cfg.cc)           items.push({ id:'sw-cc-spoof-chg', name:'充电循环次数伪装', detail: '' + cfg.cc_spoof_val, chg: cfg.cc_spoof_chg });
  if (cfg.status_spoof) items.push({ id:'sw-status-spoof-chg', name:'充放状态伪装', detail:'伪装为未充电', chg: cfg.status_spoof_chg });
  if (cfg.chg_unlock)   items.push({ id:'sw-chg-unlock-chg', name:'解除亮屏充电限制', detail:'', chg: cfg.chg_unlock_chg });
  /* 充电页功能 */
  if (cfg.bypass)       items.push({ id:'sw-bypass-chg', name:'MI伪旁路充电', detail:'限流500mA', chg: cfg.bypass_chg });
  if (cfg.currlimit)    items.push({ id:'sw-currlimit-chg', name:'电流限制', detail: cfg.currma + 'mA', chg: cfg.currlimit_chg });
  if (cfg.mmi_bypass)   items.push({ id:'sw-mmi-chg', name:'O伪旁路充电', detail:'', chg: cfg.mmi_chg });
  if (cfg.plc_charge)   items.push({ id:'sw-plc-chg', name:'伪Osys旁路充电', detail:'', chg: cfg.plc_chg });
  if (cfg.plug_interval > 0) items.push({ id:'sw-plug-chg', name:'伪插拔', detail: cfg.plug_interval + 'min', chg: cfg.plug_chg });
  if (cfg.oplus_comp)   items.push({ id:'sw-comp-chg', name:'组件控制', detail:'', chg: cfg.oplus_comp_chg });

  list.innerHTML = items.length
    ? items.map(i =>
        '<div class="chg-gate-item">' +
          '<label class="chg-gate-switch">' +
            '<input type="checkbox" id="' + i.id + '" onchange="onChgSpoofChg(this)"' + (i.chg ? ' checked' : '') + '>' +
            '<span class="track"></span>' +
          '</label>' +
          '<span class="chg-gate-opt-label">充电专属</span>' +
          '<span class="chg-gate-label">' + i.name + '</span>' +
          (i.detail ? '<span class="chg-gate-detail">' + i.detail + '</span>' : '') +
        '</div>'
      ).join('')
    : '<div class="chg-gate-empty">尚未开启任何功能</div>';
}

/* 充电专属标记 toggle */
function onChgSpoofChg(el) {
  const map = {
    'sw-cap-spoof-chg':'cap_spoof_chg', 'sw-temp-spoof-chg':'temp_spoof_chg',
    'sw-cc-spoof-chg':'cc_spoof_chg', 'sw-status-spoof-chg':'status_spoof_chg',
    'sw-chg-unlock-chg':'chg_unlock_chg',
    'sw-bypass-chg':'bypass_chg', 'sw-currlimit-chg':'currlimit_chg',
    'sw-mmi-chg':'mmi_chg', 'sw-plc-chg':'plc_chg',
    'sw-plug-chg':'plug_chg', 'sw-comp-chg':'oplus_comp_chg'
  };
  const key = map[el.id];
  if (key) cfg[key] = el.checked ? 1 : 0;
}

/* ─── 公共页 toggle 处理函数 ─── */
function onCapSpoofToggle() {
  cfg.cap_spoof = document.getElementById('sw-cap-spoof').checked ? 1 : 0;
  toggleDisguiseBody('cap-spoof-body', cfg.cap_spoof);
  updateSpoofIcon('cap-spoof-icon', cfg.cap_spoof);
  syncChgGateList();
}

function onCapSpoofSlider(el) {
  syncSlider(el);
  cfg.cap_spoof_val = +el.value;
  const valEl = document.getElementById('cap-spoof-val');
  if (valEl) valEl.textContent = el.value + '%';
  syncChgGateList();
}

function onTempSpoofToggle() {
  cfg.temp_spoof = document.getElementById('sw-temp-spoof').checked ? 1 : 0;
  toggleDisguiseBody('temp-spoof-body', cfg.temp_spoof);
  updateSpoofIcon('temp-spoof-icon', cfg.temp_spoof);
  syncChgGateList();
}

function onTempSpoofSlider(el) {
  syncSlider(el);
  cfg.temp_spoof_val = +el.value;
  const valEl = document.getElementById('temp-spoof-val');
  if (valEl) valEl.textContent = el.value + '°C';
  syncChgGateList();
}

function onCcSpoofToggle() {
  cfg.cc = document.getElementById('sw-cc-spoof').checked ? 1 : 0;
  toggleDisguiseBody('cc-spoof-body', cfg.cc);
  updateSpoofIcon('cc-spoof-icon', cfg.cc);
  syncChgGateList();
}

function onCcSpoofSlider(el) {
  syncSlider(el);
  cfg.cc_spoof_val = +el.value;
  const valEl = document.getElementById('cc-spoof-val');
  if (valEl) valEl.textContent = el.value;
  syncChgGateList();
}

function onStatusSpoofToggle() {
  cfg.status_spoof = document.getElementById('sw-status-spoof').checked ? 1 : 0;
  updateSpoofIcon('status-spoof-icon', cfg.status_spoof);
  syncChgGateList();
}

function onChgUnlockToggle() {
  cfg.chg_unlock = document.getElementById('sw-chg-unlock').checked ? 1 : 0;
  updateSpoofIcon('chg-unlock-icon', cfg.chg_unlock);
  syncChgGateList();
}

/* ─── SOC ring color ─── */
function socColor(pct) {
  if (pct >= 60) return '#4CAF50';
  if (pct >= 30) return '#FF9800';
  return '#F44336';
}
function updateSocRing(pct) {
  const circ = 314.16;
  const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const arc = document.getElementById('soc-ring-arc');
  const fill = document.getElementById('soc-fill');
  const col = socColor(pct);
  if (arc) { arc.style.strokeDashoffset = offset.toFixed(2); arc.style.stroke = col; }
  if (fill) { fill.style.width = Math.min(pct,100) + '%'; fill.style.background = col; }
}

/* ─── Batt sparkline history ─── */
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
  const cs = getComputedStyle(document.documentElement);
  const pr = cs.getPropertyValue('--clr-secondary').trim() || '#625B71';
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

/* ─── 解析 uevent ─── */
function parseUevent(raw) {
  const m = {};
  raw.split('\n').forEach(l => {
    const i = l.indexOf('=');
    if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  });
  return m;
}
