// 자관 선택 위젯 (v4.6 사용자 확정) — 자관 상세 아래 「자유 공간」에 자관마다 골라 넣는 위젯.
// 디데이·LOG/LOREBOOK은 모든 자관에 붙는 고정 위젯(RelWidgets.tsx)이고, 이쪽은 관리자가 고른 것만 보인다.
// 예전 「HTML 프리 스페이스」(freeBlocks)는 여기의 'html' 종류가 되었다 — 읽을 때 저절로 옮겨 읽고,
// 상세 페이지에서 한 번이라도 고치면 widgets로 저장하면서 freeBlocks는 지운다.
// 자관 문서(relations) 안의 값이라 Firebase·Supabase 규칙은 바뀌지 않는다(두 백엔드 모두 문서를 통째로 저장).
import type { Relation, RelAu } from './relStore';

export type RelWidgetKind = 'html' | 'theme' | 'memo' | 'line' | 'scene' | 'lexicon';

/** 모양 프리셋 (v4.3 시안 P-1) — 고른 뒤 투명도·모서리를 손대면 'custom'.
 *  'line'(투명)은 배경 없이 위아래 가로줄만 — 이때 a는 가로줄 진하기이고 0이면 줄도 없다 (v4.4 시안 L-1) */
export type RelWidgetPreset = 'card' | 'glass' | 'line' | 'pill' | 'custom';
export const WIDGET_PRESETS: Record<Exclude<RelWidgetPreset, 'custom'>, { label: string; a: number; r: number }> = {
  card: { label: '카드', a: 100, r: 14 },
  glass: { label: '유리', a: 55, r: 14 },
  line: { label: '투명', a: 35, r: 0 },
  pill: { label: '알약', a: 80, r: 32 },
};
/** 격자 칸 수 (v4.7 사용자 요청 — 12칸 직사각형 → 24칸 정사각형). 휴대폰(620px 이하)에서는 늘 가로 전체 */
export const GRID_COLS = 24;
/** 위젯 최소 너비 (24칸 중) */
export const SPAN_MIN = 4;
/** 예전(12칸 격자) 너비 값 — 읽을 때만 쓴다. 새로 저장하면 span으로 바뀐다 */
export type RelWidgetWidth = 3 | 4 | 6 | 8 | 12;
export const WIDGET_H_MIN = 80;
export const WIDGET_H_MAX = 600;

export interface ThemeTrack { id: string; title: string; artist?: string; videoId: string }
export interface MemoItem { id: string; title: string; body: string; membersOnly?: boolean }
export interface SceneLine { id: string; who: string; text: string }   // who: 멤버 charId, ''이면 지문
export interface LexEntry { id: string; word: string; pron?: string; pos?: string; defs: string[]; src?: string }

export interface RelWidget {
  id: string;
  kind: RelWidgetKind;
  title?: string;
  /** 예전 12칸 격자의 너비 — span이 없을 때만 ×2로 읽는다 (spanOf) */
  w?: RelWidgetWidth;
  /** 24칸 중 몇 칸 (기본 24). 묶음 안 위젯이면 묶음 너비를 넘지 않는다 */
  span?: number;
  /** 앞 위젯 아래에 붙는다 — 앞 위젯의 세로 묶음에 들어간다 (v4.7 시안 A · 세로 묶음) */
  under?: boolean;
  /** 묶음 안에서 시작 칸 (0부터, 묶음 왼쪽 기준). 없으면 빈자리에 차례로 */
  col?: number;
  /** 고정 높이 px (없으면 내용대로). 넘치는 내용은 위젯 안에서 스크롤 */
  h?: number;
  preset?: RelWidgetPreset;
  /** custom일 때 배경 불투명도 0~100 / line일 때 가로줄 진하기 */
  a?: number;
  /** custom일 때 모서리 px */
  r?: number;
  html?: string;
  tracks?: ThemeTrack[];
  memos?: MemoItem[];
  /** 오늘의 한 줄 — LOG만 / LOG + LOREBOOK */
  lineSrc?: 'log' | 'all';
  scene?: SceneLine[];
  sceneFrom?: string;
  lex?: LexEntry[];
}

export const WIDGET_KINDS: { kind: RelWidgetKind; label: string; hint: string }[] = [
  { kind: 'theme', label: '테마곡', hint: '유튜브 플레이리스트' },
  { kind: 'memo', label: '접어 둔 메모', hint: '눌러서 펼치기' },
  { kind: 'line', label: '오늘의 한 줄', hint: 'LOG에서' },
  { kind: 'scene', label: '대화 장면', hint: '멤버 말풍선' },
  { kind: 'lexicon', label: '관계 사전', hint: '표제어 · 뜻풀이' },
  { kind: 'html', label: 'HTML', hint: '자유 입력' },
];
export const kindLabel = (k: RelWidgetKind) => WIDGET_KINDS.find(x => x.kind === k)?.label ?? k;

type FreeBlock = { id: string; title?: string; html: string };
const fromFree = (b: FreeBlock[]): RelWidget[] => b.map(x => ({ id: x.id, kind: 'html', title: x.title, html: x.html }));

/** 이 자관·AU에서 보일 위젯 — AU가 따로 가진 게 없으면 원본(base) 것을 그대로 (예전 freeBlocks와 같은 규칙) */
export function relWidgetsOf(rel: Relation, au?: RelAu): RelWidget[] {
  const own = (x: { widgets?: RelWidget[]; freeBlocks?: FreeBlock[] } | undefined) =>
    x?.widgets ?? (x?.freeBlocks ? fromFree(x.freeBlocks) : undefined);
  const isBase = !au || au.id === 'base';
  return (isBase ? undefined : own(au)) ?? own(rel) ?? [];
}

/** 위젯 배경·모서리 — 프리셋이면 그 값, custom이면 저장한 값 */
export function widgetLook(w: RelWidget): { line: boolean; a: number; r: number } {
  const p = w.preset ?? 'card';
  if (p === 'custom') return { line: false, a: w.a ?? 100, r: w.r ?? 14 };
  const base = WIDGET_PRESETS[p];
  // line은 가로줄 진하기만 따로 저장한다 (a)
  return { line: p === 'line', a: p === 'line' ? (w.a ?? base.a) : base.a, r: base.r };
}

/** 위젯 너비(24칸 중) — 예전 12칸 값은 두 배로 */
export const spanOf = (w: RelWidget): number =>
  Math.max(SPAN_MIN, Math.min(GRID_COLS, Math.round(w.span ?? (w.w ?? 12) * 2)));

/** 세로 묶음 — 첫 위젯(head)이 너비를 정하고, under 위젯들이 그 아래에 쌓인다 */
export interface RelStack { span: number; items: RelWidget[] }

/** 순서대로 묶는다 — under는 바로 앞 묶음에 들어가고, 맨 앞 위젯의 under는 무시한다 */
export function stacksOf(list: RelWidget[]): RelStack[] {
  const out: RelStack[] = [];
  for (const w of list) {
    const last = out[out.length - 1];
    if (w.under && last) last.items.push(w);
    else out.push({ span: spanOf(w), items: [w] });
  }
  return out;
}

/** 묶음 안 위젯의 너비·시작 칸 — 묶음을 넘지 않게 줄인다. head는 늘 묶음 전체 */
export function placeIn(st: RelStack, w: RelWidget): { span: number; col?: number } {
  if (w.id === st.items[0].id) return { span: st.span };
  const col = w.col != null ? Math.max(0, Math.min(st.span - SPAN_MIN, w.col)) : undefined;
  return { span: Math.min(spanOf(w), st.span - (col ?? 0)), col };
}

/** 마지막 줄에 남은 칸 수 (0이면 꽉 참) — 묶음이 줄을 넘기면 다음 줄에서 다시 센다(CSS grid와 같은 규칙) */
export function lastRowFree(list: RelWidget[]): number {
  let used = 0;
  for (const st of stacksOf(list)) {
    if (used + st.span > GRID_COLS) used = 0;
    used += st.span;
    if (used === GRID_COLS) used = 0;
  }
  return used === 0 ? 0 : GRID_COLS - used;
}

/* ---------- 오늘의 한 줄 — 본문에서 한글 문장 하나 (v4.7 사용자 요청: 상태창 말고 로그 본문의 한글 한 문장만) ---------- */

/** 상태창·머리말 줄 — 날짜(2026/07/18) · 시각(11:04) · 요일 괄호 · 「장소: …」 같은 이름표 */
const STATUS_LINE = /\d{2,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2}|\d{1,2}\s*:\s*\d{2}|\((?:MON|TUE|WED|THU|FRI|SAT|SUN|월|화|수|목|금|토|일)\)|^[^\s:：]{1,8}\s*[:：|]/i;
const SENTENCE_MIN = 12;
const SENTENCE_MAX = 140;
/** 한 글에서 후보로 남길 문장 수 — 긴 글도 메모리를 너무 쓰지 않게 */
const SENTENCE_CAP = 60;

/**
 * 글의 문단들(widgetExcerpt.visibleParts) → 「오늘의 한 줄」 후보 문장.
 * 문단 안에서 . ! ? … 」 』 " ” 뒤를 끊고, 아래 문장만 남긴다.
 *  - 상태창·머리말 줄(STATUS_LINE)이 아님
 *  - 글자(숫자·문장부호·기호 제외)의 70% 이상이 한글 — 영어 가사·상태창 영문은 빠진다
 *  - 12~140자 — 제목·이름표 조각과 여러 문장이 붙은 덩어리는 빠진다
 *  - 마침표류로 끝남 — 마침표 없이 한글로 끝나면 20자 이상일 때만 (「시모어 하우스, 모닝 룸」 같은 장소 줄을 빼려고)
 */
export function bodySentences(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const clean = p
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    for (const raw of clean.split(/(?<=[.!?。…」』"”])\s+/)) {
      const s = raw.replace(/^[-–—•·*>\s]+/, '').replace(/\s+/g, ' ').trim();
      if (s.length < SENTENCE_MIN || s.length > SENTENCE_MAX || STATUS_LINE.test(s)) continue;
      const letters = s.replace(/[\s\d\p{P}\p{S}]/gu, '');
      const ko = s.match(/[가-힣]/g)?.length ?? 0;
      if (!letters.length || ko / letters.length < 0.7) continue;
      if (!/[.!?…。」』"”~]$/.test(s) && !(s.length >= 20 && /[가-힣]$/.test(s))) continue;
      out.push(s);
      if (out.length >= SENTENCE_CAP) return out;
    }
  }
  return out;
}
