'use client';
/**
 * 메뉴를 비공개로 두면 **글도 비공개로 저장한다** (v2.0 사용자 요청).
 *
 * 여태 메뉴 공개범위는 화면에서 가리는 것뿐이었다 — 글은 `visibility: 'public'`으로 저장돼 있어
 * 서버(RLS)가 누구에게든 그 행을 내줬다. 주소를 막아도 API를 직접 부르면 그대로 보인다는 뜻이다.
 * 그래서 **저장할 때** 그 글이 걸린 메뉴의 공개범위를 「최소 기준」으로 삼는다:
 *
 *   메뉴 전체 보임 → 글 그대로   ·   회원만 → 최소 `member`   ·   관리자만 → 최소 `private`
 *
 * 글 자체가 더 좁으면(비공개 글) 그대로 둔다 — **좁히기만 하고 넓히지 않는다.**
 * 글에 `visibility` 칸이 아예 없는 종류(게시판 글 등)도 여기서 정해지므로 타입을 안 고쳐도 된다.
 */
import { currentMenuSettings, hrefAccess } from './menuStore';
import { MAIN_SEC, sectionHref, type SectionKind } from './sectionStore';
import { MAIN_BOARD_ID, boardHref } from './boardStore';
import type { Visibility } from './relStore';
import { metaOf, type ListItem } from './backend/types';

/** 컬렉션 → 그 목록이 걸린 메뉴. 섹션형은 종류만 주고 소속은 항목의 `secId`에서 읽는다 */
const AREA: Record<string, { kind?: SectionKind; href?: string; board?: boolean }> = {
  posts: { board: true },              // 게시판은 섹션이 아니라 `?b=`로 갈린다
  gallery: { kind: 'gallery' },
  roadview: { kind: 'roadview' },
  trpg_logs: { kind: 'trpg' },
  trpg_log_bodies: { kind: 'trpg' },   // 본문은 별도 문서 — 목록만 막으면 본문이 그대로 남는다
  diary: { kind: 'diary' },
  threads: { kind: 'threads' },
  relations: { kind: 'rels' },
  archive: { href: '/archive' },
};

/** 이 항목이 걸린 메뉴 주소 — 어디에도 안 걸리는 컬렉션(댓글·답변 등)은 null */
export function areaHrefOf(coll: string, item: ListItem): string | null {
  const a = AREA[coll];
  if (!a) return null;
  if (a.href) return a.href;
  if (a.board) {
    const b = typeof item.boardId === 'string' ? item.boardId : MAIN_BOARD_ID;
    return boardHref(b);   // 메뉴에 적히는 주소와 같아야 한다 — /board/b/별명 (v2.4)
  }
  const s = typeof item.secId === 'string' ? item.secId : MAIN_SEC;
  return sectionHref(a.kind!, s);
}

/** 이 항목을 저장할 때 지켜야 할 **최소** 공개범위 */
export function visFloorOf(coll: string, item: ListItem): Visibility {
  // 댓글은 달린 글의 공개범위를 따른다 (보안 검토) — 예전엔 늘 공개로 저장돼 비밀글·회원 전용
  // 글에 달린 댓글도 비로그인 방문자에게 그대로 내려갔다. 값은 댓글을 쓸 때 commentTargetMeta가 채운다
  if (coll === 'comments') {
    const tv = item.targetVis;
    return tv === 'member' || tv === 'private' ? tv : 'public';
  }
  const href = areaHrefOf(coll, item);
  if (!href) return 'public';
  const v = hrefAccess(currentMenuSettings(), href);
  return v === 'admin' ? 'private' : v === 'member' ? 'member' : 'public';
}

const RANK: Record<string, number> = { public: 0, member: 1, pw: 1.5, private: 2 };

/** 둘 중 더 좁은 쪽 */
export const strictestVis = (a: string, b: string): string =>
  ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

/** 댓글을 저장할 때 함께 적을 「달린 글」 정보 (보안 검토).
 *  · targetVis — 그 글이 실제로 저장되는 공개범위(비밀글·메뉴 비공개 반영). 댓글도 이 범위로 저장된다
 *  · targetAuthorId — 그 글의 작성자. 비밀글에 관리자가 단 답글을 글쓴이가 읽을 수 있게 규칙이 본다
 *  targetColl: 글이 있는 컬렉션 (posts · roadview · threads) */
export function commentTargetMeta(targetColl: string, target: { id: string } | undefined | null): {
  targetVis: 'public' | 'member' | 'private'; targetAuthorId?: string;
} {
  if (!target) return { targetVis: 'public' };
  const it = target as ListItem;
  const { visibility, authorId } = metaOf(it, null, visFloorOf(targetColl, it));
  const targetVis = visibility === 'member' ? 'member' : visibility === 'public' ? 'public' : 'private';
  return { targetVis, ...(authorId ? { targetAuthorId: authorId } : {}) };
}

/** 댓글 대상 종류 → 그 글이 있는 컬렉션 */
export const COMMENT_TARGET_COLL = { post: 'posts', road: 'roadview', thread: 'threads' } as const;
