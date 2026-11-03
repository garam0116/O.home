'use client';
// 사이트 설정 저장 계층 (v2.0)
//
// 테마·메뉴·폰트·로고·메인 위젯 배치 같은 값은 "관리자가 정하고 방문자 모두가 보는" 값이다.
// 지금까지는 브라우저(localStorage)에만 있어서, 공개 홈에서는 방문자가 기본 테마를 보게 된다.
// → 서버 모드에서는 DB(site_settings / settings)에 저장하고, 앱 시작 때 한 번에 받아 캐시한다.
//
// 각 스토어는 렌더 도중 동기적으로 값을 읽으므로, ServerBoot가 화면을 그리기 전에
// primeSettings()로 캐시를 채운다. 이후 읽기는 전부 동기(캐시)라 기존 코드 모양이 유지된다.
// 쓰기는 캐시 → localStorage(첫 페인트용 사본) → DB 순으로 나간다.
import { backend, isServerMode } from './backend';
import { isPreviewFrame } from './previewFrame';

const cache = new Map<string, unknown>();
const revisions = new Map<string, number>();
let primed = false;
const EVT = 'ohome-settings';
const SNAPSHOT_KEY = 'ohome.settings.snapshot.v1';
/** 서버 저장 실패 알림 — SettingSync가 받아 화면에 띄운다 */
export const ERR_EVT = 'ohome-setting-error';

/** 브라우저에만 두는 값 — 접힘 상태·세션·연결 설정처럼 사람마다 다른 것 */
const LOCAL_ONLY = new Set<string>([
  'ohome.bgm.fold', 'ohome.mockuser.v1', 'ohome.server.v1', 'ohome.setup.v1',
  'ohome.themeCss.v1',   // 첫 페인트용 파생 캐시 (원본은 ohome.theme.v2)
]);

/** 이 키는 기기 보관 전용인가 — 백업 복원·이전이 서버로 올리지 않게 (v2.0) */
export const isLocalOnlySetting = (key: string) => LOCAL_ONLY.has(key);

/**
 * 서버로 올라가는 사이트 설정 키 — **이 목록에 있는 것만 설정으로 취급한다.**
 * `ohome.*` 전체를 훑으면 글 목록 같은 콘텐츠 키(ohome.board.v1 등)까지 설정으로 오인해
 * 「서버에 올리지 않은 설정」이 헛되이 뜨고, 올리기를 누르면 글 배열이 설정 테이블에 들어간다.
 * 백업(lib/transfer)도 같은 목록을 쓴다.
 */
export const SETTING_KEYS = [
  'ohome.theme.v2', 'ohome.themePresets.v1', 'ohome.fonts.v2', 'ohome.menuset.v1', 'ohome.site.v1',
  'ohome.pagetext.v1', 'ohome.bgm.v1', 'ohome.boardset.v1', 'ohome.boards.v1',
  'ohome.threadset.v1',
  'ohome.main.v1',
  'ohome.membertags.v1', 'ohome.invite.v1', 'ohome.roadnext.v1', 'ohome.repo.v1',
  'ohome.sections.v1', 'ohome.links.v1',
];

/** 앱 시작 시 1회 — 서버에 저장된 설정을 전부 받아 캐시 */
export async function primeSettings(): Promise<void> {
  primed = true;
  const be = backend();
  if (!be) return;
  let hasSnapshot = false;
  try {
    const snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as Record<string, unknown> | null;
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      for (const key of SETTING_KEYS) {
        if (!LOCAL_ONLY.has(key) && snapshot[key] != null) cache.set(key, snapshot[key]);
      }
      hasSnapshot = true;
    }
  } catch { /* 무시 */ }
  const refresh = async () => {
    const startedAt = new Map(revisions);
    const all = await be.fetchAllSettings();
    const changed: string[] = [];
    Object.entries(all).forEach(([k, v]) => {
      if ((revisions.get(k) ?? 0) !== (startedAt.get(k) ?? 0)) return;
      // 기기 보관 전용 키는 서버 값이 남아 있어도 받지 않는다 (v2.0 포크 제보) —
      // 옛 백업 복원으로 서버에 올라간 알림 on/off가 매 접속마다 로컬 토글을 덮어썼다
      if (LOCAL_ONLY.has(k)) return;
      // null = 지워진 값(초기화가 그렇게 저장한다). 캐시에 담으면 화면이 기본값 대신
      // null을 받아 깨지므로 아예 없는 것으로 둔다.
      if (v == null) {
        if (cache.has(k)) changed.push(k);
        cache.delete(k);
        try { localStorage.removeItem(k); } catch { /* 무시 */ }
        return;
      }
      if (!cache.has(k) || JSON.stringify(cache.get(k)) !== JSON.stringify(v)) changed.push(k);
      cache.set(k, v);
      // 첫 페인트를 위해 로컬에도 사본을 둔다 (다음 방문 때 깜빡임 감소)
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ }
    });
    const snapshot: Record<string, unknown> = {};
    SETTING_KEYS.forEach(k => {
      if (!LOCAL_ONLY.has(k) && cache.has(k)) snapshot[k] = cache.get(k);
    });
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch { /* 무시 */ }
    /* 서버에서 새 값이 오면 화면도 다시 읽게 한다 (v2.5 사용자 발견 — 「댓글을 껐는데 글 아래 댓글창이 살아 있어」).
       스냅샷으로 먼저 그린 화면은 예전 값을 들고 있는데, 스토어들이 이 알림을 듣지 않아 **새로고침을 한 번 더 해야**
       바뀐 설정이 보였다. RELOAD_EVT를 들으면 저장본을 다시 읽는다 */
    changed.forEach(k => {
      try { window.dispatchEvent(new CustomEvent(EVT, { detail: k })); } catch { /* 무시 */ }
      try { window.dispatchEvent(new CustomEvent(RELOAD_EVT, { detail: k })); } catch { /* 무시 */ }
    });
  };
  if (hasSnapshot) {
    // 스냅샷으로 먼저 화면을 그리고, 최신 값은 기존 설정 구독 경로로 반영한다.
    void refresh().catch(() => { /* 로컬 스냅샷으로 동작 */ });
    return;
  }
  try {
    await refresh();
  } catch {
    /* 규칙·네트워크 문제면 로컬 값으로 동작 */
  }
}

export function settingsPrimed(): boolean { return primed; }

/** 동기 읽기 — 서버 캐시 > localStorage > 기본값 */
export function getSetting<T>(key: string, fallback: T): T {
  // 설정 탭 SAVE 드래프트 (v2.5) — 저장 전 값이 있으면 그것을 먼저 본다
  if (draftVals.has(key)) return draftVals.get(key) as T;
  // null·undefined는 "지워진 값"으로 보고 기본값으로 돌아간다 —
  // 초기화가 설정을 null로 저장하는데 그대로 돌려주면 화면이 기본값 대신 null을 받아 깨진다.
  // (false·0·''은 정상값이므로 != null 로만 거른다)
  const cached = cache.get(key);
  if (cached != null) return cached as T;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed == null ? fallback : parsed) as T;   // 예전에 저장된 "null" 문자열도 방어
    } catch {
      // 예전에 문자열을 그대로 저장한 값(가입코드 등) 호환
      return (typeof fallback === 'string' ? raw : fallback) as T;
    }
  } catch { /* 무시 */ }
  return fallback;
}

/** 문자열 그대로 저장된 값(구버전 호환)용 — JSON이 아니어도 읽는다 */
export function getRawSetting(key: string): string | null {
  if (draftVals.has(key)) {
    const d = draftVals.get(key);
    return typeof d === 'string' ? d : JSON.stringify(d);
  }
  return savedRaw(key);
}

/** 저장된 값(드래프트 제외)의 문자열 */
function savedRaw(key: string): string | null {
  const v = cache.get(key);
  if (v != null) return typeof v === 'string' ? v : JSON.stringify(v);
  try {
    const raw = localStorage.getItem(key);
    return raw === 'null' ? null : raw;   // 지워진 값이 "null" 문자열로 남아 있던 경우 방어
  } catch { return null; }
}

/** 저장 — 캐시·로컬 사본·DB 순. DB 저장 실패는 조용히 무시(로컬은 남는다) */
export function setSetting(key: string, value: unknown): void {
  // 설정 탭 SAVE 드래프트 (v2.5) — 지금 열린 탭이 맡은 키는 SAVE 전까지 저장하지 않고 붙잡아 둔다
  // 설정 화면 미리보기 iframe (v3.1) — 그 안에서는 어떤 설정도 저장하지 않는다. 화면에만 반영
  if (draftScope?.has(key) || isPreviewFrame()) {
    draftVals.set(key, value);
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: key })); } catch { /* 무시 */ }
    try { window.dispatchEvent(new Event(DRAFT_EVT)); } catch { /* 무시 */ }
    return;
  }
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  cache.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ }
  // 첫 페인트용 스냅샷도 함께 고친다 — 안 고치면 이 브라우저에서 새로고침했을 때 저장 전 값으로 먼저 그린다 (v2.5)
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    try {
      const snap = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as Record<string, unknown> | null;
      if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
        snap[key] = value;
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      }
    } catch { /* 무시 */ }
  }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    // 실패를 삼키면 이 브라우저에는 남아 저장된 것처럼 보이다가, 다음 접속에 서버 값으로
    // 덮여 "저장했는데 원래대로 돌아가는" 증상이 된다 — 실패는 화면으로 알린다.
    void backend()?.saveSetting(key, value).catch(err => {
      console.error('[ohome] 설정 저장 실패', key, err);
      try {
        window.dispatchEvent(new CustomEvent(ERR_EVT, {
          detail: { key, message: (err as { message?: string })?.message ?? '' },
        }));
      } catch { /* 무시 */ }
    });
  }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: key })); } catch { /* 무시 */ }
}

export function removeSetting(key: string): void {
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  cache.delete(key);
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    void backend()?.saveSetting(key, null).catch(() => { /* 무시 */ });
  }
}

/* ---------- 설정 탭 SAVE 드래프트 (v2.5 사용자 요청) ----------
   「메인 페이지 / 위젯 / 게시판 관리 / BGM」도 디자인 탭처럼 SAVE를 눌러야 저장된다.
   스토어마다 저장 코드를 고치지 않고 이 계층에서 붙잡는다 — 탭이 열려 있는 동안 그 탭이 맡은
   키에 들어오는 setSetting은 draftVals에만 담기고, 읽기(getSetting·getRawSetting)는 드래프트를
   먼저 본다(화면은 미리보기로 바로 바뀐다). SAVE = 담긴 값을 실제로 저장, 취소 = 버리고
   RELOAD_EVT로 각 스토어에 저장본을 다시 읽게 한다. */
let draftScope: Set<string> | null = null;
let draftOwner: string | null = null;      // 드래프트를 연 탭 이름
const draftVals = new Map<string, unknown>();
/** 드래프트가 바뀔 때 (저장 안 된 변경 표시 갱신용) */
export const DRAFT_EVT = 'ohome-setting-draft';
/** 드래프트를 버렸을 때 — detail = 키. 메모리에 값을 들고 있는 스토어는 저장본을 다시 읽는다 */
export const RELOAD_EVT = 'ohome-setting-reload';

/** 이 키들을 드래프트로 붙잡기 시작 (탭을 열 때) */
export function beginSettingDraft(keys: readonly string[], owner: string): void {
  // 같은 탭이 다시 열리면(뒤로가기로 화면이 새로 그려진 경우 등) 붙잡아 둔 값을 그대로 이어 간다
  if (draftOwner === owner && draftScope) return;
  if (draftVals.size) discardSettingDraft();
  draftScope = new Set(keys);
  draftOwner = owner;
}

/** 지금 드래프트를 연 탭 — 없으면 null */
export function settingDraftOwner(): string | null { return draftOwner; }

/** 붙잡기 끝 — 저장 안 한 값은 버린다 (탭을 닫을 때) */
export function endSettingDraft(): void {
  discardSettingDraft();
  draftScope = null;
  draftOwner = null;
}

/** 저장본과 다른 드래프트 값이 있는가 */
export function settingDraftDirty(): boolean {
  for (const [k, v] of draftVals) {
    if (JSON.stringify(v) !== (savedRaw(k) ?? 'null')) return true;
  }
  return false;
}

/** 저장본과 다른 드래프트 키 목록 (v3.1 — 환경설정 메뉴의 「저장 안 된 변경」 점) */
export function settingDraftDirtyKeys(): string[] {
  const out: string[] = [];
  for (const [k, v] of draftVals) if (JSON.stringify(v) !== (savedRaw(k) ?? 'null')) out.push(k);
  return out;
}

/** SAVE — 드래프트 값을 실제로 저장 */
export function commitSettingDraft(): void {
  const entries = [...draftVals];
  draftVals.clear();
  const scope = draftScope;
  draftScope = null;
  try { entries.forEach(([k, v]) => setSetting(k, v)); } finally { draftScope = scope; }
  try { window.dispatchEvent(new Event(DRAFT_EVT)); } catch { /* 무시 */ }
}

/** 변경 취소 — 드래프트를 버리고 저장본으로 */
export function discardSettingDraft(): void {
  const keys = [...draftVals.keys()];
  draftVals.clear();
  keys.forEach(k => {
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: k })); } catch { /* 무시 */ }
    try { window.dispatchEvent(new CustomEvent(RELOAD_EVT, { detail: k })); } catch { /* 무시 */ }
  });
  try { window.dispatchEvent(new Event(DRAFT_EVT)); } catch { /* 무시 */ }
}

/** 지금 붙잡아 둔 값 전체 — 설정 화면이 미리보기 iframe에 넘겨 준다 (v3.1) */
export function settingDraftValues(): Record<string, unknown> {
  return Object.fromEntries(draftVals);
}

/**
 * 드래프트를 잠시 걷어 내고 실행 (v3.1) — 설정 화면은 이제 전체가 하나의 드래프트라,
 * 백업 복원·서버 이전·설정 올리기처럼 **바로 실제 값을 다뤄야 하는 작업**이 드래프트에 붙잡히거나
 * 저장 전 값을 읽지 않게 한다. 끝나면 붙잡던 값과 범위를 그대로 돌려놓는다.
 */
export async function withSettingDraftPaused<T>(fn: () => Promise<T> | T): Promise<T> {
  const scope = draftScope;
  const held = new Map(draftVals);
  draftScope = null;
  draftVals.clear();
  try {
    return await fn();
  } finally {
    draftScope = scope;
    held.forEach((v, k) => draftVals.set(k, v));
    try { window.dispatchEvent(new Event(DRAFT_EVT)); } catch { /* 무시 */ }
  }
}

/**
 * 미리보기 iframe 쪽 (v3.1) — 부모가 보낸 저장 전 값을 드래프트 자리에 얹는다.
 * 빠진 키는 저장본으로 돌아가고, 바뀐 키는 스토어들이 다시 읽게 RELOAD_EVT를 보낸다.
 */
export function applyPreviewSettings(vals: Record<string, unknown>): void {
  const changed = new Set<string>();
  for (const k of [...draftVals.keys()]) {
    if (!(k in vals)) { draftVals.delete(k); changed.add(k); }
  }
  for (const [k, v] of Object.entries(vals)) {
    if (JSON.stringify(draftVals.get(k)) !== JSON.stringify(v)) { draftVals.set(k, v); changed.add(k); }
  }
  changed.forEach(k => {
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: k })); } catch { /* 무시 */ }
    try { window.dispatchEvent(new CustomEvent(RELOAD_EVT, { detail: k })); } catch { /* 무시 */ }
  });
}

/** 드래프트를 버렸을 때 이 키를 다시 읽게 하는 구독 */
export function onSettingReload(key: string, cb: () => void): () => void {
  const h = (e: Event) => { if ((e as CustomEvent).detail === key) cb(); };
  window.addEventListener(RELOAD_EVT, h);
  return () => window.removeEventListener(RELOAD_EVT, h);
}

/** 다른 화면에서 같은 설정을 바꿨을 때 알림 */
export function onSettingChange(cb: (key: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail as string);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

/** 이 브라우저에 꾸며 둔 설정을 서버로 올리기 (연결 직후 1회 — 환경설정에서 호출) */
export async function pushLocalSettings(keys: string[]): Promise<number> {
  const be = backend();
  if (!be) return 0;
  let n = 0;
  for (const k of keys) {
    if (LOCAL_ONLY.has(k)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      await be.saveSetting(k, JSON.parse(raw));
      revisions.set(k, (revisions.get(k) ?? 0) + 1);
      cache.set(k, JSON.parse(raw));
      n += 1;
    } catch { /* 개별 실패는 건너뜀 */ }
  }
  return n;
}

/**
 * 이 브라우저에만 있고 서버에는 없는 설정 키.
 *
 * 설치 화면에서 DB를 먼저 연결한 보통의 경우에는 설정이 바뀔 때마다 서버로 나가므로 항상 빈 배열이다.
 * 로컬(브라우저 저장)으로 먼저 꾸민 뒤에 서버를 붙인 경우에만 값이 남고, 그때만 「설정 올리기」가 필요하다.
 * 캐시는 primeSettings가 서버에서 받아 채운 것이라 "서버에 있는가"의 기준이 된다.
 */
export function unsyncedSettingKeys(): string[] {
  if (!isServerMode()) return [];
  const out: string[] = [];
  try {
    for (const k of SETTING_KEYS) {
      if (LOCAL_ONLY.has(k) || cache.has(k)) continue;
      if (localStorage.getItem(k) != null) out.push(k);
    }
  } catch { /* 무시 */ }
  return out;
}
