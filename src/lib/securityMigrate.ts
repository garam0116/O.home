'use client';
/**
 * 보안 검토 후속 — 관리자가 로그인하면 이미 저장된 데이터를 새 기준으로 옮긴다.
 *
 * 화면에서만 가리던 것들이 서버에는 「공개」로 저장돼 있어 F12(네트워크 탭)로 보였다:
 *   · 비밀글(🔒) 본문            → 비공개(작성자·관리자)로 다시 저장
 *   · 비공개 글에 달린 댓글       → 달린 글의 공개범위로 다시 저장 (commentTargetMeta)
 *   · TRPG 로그 열람 비밀번호      → 목록 문서에서 지우고 비밀번호 해시 주소의 본문 사본으로
 *   · 옛 TRPG 로그의 내장 본문     → 목록 문서에서 빼 본문 문서로
 *   · 가입코드가 없거나 WELCOME   → 무작위 코드
 *
 * 남의 문서를 고칠 수 있는 건 관리자뿐이라 관리자 로그인 때 돈다. 한 번만 하면 되는 것은
 * 설정 `ohome.secmig.v1`에 끝났다고 적어 두고, 댓글 맞춤은 바뀐 것만 쓰므로 매번 확인한다
 * (회원이 나중에 자기 글을 비밀글로 바꾸면 남이 단 댓글은 관리자만 고칠 수 있기 때문).
 */
import type { Backend, ListItem } from './backend/types';
import { commentTargetMeta, COMMENT_TARGET_COLL } from './visFloor';
import type { CommentRow } from './postStore';
import { withLogBodies, type TrpgLog, type TrpgLogBody } from './galleryStore';

const FLAG_KEY = 'ohome.secmig.v1';
type Flags = { posts?: boolean; trpg?: boolean };

/** 댓글마다 달린 글의 공개범위·작성자를 다시 계산해, 바뀐 것만 저장한다. 고친 개수를 돌려준다 */
export async function resyncCommentMeta(be: Backend, uid: string | null): Promise<number> {
  const comments = await be.fetchList<CommentRow & ListItem>('comments');
  if (!comments.length) return 0;
  const targets = new Map<string, Map<string, ListItem>>();
  for (const coll of Object.values(COMMENT_TARGET_COLL)) {
    const rows = await be.fetchList(coll);
    targets.set(coll, new Map(rows.map(r => [r.id, r])));
  }
  let changed = 0;
  const next = comments.map(c => {
    const coll = COMMENT_TARGET_COLL[c.target];
    if (!coll) return c;
    const target = targets.get(coll)?.get(c.targetId);
    // 대상 글을 못 찾으면(이미 지워짐) 손대지 않는다
    if (!target) return c;
    const m = commentTargetMeta(coll, target);
    if (c.targetVis === m.targetVis && (c.targetAuthorId ?? undefined) === m.targetAuthorId) return c;
    changed++;
    const { targetAuthorId: _old, ...rest } = c;
    void _old;
    return { ...rest, ...m } as CommentRow & ListItem;
  });
  if (changed) await be.syncList('comments', comments, next, uid);
  return changed;
}

/** TRPG 로그 — 평문 비밀번호·내장 본문을 목록 문서에서 빼낸다 */
async function migrateTrpg(be: Backend, uid: string | null) {
  const logs = await be.fetchList<TrpgLog & ListItem>('trpg_logs');
  const bodies = await be.fetchList<TrpgLogBody & ListItem>('trpg_log_bodies');
  let nextBodies: TrpgLogBody[] = bodies;
  const nextLogs = [] as (TrpgLog & ListItem)[];
  let touched = false;
  for (const l of logs) {
    const legacyBody = l.body !== undefined || l.bodyId !== undefined || l.originalFileId !== undefined;
    if (!l.password && !legacyBody) { nextLogs.push(l); continue; }
    touched = true;
    const cur = nextBodies.find(x => x.id === l.id);
    const normal: TrpgLogBody = {
      ...(cur ?? {}),
      id: l.id,
      body: cur?.body ?? l.body ?? '',
      bodyId: cur?.bodyId ?? l.bodyId,
      bodyHtml: cur?.bodyHtml ?? l.bodyHtml,
      originalFileId: cur?.originalFileId ?? l.originalFileId,
      originalName: cur?.originalName ?? l.originalName,
      visibility: l.visibility,
      ...(l.secId ? { secId: l.secId } : {}),
    };
    // 비밀번호가 있으면 사본을 만들고, 없으면 일반 본문만 맞춘다(예전 사본이 있으면 지운다)
    const pw = l.password ?? (l.hasPassword ? nextBodies.find(x => x.pwOf === l.id)?.password : undefined);
    nextBodies = await withLogBodies(nextBodies, l.id, normal, pw);
    nextLogs.push({
      ...l,
      password: undefined, hasPassword: pw ? true : undefined,
      body: undefined, bodyId: undefined, bodyHtml: undefined,
      originalFileId: undefined, originalName: undefined,
    });
  }
  if (!touched) return;
  // 본문을 먼저 옮기고 나서 목록 문서에서 지운다 — 중간에 끊겨도 본문이 사라지지 않게
  await be.syncList('trpg_log_bodies', bodies, nextBodies as (TrpgLogBody & ListItem)[], uid);
  await be.syncList('trpg_logs', logs, nextLogs, uid);
}

export interface MigrateResult { newInviteCode: string | null; comments: number }

/** 관리자 로그인 때 한 번 (세션마다) */
export async function runSecurityMigration(be: Backend, uid: string): Promise<MigrateResult> {
  const out: MigrateResult = { newInviteCode: null, comments: 0 };
  try { out.newInviteCode = await be.ensureInviteCode(); } catch (e) { console.warn('[ohome] 가입코드 확인 실패', e); }

  let flags: Flags = {};
  try { flags = (await be.fetchSetting<Flags>(FLAG_KEY)) ?? {}; } catch { /* 처음 */ }
  const done = { ...flags };

  if (!flags.posts) {
    try {
      // 비밀글 → 비공개 (metaOf가 secret을 private으로 계산한다)
      const posts = await be.fetchList<ListItem>('posts');
      const secret = posts.filter(p => p.secret === true);
      if (secret.length) await be.refreshVis('posts', secret, uid);
      done.posts = true;
    } catch (e) { console.warn('[ohome] 비밀글 옮기기 실패', e); }
  }
  if (!flags.trpg) {
    try { await migrateTrpg(be, uid); done.trpg = true; } catch (e) { console.warn('[ohome] TRPG 비밀번호 옮기기 실패', e); }
  }
  try { out.comments = await resyncCommentMeta(be, uid); } catch (e) { console.warn('[ohome] 댓글 공개범위 맞추기 실패', e); }

  if (done.posts !== flags.posts || done.trpg !== flags.trpg) {
    try { await be.saveSetting(FLAG_KEY, done); } catch { /* 다음 로그인 때 다시 */ }
  }
  return out;
}
