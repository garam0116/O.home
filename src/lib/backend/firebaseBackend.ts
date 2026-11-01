'use client';
// Firebase 백엔드 — Firestore(문서=항목) + Auth + Storage
// 권한 규칙: firebase/firestore.rules · firebase/storage.rules
//
// Supabase 판과 같은 모양으로 맞춘 부분:
//  · 컬렉션 이름 동일 (posts, characters, …)
//  · 문서 = 항목 하나, 필드는 { data, authorId, visibility, sort }
//  · 관리자 판정은 meta/owner 문서 — 첫 로그인 계정이 소유자로 등록된다(규칙이 1회만 허용)
import {
  Backend, BackendCheck, BackendConfig, BackendUser, ListItem, diffList, metaOf,
} from './types';
import { visFloorOf } from '../visFloor';

type FirebaseCfg = Extract<BackendConfig, { kind: 'firebase' }>;

export async function createFirebaseBackend(cfg: FirebaseCfg): Promise<Backend> {
  const [{ initializeApp, getApps, getApp }, authMod, fsMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);

  const app = getApps().length ? getApp() : initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    appId: cfg.appId,
    ...(cfg.messagingSenderId ? { messagingSenderId: cfg.messagingSenderId } : {}),
  });

  const auth = authMod.getAuth(app);
  // 콘솔에서 데이터베이스를 (default)가 아닌 이름으로 만든 경우를 위해 ID를 받는다
  const dbId = (cfg.databaseId ?? '').trim();
  const named = !!dbId && dbId !== '(default)';
  // ignoreUndefinedProperties — 화면 데이터에는 값이 없는 필드가 undefined로 남는데(grants 등),
  // JSON 저장에서는 자동으로 빠지지만 Firestore는 거부한다. 같은 동작이 되도록 건너뛰게 한다.
  const db = (() => {
    const opts = { ignoreUndefinedProperties: true };
    try {
      return named ? fsMod.initializeFirestore(app, opts, dbId) : fsMod.initializeFirestore(app, opts);
    } catch {
      // 이미 만들어진 인스턴스가 있으면 그걸 쓴다 (백엔드를 두 번 만드는 경로)
      return named ? fsMod.getFirestore(app, dbId) : fsMod.getFirestore(app);
    }
  })();
  let storageMod: typeof import('firebase/storage') | undefined;
  let storage: ReturnType<typeof import('firebase/storage').getStorage> | undefined;
  const getStorage = async () => {
    const st = storageMod ?? (storageMod = await import('firebase/storage'));
    return { st, storage: (storage ??= st.getStorage(app)) };
  };

  const {
    collection, doc, getDoc, getDocs, getDocsFromServer, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, limit,
    runTransaction,
  } = fsMod;
  type Cons = ReturnType<typeof where>;

  // 가입코드는 공개 설정(settings)이 아니라 관리자만 읽는 meta/invite에 둔다 (보안 검토)
  const INVITE_KEY = 'ohome.invite.v1';

  // Firestore SDK는 서버에 못 닿으면 무한 재시도한다 — 쓰기가 영영 안 끝나는 것을 막는다
  const TIMEOUT = Symbol('timeout');
  const withLimit = <X,>(p: Promise<X>, ms = 12000) =>
    Promise.race([p, new Promise<typeof TIMEOUT>(r => setTimeout(() => r(TIMEOUT), ms))]);
  const NO_REACH = dbId
    ? `Firestore에 저장하지 못했습니다 — 데이터베이스 ID "${dbId}"가 맞는지 확인해 주세요.`
    : 'Firestore에 저장하지 못했습니다 — 데이터베이스가 만들어졌는지, 이름이 (default)인지 확인해 주세요.';

  /** 관리자 여부 — meta/owner 문서의 uid 또는 admins 목록 */
  const ownerInfo = async (): Promise<{ uid?: string; admins?: string[] } | null> => {
    try {
      const snap = await getDoc(doc(db, 'meta', 'owner'));
      return snap.exists() ? (snap.data() as { uid?: string; admins?: string[] }) : null;
    } catch { return null; }
  };

  // 목록 조회가 auth 복원을 기다리지 않도록 백엔드 생성과 함께 복원을 시작한다.
  const authReady = new Promise<typeof auth.currentUser>(resolve => {
    let off = () => {};
    off = authMod.onAuthStateChanged(auth, u => { off(); resolve(u); });
  });

  // 목록을 읽을 때마다 meta/owner를 다시 읽지 않도록 (읽기 횟수도 요금이다)
  let ownerCache: Promise<{ uid?: string; admins?: string[] } | null> | undefined;
  const ownerNow = () => (ownerCache ??= ownerInfo());
  const isAdminNow = async () => {
    const u = auth.currentUser;
    if (!u) return false;
    const own = await ownerNow();
    return own?.uid === u.uid || (own?.admins ?? []).includes(u.uid);
  };
  let initialAuthState = true;
  authMod.onAuthStateChanged(auth, () => {
    if (initialAuthState) { initialAuthState = false; return; }
    ownerCache = undefined;
    memberCache = undefined;
  });
  void authReady;
  void ownerNow();

  /** 회원 여부 — members/{uid} 문서(가입코드를 맞힌 계정) 또는 관리자.
   *  규칙이 회원 공개 글을 회원에게만 내주므로, 회원이 아니면 공개 글만 질의해야 목록이 통째로 거부되지 않는다.
   *  예전 규칙(members 없음)에서는 읽기가 거부되는데, 그때는 예전처럼 로그인 = 회원으로 본다. */
  let memberCache: Promise<boolean> | undefined;
  const isMemberNow = async () => {
    const u = auth.currentUser;
    if (!u) return false;
    if (await isAdminNow()) return true;
    return (memberCache ??= getDoc(doc(db, 'members', u.uid)).then(s => s.exists(), () => true));
  };

  /** 관리자 로그인 시 1회 — 보안 규칙 갱신 이전 데이터를 새 구조로 옮긴다.
   *  · 기존 회원(프로필이 있는 계정)에게 members 문서를 만들어 회원 권한 유지 (meta/owner.membersMigrated로 1회만)
   *  · 공개 설정(settings)에 있던 가입코드를 관리자 전용 meta/invite로 옮기고 공개 사본 삭제
   *  최신 규칙이 아직 게시되지 않았다면 조용히 실패한다 — 규칙을 게시하고 다시 로그인하면 된다. */
  let migrating = false;
  const migrateAsAdmin = async () => {
    if (migrating) return;
    migrating = true;
    let failed = false;
    try {
      const own = await ownerNow() as { membersMigrated?: boolean } | null;
      if (own && !own.membersMigrated) {
        const profs = await getDocs(collection(db, 'profiles'));
        for (let i = 0; i < profs.docs.length; i += 400) {
          const batch = writeBatch(db);
          profs.docs.slice(i, i + 400).forEach(p =>
            batch.set(doc(db, 'members', p.id), { migrated: true, at: Date.now() }, { merge: true }));
          await batch.commit();
        }
        await updateDoc(doc(db, 'meta', 'owner'), { membersMigrated: true });
        ownerCache = undefined;
      }
    } catch { failed = true; /* 예전 규칙 */ }
    try {
      const legacy = await getDoc(doc(db, 'settings', INVITE_KEY));
      if (legacy.exists()) {
        const inv = await getDoc(doc(db, 'meta', 'invite'));
        if (!inv.exists()) {
          const v = (legacy.data() as { value?: unknown }).value;
          await setDoc(doc(db, 'meta', 'invite'), { code: (typeof v === 'string' && v.trim()) || 'WELCOME' });
        }
        await deleteDoc(legacy.ref);
      }
    } catch { failed = true; /* 예전 규칙 */ }
    // 실패했으면 다음 로그인 상태 확인 때 다시 시도 (규칙을 게시한 뒤 새로고침 없이도 옮겨지게)
    if (failed) migrating = false;
  };

  /**
   * 로그인 상태에 맞는 목록 질의 조건.
   *
   * Firestore는 **규칙으로 못 읽을 문서가 섞일 수 있는 질의를 통째로 거부한다.**
   * (Supabase의 RLS는 행을 조용히 걸러 주므로 조건 없이 읽어도 되지만, 여기서는 아니다.)
   * 조건 없이 읽으면 비로그인 방문자에게 전체공개 글까지 하나도 안 보인다 — 목록 요청 자체가 거부되기 때문.
   *
   * 정렬(orderBy)은 일부러 붙이지 않는다. where + orderBy 조합은 복합 색인을 만들어야 해서
   * 설치한 사람이 콘솔에서 색인을 추가해야 하기 때문 — 대신 받은 뒤 sort로 정렬한다.
   */
  const readSets = async (): Promise<Cons[][]> => {
    await authReady;
    const u = auth.currentUser;
    if (!u) return [[where('visibility', '==', 'public')]];
    if (await isAdminNow()) return [[]];                    // 관리자는 전부
    // 가입코드 없이 만든 계정(회원 아님) — 전체공개 + 내가 쓴 것만
    if (!(await isMemberNow())) return [[where('visibility', '==', 'public')], [where('authorId', '==', u.uid)]];
    // 회원: 전체공개+회원공개, 그리고 내가 쓴 것(비공개 포함)은 따로 받아 합친다
    return [[where('visibility', 'in', ['public', 'member'])], [where('authorId', '==', u.uid)]];
  };

  const listQuery = (coll: string, cs: Cons[]) =>
    (cs.length ? query(collection(db, coll), ...cs) : query(collection(db, coll)));

  const toUser = async (u: { uid: string; email?: string | null; displayName?: string | null } | null): Promise<BackendUser | null> => {
    if (!u) return null;
    // 이메일을 그대로 이름으로 쓰지 않는다 — 회원 목록·댓글에 남의 메일 주소가 그대로 노출된다.
    // (프로필 저장 직후에는 displayName이 아직 비어 있어 여기로 떨어질 수 있다)
    let nickname = u.displayName || (u.email ? u.email.split('@')[0] : 'user');
    let avatarUrl: string | undefined;
    let avatarColor: string | undefined;
    const profilePromise = getDoc(doc(db, 'profiles', u.uid))
      .then(p => p.exists() ? p.data() as { nickname?: string; avatarUrl?: string; avatarColor?: string } : null)
      .catch(() => null);
    const [profile, own] = await Promise.all([profilePromise, ownerNow()]);
    if (profile) {
      nickname = profile.nickname ?? nickname;
      avatarUrl = profile.avatarUrl;
      avatarColor = profile.avatarColor;
    }
    const isAdmin = !!own && (own.uid === u.uid || (own.admins ?? []).includes(u.uid));
    if (isAdmin) void migrateAsAdmin();
    return {
      id: u.uid, nickname, role: isAdmin ? 'admin' : 'member',
      email: u.email ?? undefined, avatarUrl, avatarColor,
    };
  };

  const humanError = (e: unknown): string => {
    const code = (e as { code?: string })?.code ?? '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    }
    if (code.includes('email-already-in-use')) return '이미 사용 중인 이메일입니다.';
    if (code.includes('weak-password')) return '비밀번호는 6자 이상이어야 합니다.';
    if (code.includes('invalid-email')) return '이메일 형식이 올바르지 않습니다.';
    if (code.includes('operation-not-allowed')) return 'Firebase 콘솔에서 이메일/비밀번호 로그인을 켜 주세요 (Authentication → Sign-in method).';
    if (code.includes('permission-denied')) return '권한이 없습니다 — 보안 규칙이 적용됐는지 확인해 주세요.';
    return (e as { message?: string })?.message ?? '알 수 없는 오류입니다.';
  };

  return {
    kind: 'firebase',

    async check(): Promise<BackendCheck> {
      const fail = (p: Partial<BackendCheck>): BackendCheck =>
        ({ ok: false, reachable: false, schema: false, hasAdmin: false, message: '', ...p });
      // Firestore는 테이블을 미리 만들지 않는다 — 대신 "읽기가 되는지(규칙 적용 여부)"를 본다.
      // 반드시 getDocsFromServer — 일반 getDocs는 서버에 못 닿아도 로컬 캐시로 성공해서,
      // 데이터베이스가 없는데도 확인을 통과시켜 버린다(그 뒤 쓰기에서 멈춘다).
      try {
        const r = await withLimit(getDocsFromServer(query(collection(db, 'settings'), limit(1))));
        if (r === TIMEOUT) {
          return fail({ message: '응답이 없습니다 — projectId가 맞는지, Firestore 데이터베이스를 만들었는지 확인해 주세요.' });
        }
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        const msg = (e as { message?: string })?.message ?? '';
        if (code.includes('permission-denied')) {
          return fail({ reachable: true, message: '보안 규칙이 아직 적용되지 않았습니다 — 아래 규칙을 Firebase 콘솔의 Firestore → 규칙에 붙여넣고 게시해 주세요.' });
        }
        // 데이터베이스 자체가 없을 때 — 가장 흔한 첫 설치 실수
        if (code.includes('not-found') || /Database .* not found|NOT_FOUND/i.test(msg)) {
          return fail({
            message: dbId
              ? `"${dbId}" 데이터베이스를 찾을 수 없습니다 — Firebase 콘솔의 Firestore Database에서 그 이름이 맞는지 확인해 주세요.`
              : 'Firestore 데이터베이스가 없습니다 — Firebase 콘솔 → Firestore Database에서 [데이터베이스 만들기]를 먼저 해 주세요. 이미 만들었다면 데이터베이스 ID가 (default)인지 확인해 주세요.',
          });
        }
        if (code.includes('unavailable') || code.includes('failed-precondition')) {
          return fail({ message: 'Firestore가 아직 준비되지 않았습니다 — Firebase 콘솔에서 Firestore 데이터베이스를 먼저 만들어 주세요.' });
        }
        return fail({ message: `연결에 실패했습니다 — ${humanError(e)}` });
      }
      const own = await ownerNow();
      const hasAdmin = !!own?.uid;
      return {
        ok: true, reachable: true, schema: true, hasAdmin,
        message: hasAdmin ? '연결 완료 — 관리자 계정이 이미 있습니다. 그 계정으로 로그인해 주세요.'
          : '연결 완료 — 이제 관리자 계정을 만들면 됩니다. 첫 번째 계정이 이 홈의 관리자가 됩니다.',
      };
    },

    async currentUser() {
      // 새로고침 직후 auth 복원을 기다린다
      const u = await authReady;
      return toUser(u);
    },

    onAuthChange(cb) {
      return authMod.onAuthStateChanged(auth, u => { void toUser(u).then(cb); });
    },

    async signIn(id, password) {
      try {
        await authMod.signInWithEmailAndPassword(auth, id, password);
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async signUp(id, password, nickname, invite = '') {
      let cred: Awaited<ReturnType<typeof authMod.createUserWithEmailAndPassword>>;
      try {
        cred = await authMod.createUserWithEmailAndPassword(auth, id, password);
      } catch (e) { return { ok: false, error: humanError(e) }; }
      // 가입코드 확인은 규칙이 한다 — members 문서를 만들 수 있어야 회원이다.
      // 코드가 틀리면 방금 만든 로그인 계정을 지워 같은 이메일로 다시 시도할 수 있게 한다.
      try {
        const m = await withLimit(setDoc(doc(db, 'members', cred.user.uid), { code: invite, at: Date.now() }));
        if (m === TIMEOUT) return { ok: false, error: `${NO_REACH} (로그인 계정은 이미 만들어졌습니다)` };
      } catch (e) {
        if (((e as { code?: string })?.code ?? '').includes('permission-denied')) {
          // 자기 members 문서 읽기까지 거부되면 members 규칙이 없는 예전 규칙이다 —
          // 서버가 코드를 확인하지 못하므로 예전처럼 여기서 비교한다 (최신 규칙 게시 권장)
          const oldRules = await getDoc(doc(db, 'members', cred.user.uid)).then(() => false, () => true);
          let valid = false;
          if (oldRules) {
            const own = await ownerInfo();
            let expected = 'WELCOME';
            try {
              const s = await getDoc(doc(db, 'settings', INVITE_KEY));
              const v = s.exists() ? (s.data() as { value?: unknown }).value : null;
              if (typeof v === 'string' && v.trim()) expected = v.trim();
            } catch { /* 기본값 */ }
            valid = !own?.uid || invite === expected;   // 첫 관리자 설치는 코드 없이
          }
          if (!valid) {
            try { await authMod.deleteUser(cred.user); } catch { /* 무시 */ }
            return { ok: false, error: '가입코드가 올바르지 않습니다.' };
          }
        } else {
          return { ok: false, error: humanError(e) };
        }
      }
      memberCache = undefined;
      try {
        await authMod.updateProfile(cred.user, { displayName: nickname });
        const r = await withLimit(
          setDoc(doc(db, 'profiles', cred.user.uid), { nickname, createdAt: Date.now() }, { merge: true }));
        // 계정(Auth)은 이미 만들어졌으므로 그 사실을 알려 준다 — 다시 시도하면 "이미 사용 중"이 뜬다
        if (r === TIMEOUT) return { ok: false, error: `${NO_REACH} (로그인 계정은 이미 만들어졌습니다)` };
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async signOut() { await authMod.signOut(auth); },

    async resetPassword(email) {
      try {
        await authMod.sendPasswordResetEmail(auth, email);
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async updateProfile(patch) {
      const u = auth.currentUser;
      if (!u) return { ok: false, error: '로그인이 필요합니다.' };
      try {
        const row: Record<string, unknown> = {};
        if (patch.nickname !== undefined) row.nickname = patch.nickname;
        if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl ?? null;
        if (patch.avatarColor !== undefined) row.avatarColor = patch.avatarColor ?? null;
        await setDoc(doc(db, 'profiles', u.uid), row, { merge: true });
        if (patch.nickname) await authMod.updateProfile(u, { displayName: patch.nickname });
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    /** 첫 계정을 소유자(관리자)로 등록 — 규칙이 "없을 때 1회"만 허용한다 */
    async claimOwner() {
      const u = auth.currentUser;
      if (!u) return { ok: false, error: '로그인이 필요합니다.' };
      try {
        const own = await ownerNow();
        if (own?.uid) return { ok: true };   // 이미 소유자 있음
        const r = await withLimit(setDoc(doc(db, 'meta', 'owner'), { uid: u.uid, admins: [u.uid], at: Date.now() }));
        if (r === TIMEOUT) return { ok: false, error: NO_REACH };
        ownerCache = undefined;   // 방금 관리자가 됐으니 다시 판정하게
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async listMembers() {
      const own = await ownerNow();
      const admins = new Set([own?.uid, ...(own?.admins ?? [])].filter(Boolean) as string[]);
      const snap = await getDocs(collection(db, 'profiles'));
      return snap.docs.map(d => {
        // avatarUrl도 함께 — 이미지 정리가 프로필 사진을 「안 쓰는 파일」로 지우지 않게 (v2.0 사용자 제보)
        const v = d.data() as { nickname?: string; avatarUrl?: string; no?: number; createdAt?: number };
        return {
          id: d.id,
          nickname: v.nickname ?? d.id,
          role: (admins.has(d.id) ? 'admin' : 'member') as 'admin' | 'member',
          avatarUrl: v.avatarUrl,
          no: typeof v.no === 'number' ? v.no : undefined,
          createdAt: typeof v.createdAt === 'number' ? v.createdAt : undefined,
        };
      });
    },

    async setMemberNo(uid, no) {
      await setDoc(doc(db, 'profiles', uid), { no }, { merge: true });
    },

    /* 번호 발급 (v2.4) — counters/{kind} 문서 하나를 트랜잭션으로 올린다.
       동시에 두 사람이 받아도 트랜잭션이 하나를 다시 돌리므로 같은 번호가 나가지 않는다.
       규칙은 「값이 커지는 쓰기」만 허용한다 (firebase/firestore.rules). */
    async reserveNo(kind, count, floor) {
      const ref = doc(db, 'counters', kind);
      return runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        const cur = snap.exists() ? Number((snap.data() as { n?: number }).n) || 0 : 0;
        const base = Math.max(cur, floor);
        if (base + count > cur || !snap.exists()) tx.set(ref, { n: base + count });
        return base + 1;
      });
    },

    async fetchList<T extends ListItem>(coll: string): Promise<T[]> {
      const sets = await readSets();
      // 반드시 getDocsFromServer — 일반 getDocs는 로컬(오프라인) 캐시가 있으면 그걸로 조용히 성공해
      // 버린다. 실시간 구독이 한 번의 쓰기에 두 번(로컬 반영·서버 확정) 반응해 재조회가 겹칠 때
      // 낡은 캐시 결과가 방금 반영된 변경을 도로 덮어써 "새로고침해야 보임"이 되던 원인 중 하나
      // (v2.0 사용자 발견 — 목록 숨김을 바꿔도 반영이 안 되는 것처럼 보임)
      const snaps = await Promise.all(sets.map(cs => getDocsFromServer(listQuery(coll, cs))));
      // 두 질의(공개분 · 내 글)를 합치므로 문서 id로 중복을 없앤 뒤 sort로 정렬한다
      const seen = new Map<string, { sort: number; item: T }>();
      snaps.forEach(s => s.docs.forEach(d => {
        if (seen.has(d.id)) return;
        const raw = d.data() as { data?: Record<string, unknown>; sort?: number };
        seen.set(d.id, { sort: raw.sort ?? 0, item: { ...(raw.data ?? {}), id: d.id } as T });
      }));
      return [...seen.values()].sort((a, b) => a.sort - b.sort).map(v => v.item);
    },

    async syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null) {
      const { inserts, updates, moves, deletes } = diffList(prev, next);
      const ops = [...inserts, ...updates];
      // Firestore 배치는 500개 제한에 **요청 크기 10MiB 제한**도 있다 (v2.0 포크 제보 — 큰 로그
      // 본문 저장 실패). 개수(400)만 보고 끊으면 700KB짜리 본문 문서 십수 개에 10MiB를 넘어
      // 배치가 통째로 거부된다 — 대략 크기를 재서 8MB쯤에서 미리 끊는다.
      const parts: { item: T; sort: number }[][] = [];
      let cur: { item: T; sort: number }[] = [];
      let bytes = 0;
      for (const op of ops) {
        const size = JSON.stringify(op.item).length + 200;
        if (cur.length && (cur.length >= 400 || bytes + size > 8_000_000)) { parts.push(cur); cur = []; bytes = 0; }
        cur.push(op); bytes += size;
      }
      if (cur.length) parts.push(cur);
      for (const part of parts) {
        const batch = writeBatch(db);
        part.forEach(({ item, sort }) => {
          const { authorId, visibility, editorIds } = metaOf(item, uid, visFloorOf(coll, item));
          batch.set(doc(db, coll, item.id), {
            data: item, authorId, visibility, editorIds, sort, updatedAt: Date.now(),
          });
        });
        await batch.commit();
      }
      const chunk = <X,>(arr: X[], n: number) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
      // 자리만 바뀐 항목 — sort만 고친다 (본문까지 다시 보내지 않게, 위 diffList 주석 참조)
      for (const part of chunk(moves, 400)) {
        const batch = writeBatch(db);
        part.forEach(({ id, sort }) => batch.update(doc(db, coll, id), { sort, updatedAt: Date.now() }));
        await batch.commit();
      }
      for (const part of chunk(deletes, 400)) {
        const batch = writeBatch(db);
        part.forEach(id => batch.delete(doc(db, coll, id)));
        await batch.commit();
      }
    },

    /* 공개범위·편집 권한 목록만 다시 계산해 덮어쓰기 (v2.0) — data·sort는 손대지 않는다.
       editorIds도 함께 쓴다 (포크 제보 — 업데이트 전에 준 편집 권한이 문서에 평평한 목록으로
       없어서, 최신 규칙을 넣어도 그 회원의 저장이 계속 거부됐다) */
    async refreshVis<T extends ListItem>(coll: string, items: T[], uid: string | null): Promise<number> {
      let n = 0;
      for (let i = 0; i < items.length; i += 400) {
        const part = items.slice(i, i + 400);
        const batch = writeBatch(db);
        part.forEach(it => {
          const { visibility, editorIds } = metaOf(it, uid, visFloorOf(coll, it));
          batch.update(doc(db, coll, it.id), { visibility, editorIds, updatedAt: Date.now() });
        });
        await batch.commit();
        n += part.length;
      }
      return n;
    },

    subscribe(coll, onChange) {
      // 조건이 두 갈래면 구독도 두 개 — fetchList와 같은 이유(질의 전체 거부 방지)
      let offs: Array<() => void> = [];
      let stopped = false;
      void readSets().then(sets => {
        if (stopped) return;
        offs = sets.map(cs => {
          let first = true;
          let pending = false;
          return onSnapshot(listQuery(coll, cs), { includeMetadataChanges: true }, snap => {
            // 첫 전체 결과는 fetchList가 가져온다. 로컬 반영 대신 서버 확정 때만 다시 읽는다.
            // 메타데이터도 받아야 로컬 쓰기 확정(내용은 같고 pending만 해제됨)을 놓치지 않는다.
            const initial = first;
            first = false;
            const confirmed = pending && !snap.metadata.hasPendingWrites;
            pending = snap.metadata.hasPendingWrites;
            if (initial || snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
            // 초기 캐시의 서버 확인만으로는 재조회하지 않는다 (쓰기 확정 알림은 별도로 반영).
            if (!confirmed && snap.docChanges().length === 0) return;
            onChange();
          }, () => { /* 권한 없음 등은 무시 */ });
        });
      });
      return () => { stopped = true; offs.forEach(off => off()); offs = []; };
    },

    async fetchSetting<T>(key: string) {
      if (key === INVITE_KEY) {
        try {
          const inv = await getDoc(doc(db, 'meta', 'invite'));
          return inv.exists() ? ((inv.data() as { code?: T }).code ?? null) : null;
        } catch { return null; }
      }
      const snap = await getDoc(doc(db, 'settings', key));
      return snap.exists() ? ((snap.data() as { value: T }).value ?? null) : null;
    },

    async saveSetting(key, value) {
      if (key === INVITE_KEY) {
        if (value == null) await deleteDoc(doc(db, 'meta', 'invite'));
        else await setDoc(doc(db, 'meta', 'invite'), { code: String(value).trim() || 'WELCOME' });
        // 예전 버전이 공개 설정에 남긴 사본은 지운다
        try { await deleteDoc(doc(db, 'settings', INVITE_KEY)); } catch { /* 무시 */ }
        return;
      }
      await setDoc(doc(db, 'settings', key), { value, updatedAt: Date.now() });
    },

    async fetchAllSettings() {
      const snap = await getDocs(collection(db, 'settings'));
      const out: Record<string, unknown> = {};
      snap.docs.forEach(d => { if (d.id !== INVITE_KEY) out[d.id] = (d.data() as { value: unknown }).value; });
      await authReady;
      if (await isAdminNow()) {
        try {
          const inv = await getDoc(doc(db, 'meta', 'invite'));
          if (inv.exists()) out[INVITE_KEY] = (inv.data() as { code?: unknown }).code;
        } catch { /* 예전 규칙 */ }
      }
      return out;
    },

    async uploadFile(blob, ext) {
      const { st, storage } = await getStorage();
      const path = `ohome/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = st.ref(storage, path);
      // 경로가 업로드마다 고유하므로 내용이 바뀌지 않는다 — 길게 캐시해 재방문·엣지 캐시 이득을 본다
      // (지정하지 않으면 브라우저가 매번 다시 받아 먼 지역 버킷에서 지연이 그대로 드러남)
      // owner: 규칙이 덮어쓰기·삭제를 올린 사람(또는 관리자)에게만 허용한다
      await st.uploadBytes(r, blob, {
        contentType: blob.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
        customMetadata: { owner: auth.currentUser?.uid ?? '' },
      });
      return await st.getDownloadURL(r);
    },

    async listFiles() {
      const { st, storage } = await getStorage();
      // 저장하는 주소가 다운로드 URL이므로 목록도 같은 형태로 돌려줘야 대조가 된다
      const res = await st.listAll(st.ref(storage, 'ohome'));
      return Promise.all(res.items.map(async it => {
        const [ref, meta] = await Promise.all([st.getDownloadURL(it), st.getMetadata(it)]);
        return { ref, size: meta.size ?? 0 };
      }));
    },

    async deleteFile(ref) {
      const { st, storage } = await getStorage();
      // Firebase SDK는 다운로드 URL로도 참조를 만들 수 있다
      await st.deleteObject(st.ref(storage, ref));
    },

    async deleteMember(id) {
      // profiles 문서만 지운다 — Authentication 계정은 관리자 키가 있어야 지울 수 있다
      await deleteDoc(doc(db, 'profiles', id));
    },
  };

  // (deleteDoc은 삭제 배치에서 doc 단위로 쓰지 않아 참조만 유지)
  void deleteDoc;
}
