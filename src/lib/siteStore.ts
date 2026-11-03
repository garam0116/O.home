'use client';
// 사이트 로고 설정 (5.2 — 제목/서브타이틀/서브 정렬) — 상단바 브랜드 + TRPG 티켓 하단 문구 연동
// v1.9: 디자인 탭 SAVE 통합 — 드래프트(useSiteDraft)로 즉시 미리보기하고 SAVE를 눌러야 저장.
// 소비자(useSiteSettings)는 드래프트가 있으면 그 값을 봄 (테마 미리보기와 동일 규칙).
import { useCallback, useEffect, useReducer, useState } from 'react';
import { getRawSetting, setSetting, onSettingReload } from './settingStore';

export interface SiteSettings {
  title: string;             // 로고 텍스트
  subtitle: string;          // 로고 아랫줄 (서브타이틀)
  align: 'left' | 'center' | 'right'; // 서브타이틀 정렬 (프로토타입 정렬 아이콘)
  docTitle?: string;         // 브라우저 탭 제목 (v1.9 사용자 요청 — 비우면 「로고 텍스트 — 개인홈」)
  // 링크 공유 시 크롤링되는 설명 문구 (v2.0 사용자 요청) — 카톡·디스코드 미리보기 설명줄.
  // 비우면 서브타이틀을, 그것도 비었으면 기본 문구를 그대로 쓴다 (generateMetadata)
  crawlDesc?: string;
  // 브라우저 탭 아이콘 (v2.0 사용자 요청) — 비우면 기본 아이콘.
  // 서버 모드면 저장소 주소라 서버 메타데이터에도 그대로 실리고, 로컬 모드면 파일 id라 화면에서만 붙는다
  favicon?: string;
  // 로고 이미지 (v2.2 사용자 요청) — 지정하면 상단바에 로고 텍스트 대신 이미지를 띄운다.
  // 모바일용을 따로 비우면 PC용을 모바일에도 쓴다. 둘 다 비우면 지금처럼 텍스트 로고
  logoImage?: string;
  logoImageM?: string;
  // 게시판 본문 폭 px (v2.3 사용자 요청) — 목록·글 상세가 같은 폭을 쓴다(동기화). 비우면 700
  boardW?: number;
  // 환경설정 왼쪽 메뉴에서 「보관」한 탭 이름 (v2.3 사용자 요청) — 메뉴 맨 아래 보관함에 접어 둔다.
  // 숨기기만 하고 그 탭의 설정값은 그대로 둔다. 디자인 탭 SAVE와 무관하게 누르는 즉시 저장
  setArchived?: string[];
  // 모바일 메뉴 모양 (v2.9 사용자 요청) — 휴대폰에서 ≡를 눌렀을 때 열리는 패널. 비우면 accordion
  mNav?: MobileNavStyle;
  // Cover 모양에서 쓰는 상위 메뉴별 커버 이미지 — 메뉴 트리 그룹 id → 파일 주소.
  // 다른 모양을 골라도 지우지 않고 보관한다(다시 Cover를 고르면 그대로 쓰임)
  mNavCovers?: Record<string, string>;
  // PC 2단형 메뉴 카드 모양 (v3.0 사용자 요청) — 구성은 같고 장식만 다르다. 비우면 basic(지금 모양)
  mCard?: MenuCardStyle;
}

/** PC 2단형 메뉴 카드 모양 5종 (v3.0) — 기본 · Ink · Halo · Prism · Thread */
export type MenuCardStyle = 'basic' | 'ink' | 'halo' | 'prism' | 'thread';
export const MENU_CARD_STYLES: { value: MenuCardStyle; label: string; desc: string }[] = [
  { value: 'basic', label: '기본', desc: '지금 모양' },
  { value: 'ink', label: 'Ink', desc: '포인트 색 머리 띠 · 밑줄이 번지는 색인 · 하위 메뉴 글 수 막대' },
  { value: 'halo', label: 'Halo', desc: '유리 카드 · 마우스 가까운 테두리만 빛남' },
  { value: 'prism', label: 'Prism', desc: '유리 카드 · 왼쪽 빛줄기가 마우스를 따라감' },
  { value: 'thread', label: 'Thread', desc: '상자 없이 점선 실과 ◆ 마디 · 하위 메뉴까지 점선이 이어짐' },
];

/** 모바일 메뉴 모양 4종 (v2.9) — Accordion · Stage · Cover · Ledger */
export type MobileNavStyle = 'accordion' | 'stage' | 'cover' | 'ledger';
export const MOBILE_NAV_STYLES: { value: MobileNavStyle; label: string; desc: string }[] = [
  { value: 'accordion', label: 'Accordion', desc: '지금 메뉴만 펼침' },
  { value: 'stage', label: 'Stage', desc: '가운데 정렬 · 별 장식' },
  { value: 'cover', label: 'Cover', desc: '왼쪽 메뉴 · 오른쪽 커버' },
  { value: 'ledger', label: 'Ledger', desc: '상단바 아래 줄 목록' },
];

/** 게시판 본문 폭 기본값·범위 (v2.3) — 디자인 탭 입력칸과 적용부가 같은 값을 본다 */
export const BOARD_W = { def: 700, min: 480, max: 1180 } as const;
export const boardWOf = (s: SiteSettings) =>
  Math.min(BOARD_W.max, Math.max(BOARD_W.min, s.boardW ?? BOARD_W.def));

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  // 초기 타이틀 = 프로젝트 이름 O.HOME (v1.9 사용자 확정 — 초기화하면 이 값으로 돌아감)
  title: 'O.HOME', subtitle: 'PERSONAL ARCHIVE', align: 'left',
};

const KEY = 'ohome.site.v1';
const EVT = 'ohome-site';

// 모듈 싱글턴 — 어느 컴포넌트에서 접근하든 같은 저장본/드래프트를 봄
let savedCache: SiteSettings = DEFAULT_SITE_SETTINGS;
let cacheLoaded = false;
let draft: SiteSettings | null = null;

function loadSaved() {
  if (cacheLoaded) return;
  try {
    const raw = getRawSetting(KEY);
    if (raw) savedCache = { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(raw) };
  } catch { /* 기본값 */ }
  cacheLoaded = true;
}

const notify = () => setTimeout(() => window.dispatchEvent(new Event(EVT)), 0);

export function useSiteSettings(): [SiteSettings, (patch: Partial<SiteSettings>) => void, boolean] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    loadSaved();
    setLoaded(true);
    force();
    window.addEventListener(EVT, force);
    // 서버에서 새 값이 오면 저장본을 다시 읽는다 (v2.5) — 첫 화면은 이 브라우저의 스냅샷으로 그린다
    const offReload = onSettingReload(KEY, () => {
      cacheLoaded = false; savedCache = DEFAULT_SITE_SETTINGS; loadSaved(); notify();
    });
    return () => { window.removeEventListener(EVT, force); offReload(); };
  }, []);
  // 즉시 저장 patch — 디자인 탭 밖 소비자용 (드래프트가 떠 있으면 드래프트에도 반영해 미리보기 유지)
  const patch = useCallback((p: Partial<SiteSettings>) => {
    savedCache = { ...savedCache, ...p };
    if (draft) draft = { ...draft, ...p };
    try { setSetting(KEY, savedCache); } catch { /* 무시 */ }
    notify();
  }, []);
  return [draft ?? savedCache, patch, loaded];
}

/** 디자인 탭 전용 드래프트 (v1.9) — 변경은 미리보기로만, SAVE로 확정 · 취소로 폐기 */
export function useSiteDraft() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    loadSaved();
    force();
    window.addEventListener(EVT, force);
    return () => window.removeEventListener(EVT, force);
  }, []);
  return {
    site: draft ?? savedCache,
    dirty: draft !== null && JSON.stringify(draft) !== JSON.stringify(savedCache),
    set: (p: Partial<SiteSettings>) => { draft = { ...(draft ?? savedCache), ...p }; notify(); },
    save: () => {
      if (!draft) return;
      savedCache = draft;
      draft = null;
      try { setSetting(KEY, savedCache); } catch { /* 무시 */ }
      notify();
    },
    discard: () => { draft = null; notify(); },
  };
}
