function toggleSub(row) { row.classList.toggle('expanded'); }

function applyMasterUI(on) {
  const row  = document.getElementById('master-row');
  const sub  = document.getElementById('master-sub');
  const sw   = document.getElementById('sw-svc');
  const body = document.getElementById('sw-body');
  if (sw)   sw.checked = on;
  if (row)  { row.classList.toggle('on', on); row.classList.toggle('off', !on); }
  if (sub)  sub.textContent = on ? '已启用，所有配置生效' : '已关闭';
  if (body) on ? body.classList.remove('collapsed') : body.classList.add('collapsed');
}
function onMasterChange(sw) { applyMasterUI(sw.checked); }
function popBtn(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

function openUrl(url) {
  if (!url) return;
  try {
    if (typeof ksu !== 'undefined' && ksu.exec) {
      ksu.exec("am start -a android.intent.action.VIEW -d '" + url.replace(/'/g, "'\\''") + "' 2>/dev/null");
      return;
    }
  } catch(_) {}
  try { window.open(url, '_blank'); } catch(_) {}
}

/* 顶部导航胶囊动画 */
function animateCards(page) {
  const els = page.querySelectorAll('.card,.card-filled,.tile-pri,.tile-sec,.pid-card,.section-label');
  els.forEach((el, i) => {
    if (el.dataset.revealed) return;   /* 已入场过，不重置不重播 */
    el.style.setProperty('--delay', (i * 50) + 'ms');
    el.classList.add('reveal');
    el.dataset.revealed = '1';
  });
}

(function initTabBar() {
  const bar  = document.getElementById('tabbar');

  let _switchTimer = null;
  const _allAnim = ['entering','slide-in','slide-out','slide-in-rev','slide-out-rev'];

  function doSwitch(id) {
    if (_switchTimer) { clearTimeout(_switchTimer); _switchTimer = null; }
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active', ..._allAnim);
      p.style.transform = '';
    });
    bar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const pg = document.getElementById('page-' + id);
    const tb = document.getElementById('tab-' + id);
    if (pg) {
      pg.classList.add('active', 'entering');
      pg.scrollTop = 0;
      animateCards(pg);
    }
    if (tb) tb.classList.add('active');
    if (id === 'charging') setTimeout(() => drawGauge(cfg.target_temp), 80);
    if (id === 'log') loadLog(); }
  window.doSwitch = doSwitch;

  /* 横滑切换：dir='left' 新页从右滑入，dir='right' 新页从左滑入 */
  window.switchSlide = function(id, dir) {
    if (_switchTimer) { clearTimeout(_switchTimer); _switchTimer = null; }
    const cur = document.querySelector('.page.active');
    const next = document.getElementById('page-' + id);
    if (!next || next === cur) return;
    const tb = document.getElementById('tab-' + id);
    bar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (tb) tb.classList.add('active');

    if (cur) {
      cur.classList.remove(..._allAnim);
      cur.classList.add(dir === 'left' ? 'slide-out' : 'slide-out-rev');
    }
    if (dir === 'right') {
      next.style.transform = 'translateX(-30%)';
    } else {
      next.style.transform = '';
    }
    next.classList.remove('active', ..._allAnim);
    next.classList.add(dir === 'left' ? 'slide-in' : 'slide-in-rev');
    next.scrollTop = 0;

    _switchTimer = setTimeout(() => {
      _switchTimer = null;
      if (cur) cur.classList.remove('active', ..._allAnim);
      next.classList.remove(..._allAnim);
      next.style.transform = '';
      next.classList.add('active');
      animateCards(next);
      if (id === 'charging') drawGauge(cfg.target_temp);
    }, 230);
  };

  bar.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.page) doSwitch(tab.dataset.page);
  });
})();

requestAnimationFrame(() => animateCards(document.getElementById('page-status')));

/* 滚动时顶部栏阴影 */
(function initTopBarElevation() {
  const pages = document.querySelectorAll('.page');
  pages.forEach(page => {
    page.addEventListener('scroll', () => {
      const topBar = page.querySelector('.top-bar');
      if (!topBar) return;
      topBar.classList.toggle('top-bar-scrolled', page.scrollTop > 4);
    }, { passive: true });
  });
})();

function tick() {
  const n = new Date(), p = x => String(x).padStart(2,'0');
  const el = document.getElementById('i-time');
  if (el) el.textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
}
tick(); setInterval(tick, 1000);

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

async function loadLog() {
  const el = document.getElementById('log-content');
  if (!el) return;
  el.textContent = '加载中…';
  const raw = await exec(`cat '${LOGFILE}' 2>/dev/null | tail -500`, 8000);
  el.textContent = raw || '（暂无日志）';
  el.scrollTop = el.scrollHeight;
}

async function clearLog() {
  if (!confirm('确定清空日志？')) return;
  await exec(`printf '' > '${LOGFILE}' 2>/dev/null; true`);
  loadLog();
}

