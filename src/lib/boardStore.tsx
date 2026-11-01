'use client';
// 게시판 설정 (5.2 게시판 관리) — 시스템 뱃지 + 갤러리 분류·뱃지 색
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

/** 갤러리(그림백업) 유형 뱃지 2종 — 로그/단일 (라벨·색 수정 가능, 삭제 불가) */
export const DEFAULT_GALLERY_BADGES: BoardBadge[] = [
  { id: 'log', label: '로그', bg: '#1d2025', border: '#1d2025', fg: '#ffffff' },
  { id: 'single', label: '단일', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' },
  // 단일(세로정렬) (v1.9) — 로그와 달리 이미지 사이 갭을 두고 세로로 죽 내려보는 게시글
  { id: 'vlist', label: '단일(세로)', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' },
];

/** 갤러리 말머리 (v2.0) — 자유롭게 관리 */
export const DEFAULT_GALLERY_CATS: BoardBadge[] = ['합작', '낙서', '커미션', '설정화'].map(c => ({
  id: `gcat-${c}`, label: c, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d',
}));

export interface BoardSettings {
  system: BoardBadge[]; gallery: BoardBadge[]; galleryCats: BoardBadge[];
  /** 갤러리마다 따로 쓰는 말머리 (v2.0 사용자 요청) — 정한 적 없으면 기본 갤러리 것을 그대로.
   *  새로 만들자마자 말머리가 비면 글부터 못 쓴다(감상타래·스케줄러와 같은 규칙). */
  secGalleryCats?: Record<string, BoardBadge[]>;
  /** 게시판 목록 한 페이지에 보일 글 수 (v2.3 사용자 요청) — 모든 게시판 공통. 비우면 10 */
  perPage?: number;
}
const DEFAULTS: BoardSettings = {
  system: DEFAULT_BOARD_SYSTEM,
  gallery: DEFAULT_GALLERY_BADGES, galleryCats: DEFAULT_GALLERY_CATS,
};

/** 게시판 목록 페이지당 글 수 — 기본값·범위 (v2.3) */
export const BOARD_PER_PAGE = { def: 10, min: 3, max: 60 } as const;
export const perPageOf = (s: BoardSettings) =>
  Math.min(BOARD_PER_PAGE.max, Math.max(BOARD_PER_PAGE.min, Math.round(s.perPage ?? BOARD_PER_PAGE.def)));
const KEY = 'ohome.boardset.v1';

/** 그 갤러리에서 쓸 말머리 (v2.0) — 따로 정한 적이 없으면 기본 갤러리 것 */
export const galleryCatsOf = (s: BoardSettings, secId: string): BoardBadge[] =>
  (secId === MAIN_SEC ? s.galleryCats : s.secGalleryCats?.[secId] ?? s.galleryCats);

/** 그 갤러리의 말머리를 담은 patch — 기본 갤러리면 예전 자리에 그대로 저장한다 */
const galleryCatsPatch = (s: BoardSettings, secId: string, cats: BoardBadge[]): Partial<BoardSettings> =>
  (secId === MAIN_SEC ? { galleryCats: cats } : { secGalleryCats: { ...s.secGalleryCats, [secId]: cats } });

export function useBoardSettings() {
  const [st, setSt] = useState<BoardSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<BoardSettings>;
        setSt({
          system: DEFAULT_BOARD_SYSTEM.map(d => p.system?.find(s => s.id === d.id) ?? d),
          gallery: DEFAULT_GALLERY_BADGES.map(d => p.gallery?.find(g => g.id === d.id) ?? d),
          galleryCats: p.galleryCats ?? DEFAULT_GALLERY_CATS,
          secGalleryCats: p.secGalleryCats,
          perPage: p.perPage,
        });
      }
    } catch { /* 기본값 */ }
    setLoaded(true);
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
  const patchGallery = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, gallery: s.gallery.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  /* 갤러리 말머리 — 추가·수정·삭제·정렬 (v2.0).
     **갤러리마다 따로** 가질 수 있다 (v2.0 사용자 요청) — 첫 인자가 어느 갤러리인지다.
     보고 있는 갤러리 것만 건드리므로 다른 갤러리 말머리가 지워지지 않는다. */
  const mutGalleryCats = useCallback((secId: string, fn: (cats: BoardBadge[]) => BoardBadge[]) =>
    apply(s => ({ ...s, ...galleryCatsPatch(s, secId, fn(galleryCatsOf(s, secId))) })), [apply]);
  const patchGalleryCat = useCallback((secId: string, id: string, p: Partial<BoardBadge>) =>
    mutGalleryCats(secId, cs => cs.map(b => (b.id === id ? { ...b, ...p } : b))), [mutGalleryCats]);
  const addGalleryCat = useCallback((secId: string) =>
    mutGalleryCats(secId, cs => [...cs, { id: newId(), label: '새 말머리', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }]), [mutGalleryCats]);
  const removeGalleryCat = useCallback((secId: string, id: string) =>
    mutGalleryCats(secId, cs => cs.filter(b => b.id !== id)), [mutGalleryCats]);
  const setGalleryCats = useCallback((secId: string, cats: BoardBadge[]) =>
    mutGalleryCats(secId, () => cats), [mutGalleryCats]);
  const setPerPage = useCallback((n: number) => apply(s => ({ ...s, perPage: n })), [apply]);
  return {
    st, loaded, patchSystem, patchGallery, setPerPage,
    patchGalleryCat, addGalleryCat, removeGalleryCat, setGalleryCats,
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
    return () => window.removeEventListener('ohome-boards', sync);
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
import { getRawSetting, setSetting } from './settingStore';
