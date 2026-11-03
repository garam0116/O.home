'use client';
// 게시판 설정 (5.2 게시판 관리) — 시스템 뱃지 색 · 페이지당 글 수 · 본문 박스
import { useCallback, useEffect, useState } from 'react';
import { newId } from './postStore';
import { MAIN_SEC, cleanSlug } from './sectionStore';
import type { Post } from './postStore';
import { numbersOf, findByNo, noKeyOf } from './itemNo';

export interface BoardBadge { id: string; label: string; bg: string; border: string; fg: string }

/** 시스템 뱃지 3종 — 삭제 불가 (색·글씨는 수정 가능) */
export const DEFAULT_BOARD_SYSTEM: BoardBadge[] = [
  { id: 'notice', label: '공지', bg: '#1d2025', border: '#1d2025', fg: '#ffffff' },
  { id: 'secret', label: '비밀', bg: '#a63a45', border: '#8c2f39', fg: '#ffffff' },
  { id: 'fold', label: '접힘', bg: '#f2e6e7', border: '#d9b8bc', fg: '#a63a45' },
];

export interface BoardSettings {
  /* 갤러리 유형 뱃지·말머리는 쓰지 않아 삭제 (v2.6 사용자 요청) — 예전 저장본에 남은 값은 읽지 않고,
     다음 저장 때 빠진다 */
  system: BoardBadge[];
  /** 게시판 목록 한 페이지에 보일 글 수 (v2.3 사용자 요청) — 모든 게시판 공통. 비우면 10 */
  perPage?: number;
  /** 본문 박스 불투명도 0~100 (v2.6 사용자 요청) — 게시판 목록·글 화면의 흰 박스(모바일은 글 화면의 흰 바탕).
   *  모든 게시판 공통. 비우면 지금 모양 그대로(박스 94% · 모바일 바탕 80%) */
  boxAlpha?: number;
  /** 박스 안 글씨색 — 'keep': 지금처럼 어두운 글씨(기본) / 'theme': 테마 따라감(다크면 밝게, 라이트면 어둡게) */
  boxText?: 'keep' | 'theme';
  /** 카테고리 목록 상단 헤더 모양 (v3.2 사용자 요청) — 모든 게시판 공통, 환경설정 > 디자인 「카테고리 헤더」.
   *  'basic' 지금 모양(기본) · 'mast' 마스트헤드(머리글 + 이탤릭 큰 제목 + 밑줄 탭) · 'emblem' 각인(가운데 정렬 + 장식) */
  headStyle?: BoardHeadStyle;
}
export type BoardHeadStyle = 'basic' | 'mast' | 'emblem';
const DEFAULTS: BoardSettings = {
  system: DEFAULT_BOARD_SYSTEM,
};

/** 게시판 목록 페이지당 글 수 — 기본값·범위 (v2.3) */
export const BOARD_PER_PAGE = { def: 10, min: 3, max: 60 } as const;
export const perPageOf = (s: BoardSettings) =>
  Math.min(BOARD_PER_PAGE.max, Math.max(BOARD_PER_PAGE.min, Math.round(s.perPage ?? BOARD_PER_PAGE.def)));
const KEY = 'ohome.boardset.v1';

/** 본문 박스 기본 불투명도 (지금 모양 = --panel 94%) */
export const BOARD_BOX_DEF = 94;
export const boxAlphaOf = (s: BoardSettings) => Math.min(100, Math.max(0, Math.round(s.boxAlpha ?? BOARD_BOX_DEF)));

/** 게시판 화면에 본문 박스 설정을 건다 (v2.6) — <html>에 클래스·변수를 달고, CSS(globals.css 「본문 박스」)가
 *  게시판 목록·글 화면 안에서만 그것을 쓴다. 값을 정한 적 없으면 아무것도 달지 않아 지금 모양 그대로다.
 *  모바일 글 화면의 흰 바탕(#appMain)도 함께 옅어져야 해서 화면 바깥(html)에 단다. */
export function useBoardBoxStyle() {
  const { st } = useBoardSettings();
  const on = st.boxAlpha !== undefined;
  const a = boxAlphaOf(st);
  const theme = st.boxText === 'theme';
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('bbox-on', on);
    root.classList.toggle('bbox-zero', on && a === 0);
    root.classList.toggle('bbox-theme', theme);
    if (on) root.style.setProperty('--bbox-a', String(a / 100)); else root.style.removeProperty('--bbox-a');
    return () => {
      root.classList.remove('bbox-on', 'bbox-zero', 'bbox-theme');
      root.style.removeProperty('--bbox-a');
    };
  }, [on, a, theme]);
}

export function useBoardSettings() {
  const [st, setSt] = useState<BoardSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // 환경설정에서 SAVE 없이 변경을 취소하면 저장본을 다시 읽는다 (v2.5)
    const load = () => { try {
      const raw = getRawSetting(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<BoardSettings>;
        setSt({
          system: DEFAULT_BOARD_SYSTEM.map(d => p.system?.find(s => s.id === d.id) ?? d),
          perPage: p.perPage,
          boxAlpha: p.boxAlpha,
          boxText: p.boxText,
          headStyle: p.headStyle,
        });
      } else setSt(DEFAULTS);
    } catch { /* 기본값 */ } };
    load();
    setLoaded(true);
    /* 같은 설정을 다른 칸에서 바꿨을 때도 다시 읽는다 (v3.2) — 「카테고리 헤더」(디자인)와
       「페이지당 포스팅 수」(카테고리)가 같은 키를 따로 고치므로, 서로의 옛 값으로 덮어쓰지 않게 */
    const offChange = onSettingChange(k => { if (k === KEY) queueMicrotask(load); });
    const offReload = onSettingReload(KEY, load);
    return () => { offChange(); offReload(); };
  }, []);
  const apply = useCallback((fn: (s: BoardSettings) => BoardSettings) => {
    setSt(s => {
      const n = fn(s);
      try { setSetting(KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  const patchSystem = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, system: s.system.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  const setPerPage = useCallback((n: number) => apply(s => ({ ...s, perPage: n })), [apply]);
  const setBox = useCallback((p: Pick<BoardSettings, 'boxAlpha' | 'boxText'>) => apply(s => ({ ...s, ...p })), [apply]);
  const setHeadStyle = useCallback((v: BoardHeadStyle) =>
    apply(s => ({ ...s, headStyle: v === 'basic' ? undefined : v })), [apply]);
  return {
    st, loaded, patchSystem, setPerPage, setBox, setHeadStyle,
  };
}

/* ---------- 게시판 다중 생성 (5.2 v1.9) ---------- */
// 같은 유형(리스트형) 게시판을 여러 개 — 게시판별 이름·권한·리스트 스킨(기본형/갤러리형).
// 글은 ohome.board.v1 한 곳에 boardId로 구분 저장(게시판 삭제 시에도 글 데이터는 보존 — 3장 원칙).
/* 스킨 (v2.3 사용자 요청) — 티켓형을 없애고 갤러리형 두 가지로 바꿨다.
   gallery  = 그림 위에 하단 그림자 + 흰 글씨 (갤러리형 1)
   gallery2 = 그림 위에 반투명 흰 띠 + 글씨 (갤러리형 2) */
export type BoardSkin = 'list' | 'gallery' | 'gallery2';
export const BOARD_SKINS: { id: BoardSkin; label: string }[] = [
  { id: 'list', label: '기본형' }, { id: 'gallery', label: '갤러리형 1' }, { id: 'gallery2', label: '갤러리형 2' },
];
/** 저장본 정리 — 예전 티켓형('ticket')은 갤러리형 1로 이어 받는다 (v2.3) */
const normBoards = (list: Board[]): Board[] =>
  list.map(b => (BOARD_SKINS.some(k => k.id === b.skin) ? b : { ...b, skin: b.skin === ('ticket' as string) ? 'gallery' : 'list' }));
export type BoardPerm = 'guest' | 'member' | 'admin';

export interface Board {
  id: string;              // 'main' = 기본 게시판 (삭제 불가)
  name: string;            // 메뉴·페이지 타이틀 표시명
  desc: string;            // 페이지 설명 기본 문구
  skin: BoardSkin;         // 리스트 스킨 — 기본형 / 갤러리형 1 / 갤러리형 2
  permWrite: BoardPerm;    // 글쓰기 권한 (mock 단계에선 로그인 전제 — 로드뷰와 동일)
  permComment: BoardPerm;  // 댓글 권한
  fg?: string;             // 목록 글씨색 (v1.9 — 미지정이면 테마 기본색)
  /** 댓글 기능 끄기 (v2.5 사용자 요청) — true면 글 아래 댓글 목록·입력창과 목록의 댓글 수를 숨긴다.
   *  비어 있으면 켜짐(예전 게시판 그대로). 이미 달린 댓글은 지우지 않으므로 다시 켜면 그대로 보인다 */
  noComment?: boolean;
  /** 주소 별명 (v2.4 사용자 요청) — `/board/b/{별명}`. 비우면 게시판 이름을 영소문자로 바꿔 쓰고
   *  (Palimpsest → palimpsest), 이름에 영문·숫자가 없으면 내부 id가 주소에 나온다.
   *  **글의 소속(boardId)은 언제나 id로 저장한다** — 별명·이름을 바꿔도 글이 떨어져 나가지 않는다. */
  slug?: string;
}

const BOARDS_KEY = 'ohome.boards.v1';
export const MAIN_BOARD_ID = 'main';

export const DEFAULT_BOARDS: Board[] = [{
  id: MAIN_BOARD_ID, name: '리스트',
  desc: 'MD / HTML 작성 지원 · 스크립트 실행 불허 · 비밀글 · 접기',
  skin: 'list', permWrite: 'member', permComment: 'member',
}];

export function useBoards(): {
  boards: Board[]; setBoards: (next: Board[]) => void; loaded: boolean;
  patchBoard: (id: string, p: Partial<Board>) => void;
} {
  const [boards, setSt] = useState<Board[]>(DEFAULT_BOARDS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(BOARDS_KEY);
      if (raw) setSt(normBoards(JSON.parse(raw)));
    } catch { /* 기본값 */ }
    setLoaded(true);
    const sync = () => {
      try {
        const raw = getRawSetting(BOARDS_KEY);
        if (raw) setSt(normBoards(JSON.parse(raw)));
      } catch { /* 무시 */ }
    };
    window.addEventListener('ohome-boards', sync);
    // 환경설정에서 SAVE 없이 변경을 취소하면 저장본으로 (v2.5)
    const offReload = onSettingReload(BOARDS_KEY, () => setSt(currentBoards()));
    return () => { window.removeEventListener('ohome-boards', sync); offReload(); };
  }, []);
  const setBoards = useCallback((next: Board[]) => {
    setSt(next);
    try { setSetting(BOARDS_KEY, next); } catch { /* 무시 */ }
    // 상단바 메뉴가 같은 탭에서 즉시 갱신되도록
    setTimeout(() => window.dispatchEvent(new Event('ohome-boards')), 0);
  }, []);
  const patchBoard = useCallback((id: string, p: Partial<Board>) => {
    setSt(s => {
      const n = s.map(b => (b.id === id ? { ...b, ...p } : b));
      try { setSetting(BOARDS_KEY, n); } catch { /* 무시 */ }
      setTimeout(() => window.dispatchEvent(new Event('ohome-boards')), 0);
      return n;
    });
  }, []);
  return { boards, setBoards, loaded, patchBoard };
}

/* ---------- 게시판 주소 (v2.4 사용자 요청) ----------
   `/board?b=mt9ipt` 대신 `/board/b/palimpsest`. 기본 게시판은 지금처럼 `/board`.
   메뉴 트리·공개범위 판정·페이지 타이틀이 모두 **주소 문자열**로 맞춰 보므로,
   주소는 반드시 이 함수들로만 만든다. */
export const BOARD_PATH = '/board/b';

/** 지금 저장된 게시판 목록 (훅 없이) — 주소를 만들 때 렌더 밖에서도 필요하다 */
export function currentBoards(): Board[] {
  try {
    const raw = getRawSetting(BOARDS_KEY);
    if (raw) return normBoards(JSON.parse(raw));
  } catch { /* 기본값 */ }
  return DEFAULT_BOARDS;
}

/** 게시판마다 주소에 쓸 값 — 직접 정한 별명 → 이름(영소문자) → id 순.
 *  겹치면 직접 정한 별명이 이기고, 이름에서 만든 것끼리는 목록에서 앞선 게시판이 갖는다
 *  (뒤의 것은 id로 물러난다 — 두 게시판이 같은 주소를 가리키는 일이 없게). */
export function boardKeys(boards: Board[] = currentBoards()): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set(boards.map(b => b.id));
  const extra = boards.filter(b => b.id !== MAIN_BOARD_ID);
  for (const b of extra) {
    const k = cleanSlug(b.slug ?? '');
    if (k && !used.has(k)) { out.set(b.id, k); used.add(k); }
  }
  for (const b of extra) {
    if (out.has(b.id)) continue;
    const k = cleanSlug(b.name);
    if (k && !used.has(k)) { out.set(b.id, k); used.add(k); } else out.set(b.id, b.id);
  }
  return out;
}

/** 이 게시판의 주소 값 (별명·이름·id 중 실제로 쓰이는 것) */
export const boardKeyOf = (id: string, boards?: Board[]) => boardKeys(boards).get(id) ?? id;

/** 주소 값(별명·이름에서 만든 값·id 어느 것이든) → 게시판. 옛 `?b=id` 주소도 이것으로 찾는다 */
export function findBoardByKey(key: string, boards: Board[] = currentBoards()): Board | undefined {
  const keys = boardKeys(boards);
  return boards.find(b => b.id === key) ?? boards.find(b => keys.get(b.id) === key);
}

/** 게시판 목록 페이지 경로 — 기본 게시판은 `/board`, 나머지는 `/board/b/{주소 값}` */
export const boardHref = (id: string, boards?: Board[]) =>
  (id === MAIN_BOARD_ID ? '/board' : `${BOARD_PATH}/${boardKeyOf(id, boards)}`);

/* ---------- 글 번호 (v2.4 사용자 요청) ----------
   글 주소는 `/board/{번호}` — 모든 게시판을 통틀어 올린 순서대로. 다른 게시판으로 옮겨도 그대로다.
   번호를 매기고 받는 규칙은 모든 종류가 같으므로 lib/itemNo에 모아 두었다. */
export const postNumbers = (posts: Post[]) => numbersOf(posts);
export const findPostByKey = (posts: Post[], key: string, nums?: Map<string, number>) => findByNo(posts, key, nums);

/** 글 주소 — 번호를 모르면 id 주소(그 주소로 들어와도 번호 주소로 바뀐다) */
export const postHref = (p: { id: string }, nums: Map<string, number>) => `/board/${noKeyOf(p, nums)}`;

/** 게시판 뱃지 스타일 — 알약형, 텍스트 정중앙 (배경까지 함께 칠해 글씨만 튀지 않게)
 *  한글 잉크는 폰트박스 위쪽에 몰려 line-height:1이면 위로 쏠려 보임 (v1.9 실측 보정) —
 *  line-height 11px + 위3/아래2 비대칭 패딩으로 잉크 중심 = 뱃지 중심, 총높이 18px 정수 */
export function boardBadgeStyle(b?: BoardBadge): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '3px 11px 2px', borderRadius: 999, lineHeight: 'calc(11px*var(--fs,1))',
    background: b?.bg ?? '#eef0f2', border: `1px solid ${b?.border ?? '#d7dae0'}`, color: b?.fg ?? '#5d636d',
    fontSize: 'calc(10.5px*var(--fs,1))', fontWeight: 700, letterSpacing: '.05em',
    fontFamily: 'var(--sans)', whiteSpace: 'nowrap',
  };
}
import type React from 'react';
import { getRawSetting, setSetting, onSettingReload, onSettingChange } from './settingStore';
