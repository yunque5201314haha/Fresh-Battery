/* ─── Monet 动态取色 (Material You)
 *   从系统提取壁纸 accent color，生成 M3 完整色板，
 *   注入为 CSS 自定义属性 --clr-*。
 *   在所有管理器（KSU / Magisk / APatch）下生效。
 *   若取色失败，使用默认紫色回退。
 * ─────────────────────────────────────────── */
import { hexFromArgb, Hct, TonalPalette } from 'https://esm.run/@material/material-color-utilities@2';

/* ── 将 shell 输出中的颜色值解析为 ARGB int ── */
function parseColorInt(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith('#')) s = s.slice(1);
  /* 纯 hex (RRGGBB 或 AARRGGBB) */
  if (/^[0-9a-fA-F]{6,8}$/.test(s)) {
    let n = parseInt(s, 16);
    if (s.length === 6) n = 0xFF000000 | n;
    return n >>> 0;  /* 保证无符号 */
  }
  /* 纯十进制 */
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return n >>> 0;
  return null;
}

/* ── 通过 root shell 尝试获取系统壁纸的 accent seed ── */
async function extractSeed() {
  const cmds = [
    /* 1) dumpsys wallpaper — 优先 mPrimaryColor */
    `dumpsys wallpaper 2>/dev/null | grep -oE 'mPrimaryColor=[0-9]+' | head -1 | grep -oE '[0-9]+$'`,
    /* 2) dumpsys wallpaper — mSeedColor */
    `dumpsys wallpaper 2>/dev/null | grep -oE 'mSeedColor=[0-9]+' | head -1 | grep -oE '[0-9]+$'`,
    /* 3) settings global (Pixel) */
    `settings get global dynamic_color_seed 2>/dev/null`,
    /* 4) settings secure (某些 OEM) */
    `settings get secure theme_color 2>/dev/null`,
    /* 5) theme_color.xml (root) */
    `cat /data/system/theme_color.xml 2>/dev/null | grep -oE 'seed_color="[^"]*"' | sed 's/.*"\\(.*\\)".*/\\1/'`,
    /* 6) dumpsys 中出现 hex primaryColor 时 */
    `dumpsys wallpaper 2>/dev/null | grep -oP '(?<=primaryColor=)#[0-9a-fA-F]{6,8}' | head -1 | sed 's/#//'`,
    /* 7) dumpsys dominant color */
    `dumpsys wallpaper 2>/dev/null | grep -i 'dominant' | grep -oE '[0-9]{6,10}' | head -1`,
  ];
  for (const c of cmds) {
    const out = await window.exec(c, 3000);
    const v = parseColorInt(out);
    if (v !== null) return v;
  }
  return null;
}

/* ── 从 seed ARGB 生成完整 M3 色板（深浅两套 tone） ── */
function generatePalette(seed, isDark) {
  const hct = Hct.fromInt(seed);
  const hue = hct.hue;
  const chroma = Math.max(48, Math.min(hct.chroma, 120)); /* 避免过饱和或过灰 */

  /* 标准 M3 调色板 */
  const P = TonalPalette.of(hue, chroma);
  const S = TonalPalette.of(hue, 16);           /* secondary: 同色相，低彩度 */
  const T = TonalPalette.of(hue + 60, 24);      /* tertiary: 转 60°，中彩度 */
  const N = TonalPalette.of(hue, 4);            /* neutral: 近似无色 */
  const NV = TonalPalette.of(hue, 8);           /* neutral variant: 微彩 */
  const E = TonalPalette.of(25, 84);            /* error: 固定 */
  const I = P;                                  /* inverse primary 直接用 primary */

  /* tone 映射表：css 变量名 → [浅色调, 深色调] */
  const map = {
    primary:                [40, 80],
    'on-primary':                [100, 20],
    'primary-container':         [90, 30],
    'on-primary-container':      [10, 90],
    secondary:              [40, 80],
    'on-secondary':              [100, 20],
    'secondary-container':       [90, 30],
    'on-secondary-container':    [10, 90],
    tertiary:               [40, 80],
    'on-tertiary':               [100, 20],
    'tertiary-container':        [90, 30],
    'on-tertiary-container':     [10, 90],
    error:                  [40, 80],
    'on-error':                  [100, 20],
    'error-container':           [90, 30],
    'on-error-container':        [10, 90],
    background:             [98, 6],
    'on-background':             [10, 90],
    surface:                [98, 6],
    'on-surface':                [10, 90],
    'surface-variant':           [90, 30],
    'on-surface-variant':        [30, 80],
    outline:                [50, 60],
    'outline-variant':           [80, 30],
    'inverse-surface':           [20, 90],
    'inverse-on-surface':        [95, 20],
    'inverse-primary':           [80, 40],
    /* surface container levels */
    'surface-container-lowest':  [100, 4],
    'surface-container-low':     [96, 10],
    'surface-container':         [94, 12],
    'surface-container-high':    [92, 17],
    'surface-container-highest': [90, 22],
  };

  /* 决定每个 key 用哪个调色板 */
  const getTP = (key) => {
    if (key.includes('primary'))    return P;
    if (key.includes('secondary'))  return S;
    if (key.includes('tertiary'))   return T;
    if (key.includes('error'))      return E;
    if (key.includes('variant'))    return NV;
    if (key.includes('outline'))    return NV;
    return N;
  };

  const out = {};
  for (const [key, [lt, dt]] of Object.entries(map)) {
    const tone = isDark ? dt : lt;
    out[key] = hexFromArgb(getTP(key).get(tone));
  }
  return out;
}

/* ── 将色板写入 --clr-* CSS 变量 ── */
function applyPalette(colors) {
  const root = document.documentElement;
  for (const [key, hex] of Object.entries(colors)) {
    root.style.setProperty('--clr-' + key, '#' + hex);
  }
}

/* ── 获取当前有效深浅模式 ── */
function effectiveDark() {
  const root = document.documentElement;
  if (root.classList.contains('theme-dark'))  return true;
  if (root.classList.contains('theme-light')) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/* ── 持久化主题偏好 ── */
function savePref(mode) {
  try { localStorage.setItem('fb-theme', mode); } catch (_) {}
}

/* ── 公开 API ── */

/* 重新生成并注入色板（在深浅切换时调用） */
export function rebuild() {
  let mode = 'auto';
  try { const s = localStorage.getItem('fb-theme'); if (s) mode = s; } catch (_) {}
  const dark = mode === 'dark' ? true : mode === 'light' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches;

  let seed = null;
  try { const s = localStorage.getItem('fb-seed'); if (s) seed = parseInt(s, 10); } catch (_) {}
  if (!seed) seed = 0xFF6750A4; /* fallback 紫色 */

  const colors = generatePalette(seed, dark);
  applyPalette(colors);
}

/* 初始化：提取 seed → 生成 → 注入 */
export async function init() {
  const seed = await extractSeed();
  if (seed) {
    try { localStorage.setItem('fb-seed', String(seed)); } catch (_) {}
  }
  rebuild();

  /* 监听系统深浅切换 */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    let mode = 'auto';
    try { const s = localStorage.getItem('fb-theme'); if (s) mode = s; } catch (_) {}
    if (mode === 'auto') rebuild();
  });
}

/* 切换模式：auto → light → dark → auto */
export function toggle() {
  const root = document.documentElement;
  const isLight = root.classList.contains('theme-light');
  const isDark  = root.classList.contains('theme-dark');
  let mode = 'auto';
  if (!isLight && !isDark) mode = 'light';
  else if (isLight)        mode = 'dark';
  else                     mode = 'auto';

  root.classList.remove('theme-light', 'theme-dark');
  if (mode === 'light') root.classList.add('theme-light');
  if (mode === 'dark')  root.classList.add('theme-dark');
  savePref(mode);
  rebuild();
}
