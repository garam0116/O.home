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
/** 12칸 격자에서 고를 수 있는 너비 — 휴대폰(620px 이하)에서는 늘 가로 전체 */
export const WIDGET_WIDTHS = [3, 4, 6, 8, 12] as const;
export type RelWidgetWidth = typeof WIDGET_WIDTHS[number];
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
  /** 12칸 중 몇 칸 (기본 12) */
  w?: RelWidgetWidth;
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

/** 남은 칸에 맞는 너비 — 고를 수 있는 너비 중 남은 칸 이하에서 가장 큰 것 (최소 3) */
export const fitWidth = (free: number): RelWidgetWidth =>
  ([...WIDGET_WIDTHS].reverse().find(w => w <= free) ?? 3) as RelWidgetWidth;

/** 마지막 줄에 남은 칸 수 (0이면 꽉 참) — 위젯이 줄을 넘기면 다음 줄에서 다시 센다(CSS grid와 같은 규칙) */
export function lastRowFree(list: RelWidget[]): number {
  let used = 0;
  for (const w of list) {
    const span = w.w ?? 12;
    if (used + span > 12) used = 0;
    used += span;
    if (used === 12) used = 0;
  }
  return used === 0 ? 0 : 12 - used;
}

/** 오늘의 한 줄 — 글 요약을 문장으로 나눈다. 너무 짧은 조각(제목·날짜 줄)은 뺀다 */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?。…」』])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 12);
}
