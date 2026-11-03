// 테마 시스템 — 기획서 5.1
// 모드 4종: 라이트 / 다크(기본) / 포인트 자동(다크·라이트 톤) / 완전 커스텀
// 모든 색은 순수 hex로 저장(환경설정 hex 입력란과 1:1) — 반투명이 필요한 곳은
// themeToCssVars 에서 고정 알파를 적용해 CSS 변수로 변환한다.
import { adjust, ensureContrast, hexToHsl, hslToHex, onColor, oklchToHex, toOklch, withAlpha } from './color';

export type ThemeMode = 'light' | 'dark' | 'point' | 'custom';
export type PointTone = 'dark' | 'light';
/** 포인트 자동 가독성 단계 (v3.6) — 표준 = WCAG AA(글씨 4.5:1 · 보조 3:1), 높음 = AAA(7:1 · 4.5:1) */
export type ReadLevel = 'std' | 'high';
export const READ_TARGETS: Record<ReadLevel, { text: number; hint: number }> = {
  std: { text: 4.5, hint: 3 },
  high: { text: 7, hint: 4.5 },
};

/** 환경설정에서 항목별로 제어되는 테마 변수 (5.1 상세 설정 항목) */
export interface ThemeVars {
  // 배경 그라데이션 (시작색 → 끝색)
  bgG1: string; bgG2: string;
  // 배경 확장 (v1.9): 그라데이션/이미지 선택 · 그라데이션 각도 · 이미지(IndexedDB)와 블러
  bgType?: 'gradient' | 'image';
  bgAngle?: number;          // 그라데이션 각도 (deg, 기본 180)
  bgImageId?: string;        // 배경 이미지 파일 id (IndexedDB)
  bgBlur?: number;           // 배경 이미지 블러 px (0 = 없음)
  /* 배경 이미지 덮개 % (v2.0 사용자 요청 — 「다크 모드면 사진을 좀 더 어둡게, 라이트 모드면 좀 더 밝게」).
     사진 위에 그 모드의 배경 끝색(bgG2)을 이만큼 얹는다 — 다크는 어둡게, 라이트는 밝게,
     포인트 자동은 그 색조로 눌린다. 0 = 사진 그대로 */
  bgDim?: number;
  // 카드(패널·게시판 리스트·필터 등) 배경/글씨 (v1.9) — 보조 글씨색은 글씨색에서 자동 파생
  cardBg?: string; cardFg?: string;
  /* 카드 배경 불투명도 % (v3.4 사용자 요청) — 배경 이미지가 카드 뒤로 비쳐 보이게 하던 고정 94%를 설정으로.
     색 입력칸의 투명도(rgba)와 곱해진다. 비워 두면 CARD_ALPHA(지금까지의 모습) */
  cardAlpha?: number;
  // 상단메뉴: 배경 · 글씨 · 호버 글씨(v1.9 분리) · 로고 글씨
  topBg: string; topFg: string; topHv: string; topBrand: string;
  // 하위메뉴 드롭다운: 배경 · 글씨 · 호버(오버레이 색)
  ddBg: string; ddFg: string; ddHv: string;
  // 페이지 타이틀 / 설명
  pageTitle: string; pageDesc: string;
  // 페이지 헤더 표시 (v1.9): 둘 다 / 제목만 / 설명만 / 둘 다 안 띄움
  pageHead?: 'both' | 'title' | 'desc' | 'none';
  // 모바일 헤더 (v1.9 사용자 요청): PC 설정과 동일 / 모바일에서만 생략
  pageHeadM?: 'same' | 'none';
  // BGM 플레이어
  bgmBg: string; bgmFg: string; bgmIc: string; bgmVol: string;
  // 스크롤바: 색 · 테두리색
  sbThumb: string; sbBd: string;
  // 검색창 (6.4 공통 검색): 배경 · 글씨 · 아이콘/플레이스홀더 · 테두리
  searchBg?: string; searchFg?: string; searchIc?: string; searchBd?: string;
  // 진한 버튼(btn-dark) — 배경·글씨·호버 3색. 체크박스·선택 필터 칩에도 공통 적용 (v1.9 사용자 피드백)
  btnDark?: string; btnDarkFg?: string; btnDarkHv?: string;
  // 스위치 탭 (v2.0 사용자 요청) — 게시판 말머리·갤러리 보기 전환 등. 고른 쪽은 진한 버튼색을 그대로 따라가고
  // 여기서 정하는 것은 「안 고른 쪽」의 판 배경과 글씨색
  segBg?: string; segFg?: string;
  // 위젯 (v2.0 사용자 요청) — 메인·사이드에 얹히는 카드. 미지정이면 카드 색을 그대로 따라간다.
  // wgBorder를 켜야 테두리를 그린다(기본은 그림자만, 지금까지의 모습)
  wgBg?: string; wgTitle?: string; wgFg?: string;
  wgBorder?: boolean; wgBd?: string;
  // 이미지 편집(크롭) 배경 (v1.9 사용자 피드백) — 투명 PNG 위치 지정 시 보이는 판
  cropBg?: string;
  // 입력 포커스 (v1.9 사용자 요청) — 인풋·텍스트에리어·드롭다운·에디터 공통
  // focusColor: 테두리·링 색 / focusRing: 링 방식(은은한 글로우 · 선명한 라인 · 없음) / focusW: 링 두께 px
  focusColor?: string; focusRing?: 'glow' | 'line' | 'none'; focusW?: number;
  // 드래그 효과 (v3.7 사용자 요청) — 글자를 끌어 선택할 때 바탕은 그대로, 글자만 흐린다.
  // fog: 안개(글자색으로 번짐, 기본) / ghost: 삼중 잔상(포인트색·푸른 회색이 좌우로 엇갈리고 가운데 흐린 글자색)
  selFx?: 'fog' | 'ghost';
  // 포인트 컬러
  accent: string; accentSoft: string;
  /* 가독성 보정 (v3.6) — 포인트 자동이 채운다. 있으면 카드 보조·옅은 글씨, 카드 위 포인트 글씨,
     포인트 버튼 글씨를 이 단계의 대비 기준에 맞춰 themeToCssVars에서 자동 보정한다.
     커스텀으로 넘어가도 따라가서, 글씨색을 손봐도 보정이 계속 걸린다. 없으면 지금까지처럼 그대로 */
  readLevel?: ReadLevel;
  // 모서리 둥글기(px)
  radius: number; radiusS: number;
  // 블록(패널·카드) 그림자 세기 % — 0 = 없음, 100 = 기본, 200 = 최대
  shadow: number;
  // 드롭다운(하위메뉴·프로필 메뉴) 그림자 세기 % — 블록 그림자와 별개 (없는 편이 예쁠 때가 있음)
  ddShadow?: number;
  // 드롭섀도우 색 (블록·드롭다운 공통, 기본 검정)
  shColor?: string;
}

export interface ThemeState {
  mode: ThemeMode;
  pointTone: PointTone;
  vars: ThemeVars;
}

/** 배경 이미지 덮개 기본값 % — 모든 모드 공통 (색은 모드의 배경 끝색을 따라간다) */
/** 카드 배경 불투명도 기본값 % — v3.4 이전에 고정으로 쓰던 값 */
export const CARD_ALPHA = 94;
export const BG_DIM = 35;

/** 다크 모드 (기본 디폴트) — 프로토타입 "시크 모노톤" 기준 */
export const DARK_THEME: ThemeVars = {
  bgG1: '#2b3038', bgG2: '#121418',
  bgType: 'gradient', bgAngle: 180, bgBlur: 0, bgDim: BG_DIM,
  cardBg: '#fbfbfc', cardFg: '#1d2025',
  topBg: '#14161b', topFg: '#aab0ba', topHv: '#ffffff', topBrand: '#f2f3f5',
  ddBg: '#1c1f25', ddFg: '#c6cad1', ddHv: '#ffffff',
  pageTitle: '#eceef1', pageDesc: '#9aa0a9',
  bgmBg: '#16181d', bgmFg: '#eef0f3', bgmIc: '#cfd3da', bgmVol: '#e8eaee',
  sbThumb: '#565d68', sbBd: '#1a1d22',
  searchBg: '#232830', searchFg: '#e8eaee', searchIc: '#8b919b', searchBd: '#3a404a',
  btnDark: '#1d2025', btnDarkFg: '#ffffff', btnDarkHv: '#33373e',
  cropBg: '#2c313a',
  accent: '#a63a45', accentSoft: '#c96a73',
  radius: 14, radiusS: 9, shadow: 100, ddShadow: 100,
};

/** 라이트 모드 — 호버 글씨색은 흰 배경에서도 보이는 색 (v1.9) */
export const LIGHT_THEME: ThemeVars = {
  bgG1: '#f2f3f5', bgG2: '#dfe1e6',
  bgType: 'gradient', bgAngle: 180, bgBlur: 0, bgDim: BG_DIM,
  cardBg: '#fbfbfc', cardFg: '#1d2025',
  topBg: '#fbfbfc', topFg: '#5d636d', topHv: '#a63a45', topBrand: '#2b3038',
  ddBg: '#ffffff', ddFg: '#3c434d', ddHv: '#000000',
  pageTitle: '#2b3038', pageDesc: '#7a8089',
  bgmBg: '#ffffff', bgmFg: '#2b3038', bgmIc: '#5d636d', bgmVol: '#3c434d',
  sbThumb: '#b8bcc4', sbBd: '#e2e4e8',
  searchBg: '#ffffff', searchFg: '#2b3038', searchIc: '#8a9099', searchBd: '#d7dae0', // 라이트에서 또렷하게
  btnDark: '#5d636d', btnDarkFg: '#ffffff', btnDarkHv: '#6d7480', // 라이트는 뮤트 슬레이트 — 검정이면 대비 과함 (사용자 피드백)
  cropBg: '#e2e5ea', // 라이트 — 투명 이미지가 보이는 밝은 판 (v1.9)
  accent: '#a63a45', accentSoft: '#c96a73',
  radius: 14, radiusS: 9, shadow: 30, ddShadow: 30, // 밝은 배경에선 그림자를 약하게 (사용자 확정 30%)
};

/** 포인트색에서 옅은 보조색 파생 */
export function softAccent(accent: string): string {
  return adjust(accent, cc => ({ l: Math.min(0.75, cc.l + 0.18), s: cc.s * 0.8 }));
}

/**
 * 포인트 자동 모드 (v1.8 확정) — 포인트 컬러 하나로 전체 팔레트 파생.
 * 톤(다크/라이트) 선택 가능, 파생값은 세부 항목 hex 란에 전부 채워짐 (v1.9).
 * 가독성 보정 (v3.6) — 색 구성은 그대로 두고, 마지막에 글씨마다 대비율을 검사해
 * 단계(level) 기준에 못 미치는 글씨만 명도를 밀어 준다. 이미 잘 읽히는 색은 손대지 않는다.
 */
export function derivePointTheme(accent: string, tone: PointTone, level: ReadLevel = 'std'): ThemeVars {
  const T = READ_TARGETS[level];
  const { h, s } = hexToHsl(accent);
  const c = (sat: number, lig: number) => hslToHex({ h, s: Math.min(1, s * sat), l: lig });
  const accentSoft = softAccent(accent);

  // 라이트 톤 — 호버 글씨색은 어두운 포인트색 파생 (흰 배경 위 흰 글씨 방지, v1.9)
  const deepAccent = adjust(accent, cc => ({ l: Math.min(cc.l, 0.38) }));
  let t: ThemeVars;
  if (tone === 'dark') {
    t = {
      bgG1: c(0.28, 0.2), bgG2: c(0.32, 0.07),
      bgType: 'gradient', bgAngle: 180, bgBlur: 0, bgDim: BG_DIM,
      cardBg: c(0.12, 0.985), cardFg: c(0.4, 0.14),
      topBg: c(0.3, 0.09), topFg: c(0.14, 0.68), topHv: c(0.2, 0.97), topBrand: c(0.12, 0.95),
      ddBg: c(0.28, 0.11), ddFg: c(0.14, 0.78), ddHv: '#ffffff',
      pageTitle: c(0.1, 0.93), pageDesc: c(0.12, 0.62),
      bgmBg: c(0.3, 0.08), bgmFg: c(0.1, 0.94), bgmIc: c(0.12, 0.82), bgmVol: c(0.1, 0.9),
      sbThumb: c(0.22, 0.38), sbBd: c(0.3, 0.1),
      searchBg: c(0.26, 0.14), searchFg: c(0.1, 0.9), searchIc: c(0.12, 0.6), searchBd: c(0.22, 0.24),
      btnDark: c(0.38, 0.12), btnDarkFg: c(0.08, 0.97), btnDarkHv: c(0.38, 0.19), /* 채도 살짝↑ 명도 아주 약간↓ — 컬러감 (v1.9 사용자 피드백) */
      cropBg: c(0.24, 0.19),
      accent, accentSoft, readLevel: level,
      radius: 14, radiusS: 9, shadow: 100, ddShadow: 100,
    };
  }
  else t = {
    bgG1: c(0.25, 0.95), bgG2: c(0.3, 0.86),
    bgType: 'gradient', bgAngle: 180, bgBlur: 0, bgDim: BG_DIM,
    cardBg: c(0.15, 0.99), cardFg: c(0.4, 0.14),
    topBg: c(0.35, 0.97), topFg: c(0.3, 0.38), topHv: deepAccent, topBrand: c(0.45, 0.22),
    ddBg: c(0.3, 0.98), ddFg: c(0.3, 0.3), ddHv: '#000000',
    pageTitle: c(0.45, 0.22), pageDesc: c(0.2, 0.5),
    bgmBg: c(0.3, 0.98), bgmFg: c(0.4, 0.24), bgmIc: c(0.3, 0.4), bgmVol: c(0.4, 0.3),
    sbThumb: c(0.2, 0.72), sbBd: c(0.25, 0.88),
    searchBg: c(0.3, 0.99), searchFg: c(0.4, 0.24), searchIc: c(0.2, 0.55), searchBd: c(0.25, 0.84),
    btnDark: c(0.33, 0.4), btnDarkFg: c(0.1, 0.99), btnDarkHv: c(0.33, 0.46), // 라이트 톤 — 뮤트 버튼 (대비 완화 · 채도 살짝↑ 명도 약간↓, v1.9)
    cropBg: c(0.2, 0.89),
    accent, accentSoft, readLevel: level,
    radius: 14, radiusS: 9, shadow: 30, ddShadow: 30, // 라이트 톤도 그림자 약하게 (30%)
  };

  // 대비 보정 — 글씨는 단계 기준(text), 아이콘·안내문은 보조 기준(hint)
  const fix = <K extends keyof ThemeVars>(k: K, bg: string | string[], target: number) => {
    (t as unknown as Record<string, string>)[k] = ensureContrast(t[k] as string, bg, target);
  };
  const page = [t.bgG1, t.bgG2];
  fix('topBrand', t.topBg, T.text); fix('topFg', t.topBg, T.text); fix('topHv', t.topBg, T.text);
  fix('ddFg', t.ddBg, T.text);
  fix('pageTitle', page, T.text); fix('pageDesc', page, T.text);
  fix('searchFg', t.searchBg!, T.text); fix('searchIc', t.searchBg!, T.hint);
  fix('cardFg', t.cardBg!, Math.max(7, T.text));
  fix('btnDarkFg', [t.btnDark!, t.btnDarkHv!], T.text);
  // 글씨를 끝까지 밀어도 모자라면(높음 단계) 버튼 면 쪽을 글씨에서 멀어지게 조정
  fix('btnDark', t.btnDarkFg!, T.text); fix('btnDarkHv', t.btnDarkFg!, T.text);
  fix('bgmFg', t.bgmBg, T.text); fix('bgmIc', t.bgmBg, T.hint);
  return t;
}

/** 포인트 색의 가독성 보정값 (v3.6) — 카드 위 글씨용 색 · 버튼 면 색 · 버튼 글씨 */
export function readableAccent(accent: string, cardBg: string, level: ReadLevel) {
  const T = READ_TARGETS[level];
  const o = toOklch(accent);
  const ink = ensureContrast(oklchToHex({ ...o, L: Math.min(o.L, 0.5) }), cardBg, T.text);
  const on = onColor(accent);
  // 흰/먹 글씨로도 4.5가 안 나오는 색이면 버튼 면만 살짝 밝게(어둡게) 조정
  const fill = ensureContrast(accent, on, 4.5);
  return { ink, fill, on };
}

export function themeForMode(mode: ThemeMode, accent: string, tone: PointTone, custom: ThemeVars, level: ReadLevel = 'std'): ThemeVars {
  switch (mode) {
    case 'light': return LIGHT_THEME;
    case 'dark': return DARK_THEME;
    case 'point': return derivePointTheme(accent, tone, level);
    case 'custom': return custom;
  }
}

/* ---------- 모드별 독립 설정 저장소 (v1.9 — 모드 전환이 수정값을 리셋하지 않음) ---------- */
export interface ThemeStore {
  mode: ThemeMode;
  pointTone: PointTone;
  pointAccent: string;                     // 포인트 자동 기준색 (변경 시에만 재파생)
  pointLevel?: ReadLevel;                  // 포인트 자동 가독성 단계 (v3.6, 없으면 표준)
  perMode: Record<ThemeMode, ThemeVars>;   // 각 모드의 현재 값 (화면에 보이는 값)
  /* 사용자가 직접 지정한 항목 (v2.0 사용자 요청 — 「포인트 자동 톤·모드를 바꿀 때 지정한
     포인트 컬러·배경 이미지가 다 초기화된다」). 모드·톤을 바꾸면 새 모드의 초기값 위에
     이 값들을 그대로 다시 얹는다. 모드별로 따로 기억하지 않는다 — 되돌리기는 [선택 리셋]. */
  edits: Partial<ThemeVars>;
}

/* 모드를 바꿔도 이어지는 항목 (v2.0 사용자 제보 — 「테마를 불러와서 라이트/다크를 바꿨더니
   포인트 컬러도 바뀌고 모든 게 이상해진다」). 예전에는 지정한 **모든** 값(배경색·글씨색 등)을
   새 모드의 초기값 위에 얹었다 — 다크용으로 고른 색이 라이트 초기값 위에 섞여 반은 어둡고
   반은 밝은 화면이 됐다. 이제 모드와 상관없는 값(포인트 컬러·배경 이미지·모서리·표시 옵션)만
   이어 가고, 색 구성은 그 모드의 기본을 쓴다. 직접 꾸민 색 구성은 [커스텀]에 그대로 남는다. */
export const SHARED_KEYS = [
  'accent', 'accentSoft',
  'bgType', 'bgAngle', 'bgImageId', 'bgBlur',
  'pageHead', 'pageHeadM',
  'focusRing', 'focusW', 'wgBorder', 'selFx',
  'radius', 'radiusS',
] as const satisfies readonly (keyof ThemeVars)[];
const SHARED = new Set<string>(SHARED_KEYS);

/** 지정 항목 중 모드를 바꿔도 이어지는 것만 */
export function sharedEdits(e: Partial<ThemeVars>): Partial<ThemeVars> {
  const out: Partial<ThemeVars> = {};
  for (const [k, v] of Object.entries(e)) if (SHARED.has(k) && v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** 모드·톤을 바꿀 때 새 모드의 값 = 그 모드의 초기값(커스텀은 보관된 커스텀 값) + 이어지는 항목 */
export function composeVars(mode: ThemeMode, accent: string, tone: PointTone,
  edits: Partial<ThemeVars>, custom: ThemeVars, level: ReadLevel = 'std'): ThemeVars {
  const shared = sharedEdits(edits);
  if (mode === 'point') {
    // 포인트색은 파생의 기준 — accent는 pointAccent와 항상 같게 맞춰 둔다
    const { accent: _a, accentSoft: _s, ...rest } = shared;
    void _a; void _s;
    return { ...derivePointTheme(accent, tone, level), ...rest };
  }
  const base = mode === 'custom' ? custom : defaultVarsFor(mode, accent, tone);
  const out: ThemeVars = { ...base, ...shared };
  const a = shared.accent;
  if (a && a !== base.accent) {
    if (!shared.accentSoft) out.accentSoft = softAccent(a);
    // 라이트 상단메뉴 호버 글씨는 원래 포인트색 — 포인트색을 바꿨으면 같이 따라가게
    if (base.topHv === base.accent) out.topHv = a;
  }
  return out;
}

/** 모드별 초기값 (선택 리셋용) */
export function defaultVarsFor(mode: ThemeMode, accent: string, tone: PointTone, level: ReadLevel = 'std'): ThemeVars {
  switch (mode) {
    case 'light': return LIGHT_THEME;
    case 'dark': return DARK_THEME;
    case 'point': return derivePointTheme(accent, tone, level);
    case 'custom': return DARK_THEME; // 커스텀 초기 상태 = 기본(다크)
  }
}

export const DEFAULT_THEME_STORE: ThemeStore = {
  mode: 'dark', pointTone: 'dark', pointAccent: '#a63a45', pointLevel: 'std',
  perMode: {
    light: LIGHT_THEME,
    dark: DARK_THEME,
    point: derivePointTheme('#a63a45', 'dark'),
    custom: DARK_THEME,
  },
  edits: {},
};

/** 저장해 둔 테마 프리셋 (v1.9 — 드롭다운에서 커스텀으로 적용) */
export interface ThemePreset { id: string; name: string; vars: ThemeVars }

/** ThemeVars → CSS 변수 매핑 (globals.css 의 var() 이름과 1:1) */
export function themeToCssVars(t: ThemeVars): Record<string, string> {
  // 블록 그림자 — 세기 %에 따라 알파 스케일 (0 = none) · 색은 shColor (기본 검정)
  const hex = (t.shColor ?? '#000000').replace('#', '');
  const hf = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
  const rgb = `${parseInt(hf.slice(0, 2), 16) || 0},${parseInt(hf.slice(2, 4), 16) || 0},${parseInt(hf.slice(4, 6), 16) || 0}`;
  const k = Math.max(0, Math.min(200, t.shadow ?? 100)) / 100;
  const sh = (y: number, blur: number, alpha: number) =>
    k === 0 ? 'none' : `0 ${y}px ${blur}px rgba(${rgb},${Math.min(1, alpha * k).toFixed(3)})`;
  // 드롭다운 그림자 — 별도 세기 (기본 100%)
  const kd = Math.max(0, Math.min(200, t.ddShadow ?? 100)) / 100;
  // 카드 글씨 — 보조(sub)·옅은(faint) 색은 지정한 글씨색의 명도에서 자동 파생 (v1.9)
  const cardFg = t.cardFg ?? '#1d2025';
  const fgDark = hexToHsl(cardFg).l < 0.5;
  let cardSub = adjust(cardFg, cc => ({ l: fgDark ? Math.min(0.85, cc.l + 0.25) : Math.max(0.15, cc.l - 0.22) }));
  let cardFaint = adjust(cardFg, cc => ({ l: fgDark ? Math.min(0.92, cc.l + 0.45) : Math.max(0.3, cc.l - 0.38), s: cc.s * 0.6 }));
  // 가독성 보정 (v3.6) — 포인트 자동(과 그걸 이어받은 커스텀)에서만. 다른 모드는 지정한 색 그대로
  const lv = t.readLevel;
  const cardBgSolid = t.cardBg ?? '#fbfbfc';
  let accentInk = t.accent, accentFill = t.accent, onAccent = '#ffffff';
  if (lv) {
    const T = READ_TARGETS[lv];
    cardSub = ensureContrast(cardSub, cardBgSolid, T.text);
    cardFaint = ensureContrast(cardFaint, cardBgSolid, T.hint);
    ({ ink: accentInk, fill: accentFill, on: onAccent } = readableAccent(t.accent, cardBgSolid, lv));
  }
  // 입력 포커스 (v1.9) — 미지정이면 포인트색 기반 글로우 3px
  const focusC = t.focusColor ?? t.accent;
  const focusRing = t.focusRing ?? 'glow';
  const focusW = Math.max(0, Math.min(6, t.focusW ?? 3));
  // 카드·위젯 배경 불투명도 (v3.4) — 0~100%
  const cardA = Math.max(0, Math.min(100, t.cardAlpha ?? CARD_ALPHA)) / 100;
  return {
    '--bg-angle': `${t.bgAngle ?? 180}deg`,
    '--bg-blur': `${Math.max(0, t.bgBlur ?? 0)}px`,
    // 배경 이미지 덮개 (v2.0) — 사진을 쓸 때만 그린다. 그라데이션 위에는 얹지 않는다
    '--bg-dim-layer': t.bgType === 'image' && t.bgImageId && (t.bgDim ?? BG_DIM) > 0
      ? (() => { const c = withAlpha(t.bgG2, Math.min(100, t.bgDim ?? BG_DIM) / 100); return `linear-gradient(${c},${c})`; })()
      : 'none',
    '--panel-solid': t.cardBg ?? '#fbfbfc',
    '--panel': withAlpha(t.cardBg ?? '#fcfcfd', cardA),
    '--ink': cardFg, '--sub': cardSub, '--faint': cardFaint,
    '--sh-sm': sh(8, 26, 0.22),   // 작은 카드
    '--sh-md': sh(10, 40, 0.25),  // 패널·배너
    '--sh-lg': sh(24, 70, 0.5),   // 모달
    '--sh-dd': kd === 0 ? 'none' : `0 14px 40px rgba(${rgb},${Math.min(1, 0.5 * kd).toFixed(3)})`,
    '--bg-g1': t.bgG1, '--bg-g2': t.bgG2,
    '--top-bg': withAlpha(t.topBg, 0.84), '--top-fg': t.topFg, '--top-hv': t.topHv, '--top-brand': t.topBrand,
    '--dd-bg': withAlpha(t.ddBg, 0.97), '--dd-fg': t.ddFg, '--dd-hv': withAlpha(t.ddHv, 0.09),
    '--page-title': t.pageTitle, '--page-desc': t.pageDesc,
    // 페이지 헤더 표시 옵션 (v1.9) — 모바일 생략은 CSS 미디어쿼리가 --ph-m을 보고 처리
    '--ph-title': (t.pageHead ?? 'both') === 'both' || t.pageHead === 'title' ? 'block' : 'none',
    '--ph-desc': (t.pageHead ?? 'both') === 'both' || t.pageHead === 'desc' ? 'block' : 'none',
    '--ph-title-m': (t.pageHeadM ?? 'same') === 'none' ? 'none'
      : ((t.pageHead ?? 'both') === 'both' || t.pageHead === 'title' ? 'block' : 'none'),
    '--ph-desc-m': (t.pageHeadM ?? 'same') === 'none' ? 'none'
      : ((t.pageHead ?? 'both') === 'both' || t.pageHead === 'desc' ? 'block' : 'none'),
    '--bgm-bg': withAlpha(t.bgmBg, 0.9), '--bgm-fg': t.bgmFg, '--bgm-ic': t.bgmIc, '--bgm-vol': t.bgmVol,
    '--sb-thumb': t.sbThumb, '--sb-bd': t.sbBd,
    '--search-bg': t.searchBg ?? '#232830', '--search-fg': t.searchFg ?? '#e8eaee',
    '--search-ic': t.searchIc ?? '#8b919b', '--search-bd': t.searchBd ?? '#3a404a',
    // --accent = 글씨로 쓰는 포인트색 / --accent-fill = 면(버튼·토글)으로 쓰는 포인트색 / --on-accent = 그 위 글씨 (v3.6)
    '--accent': accentInk, '--accent-soft': t.accentSoft,
    '--accent-fill': accentFill, '--on-accent': onAccent,
    // 진한 버튼 3색 — 호버 미지정 시 배경에서 살짝 밝게 자동 파생
    '--btn-dark': t.btnDark ?? '#1d2025',
    '--btn-dark-fg': t.btnDarkFg ?? '#ffffff',
    '--btn-dark-hv': t.btnDarkHv ?? adjust(t.btnDark ?? '#1d2025', cc => ({ l: Math.min(1, cc.l + 0.07) })),
    // 이미지 편집(크롭) 배경 (v1.9)
    '--crop-bg': t.cropBg ?? '#2c313a',
    // 입력 포커스 (v1.9) — 테두리색 + 링(글로우: 반투명 번짐 / 라인: 선명한 테두리 / 없음)
    // 드래그 효과 (v3.7) — globals.css의 ::selection이 이 그림자만 쓴다(글자·바탕은 투명).
    // 번짐은 카드 글씨색 + 페이지 제목색 두 겹 — 선택 영역에선 원래 글자색을 알 수 없어서(글자가 투명),
    // 카드 위(카드 글씨색)와 배경 위(제목색) 어느 쪽에서든 한 겹은 보이게 한다
    '--sel-shadow': (t.selFx ?? 'fog') === 'ghost'
      ? `-2px 0 3px ${withAlpha(t.accent, 0.85)},2px 0 3px ${withAlpha(fgDark ? '#5f7f9e' : '#86a6c4', 0.85)},0 0 2.5px ${withAlpha(cardFg, 0.6)},0 0 2.5px ${withAlpha(t.pageTitle, 0.45)}`
      : `0 0 4px ${withAlpha(cardFg, 0.7)},0 0 4px ${withAlpha(t.pageTitle, 0.55)}`,
    '--focus-bd': focusC,
    '--focus-ring': focusRing === 'none' || focusW === 0
      ? 'none'
      : focusRing === 'line'
        ? `0 0 0 ${focusW}px ${focusC}`
        : `0 0 0 ${focusW}px ${withAlpha(focusC, 0.16)}`,
    // 스위치 탭 — 안 고른 쪽 (v2.0) · 고른 쪽은 --btn-dark 3색을 그대로 쓴다
    '--seg-bg': t.segBg ?? '#f0f1f3',
    '--seg-fg': t.segFg ?? '#8a8f98',
    // 위젯 (v2.0 사용자 요청) — 안 정하면 카드 색을 그대로 따라간다(지금까지의 모습).
    // 배경만 반투명 처리하는 것은 카드와 같은 규칙 — 배경 이미지를 깔았을 때 비쳐 보이게 한다
    '--wg-bg': t.wgBg ? withAlpha(t.wgBg, cardA) : withAlpha(t.cardBg ?? '#fcfcfd', cardA),
    '--wg-title': t.wgTitle ?? 'var(--faint)',
    '--wg-fg': t.wgFg ?? 'var(--ink)',
    // 테두리는 켤 때만 그린다 — 끄면 0이라 지금까지처럼 그림자만 남는다
    '--wg-bd-w': t.wgBorder ? '1px' : '0px',
    '--wg-bd': t.wgBd ?? 'var(--line)',
    '--radius': `${t.radius}px`, '--radius-s': `${t.radiusS}px`,
  };
}
