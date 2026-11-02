'use client';
// 메인 위젯 시스템 + 편집모드 상태 (기획서 4.0)
// 저장소: localStorage → 추후 Supabase site_settings 로 이전
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ui/Modal';
import { useAuth } from './auth';
import { getRawSetting, setSetting, onSettingReload } from './settingStore';
import { isRailPage, sideOf, centerMiddleWidgets, mirrorSides } from './widgetZone';

export type WidgetType =
  | 'banner'                            // 고정 요소 (삭제 불가)
  | 'member'                            // 회원정보창 — 추가·삭제 가능 (v2.1 사용자 요청)
  | 'menu' | 'memo' | 'diary' | 'latest'
  | 'dday' | 'ddaycard' | 'todo' | 'freetext' | 'deco'
  | 'search';   // search = 게시판 통합 검색창 · 'image'는 deco(장식 이미지+링크)로 일원화 (v1.9)

export interface WidgetConf {
  id: string;
  type: WidgetType;
  col: 1 | 2 | 3;                       // PC 배치 열
  enabled: boolean;
  fixed?: boolean;                      // 고정 요소 여부
  // 편집모드 배치값 (그리드 원점 = 첫 위치, v1.8)
  tx: number; ty: number;
  w?: number; h?: number; z?: number;
  freeMove?: boolean;   // 그리드 무시 요소 (v1.9 — 우클릭 토글, 텍스트·이미지 자유 배치용)
  mOff?: boolean;       // 모바일에서 제외 (v1.9 사용자 확정 — 토글은 모바일 표시만 제어, PC 제거는 우클릭 삭제)
  rot?: number;         // 기울기(도) — 이미지·자유 텍스트, 편집모드 왼쪽 위 핸들 드래그 (v1.9 사용자 요청)
  // PC 절대배치 좌표 (v1.9 사용자 확정 — PC 캔버스에는 문서 흐름이 없음: 겹칠 수 있고 서로 밀지 않음.
  // 흐름 스택은 모바일 뷰 전용). 기존 흐름+오프셋 배치는 최초 1회 이 좌표로 스냅샷 마이그레이션.
  ax?: number; ay?: number;
  settings: Record<string, unknown>;
}

export type LayoutMode = 'fixed' | 'fluid'; // 고정 캔버스(기본) / 반응형 (v1.9)
/** PC 레이아웃 (v2.7 사용자 요청) — top = 1단형(상단 메뉴) · side = 2단형(왼쪽/오른쪽 열 메뉴 카드).
 *  2단형도 메인·좌우 위젯 레일 페이지에서만 적용되고, 레일 없는 페이지와 모바일은 늘 1단형 */
export type PcLayout = 'top' | 'side';

interface MainState {
  layoutMode: LayoutMode;
  widgets: WidgetConf[];
  mobileOrder: string[];                // 모바일 세로 나열 순서 (위젯 id)
  settingsOrder?: string[];             // 환경설정 「위젯」 탭의 목록 순서 (위젯 id) — 설정 화면 전용, 실제 배치와 무관
  removedIds?: string[];                // 삭제한 기본 위젯 id — 로드 시 기본값 병합에서 되살아나지 않게 (v1.9)
  pcLayout?: PcLayout;                  // 없으면 top (v2.7)
  centerBody?: boolean;                 // 가운데 정렬 — 본문·가운데 위젯을 화면 한가운데에 + 좌우 위젯과의 간격도 같게 (편집모드 버튼, v2.8 — 좌우 위젯을 대칭으로 옮김)
}

export const WIDGET_META: Record<WidgetType, { title: string; desc: string }> = {
  banner: { title: '슬라이드 배너', desc: '고정 요소 — 최상단' },
  member: { title: '회원정보창', desc: '로그인/프로필' },
  menu: { title: '메뉴 카드', desc: 'PC 2단형 레이아웃 전용 — 좌우 열에서만 이동, 삭제 불가 (모바일은 상단바 ≡)' },
  memo: { title: 'MEMO', desc: '관리자 메모 (클릭 시 관리 모달)' },
  diary: { title: 'DIARY', desc: '최근 일기 (비공개 미노출)' },
  latest: { title: 'LATEST', desc: '모든 게시판 최신글 목록 (게시판 · 제목 · 날짜)' },
  dday: { title: '심플 디데이', desc: '디데이 목록 (글자만)' },
  ddaycard: { title: '디데이', desc: '사진 카드형 — 사진 · 이름 · 디데이 · 시작일' },
  todo: { title: 'TO-DO', desc: '관리자 투두 (방문자는 열람만)' },
  freetext: { title: '자유 텍스트', desc: '패널 없이 문구만' },
  deco: { title: '이미지', desc: '패널 없이 이미지만' },
  search: { title: 'SEARCH', desc: '전체 글 검색창 — 결과는 게시판 목록(갤러리형 1) 모양으로' },
};

/** 같은 종류를 여러 개 추가할 수 있는 위젯 (v1.9 사용자 확정 — 나머지는 하나만) */
export const MULTI_TYPES: WidgetType[] = ['freetext', 'deco', 'banner'];   // banner: v2.0 사용자 요청 — 슬라이드 배너 여러 개

/** 위젯 표시 이름 — 중복 추가 가능한 위젯이 2개 이상이면 번호를 붙여 구분 (v1.9) */
export function widgetLabel(widgets: WidgetConf[], w: WidgetConf): string {
  const t = WIDGET_META[w.type].title;
  if (!MULTI_TYPES.includes(w.type)) return t;
  const same = widgets.filter(x => x.type === w.type);
  return same.length > 1 ? `${t} ${same.findIndex(x => x.id === w.id) + 1}` : t;
}

// 기본 배치는 절대 좌표로 못 박음 (v1.9 사용자 피드백) — 예전에는 흐름 렌더를 측정해 스냅샷했는데
// 측정값이 위젯 최소 높이에 걸리면서 D-DAY·TO-DO가 간격 0으로 붙어버렸다. 세로 간격은 전부 10px.
const DEFAULT_STATE: MainState = {
  layoutMode: 'fixed',
  widgets: [
    // 배포 기본 — 더미 콘텐츠 없이 빈 위젯으로 시작 (v1.9)
    // 메뉴리스트는 모바일 전용(PC 숨김)이라 좌표는 의미 없음
    { id: 'menu', type: 'menu', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, h: 80, settings: {} },
    { id: 'memo', type: 'memo', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, h: 80, settings: { text: '' } },
    { id: 'banner', type: 'banner', col: 2, enabled: true, fixed: true, tx: 0, ty: 0, ax: 240, ay: 0, w: 610, h: 210, settings: {} },
    { id: 'diary', type: 'diary', col: 2, enabled: true, tx: 0, ty: 0, ax: 240, ay: 220, w: 300, h: 150, settings: {} },
    { id: 'latest', type: 'latest', col: 2, enabled: true, tx: 0, ty: 0, ax: 550, ay: 220, w: 300, h: 150, settings: {} },
    // 회원정보창은 로그인 상태 내용(프로필+버튼)에 딱 맞는 높이 — 더 키우면 아래가 비어 보임 (v1.9 사용자 확정)
    { id: 'member', type: 'member', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 0, w: 260, h: 150, settings: {} },
    { id: 'dday', type: 'dday', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 160, w: 260, h: 90, settings: { items: [] } },
    { id: 'todo', type: 'todo', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 260, w: 260, h: 90, settings: { items: [] } },
  ],
  mobileOrder: ['menu', 'memo', 'diary', 'latest', 'dday', 'todo'],
};

const STORAGE_KEY = 'ohome.main.v1';

/** 메뉴 카드 예상 높이 — 처음 자리를 잡을 때 아래 위젯을 얼마나 내릴지 (로고·프로필 + 대메뉴 한 줄당 36px) */
export const menuCardHeight = (topCount: number) => 150 + 36 * Math.max(1, topCount);

/**
 * 2단형으로 바꿀 때 메뉴 카드 자리 잡기 (v2.7) — 카드가 없거나 지운 적이 있으면 되살리고,
 * 처음이면 왼쪽 열 맨 위(0,0)에 두고 그 열의 다른 위젯을 카드 높이만큼 아래로 내린다.
 * 한 번 자리를 잡은 뒤에는(settings.placed) 사용자가 옮긴 위치를 그대로 둔다.
 */
function placeMenuCard(s: MainState, estH: number): MainState {
  let widgets = s.widgets;
  let menu = widgets.find(w => w.type === 'menu');
  if (!menu) {
    menu = { id: 'menu', type: 'menu', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, settings: {} };
    widgets = [...widgets, menu];
  }
  const removedIds = (s.removedIds ?? []).filter(id => id !== menu!.id);
  if (menu.settings?.placed && menu.ax != null && menu.ay != null) return { ...s, widgets, removedIds };
  const others = widgets.filter(w => w.id !== menu!.id && w.enabled && w.ax != null && w.ay != null && sideOf(w) === 1);
  const top = others.length ? Math.min(...others.map(w => w.ay!)) : Infinity;
  const need = estH + 10;
  const delta = top < need ? need - top : 0;
  widgets = widgets.map(w => {
    if (w.id === menu!.id) return { ...w, enabled: true, col: 1, ax: 0, ay: 0, w: 230, tx: 0, ty: 0, settings: { ...w.settings, placed: true } };
    if (delta && others.includes(w)) return { ...w, ay: w.ay! + delta };
    return w;
  });
  return { ...s, widgets, removedIds };
}
/** 없어진 위젯 종류 — 예전 저장분에 남아 있어도 불러올 때 버린다 */
const REMOVED_TYPES = ['image', 'upcoming', 'apply', 'memoboard'];
/** 편집모드를 지원하는 페이지 (v1.9 — 카드 그리드 드래그 정렬 포함)
 *  /trpg 로그 백업이 빠져 있던 것은 실수 — 드래그 정렬·목록 숨김 확인 모두 이 토글이 있어야 켜진다
 *  (v2.0 사용자 발견 — 목록 숨김 기능을 만들다 보니 편집모드 자체가 이 페이지에서 켜지지 않는 걸 발견) */
const EDIT_PAGES = ['/', '/rels', '/gallery', '/trpg'];
/** 좌우 위젯 레일이 있는 페이지는 모두 편집모드 가능 (v2.4 — 위젯을 어느 페이지에서든 옮기게) */
const canEditAt = (pathname: string) => EDIT_PAGES.includes(pathname) || isRailPage(pathname);
const EDIT_PAGE_NAMES = '자관 상세·작성, 로드비, 다이어리, 글쓰기·수정 화면, 환경설정을 제외한 모든 페이지';

interface MainCtx {
  state: MainState;
  editOn: boolean;
  editAvailable: boolean;               // 현재 페이지에서 편집모드를 켤 수 있는지 (메뉴 노출 조건)
  gridOn: boolean;
  setGridOn: (v: boolean) => void;
  toggleEdit: () => void;               // 프로필 드롭다운의 편집모드 항목
  requestExit: (pendingHref?: string) => void; // 편집중 표시 클릭·페이지 이동 시
  guardNav: (href: string) => boolean;  // true = 이동 차단(모달 표시)
  updateWidget: (id: string, patch: Partial<WidgetConf>, opts?: { persist?: boolean }) => void;
  addWidget: (type: WidgetType, col: 1 | 2 | 3) => string;   // 새 위젯 id 반환 (v1.9)
  removeWidget: (id: string) => void;
  setLayoutMode: (m: LayoutMode) => void;
  /** PC 1단형/2단형 (v2.7) — estH: 메뉴 카드를 처음 놓을 때 쓰는 예상 높이 */
  setPcLayout: (m: PcLayout, estH: number) => void;
  /** 지금 페이지가 2단형으로 그려지는지 (PC 기준 — 모바일은 CSS가 1단형으로 되돌림) */
  sideNav: boolean;
  /** 가운데 정렬 (편집모드 버튼) — 켜면 가운데 열 위젯을 캔버스 한가운데로 옮기고 본문도 화면 가운데에 둔다.
   *  편집 중 변경이라 저장은 편집 종료 시 「저장 후 종료」로 확정된다 */
  setCenterAlign: (on: boolean) => void;
  setMobileOff: (id: string, v: boolean) => void;  // 모바일에서 제외 토글 (v1.9 — PC 제거는 우클릭 삭제)
  setMobileOrder: (ids: string[]) => void;
  setSettingsOrder: (ids: string[]) => void;   // 환경설정 위젯 탭 목록 순서만 바꿈 — 메인 배치·모바일 순서와 무관
  saveNow: () => void;                  // 환경설정 등 편집모드 밖에서의 변경 즉시 저장
  resetMain: () => void;                // 메인 페이지를 기본 구성으로 되돌리기 (v1.9 — 즉시 저장)
}

const Ctx = createContext<MainCtx | null>(null);

/** 「가운데 정렬」이 켜져 있으면 (v2.8 사용자 확정 — 화면 한가운데 + 좌우 간격 같게, 두 조건 모두)
 *  ① 좌우 위젯을 가운데선 기준 거울 대칭으로 옮기고 ② 가운데 위젯을 그 사이 한가운데(= 화면 한가운데)로.
 *  anchor: 편집 중인 쪽 — 그쪽은 그대로 두고 반대쪽이 따라온다. 예전 저장분도 불러올 때 맞춰진다 */
function recenter(s: MainState, anchor?: 1 | 3): MainState {
  if (!s.centerBody) return s;
  const withMenu = s.pcLayout === 'side';
  const widgets = centerMiddleWidgets(mirrorSides(s.widgets, withMenu, anchor), withMenu);
  return widgets === s.widgets ? s : { ...s, widgets };
}

export function MainStoreProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<MainState>(DEFAULT_STATE);
  const [editOn, setEditOn] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingNav = useRef<string | null>(null);
  const snapshot = useRef<MainState | null>(null);
  const editRef = useRef(false);
  editRef.current = editOn;

  // 로드 — 환경설정에서 SAVE 없이 변경을 취소하면 저장본을 다시 읽는다 (v2.5)
  useEffect(() => {
    const load = () => { if (editRef.current) return; try {   // 편집 중인 배치는 덮지 않는다
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MainState;
        // 새 위젯 타입이 추가돼도 기본값과 병합 · 제거된 위젯 종류는 걸러냄
        // ('image'는 deco로 일원화 v1.9 · 'upcoming'·'apply'는 스케줄러·커미션, 'memoboard'는 메모장 기능 삭제로 함께 제거)
        // 구 enabled:false(전체 숨김)는 삭제로 이관 — 토글은 이제 모바일 표시만 제어 (v1.9 사용자 확정)
        const removed = new Set(parsed.removedIds ?? []);
        const kept: WidgetConf[] = [];
        for (let w of parsed.widgets) {
          if (REMOVED_TYPES.includes(w.type as string)) continue;
          // 회원정보창은 고정 요소에서 빠짐 (v2.1) — 예전 저장분의 fixed 표시를 걷어내야 삭제할 수 있다
          if (w.type === 'member' && w.fixed) w = { ...w, fixed: undefined };
          if (!w.enabled && !w.fixed) { removed.add(w.id); continue; }
          kept.push(w.enabled ? w : { ...w, enabled: true });
        }
        const ids = new Set(kept.map(w => w.id));
        // 삭제한 기본 위젯은 병합으로 되살리지 않음
        const merged = [...kept, ...DEFAULT_STATE.widgets.filter(w => !ids.has(w.id) && !removed.has(w.id))];
        setState(recenter({ ...DEFAULT_STATE, ...parsed, widgets: merged, removedIds: [...removed] }));
      } else setState(DEFAULT_STATE);
    } catch { /* 기본값 사용 */ } };
    load();
    return onSettingReload(STORAGE_KEY, load);
  }, []);

  const persist = useCallback((s: MainState) => {
    try { setSetting(STORAGE_KEY, s); } catch { /* 무시 */ }
  }, []);

  // 고정 캔버스 body 클래스 (v1.9 — 메인은 항상 고정, 반응형 옵션 제거: PC/모바일 두 가지만)
  useEffect(() => {
    document.body.classList.toggle('main-fixed', pathname === '/');
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('edit-on', editOn);
  }, [editOn]);

  const startEdit = useCallback(() => {
    if (window.matchMedia('(max-width:620px)').matches) {
      setNotice('모바일에서는 편집모드를 사용할 수 없습니다. PC에서 해주세요.');
      return;
    }
    if (!canEditAt(pathname)) {
      setNotice(`이 페이지에서는 편집모드를 켤 수 없습니다.\n가능한 페이지: ${EDIT_PAGE_NAMES}`);
      return;
    }
    snapshot.current = JSON.parse(JSON.stringify(state));
    setEditOn(true);
  }, [pathname, state]);

  const endEdit = useCallback((save: boolean) => {
    if (save) persist(state);
    // 되돌릴 때도 저장 — 편집 중 위젯 설정 모달이 즉시 저장한 값까지 스냅샷으로 원복 (v1.9)
    else if (snapshot.current) { setState(snapshot.current); persist(snapshot.current); }
    snapshot.current = null;
    setEditOn(false);
    setGridOn(false); // 편집 종료 시 그리드 자동 해제 (v1.8)
    setExitOpen(false);
    if (pendingNav.current) {
      const t = pendingNav.current;
      pendingNav.current = null;
      router.push(t);
    }
  }, [state, persist, router]);

  const toggleEdit = useCallback(() => {
    if (!isAdmin) return;
    if (editOn) setExitOpen(true);
    else startEdit();
  }, [isAdmin, editOn, startEdit]);

  const requestExit = useCallback((pendingHref?: string) => {
    pendingNav.current = pendingHref ?? null;
    setExitOpen(true);
  }, []);

  const guardNav = useCallback((href: string) => {
    if (!editOn) return false;
    requestExit(href);
    return true;
  }, [editOn, requestExit]);

  // opts.persist: 상태 갱신과 동시에 저장 (모달 SAVE 등 — saveNow는 클로저가 이전 상태를 보므로 사용 금지)
  const updateWidget = useCallback((id: string, patch: Partial<WidgetConf>, opts?: { persist?: boolean }) => {
    setState(s => {
      let n = { ...s, widgets: s.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) };
      // 좌우 위젯을 옮기거나 크기를 바꾸면 가운데 정렬도 다시 맞춘다 — 옮기는 쪽이 기준, 반대쪽이 거울처럼 따라온다.
      // 가운데 위젯을 직접 옮길 때는 건드리지 않는다
      const moved = n.widgets.find(w => w.id === id);
      const side = moved ? sideOf(moved) : 2;
      if (side !== 2 && ('ax' in patch || 'w' in patch)) n = recenter(n, side);
      if (opts?.persist) persist(n);
      return n;
    });
  }, [persist]);

  const addWidget = useCallback((type: WidgetType, col: 1 | 2 | 3): string => {
    const id = `${type}-${Date.now().toString(36)}`;
    setState(s => {
      // 중복 추가 방지 (v1.9) — 이미지·자유 텍스트 외에는 종류당 하나만 (UI에서도 막지만 안전장치)
      if (!MULTI_TYPES.includes(type) && s.widgets.some(w => w.type === type)) return s;
      // 절대배치 기본 좌표 (v1.9) — 선택한 열 상단 근처, 기존 위젯들 아래
      const colX = { 1: 0, 2: 240, 3: 880 } as const;
      const maxY = Math.max(60, ...s.widgets.filter(w => w.enabled && w.col === col && w.ay != null)
        .map(w => (w.ay ?? 0) + (w.h ?? 200) + 10));
      const w: WidgetConf = {
        id, type, col, enabled: true, tx: 0, ty: 0,
        ax: colX[col], ay: maxY,
        settings: type === 'freetext' ? { text: '자유 텍스트' } : {},
      };
      // 회원정보창은 모바일에서 항상 맨 위(순서 목록 밖)라 모바일 순서에 넣지 않는다 (v2.1)
      return { ...s, widgets: [...s.widgets, w], mobileOrder: type === 'member' ? s.mobileOrder : [...s.mobileOrder, id] };
    });
    return id;   // 추가 위젯으로 스크롤 안내용 (v1.9)
  }, []);

  const removeWidget = useCallback((id: string) => {
    setState(s => ({
      ...s,
      widgets: s.widgets.filter(w => w.id !== id || w.fixed),
      mobileOrder: s.mobileOrder.filter(x => x !== id),
      removedIds: [...(s.removedIds ?? []), id],   // 기본 위젯이면 다음 로드의 병합에서도 제외 (v1.9)
    }));
  }, []);

  const setLayoutMode = useCallback((m: LayoutMode) => {
    setState(s => { const n = { ...s, layoutMode: m }; persist(n); return n; });
  }, [persist]);

  const setPcLayout = useCallback((m: PcLayout, estH: number) => {
    setState(s => {
      const n = recenter(m === 'side' ? placeMenuCard({ ...s, pcLayout: 'side' }, estH) : { ...s, pcLayout: 'top' as const });
      persist(n); return n;
    });
  }, [persist]);

  // 2단형 적용 페이지 (v2.7 사용자 확정) — 메인 + 좌우 위젯 레일 페이지(자관 목록·다이어리·로드비 포함, v2.8).
  // 환경설정·글쓰기는 2단형으로 설정해도 1단형 그대로, 자관 상세는 상단바 없이 전체 화면.
  // 메뉴 카드가 없으면(예전 저장분) 상단바를 유지한다
  const sideNav = state.pcLayout === 'side' && (pathname === '/' || isRailPage(pathname))
    && state.widgets.some(w => w.type === 'menu' && w.enabled && w.ax != null && w.ay != null);
  useEffect(() => {
    document.body.classList.toggle('side-nav', sideNav);
  }, [sideNav]);

  const setCenterAlign = useCallback((on: boolean) => {
    setState(s => recenter({ ...s, centerBody: on }));
  }, []);

  // 토글은 모바일 표시만 제어 (v1.9 사용자 확정) — PC 메인에서 빼려면 편집모드 우클릭 삭제
  const setMobileOff = useCallback((id: string, v: boolean) => {
    setState(s => {
      const n = { ...s, widgets: s.widgets.map(w => (w.id === id ? { ...w, mOff: v } : w)) };
      persist(n); return n;
    });
  }, [persist]);

  const setMobileOrder = useCallback((ids: string[]) => {
    setState(s => { const n = { ...s, mobileOrder: ids }; persist(n); return n; });
  }, [persist]);

  const setSettingsOrder = useCallback((ids: string[]) => {
    setState(s => { const n = { ...s, settingsOrder: ids }; persist(n); return n; });
  }, [persist]);

  const saveNow = useCallback(() => persist(state), [persist, state]);

  // 메인 페이지 기본 구성으로 되돌리기 (v1.9 사용자 요청) — 위젯 구성·배치·크기·모바일 순서 전부 초기화
  // PC 레이아웃(1단형/2단형)은 위젯 구성이 아니라 유지한다 — 2단형이면 메뉴 카드 자리를 다시 잡는다 (v2.7)
  const resetMain = useCallback(() => {
    setState(s => {
      const base: MainState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      const fresh = s.pcLayout === 'side' ? placeMenuCard({ ...base, pcLayout: 'side' }, menuCardHeight(4)) : base;
      persist(fresh);
      return fresh;
    });
  }, [persist]);

  return (
    <Ctx.Provider value={{
      state, editOn, editAvailable: canEditAt(pathname), gridOn, setGridOn, toggleEdit, requestExit, guardNav,
      updateWidget, addWidget, removeWidget, setLayoutMode, setPcLayout, sideNav, setCenterAlign, setMobileOff, setMobileOrder, setSettingsOrder, saveNow, resetMain,
    }}>
      {children}

      {/* 편집 종료 확인 (v1.8 — 3버튼) */}
      <ConfirmModal
        open={exitOpen}
        title="편집을 종료하시겠습니까?"
        body="저장하지 않고 종료하면 이번 편집에서 바꾼 배치·크기·순서가 편집 시작 시점으로 복원됩니다."
        onClose={() => { pendingNav.current = null; setExitOpen(false); }}
        buttons={[
          { label: '저장 후 종료', kind: 'dark', onClick: () => endEdit(true) },
          { label: '저장하지 않고 종료', kind: 'ghost', onClick: () => endEdit(false) },
          { label: 'CANCEL', kind: 'ghost', onClick: () => { pendingNav.current = null; setExitOpen(false); } },
        ]}
      />

      {/* 편집모드 진입 불가 안내 (v1.9) */}
      <ConfirmModal
        open={notice !== null}
        title="편집모드"
        body={<span style={{ whiteSpace: 'pre-line' }}>{notice}</span>}
        onClose={() => setNotice(null)}
        buttons={[{ label: '확인', kind: 'dark', onClick: () => setNotice(null) }]}
      />
    </Ctx.Provider>
  );
}

export function useMainStore(): MainCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMainStore must be used within MainStoreProvider');
  return ctx;
}

/* ---------- 이미지 위젯 슬라이드 (v2.0) ---------- */

export interface DecoSlide {
  id: string;
  imgId: string;
  crop?: import('@/components/ui/CropEditor').CropValue;
  link?: string;
}

/**
 * 이미지 위젯의 장면 목록.
 * 예전에는 이미지 한 장(imgId/crop/link)만 담았다 — 그 저장분도 한 장짜리 목록으로 읽어
 * 화면·편집기가 슬라이드 하나로만 다루면 되게 한다.
 */
export function decoSlides(settings: Record<string, unknown>): DecoSlide[] {
  const list = settings.slides as DecoSlide[] | undefined;
  if (Array.isArray(list) && list.length) return list.filter(s => s?.imgId);
  const imgId = settings.imgId as string | undefined;
  if (!imgId) return [];
  return [{
    id: 'legacy',
    imgId,
    crop: settings.crop as DecoSlide['crop'],
    link: settings.link as string | undefined,
  }];
}
