/* ─── 路径集中管理 ─── */
const MODDIR  = '/data/adb/modules/Fresh-Battery';
const CFG     = MODDIR + '/config';
const PIDFILE = MODDIR + '/pids';
const CC1     = '/sys/class/oplus_chg/battery/battery_cc';
const CC2     = '/sys/class/power_supply/battery/cycle_count';
const FAKE_CC = MODDIR + '/fake/fakecc';
const CHIP_SOC= '/sys/class/oplus_chg/battery/chip_soc';
const BAT_CAP = '/sys/class/power_supply/battery/capacity';
const CPU_LMT = '/proc/game_opt/disable_cpufreq_limit';
const LOGFILE = MODDIR + '/log';

/* ─── URL 白名单 ─── */
const ALLOWED_HOSTS = [
  'coolapk.com', 'www.coolapk.com',
  't.me', 'telegram.me',
  '1817712916.share.123pan.cn',
  'github.com', 'www.github.com',
  'gitee.com', 'www.gitee.com',
];

/* ─── exec bridge ─── */
function exec(cmd, timeout=5000) {
  const base = new Promise(r => {
    try {
      if (typeof ksu !== 'undefined' && ksu?.exec) {
        const x = ksu.exec(cmd);
        if (x && typeof x.then === 'function') { x.then(v => r((v.stdout||'').trim())).catch(()=>r('')); return; }
        if (x && x.stdout !== undefined) { r((x.stdout||'').trim()); return; }
        r(String(x||'').trim()); return;
      }
    } catch(_) {}
    try {
      if (typeof mmrl !== 'undefined' && mmrl?.exec) {
        mmrl.exec(cmd).then(v => r((v.stdout||'').trim())).catch(()=>r(''));
        return;
      }
    } catch(_) {}
    r('');
  });
  const timer = new Promise(r => setTimeout(() => r(''), timeout));
  return Promise.race([base, timer]);
}

/* ─── 安全 URL 跳转 ─── */
function openUrl(url) {
  if (!url) return;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
    const host = u.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h))) return;
  } catch(_) { return; }
  try {
    if (typeof ksu !== 'undefined' && ksu.exec) {
      ksu.exec("am start -a android.intent.action.VIEW -d '" + url.replace(/'/g, "'\\''") + "' 2>/dev/null");
      return;
    }
  } catch(_) {}
  try { window.open(url, '_blank'); } catch(_) {}
}
