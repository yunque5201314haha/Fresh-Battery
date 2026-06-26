/* ─── Theme globals ─── */
let cfg = { target_temp:34, svc:0, cc:0, cpu:0, cap:0, bypass:0, currlimit:0, currma:22000, font:'noto', mmi_bypass:0, plug_interval:0, plug_level:80, plc_charge:0, oplus_comp:0, comp_wifi:0, comp_audio:0 };

/* ─── Temp slider ─── */
function syncSlider(el) {
  el.style.setProperty('--pct', ((+el.value - +el.min) / (+el.max - +el.min) * 100).toFixed(1) + '%');
}
const _s0 = document.getElementById('temp-slider');
const _s1 = document.getElementById('curr-slider');
if (_s0) syncSlider(_s0);
if (_s1) syncSlider(_s1);

function onTempSlider(el) {
  syncSlider(el);
  const v = +el.value;
  cfg.target_temp = v;
  drawGauge(v);
  setPreset(v);
  updateWallChip(v);
}

function setPreset(t) {
  cfg.target_temp = t;
  const sl = document.getElementById('temp-slider'); sl.value = t; syncSlider(sl);
  document.querySelectorAll('#temp-presets .seg-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.temp === t));
  drawGauge(t);
}

/* ─── Temp sparkline history ─── */
const tempHistory = [];
function pushTemp(v) {
  if (typeof v === 'number' && v > 0) { tempHistory.push(v); if (tempHistory.length > 30) tempHistory.shift(); }
  drawSparkline();
}
function drawSparkline() {
  const c = document.getElementById('sparkline'); if (!c) return;
  const W = c.offsetWidth || 120, H = 32, dpr = window.devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  if (tempHistory.length < 2) { ctx.clearRect(0,0,W,H); return; }
  const mn = Math.min(...tempHistory)-.5, mx = Math.max(...tempHistory)+.5;
  const pts = tempHistory.map((v,i) => ({ x:i/(tempHistory.length-1)*W, y:H-(v-mn)/(mx-mn)*(H-6)-3 }));
  const cs = getComputedStyle(document.documentElement);
  const pr = cs.getPropertyValue('--clr-primary').trim() || '#6750A4';
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
  ctx.strokeStyle = pr; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
}

/* ─── Gauge ─── */
function drawGauge(val) {
  const arc = document.getElementById('gauge-arc-outer');
  if (!arc) return;
  const min = 30, max = 38;
  const pct = Math.max(0, Math.min(1, (val - min) / (max - min)));
  const len = 502;
  arc.style.strokeDashoffset = (len * (1 - pct)).toFixed(2);
  const el = document.getElementById('gauge-val');
  if (el) el.innerHTML = val + '<small>°C</small>';
}

/* ─── Wall chip ─── */
function updateWallChip(t) {
  const el = document.getElementById('wall-val');
  if (el) el.textContent = '温度墙: ' + (t + 15) + '°C';
}

/* ─── KSU Monet Dynamic Colors ─── */
function reloadKsuColors() {
  /* colors.css 只在 KernelSU WebView 内由系统注入；
     直接切换 disabled 在 Android WebView 中不会触发真正重载，
     改用 cache-bust href 替换，强制浏览器重新请求 */
  try {
    const lnk = document.querySelector('link[href*="mui.kernelsu.org/internal/colors"]');
    if (!lnk) return;
    const base = lnk.href.split('?')[0];
    lnk.href = base + '?t=' + Date.now();
  } catch(_) {}
}
/* 系统深/浅色主题切换时重新加载 colors.css，避免变量冻结 */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reloadKsuColors);
/* ─── Current slider ─── */
function onCurrSlider(el) {
  syncSlider(el);
  cfg.currma = +el.value;
  document.getElementById('curr-val').textContent = el.value + 'mA';
}
function onCurrLimitToggle() {
  cfg.currlimit = document.getElementById('sw-currlimit').checked ? 1 : 0;
  const ic = document.getElementById('curr-icon-chg');
  if (ic) ic.style.background = cfg.currlimit
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
}
function onBypassToggle() {
  cfg.bypass = document.getElementById('sw-bypass').checked ? 1 : 0;
  const ic = document.getElementById('bypass-icon');
  if (ic) ic.style.background = cfg.bypass
    ? 'color-mix(in srgb,var(--clr-primary-container) 80%,transparent)'
    : 'color-mix(in srgb,var(--clr-secondary-container) 60%,transparent)';
}
