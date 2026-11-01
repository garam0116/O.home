'use client';
// 게시판·방명록 타입 + 공용 목록 저장소 훅
// v2.0: 서버(Supabase) 연결이 있으면 DB, 없으면 localStorage — 화면 코드는 동일하다.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { PostMode } from './sanitize';
import { isServerMode } from './supabase';
import { TABLE_OF, fetchList, syncList, subscribeTable } from './db';
import { currentUserId } from './currentUser';

/** 목록 저장 실패 알림 (v2.0) — 조용히 되돌리면 "쓴 게 바로 지워진다"로만 보여 원인을 알 수 없다.
 *  ListSync가 받아 화면에 띄운다 (설정 저장 실패 알림과 같은 방식) */
export const LIST_ERR_EVT = 'ohome-list-error';

export interface Comment {
  id: string;
  author: string;
  authorId: string;      // 게스트 댓글은 '' (방문자 권한 — 4.10/5.2)
  text: string;
  date: string;          // ISO
  parentId?: string;     // 대댓글
  guestPw?: string;      // 게스트 본인 수정·삭제용 (mock — 실서비스는 서버 해시)
}

/**
 * 댓글 한 줄 = 자기 문서 하나 (v2.0).
 *
 * 예전에는 댓글이 글(Post·RoadItem) 안 배열에 들어 있었다. 그래서 **댓글을 달려면 그 글을
 * UPDATE 해야 했고**, 보안 규칙의 「글 수정은 작성자 또는 관리자만」에 걸려 일반 회원이
 * 관리자 글에 댓글을 달면 서버가 거부했다 — 화면에는 잠깐 보였다가 서버 값으로 되돌아와
 * "댓글이 바로 지워지는" 것처럼 보였다 (포크 사용자 제보로 확인).
 *
 * 댓글을 별도 컬렉션으로 빼면 글을 건드릴 필요가 없고, 각 댓글이 자기 authorId를 가지므로
 * 「내가 쓴 댓글은 내가 수정·삭제」가 규칙 그대로 성립한다.
 */
export const COMMENT_KEY = 'ohome.comments.v1';

export interface CommentRow extends Comment {
  targetId: string;                 // 달린 대상(글·로드뷰 항목·감상타래·방명록)의 id
  /** 대상 종류 — 같은 컬렉션을 나눠 쓴다 (thread·guest: v2.0 사용자 요청) */
  target: 'post' | 'road' | 'thread' | 'guest';
}

export const COMMENT_SEED: CommentRow[] = [];

/** 대상 하나의 댓글 — 분리 저장분 + 옛 글 안에 남아 있던 것(legacy)을 합쳐 시간순으로 */
export function commentsFor(
  rows: CommentRow[], target: CommentRow['target'], targetId: string, legacy: Comment[] = [],
): Comment[] {
  const mine = rows.filter(r => r.target === target && r.targetId === targetId);
  const seen = new Set(mine.map(r => r.id));
  return [...legacy.filter(c => !seen.has(c.id)), ...mine]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type FoldType = 'spoiler' | 'adult' | 'custom';

export interface Post {
  id: string;
  title: string;
  body: string;
  mode: PostMode;        // 렌더 방식 (md / html)
  /** 무엇으로 썼는지 (v2.0) — 에디터로 쓴 글을 수정할 때 HTML 소스가 뜨지 않게 기억한다.
   *  렌더는 mode로 하고, 이 값은 수정 화면을 어떤 모드로 열지에만 쓴다. */
  authored?: 'editor';
  author: string;
  authorId: string;
  date: string;          // ISO
  secret: boolean;       // 비밀글
  notice: boolean;       // 공지 고정
  fold: { type: FoldType; label?: string } | null; // 스포일러/수위 접기 (6.2)
  comments: Comment[];
  boardId?: string;      // 소속 게시판 (5.2 다중 게시판 — 없으면 기본 'main')
  /** 태그 (v2.0 사용자 요청) — 기본형 목록의 작성자 왼쪽에 나열되고 검색에 걸린다 */
  tags?: string[];
  thumbSrc?: string;     // 대표 이미지 — 저장소 참조 또는 본문 이미지 URL
  thumbCrop?: { x: number; y: number; scale: number };  // 대표 썸네일 크롭 (16:9)
  /** 글 번호 (v2.4 사용자 요청) — 주소 `/board/{번호}`. 올린 순서대로, 모든 게시판 통틀어 하나로 이어진다 */
  no?: number;
}

export interface GuestEntry {
  id: string;
  author: string;
  authorId?: string;      // 로그인 회원이면
  guestPw?: string;       // 게스트 작성 시 본인 수정·삭제용 (mock — 실서비스는 서버 해시)
  body: string;
  secret: boolean;
  date: string;
  reply?: { author: string; text: string; date: string } | null; // 관리자 답글
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type ListRow = { id?: string };
const EMPTY_LIST = { rows: [] as ListRow[], loaded: false };
type ListStore = {
  snapshot: typeof EMPTY_LIST;
  listeners: Set<() => void>;
  subscription: (() => void) | null;
  refCount: number;
  inflight: Promise<void> | null;
  reqId: number;
  generation: number;
  writes: number;
  dirty: boolean;
  debounce: ReturnType<typeof setTimeout> | null;
  release: ReturnType<typeof setTimeout> | null;
};
const listStores = new Map<string, ListStore>();
const getListStore = (table: string): ListStore => {
  let store = listStores.get(table);
  if (!store) {
    store = {
      snapshot: EMPTY_LIST, listeners: new Set(), subscription: null, refCount: 0,
      inflight: null, reqId: 0, generation: 0, writes: 0, dirty: false,
      debounce: null, release: null,
    };
    listStores.set(table, store);
  }
  return store;
};
const publishList = (store: ListStore, rows: ListRow[], loaded = store.snapshot.loaded) => {
  store.snapshot = { rows, loaded };
  store.listeners.forEach(notify => notify());
};

// 두 질의의 동시 알림·연속 변경을 합친다 — Supabase realtime에도 같은 디바운스를 적용한다.
function scheduleList(table: string, store: ListStore) {
  if (store.debounce) clearTimeout(store.debounce);
  store.debounce = setTimeout(() => {
    store.debounce = null;
    void loadList(table, store);
  }, 200);
}

function loadList(table: string, store: ListStore): Promise<void> {
  if (store.inflight || store.writes) {
    store.dirty = true;
    return store.inflight ?? Promise.resolve();
  }
  store.dirty = false;
  // 순번은 훅이 아니라 공유 목록에 둔다. 늦게 도착한 조회가 최신 낙관적 갱신을 덮지 못한다.
  const id = ++store.reqId;
  const request = fetchList<{ id: string }>(table)
    .then(rows => { if (id === store.reqId) publishList(store, rows, true); })
    .catch(() => { if (id === store.reqId) publishList(store, store.snapshot.rows, true); })
    .finally(() => {
      if (store.inflight !== request) return;   // 인증 변경 전 요청은 새 요청에 관여하지 않는다
      store.inflight = null;
      if (store.dirty && store.subscription) scheduleList(table, store);
    });
  store.inflight = request;
  return request;
}

function retainList(table: string, store: ListStore, notify: () => void) {
  store.listeners.add(notify);
  if (store.release) { clearTimeout(store.release); store.release = null; }
  if (store.refCount++ === 0) {
    store.subscription ??= subscribeTable(table, () => scheduleList(table, store));
    // 재진입은 캐시를 즉시 보여 주고 백그라운드 갱신. 진행 중 조회는 그대로 공유한다.
    if (!store.inflight) void loadList(table, store);
  }
  return () => {
    store.listeners.delete(notify);
    if (--store.refCount) return;
    // 페이지 왕복마다 연결을 다시 만들지 않도록 45초간 구독과 캐시를 유지한다.
    store.release = setTimeout(() => {
      store.release = null;
      store.subscription?.();
      store.subscription = null;
      if (store.debounce) clearTimeout(store.debounce);
      store.debounce = null;
      store.dirty = false;
    }, 45000);
  };
}

/** 권한이 바뀌면 비공개 행을 남기지 않고, readSets도 새 사용자 기준으로 다시 만든다. */
export function invalidateListCache() {
  listStores.forEach((store, table) => {
    ++store.reqId;
    ++store.generation;
    store.subscription?.();
    store.subscription = null;
    if (store.debounce) clearTimeout(store.debounce);
    if (store.release) clearTimeout(store.release);
    store.debounce = store.release = null;
    store.inflight = null;
    store.writes = 0;
    store.dirty = false;
    publishList(store, [], false);
    if (store.refCount) {
      store.subscription = subscribeTable(table, () => scheduleList(table, store));
      void loadList(table, store);
    }
  });
}

/** 목록 저장소 훅 — 서버 모드면 DB, 아니면 localStorage (v2.0)
 *
 *  화면 코드는 예전 그대로 `[목록, 통째로 저장, 로드완료]`를 쓴다.
 *  서버 모드에서는 저장할 때 이전/새 배열을 비교해 바뀐 행만 insert/update/delete 하고,
 *  다른 사람의 변경은 실시간 구독으로 받아 온다. (로컬 모드는 storage 이벤트로 탭 간 동기화)
 */
export function useLocalList<T extends { id?: string }>(key: string, seed: T[]): [T[], (next: T[]) => void, boolean] {
  const server = isServerMode() && !!TABLE_OF[key];
  const table = TABLE_OF[key];
  const store = server ? getListStore(table) : null;
  const generation = store?.generation;
  const subscribe = useCallback((notify: () => void) =>
    store ? retainList(table, store, notify) : () => {}, [store, table]);
  const getSnapshot = useCallback(() => store?.snapshot ?? EMPTY_LIST, [store]);
  const shared = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_LIST);
  // 서버 모드에선 시드를 화면에 내보내지 않는다 (v2.0 사용자 발견) — 서버 목록을 받아오기 전까지
  // 예시 데이터가 잠깐 보였다 사라지는 깜빡임의 원인이었다. 시드는 로컬 모드의 시작값일 뿐이고,
  // 서버 모드에서 시드를 기준으로 삼으면 저장할 때 없는 행을 지우려 드는 문제도 있었다.
  const [list, setList] = useState<T[]>(() => (server ? [] : seed));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (server) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setList(JSON.parse(raw));
    } catch { /* 시드 유지 */ }
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try { setList(JSON.parse(e.newValue)); } catch { /* 무시 */ }
    };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('storage', onStorage); };
  }, [key, server, table]);

  const update = useCallback((next: T[]) => {
    if (store) {
      // 업로드 등을 기다리던 이전 계정의 콜백이 새 계정의 목록을 덮거나 삭제하지 못하게 한다.
      if (generation !== store.generation) return;
      const prev = store.snapshot.rows;
      ++store.reqId;
      ++store.writes;
      publishList(store, next);   // 같은 컬렉션을 보는 모든 화면에 낙관적 반영
      syncList(table, prev as unknown as { id: string }[], next as unknown as { id: string }[], currentUserId())
        .catch(err => {
          // 실패하면 서버 상태로 되돌려 화면과 DB가 어긋난 채로 남지 않게 —
          // 되돌리기만 하면 "방금 쓴 게 스스로 사라지는" 것처럼 보이므로 이유도 함께 알린다 (v2.0)
          console.error('[ohome] 저장 실패', err);
          try {
            window.dispatchEvent(new CustomEvent(LIST_ERR_EVT, {
              detail: { table, message: err instanceof Error ? err.message : String(err) },
            }));
          } catch { /* 무시 */ }
        })
        .finally(() => {
          if (generation !== store.generation) return;
          // 저장 중 조회하면 이전 서버 값이 낙관적 결과를 지울 수 있다. 모두 끝난 뒤 복구·확인한다.
          if (--store.writes === 0) scheduleList(table, store);
        });
      return;
    }
    setList(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 무시 */ }
  }, [key, store, table, generation]);

  return [store ? shared.rows as T[] : list, update, store ? shared.loaded : loaded];
}

/* ---------- 시드 (데모) ---------- */
export const BOARD_SEED: Post[] = [];

export const GUEST_SEED: GuestEntry[] = [];

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
