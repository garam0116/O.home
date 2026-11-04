import { numbersOf, findByNo } from './itemNo';
// 자관 데이터 저장소 — 기획서 4.5(자관)
// (캐릭터 기능은 삭제됐다 — 멤버의 이름·사진은 자관 멤버에 직접 담는다)
export type Visibility = 'public' | 'member' | 'private'; // 공개범위 3단계

export interface RelMember {
  /** 멤버 키 — 전신·AU 값(fulls·mset)·좌우 지정(pairRight)·앞뒤(fullFront)가 이 값으로 멤버를 가리킨다.
   *  캐릭터 기능이 있던 때 캐릭터 id를 담던 자리라 이름이 charId로 남아 있다(예전 저장분 호환) */
  charId: string;
  /** 인물 이름 — 자관 멤버에 직접 입력 (캐릭터 기능 삭제 후) */
  name?: string;
  /** 인물 사진 — 멤버 카드 얼굴칸(1:1). 위치는 faceCrop */
  photoId?: string;
  quote: string;                 // 캐릭터별 한마디
  keywords: string[];            // 키워드 뱃지
  desc: string;                  // 소개글
  fullImgId?: string;            // 전신 이미지 (v1.9 — 자관 수정에서 등록, 중앙 전신 모드)
  fullScale?: number;            // 전신 크기 % (비율 유지, 미리보기 휠로 조절 — 기본 90)
  fullOffX?: number;             // 전신 가로 위치 오프셋 % (미리보기 드래그 — 기본 0, v1.9)
  fullOffY?: number;             // 전신 세로 위치 오프셋 % (기본 0 = 하단 밀착)
  /** 멤버 카드 얼굴칸(1:1) 크롭 (v2.0) — 사진(photoId)에서 보일 위치 */
  faceCrop?: import('@/components/ui/CropEditor').CropValue;
  /** 멤버 카드 이름 굵게 (v2.0 사용자 요청) — 기본 켜짐 */
  nameBold?: boolean;
  /** 멤버 카드 이름 크기 px (v2.0) — 기본 17. 카드 폭이 좁아 이름마다 알맞은 크기가 다르다 */
  nameSize?: number;
  /** 자관 안에서 쓸 이 멤버의 이름 폰트 */
  nameFontId?: string;
  quoteColor?: string;           // 히어로 대사 글씨색 (페어, v1.9 — 기본 #d7dae0)
  quoteMarkColor?: string;       // 히어로 대사 따옴표색 (기본 포인트 소프트)
}



/** AU 한 항목 (v1.9 확장) — 캐치프레이즈만이 아니라 프로필 전체가 AU별로 분리:
 *  중앙 일러(arts). base(원본)는 Relation 최상위 필드를 그대로 사용 (기존 데이터 호환) */
/**
 * AU에서만 다르게 보여 줄 멤버 값 (v2.0 사용자 발견).
 *
 * 전신 위치·크기, 한마디, 대사 색, 이름 크기는 **자관 멤버(RelMember)에만** 있었다. AU 수정
 * 화면에서 고쳐도 결국 자관 공통 값을 고치는 것이라 **다른 AU 페이지까지 같이 바뀌었다.**
 * AU 쪽에 따로 담아 두고, 여기 없는 값만 자관 기본을 그대로 쓴다(→ `auMember`).
 */
export interface RelAuMember {
  quote?: string;
  fullScale?: number;
  fullOffX?: number;
  fullOffY?: number;
  nameSize?: number;
  nameBold?: boolean;
  /** 자관 안에서 쓸 이 멤버의 이름 폰트 */
  nameFontId?: string;
  quoteColor?: string;
  quoteMarkColor?: string;
  /** 멤버 카드 얼굴칸 위치 — AU마다 따로 (v2.0 사용자 제보 — 원본에서 바꾸면 AU도 같이 바뀌었다).
   *  안 정한 AU는 자관 기본(faceCrop)을 그대로 따른다 */
  faceCrop?: import('@/components/ui/CropEditor').CropValue;
}

/** 이 AU에서 이 멤버를 어떻게 보여 줄지 — AU에 정해 둔 값이 있으면 그것, 없으면 자관 기본.
 *  base(원본) AU이거나 정해 둔 게 없으면 자관 멤버를 그대로 돌려준다. */
export function auMember(m: RelMember, au?: RelAu): RelMember {
  const o = au?.mset?.[m.charId];
  if (!o) return m;
  const out = { ...m };
  // undefined는 「안 정했다」는 뜻 — 그대로 덮으면 자관 기본까지 지워진다
  (Object.keys(o) as (keyof RelAuMember)[]).forEach(k => {
    const v = o[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  });
  return out;
}

/**
 * AU에서만 다르게 쓸 색·배경 (v2.0 사용자 요청 — 「AU 페이지에서도 색상 테마 같은 걸 다 따로」).
 *
 * 값이 있으면 그것, 없으면 자관 기본을 그대로 쓴다(→ `auStyle`). 자관 쪽 「직접 지정」 체크를
 * 끄면 그 값들이 사라지듯, AU에서도 체크를 끄면 여기서 지워져 자관 값으로 되돌아간다.
 */
export interface RelAuStyle {
  nameColor?: string;
  cpColor?: string;
  ddayColor?: string;
  cpTagBg?: string;
  cpTagFg?: string;
  /** 2인 자관 위젯 탭 색 (v3.3) — 탭 밑줄·오늘 점·로그 고비 숫자. 미지정: 포인트색 */
  wgtColor?: string;
  nameShadowColor?: string;
  nameShadow?: number;
  headerBgG1?: string; headerBgG2?: string; headerBgAngle?: number;
  pageBgG1?: string; pageBgG2?: string; pageBgAngle?: number;
  illuBg?: string; illuOn?: string;
}

/** 이 AU에서 실제로 쓸 색·배경 — AU에 정해 둔 값이 있으면 그것, 없으면 자관 기본 */
export function auStyle(rel: Relation, au?: RelAu): RelAuStyle {
  const s = au?.style;
  const base: RelAuStyle = {
    nameColor: rel.nameColor, cpColor: rel.cpColor, ddayColor: rel.ddayColor,
    cpTagBg: rel.cpTagBg, cpTagFg: rel.cpTagFg, wgtColor: rel.wgtColor,
    nameShadowColor: rel.nameShadowColor, nameShadow: rel.nameShadow,
    headerBgG1: rel.headerBgG1, headerBgG2: rel.headerBgG2, headerBgAngle: rel.headerBgAngle,
    pageBgG1: rel.pageBgG1, pageBgG2: rel.pageBgG2, pageBgAngle: rel.pageBgAngle,
    illuBg: rel.illuBg, illuOn: rel.illuOn,
  };
  if (!s) return base;
  const out = { ...base };
  // 「자관 색·배경 묶음」 단위로 갈아 끼운다 — 한 묶음이라도 AU에 정해 뒀으면 그 묶음 전체를 AU 것으로.
  // 색 하나만 AU 값이고 나머지는 자관 값이면 어울리지 않는 조합이 나온다
  if (s.nameColor !== undefined || s.cpColor !== undefined) {
    out.nameColor = s.nameColor; out.cpColor = s.cpColor;
  }
  if (s.ddayColor !== undefined) {
    out.ddayColor = s.ddayColor;
  }
  if (s.cpTagBg !== undefined || s.cpTagFg !== undefined) {
    out.cpTagBg = s.cpTagBg; out.cpTagFg = s.cpTagFg;
  }
  if (s.wgtColor !== undefined) {
    out.wgtColor = s.wgtColor;
  }
  if (s.nameShadowColor !== undefined || s.nameShadow !== undefined) {
    out.nameShadowColor = s.nameShadowColor; out.nameShadow = s.nameShadow;
  }
  if (s.headerBgG1 !== undefined || s.headerBgG2 !== undefined) {
    out.headerBgG1 = s.headerBgG1; out.headerBgG2 = s.headerBgG2; out.headerBgAngle = s.headerBgAngle;
  }
  if (s.pageBgG1 !== undefined || s.pageBgG2 !== undefined) {
    out.pageBgG1 = s.pageBgG1; out.pageBgG2 = s.pageBgG2; out.pageBgAngle = s.pageBgAngle;
  }
  if (s.illuBg !== undefined || s.illuOn !== undefined) {
    out.illuBg = s.illuBg; out.illuOn = s.illuOn;
  }
  return out;
}

/** 전신 이미지에 깔 그림자 (v2.0 사용자 요청) — 「그림자 직접 지정」의 색·강도를 그대로 따른다.
 *  미지정이면 예전과 같은 검정 35%. 강도를 0으로 두면 그림자를 아예 빼서 또렷하게 둘 수 있다.
 *  geom은 자리마다 다르다 — 상세는 크게(0 8px 18px), 수정 미리보기는 작게(0 6px 14px). */
export function fullShadow(color?: string, strength?: number, geom = '0 8px 18px'): string | undefined {
  const pct = strength ?? 100;
  if (pct <= 0) return undefined;
  const a = 0.35 * (pct / 100);
  const hex = (color ?? '#000000').replace('#', '');
  const f = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
  return `drop-shadow(${geom} rgba(${r},${g},${b},${a}))`;
}

export interface RelSideSlot {
  imgId?: string;
  crop?: import('@/components/ui/CropEditor').CropValue;
  quote?: string;
  quoteColor?: string;
  quoteMarkColor?: string;
  name?: string;
}

export interface RelAu {
  id: string;
  /** 자관 안에서의 AU 번호 (v2.4) — 주소 /rels/{자관}/au/{번호}/edit. 만든 순서대로 */
  no?: number;
  label: string;
  catchphrase: string;
  /** AU별 자관명 (v2.0 사용자 요청) — 비우면 자관 이름을 그대로 쓴다 */
  name?: string;
  /** AU별 이름/본문 폰트 (v2.0 사용자 제보 — 여태 AU 편집의 폰트가 원본에 저장돼 전체가 같이 바뀌었다).
   *  미지정이면 자관 기본 폰트 */
  fontId?: string;
  bodyFontId?: string;
  /** AU별 전신 앞뒤 (v2.0) — AU 편집의 앞으로/뒤로가 원본 배치를 바꾸지 않게. 미지정: 자관 기본 */
  fullFront?: string;
  /** AU별 색·배경 — 없으면 자관 기본 (위 RelAuStyle 설명 참조) */
  style?: RelAuStyle;
  /** AU별 멤버 표시값 — 없으면 자관 기본 (위 RelAuMember 설명 참조) */
  mset?: Record<string, RelAuMember>;
  quotes?: string[];
  arts?: string[];        // AU별 중앙/그룹 일러 (base는 Relation.arts)
  fulls?: Record<string, string>;  // AU별 전신 이미지 (멤버 charId → blob id, 없으면 멤버 공통 전신)
  headerImgId?: string | null;     // AU별 헤더 이미지 (v1.9) — base를 물려받지 않음, 이 AU 것만
  headerCrop?: import("@/components/ui/CropEditor").CropValue;
  // AU별 페이지 테마 (v1.9 사용자 확정) — 미지정이면 base(원본) 테마 따라가기
  theme?: { mode: 'site' | 'custom'; color?: string; tone?: 'dark' | 'light' };
  ddayDate?: string;
  sideSlots?: { l?: RelSideSlot; r?: RelSideSlot };
  /** 예전 HTML 프리 스페이스 — 이제 widgets의 'html' 종류로 읽는다 (relWidgetsOf). 고치면 widgets로 옮겨 저장하고 지운다 */
  freeBlocks?: { id: string; title?: string; html: string }[];
  /** 자관 선택 위젯 (v4.6) — 없으면 원본(base) 것을 그대로 */
  widgets?: import('./relWidgets').RelWidget[];
}

export interface Relation {
  id: string;
  /** 번호 (v2.4) — 별명이 없을 때의 주소 /rels/{번호} */
  no?: number;
  /** 페이지 주소 별명 (v2.0 사용자 요청) — /rels/{별명}. 나중에 수정 화면에서 바꿀 수 있다.
   *  참조(AU 프로필 키·로그 연동 등)는 언제나 id로 저장되므로 바꿔도 끊어지지 않는다. */
  slug?: string;
  name: string;
  catchphrase: string;
  kind?: 'pair' | 'multi';         // 페어(2인) / 다인(3인+) — 등록 시 선택
  fontId?: string;               // 자관 이름 폰트 (4.5 필수 요구 — 5.1 라이브러리)
  bodyFontId?: string;           // 본문 폰트 — 카드 소개 텍스트
  arts?: string[];               // 아트 목록 (첫 장 = 대표 = 리스트 썸네일 원본)
  headerImgId?: string;          // 헤더 이미지 (v1.5 — 상단 풀폭 블러 + 페이드아웃)
  headerCrop?: import("@/components/ui/CropEditor").CropValue; // 헤더 이미지 위치 크롭 (원본 무손실)
  themeMode?: 'site' | 'custom'; // 페이지 테마: 홈페이지 그대로 / 별도 테마컬러 (4.18 방식)
  themeColor?: string;           // 별도 테마컬러 (custom일 때)
  themeTone?: 'dark' | 'light';  // 테마컬러의 다크/라이트 느낌
  illuBg?: string;               // 전신/일러 스위치 배경색 (v1.9 — 미지정: 테마 진한 버튼색 기반)
  illuOn?: string;               // 전신/일러 스위치 선택색 (미지정: 포인트색)
  nameColor?: string;            // 자관명(히어로 타이틀) 글씨색 (v1.9 — 미지정: 테마)
  cpColor?: string;              // 캐치프레이즈 글씨색 (미지정: 테마)
  ddayColor?: string;            // 디데이 글씨색 — 미지정: 기존 var(--faint) (v2.0 사용자 요청)
  cpTagBg?: string;              // LOG/LOREBOOK 버튼 배경색 (예전 CP/NCP 뱃지 색 — 미지정: 기본 pill)
  cpTagFg?: string;              // LOG/LOREBOOK 버튼 글씨색
  wgtColor?: string;             // 2인 자관 위젯 탭 색 (v3.3 — 탭 밑줄·오늘 점·로그 고비 숫자, 미지정: 포인트색)
  nameShadowColor?: string;      // 자관명 그림자 색 (v2.0 — 미지정: 검정)
  nameShadow?: number;           // 자관명 그림자 강도 % — 0~200, 미지정 100(기존 세기와 동일)
  // 헤더 이미지가 없을 때 대신 깔 배경 그라데이션 (v2.0 사용자 요청) — 색 2개 + 각도.
  // 미지정이면 예전처럼 아무것도 안 그린다 (배경 강제 없음)
  headerBgG1?: string;
  headerBgG2?: string;
  headerBgAngle?: number;
  // 이 자관 페이지 전체의 배경 그라데이션 (v2.0 사용자 요청) — 색 2개 + 각도.
  // 위 headerBg*는 상단 헤더 자리에만 깔리는 것이고, 이건 페이지 바탕 전체다.
  pageBgG1?: string;
  pageBgG2?: string;
  pageBgAngle?: number;
  thumbId?: string;              // 리스트 썸네일 (IndexedDB, 4:3 크롭)
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  ddayDate?: string;             // 디데이 기준일 (YYYY-MM-DD)
  sideSlots?: { l?: RelSideSlot; r?: RelSideSlot };
  /** 예전 HTML 프리 스페이스 — 이제 widgets의 'html' 종류로 읽는다 (relWidgetsOf). 고치면 widgets로 옮겨 저장하고 지운다 */
  freeBlocks?: { id: string; title?: string; html: string }[];
  /** 자관 선택 위젯 (v4.6) — 상세 아래 자유 공간. 디데이·LOG/LOREBOOK 같은 고정 위젯과 달리 고른 것만 보인다 */
  widgets?: import('./relWidgets').RelWidget[];
  logUrl?: string;
  lorebookUrl?: string;
  members: RelMember[];          // 2인 = 좌/우, 3인+ = 다인 리스트
  visibility: Visibility;
  /** 어느 자관 목록 것인지 — 없으면 기본 목록. 로그가 자관을 찾을 때는 소속을 보지 않는다 */
  secId?: string;
  thumbClass: string;
  illustMode: 'duo' | 'one';     // 2인: 전신 2장 / 일러 1장 (v1.8)
  aus: RelAu[];                  // AU 리스트 (첫 항목 = 원본 base)
  fullFront?: string;            // 전신 모드에서 앞에 보일 멤버 charId (v1.9 — 미리보기에서 클릭 선택)
  pairRight?: string;            // 페어에서 오른쪽 자리에 둘 멤버 charId (v2.0 — 없으면 등록 순서대로)
  /** 상세 중앙 일러가 어디를 보여 줄지 (v2.0 사용자 요청) — 리스트 썸네일(thumbCrop)과 별개.
    *  **이미지 참조를 키로** 두어 여러 장을 각각 잡을 수 있고, AU의 일러도 같은 자리에 담긴다
    *  (참조가 다르므로 섞이지 않는다). 원본은 건드리지 않는다. */
   artCrops?: Record<string, import('@/components/ui/CropEditor').CropValue>;
}

const parseRelDate = (dateStr?: string): Date | undefined => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  const [year, month, day] = dateStr.split('-').map(Number);
  const target = new Date(0);
  target.setUTCFullYear(year, month - 1, day);
  target.setUTCHours(0, 0, 0, 0);
  if (target.getUTCFullYear() !== year || target.getUTCMonth() !== month - 1 || target.getUTCDate() !== day) return undefined;
  return target;
};

/** 디데이 계산 — D-Day 위젯 plusOne처럼 시작일을 1일로 센다.
 *  '오늘'은 보는 사람의 현지 날짜(위젯과 동일)로 잡는다. UTC 날짜를 쓰면 한국 시간 오전 9시 전에는
 *  UTC가 아직 전날이라 디데이가 하루 적게 나왔다 */
export function relDday(dateStr?: string, now = new Date()): string | undefined {
  const target = parseRelDate(dateStr);
  if (!target) return undefined;
  const today = new Date(0);
  today.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  today.setUTCHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - target.getTime()) / 86400000);
  return `D${days < 0 ? `-${Math.abs(days)}` : `+${days + 1}`}`;
}

/** 디데이 날짜를 영문 월 표기로 표시한다 */
export function relDdayDate(dateStr?: string): string | undefined {
  const date = parseRelDate(dateStr);
  if (!date) return undefined;
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${String(day).padStart(2, '0')}, ${year}`;
}

export const REL_SEED: Relation[] = [];

/* ---------- 페이지 주소 별명 (v2.0 사용자 요청) ---------- */
/** 주소로 항목 찾기 — id로도, 별명으로도 열린다 (별명을 바꿔도 옛 주소가 살아 있게) */
export const findByKey = <T extends { id: string; slug?: string }>(list: T[], key: string) =>
  list.find(x => x.id === key || (x.slug ?? '') === key);
/** 주소 값 — 별명 → 번호(v2.4) → id. 번호가 아직 저장되지 않은 예전 항목만 id가 나오고,
 *  그 주소로 들어와도 상세 페이지가 번호 주소로 바꿔 준다 */
const pathKey = (x: { id: string; slug?: string; no?: number }) => x.slug?.trim() || (x.no ? String(x.no) : x.id);
/** 이 자관의 주소 — 별명을 정했으면 그것, 아니면 번호 */
export const relPath = (r: { id: string; slug?: string; no?: number }) => `/rels/${pathKey(r)}`;

/* ---------- AU 주소 (v2.4 사용자 요청 — 주소에 ?·임의 문자열 없이) ----------
   자관 AU 편집     /rels/{자관}/au/{AU 번호}/edit
   AU 번호는 자관 안에서 만든 순서대로 — 기본(base)은 번호 없이 원래 주소다. */
export function auNos(rel: Relation): Map<string, number> {
  return numbersOf(rel.aus.filter(a => a.id !== 'base'));
}
/** AU 주소 값(번호 또는 예전 id) → AU id */
export function auIdOf(rel: Relation, key: string): string | undefined {
  const list = rel.aus.filter(a => a.id !== 'base');
  return findByNo(list, key, auNos(rel))?.id;
}
/** AU 번호 (주소에 쓸 값) */
export const auKeyOf = (rel: Relation, auId: string) => String(auNos(rel).get(auId) ?? auId);
