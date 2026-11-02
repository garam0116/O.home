'use client';
// 백엔드 어댑터 (v2.0) — Supabase / Firebase 두 버전을 같은 인터페이스로 쓴다.
//
// 화면 코드는 이 파일의 타입만 알고, 어떤 서비스에 붙었는지는 모른다.
// 새 백엔드를 추가하려면 이 인터페이스만 구현하면 된다.

export type BackendKind = 'supabase' | 'firebase';

/** 설치 화면에서 입력받는 연결 정보 — 모두 공개돼도 되는 값이다(보안은 서버 규칙이 담당) */
export type BackendConfig =
  | { kind: 'supabase'; url: string; anonKey: string }
  | {
      kind: 'firebase';
      apiKey: string; authDomain: string; projectId: string;
      storageBucket: string; appId: string; messagingSenderId?: string;
      /** Firestore 데이터베이스 ID — 비우면 (default). 콘솔에서 다른 이름으로 만들었을 때만 필요 */
      databaseId?: string;
    };

/** 로그인 사용자 */
export interface BackendUser {
  id: string;
  nickname: string;
  role: 'admin' | 'member';
  email?: string;
  avatarUrl?: string;
  avatarColor?: string;
}

/** 연결·규칙 점검 결과 (설치 화면의 [연결 확인]) */
export interface BackendCheck {
  ok: boolean;
  reachable: boolean;   // 프로젝트에 닿음
  schema: boolean;      // 테이블/규칙 준비됨
  hasAdmin: boolean;    // 관리자 계정 있음
  message: string;
}

export interface ListItem { id: string; [k: string]: unknown }

export interface Backend {
  kind: BackendKind;

  /* ---- 연결 점검 ---- */
  check(): Promise<BackendCheck>;

  /* ---- 인증 ---- */
  currentUser(): Promise<BackendUser | null>;
  onAuthChange(cb: (u: BackendUser | null) => void): () => void;
  signIn(id: string, password: string): Promise<{ ok: boolean; error?: string }>;
  /** invite: 가입코드 — 서버(규칙/트리거)가 확인한다. 첫 관리자 설치 때는 생략 */
  signUp(id: string, password: string, nickname: string, invite?: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<{ ok: boolean; error?: string }>;
  updateProfile(patch: { nickname?: string; avatarUrl?: string | null; avatarColor?: string | null }): Promise<{ ok: boolean; error?: string }>;
  /** 첫 계정을 이 홈의 관리자로 등록 (관리자가 아직 없을 때만) */
  claimOwner(): Promise<{ ok: boolean; error?: string }>;
  /** 가입 회원 목록 — 회원 관리 화면용.
   *  avatarUrl도 내준다 (v2.0 사용자 제보) — 이미지 정리가 콘텐츠·설정만 훑던 시절, 프로필 사진은
   *  어디에도 참조가 안 잡혀 「아무도 안 쓰는 파일」로 지워졌다. */
  listMembers(): Promise<{ id: string; nickname: string; role: 'admin' | 'member'; email?: string; avatarUrl?: string; no?: number; createdAt?: number }[]>;
  /** 회원 번호 저장 (v2.4) — 회원 주소 /members/{번호}. 본인 또는 관리자 */
  setMemberNo(uid: string, no: number): Promise<void>;

  /* ---- 번호 발급 (v2.4 사용자 요청) ----
     홈의 모든 항목은 올린 순서대로 고정된 번호 주소(/board/1, /gallery/3 …)를 갖는다.
     회원은 비공개 글을 못 보므로 「지금 보이는 마지막 번호 + 1」로는 번호가 겹칠 수 있다 —
     그래서 종류마다 서버에 카운터를 하나 두고 거기서 번호를 받는다.
     kind 카운터를 max(현재값, floor)에서 count만큼 올리고, 받은 묶음의 첫 번호를 돌려준다.
     count가 0이면 카운터를 floor 이상으로 맞추기만 한다(돌려주는 값은 다음 번호). */
  reserveNo(kind: string, count: number, floor: number): Promise<number>;

  /* ---- 목록(콘텐츠) ---- */
  fetchList<T extends ListItem>(coll: string): Promise<T[]>;
  syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null): Promise<void>;
  /** 이미 저장된 행의 공개범위만 다시 계산해 덮어쓴다 (v2.0) — 메뉴를 비공개로 바꾼 뒤
   *  「글에도 적용」을 누르면 돈다. 내용(data)·순서(sort)는 건드리지 않는다. */
  refreshVis<T extends ListItem>(coll: string, items: T[], uid: string | null): Promise<number>;
  subscribe(coll: string, onChange: () => void): () => void;
  /** 문서 하나를 주소(id)로 직접 읽는다 (보안 검토) — 비밀번호 로그 본문처럼 **목록 질의로는
   *  절대 안 나오고**, 주소(비밀번호 해시가 섞인 id)를 아는 사람만 읽는 문서용. 없거나 못 읽으면 null */
  fetchPwDoc<T extends ListItem>(coll: string, id: string): Promise<T | null>;
  /** 가입코드가 아직 없거나 누구나 아는 기본값(WELCOME)이면 무작위 코드로 바꾼다 (보안 검토, 관리자 전용).
   *  새로 만들었으면 그 코드를, 손대지 않았으면 null을 돌려준다 */
  ensureInviteCode(): Promise<string | null>;

  /* ---- 설정(key/value) ---- */
  fetchSetting<T>(key: string): Promise<T | null>;
  saveSetting(key: string, value: unknown): Promise<void>;
  fetchAllSettings(): Promise<Record<string, unknown>>;

  /* ---- 이미지·파일 ---- */
  uploadFile(blob: Blob, ext: string): Promise<string>;   // → 공개 URL
  /** 저장소에 있는 파일 전부 — 어디서도 참조하지 않는 파일을 찾아 지우는 데 쓴다.
   *  글을 지워도 이미지는 저장소에 남기 때문에(참조가 다른 곳에 남아 있을 수 있어 자동 삭제는 위험)
   *  관리자가 환경설정에서 직접 확인하고 정리한다. */
  listFiles(): Promise<{ ref: string; size: number }[]>;
  deleteFile(ref: string): Promise<void>;

  /** 회원 프로필(닉네임·아바타) 삭제 — 홈의 회원 목록에서 사라진다.
   *  **로그인 계정 자체는 지울 수 없다.** Firebase Authentication / Supabase Auth의 계정 삭제는
   *  관리자 키가 있어야 하는데, 공개 홈에 그 키를 두면 누구나 계정을 지울 수 있게 된다.
   *  계정 삭제는 각 서비스 콘솔에서 (설치 가이드에 안내). */
  deleteMember(id: string): Promise<void>;
}

/** 콘텐츠 컬렉션 이름 (localStorage 키 → 컬렉션/테이블) — 두 백엔드가 같은 이름을 쓴다 */
export const COLLECTION_OF: Record<string, string> = {
  'ohome.board.v1': 'posts',
  'ohome.rels.v1': 'relations',
  'ohome.backup.v1': 'gallery',
  'ohome.road.v1': 'roadview',
  'ohome.trpg.v1': 'trpg_logs',
  // TRPG 로그 본문 — 목록 문서와 분리 저장 (v2.0). 목록 노출(listHidden)과 열람 권한(visibility)이
  // Firestore에서는 같은 read 규칙을 타므로(질의로 노출된 문서는 단일 조회도 전부 읽힌다),
  // "나만보기여도 목록엔 표시" 조건을 안전하게 만족하려면 본문을 아예 다른 문서에 둬야 한다
  'ohome.trpgbody.v1': 'trpg_log_bodies',
  'ohome.threads.v1': 'threads',
  'ohome.diary.v1': 'diary',
  // 댓글 — 글 안이 아니라 자기 문서로 (v2.0). 글 안에 두면 댓글을 달 때마다 글을 UPDATE 해야 해서
  // 「글 수정은 작성자·관리자만」 규칙에 걸려 일반 회원이 관리자 글에 댓글을 달 수 없었다
  'ohome.comments.v1': 'comments',
};

export const CONTENT_COLLECTIONS = Object.values(COLLECTION_OF);

/** 항목 배열 비교 — 두 백엔드가 공유하는 diff (바뀐 것만 저장).
 *
 *  **내용이 그대로고 자리만 바뀐 항목은 moves로 분리한다** (v2.0 포크 제보 — 큰 로그 본문 저장 실패).
 *  새 항목을 목록 맨 앞에 끼우면 기존 항목 전부의 자리가 밀리는데, 이걸 전부 updates로 취급하면
 *  **본문까지 통째로 다시 전송**된다. TRPG 로그 본문(문서당 최대 700KB)이 쌓인 홈에서는 그 합이
 *  Firestore 쓰기 한 번의 최대 크기(10MiB)를 넘어 **새 로그의 본문 저장만 조용히 실패**했다 —
 *  티켓은 생기는데 본문은 「비어 있습니다」가 되는 원인. moves는 sort 값만 고쳐 저장하면 된다. */
export function diffList<T extends ListItem>(prev: T[], next: T[]) {
  const prevMap = new Map(prev.map((it, i) => [it.id, { it, i }]));
  const nextIds = new Set(next.map(it => it.id));
  const inserts: { item: T; sort: number }[] = [];
  const updates: { item: T; sort: number }[] = [];
  const moves: { id: string; sort: number }[] = [];
  next.forEach((it, i) => {
    const before = prevMap.get(it.id);
    if (!before) inserts.push({ item: it, sort: i });
    else if (JSON.stringify(before.it) !== JSON.stringify(it)) updates.push({ item: it, sort: i });
    else if (before.i !== i) moves.push({ id: it.id, sort: i });
  });
  const deletes = prev.filter(it => !nextIds.has(it.id)).map(it => it.id);
  return { inserts, updates, moves, deletes };
}

/** 항목에서 권한 판단에 쓰는 값 뽑기.
 *
 *  listHidden 필드가 있는 항목(TRPG 로그 목록 문서 등)은 "목록에 뜨는지"가 곧 질의(list) 단계의
 *  공개 여부다 — 실제 열람 권한(item.visibility)과는 별개로 다룬다 (v2.0 사용자 확정: "나만보기여도
 *  목록에는 표시돼야해"). Firestore·Supabase RLS 둘 다 list/get을 같은 규칙으로 묶어 판단하므로,
 *  이 필드가 있는 문서에는 민감한 내용(본문 등)을 절대 함께 두면 안 된다 — 질의로 노출되면
 *  단일 조회 권한도 함께 열리기 때문. (그래서 TRPG 로그는 본문을 별도 문서로 분리해 저장한다.) */
export function metaOf(item: ListItem, uid: string | null, floor = 'public') {
  const rawAuthor = typeof item.authorId === 'string' ? item.authorId : '';
  // 손님 댓글(authorId '')은 누가 다시 저장하든 작성자 없음으로 남긴다 (보안 검토) — 예전엔
  // 관리자가 고쳐 저장하면 관리자 id가 들어가 「관리자가 쓴 댓글」로 바뀌었다
  const guestComment = rawAuthor === '' && 'authorId' in item && typeof item.target === 'string';
  const authorId = guestComment ? null : (rawAuthor || uid || null);
  const hasListHidden = typeof item.listHidden === 'boolean';
  const own = hasListHidden
    ? (item.listHidden ? 'private' : 'public')
    // 비밀글(🔒)은 작성자·관리자만 — 예전엔 화면에서만 가리고 서버에는 공개로 저장돼
    // F12(네트워크 탭)로 본문이 그대로 보였다 (보안 검토)
    : item.secret === true ? 'private'
    : (typeof item.visibility === 'string' ? item.visibility : 'public');
  /* 메뉴를 비공개로 둔 곳의 글은 그 기준까지 좁혀 저장한다 (v2.0 사용자 요청 — visFloor 참조).
     **좁히기만 한다** — 글이 이미 더 좁으면 그대로다. 게시판 글처럼 visibility 칸이 아예 없는
     종류도 여기서 정해지므로, 서버가 내주지 않는 것은 화면과 무관하게 보장된다.
     'pw'(비밀번호 로그 본문 사본)는 회원공개보다 좁고 비공개보다 넓다 — 주소를 아는 사람만 읽는다 */
  const visibility = (VIS_RANK[floor] ?? 0) > (VIS_RANK[own] ?? 0) ? floor : own;
  // 댓글이 달린 글의 작성자 — 비밀글에 달린 댓글을 그 글쓴이도 읽을 수 있게 규칙이 이 칸을 본다
  const targetAuthorId = typeof item.targetAuthorId === 'string' && item.targetAuthorId ? item.targetAuthorId : null;
  return { authorId, visibility, targetAuthorId };
}

/** 공개범위 넓이 — 클수록 좁다 */
export const VIS_RANK: Record<string, number> = { public: 0, member: 1, pw: 1.5, private: 2 };

/** 무작위 가입코드 — 헷갈리는 글자(0/O, 1/I/L)를 뺀 10자 */
export function randomInviteCode(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => abc[n % abc.length]).join('');
}

/** 관리자만 읽는 설정 키 — 공개 설정 저장소(settings)에 두면 F12로 누구나 본다 */
export const ADMIN_ONLY_SETTINGS = ['ohome.invite.v1', 'ohome.membertags.v1'];
