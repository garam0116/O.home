// 색 유틸 — 색 문자열 파싱 · hex ↔ HSL 변환, 알파 적용, 테마 파생에 사용
// v2.0: hex 말고 rgba()도 받는다 (사용자 요청) — 안쪽 계산은 전부 toRgba를 거친다
export interface HSL { h: number; s: number; l: number }
export interface RGBA { r: number; g: number; b: number; a: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 색 문자열 → RGBA. #rgb · #rgba · #rrggbb · #rrggbbaa · rgb() · rgba() 를 모두 받는다 */
export function toRgba(v: string): RGBA {
  const s = (v ?? '').trim();
  const fn = s.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
    const chan = (x: string | undefined) => {
      if (x == null) return 0;
      const n = parseFloat(x);
      if (!Number.isFinite(n)) return 0;
      return clamp(Math.round(x.endsWith('%') ? (n * 255) / 100 : n), 0, 255);
    };
    const alpha = (x: string | undefined) => {
      if (x == null) return 1;
      const n = parseFloat(x);
      if (!Number.isFinite(n)) return 1;
      return clamp(x.endsWith('%') ? n / 100 : n, 0, 1);
    };
    return { r: chan(parts[0]), g: chan(parts[1]), b: chan(parts[2]), a: alpha(parts[3]) };
  }
  const h = s.replace('#', '');
  // 3·4자리 축약형은 각 글자를 두 번 쓴 것과 같다
  const full = h.length === 3 || h.length === 4 ? h.split('').map(c => c + c).join('') : h;
  const at = (i: number) => {
    const n = parseInt(full.slice(i, i + 2), 16);
    return Number.isFinite(n) ? n : 0;
  };
  const a = full.length >= 8 ? at(6) / 255 : 1;
  return { r: at(0), g: at(2), b: at(4), a };
}

export function hexToHsl(hex: string): HSL {
  const c = toRgba(hex);
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToHex({ h, s, l }: HSL): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** hex + HSL 부분 오버라이드 → 색 문자열 (원래 색이 반투명이면 그 투명도를 지킨다) */
export function adjust(color: string, fn: (c: HSL) => Partial<HSL>): string {
  const { a } = toRgba(color);
  const c = hexToHsl(color);
  const hex = hslToHex({ ...c, ...fn(c) });
  return a >= 1 ? hex : setAlpha(hex, a);
}

/** 투명도를 그 값으로 못박는다 */
export function setAlpha(color: string, alpha: number): string {
  const { r, g, b } = toRgba(color);
  return `rgba(${r},${g},${b},${+clamp(alpha, 0, 1).toFixed(3)})`;
}

/** 투명도를 곱한다 — 원래 색이 이미 반투명이면 더 옅어진다 (반투명 패널·상단바용) */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b, a } = toRgba(color);
  return `rgba(${r},${g},${b},${+clamp(a * alpha, 0, 1).toFixed(3)})`;
}

export function isValidHex(v: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

/** 입력칸에 쳐도 되는 색인가 — hex(3·4·6·8자리)와 rgb()/rgba() (v2.0) */
export function isValidColor(v: string): boolean {
  const s = (v ?? '').trim();
  if (/^#?([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return true;
  const fn = s.match(/^rgba?\(([^)]+)\)$/i);
  if (!fn) return false;
  const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
  return parts.length >= 3 && parts.length <= 4 && parts.every(p => Number.isFinite(parseFloat(p)));
}

export function normalizeHex(v: string): string {
  const m = v.trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return '#' + full.toLowerCase();
}

/** 저장할 형태로 — 불투명하면 #rrggbb, 반투명하면 rgba() (v2.0) */
export function normalizeColor(v: string): string {
  const { r, g, b, a } = toRgba(v);
  if (a >= 1) {
    const to = (x: number) => x.toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
}

/* ---------- 가독성 (v3.6 사용자 요청 — 「포인트 자동 색이 가독성이 나쁘다」) ----------
   HSL 명도는 눈에 보이는 밝기와 다르다 — 같은 L이어도 노랑·라임은 훨씬 밝게 보인다.
   그래서 포인트 자동 팔레트는 지각 명도(OKLCH)로 만들고, 글씨는 WCAG 대비율로 검사해
   기준에 못 미치면 명도만 밀어 올린다(내린다). */

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const unlin = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** WCAG 상대 휘도 (투명도는 무시) */
export function luminance(color: string): number {
  const { r, g, b } = toRgba(color);
  return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
}

/** WCAG 대비율 1~21 */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export interface OKLCH { L: number; C: number; H: number }   // H = 라디안

export function toOklch(color: string): OKLCH {
  const { r: R, g: G, b: B } = toRgba(color);
  const r = lin(R / 255), g = lin(G / 255), b = lin(B / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, Bb), H: Math.atan2(Bb, A) };
}

/** OKLCH → #rrggbb. sRGB 밖이면 색조·명도는 두고 채도만 줄여 안으로 넣는다 */
export function oklchToHex({ L, C, H }: OKLCH): string {
  const LL = clamp(L, 0, 1);
  const at = (c: number) => {
    const A = c * Math.cos(H), B = c * Math.sin(H);
    const l = (LL + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (LL - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (LL - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  };
  const inGamut = (v: number[]) => v.every(x => x >= -1e-4 && x <= 1 + 1e-4);
  let c = Math.max(0, C);
  if (!inGamut(at(c))) {
    let lo = 0, hi = c;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (inGamut(at(mid))) lo = mid; else hi = mid; }
    c = lo;
  }
  const to = (v: number) => Math.round(clamp(unlin(clamp(v, 0, 1)), 0, 1) * 255).toString(16).padStart(2, '0');
  return '#' + at(c).map(to).join('');
}

/**
 * 글씨색 fg가 배경(들) bg와 target 이상의 대비를 갖도록 지각 명도만 움직인다.
 * 이미 넘으면 그대로, 아니면 기준을 넘는 가장 가까운 명도. 끝까지 가도 안 되면 흰색/검정.
 * 배경이 여러 개(그라데이션 양 끝 등)면 가장 불리한 쪽 기준.
 */
export function ensureContrast(fg: string, bg: string | string[], target: number): string {
  const bgs = Array.isArray(bg) ? bg : [bg];
  const worst = (c: string) => Math.min(...bgs.map(b => contrastRatio(c, b)));
  if (worst(fg) >= target) return fg;
  const up = worst('#ffffff') > worst('#000000');
  const o = toOklch(fg);
  let lo = o.L, hi = up ? 1 : 0;
  if (worst(oklchToHex({ ...o, L: hi })) < target) return up ? '#ffffff' : '#000000';
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (worst(oklchToHex({ ...o, L: mid })) >= target) hi = mid; else lo = mid;
  }
  return oklchToHex({ ...o, L: hi });
}

/** 색 면 위의 글씨 — 흰색과 먹색 중 더 잘 읽히는 쪽 */
export function onColor(fill: string): string {
  return contrastRatio('#ffffff', fill) >= contrastRatio('#111317', fill) ? '#ffffff' : '#111317';
}
