'use client';
// 게시판 본문 분리 저장 — 목록에 남길 검색·썸네일용 요약도 저장 시 함께 계산한다.
import { editorIdsOf, type Backend, type ListItem } from './backend/types';
import { fetchItem, saveItem, deleteItem } from './db';
import { strictestVis, visFloorOf } from './visFloor';
import type { CommentRow, Post } from './postStore';

export const POST_BODY_COLLECTION = 'post_bodies';

export interface PostBody extends ListItem {
  body: string;
  authorId: string;
  visibility: string;
  editorIds: string[];
}

export function firstPostImage(body: string): string | null {
  const html = /<img[^>]*src=["']([^"']+)["']/i.exec(body);
  if (html) return html[1];
  const md = /!\[[^\]]*\]\(([^)\s]+)/.exec(body);
  return md ? md[1] : null;
}

function excerptText(body: string): string {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function postSummary(
  post: Post, removeLegacyComments = false, storedVisibility?: string,
  storedAuthorId?: string | null, storedEditorIds?: string[],
): Post {
  const { body = '', ...summary } = post;
  const hasBody = typeof post.body === 'string';
  const visibility = storedVisibility ?? (typeof post.visibility === 'string' ? post.visibility : undefined);
  const grants = storedEditorIds
    ? storedEditorIds.map(userId => ({ userId, level: 'edit' }))
    : undefined;
  const out: Post = {
    ...summary,
    thumbAuto: post.secret ? null : hasBody ? firstPostImage(body) : (post.thumbAuto ?? null),
    excerpt: post.secret ? '' : hasBody ? excerptText(body) : (post.excerpt ?? ''),
    ...(visibility ? { visibility: strictestVis(visibility, visFloorOf('posts', post)) } : {}),
    ...(storedAuthorId ? { authorId: storedAuthorId } : {}),
    ...(grants ? { grants } : {}),
  };
  if (removeLegacyComments) delete out.comments;
  return out;
}

export function postBodyItem(
  post: Post, uid: string | null, storedVisibility?: string, storedAuthorId?: string | null,
  storedEditorIds?: string[],
): PostBody {
  const grants = storedEditorIds
    ? storedEditorIds.map(userId => ({ userId, level: 'edit' }))
    : Array.isArray(post.grants) ? post.grants : undefined;
  return {
    id: post.id,
    body: post.body ?? '',
    authorId: (storedAuthorId ?? post.authorId) || uid || '',
    visibility: post.secret ? 'private' : strictestVis(storedVisibility ?? 'public', visFloorOf('posts', post)),
    editorIds: storedEditorIds ?? editorIdsOf({ ...post, id: post.id }),
    ...(grants ? { grants } : {}),
    boardId: post.boardId,
  };
}

export async function fetchPostBody(id: string): Promise<PostBody | null> {
  return fetchItem<PostBody>(POST_BODY_COLLECTION, id);
}

export async function savePostBody(post: Post, uid: string | null, visibilityOverride?: string): Promise<void> {
  const visibility = visibilityOverride ?? (typeof post.visibility === 'string' ? post.visibility : undefined);
  await saveItem(POST_BODY_COLLECTION, postBodyItem(post, uid, visibility), uid);
}

export async function deletePostBody(id: string): Promise<void> {
  await deleteItem(POST_BODY_COLLECTION, id);
}

/** 기존 글을 안전하게 옮긴 뒤 목록 문서에서 본문을 제거한다. 일부 실패 후 다시 실행해도 같은 결과가 된다. */
export async function migratePostBodies(
  be: Backend,
  uid: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<{ posts: number; bodies: number }> {
  const sourceRows = await be.fetchListWithMeta<Post>('posts');
  const posts = sourceRows.map(row => row.item);
  const existingComments = await be.fetchList<CommentRow>('comments');
  const knownComments = new Set(existingComments.map(c => c.id));
  const legacyComments: CommentRow[] = [];
  for (const post of posts) {
    for (const comment of post.comments ?? []) {
      if (knownComments.has(comment.id)) continue;
      knownComments.add(comment.id);
      legacyComments.push({ ...comment, target: 'post', targetId: post.id });
    }
  }

  let bodies = 0;
  const withBodies = sourceRows.filter(row => typeof row.item.body === 'string');
  for (let i = 0; i < withBodies.length; i += 20) {
    const part = withBodies.slice(i, i + 20);
    await Promise.all(part.map(row => be.saveItem(POST_BODY_COLLECTION, postBodyItem(
      row.item, uid, row.visibility, row.authorId, row.editorIds,
    ), uid)));
    bodies += part.length;
    onProgress?.(bodies, withBodies.length);
  }
  if (legacyComments.length) {
    await be.syncList('comments', existingComments, [...existingComments, ...legacyComments], uid);
  }
  await be.syncList('posts', posts, sourceRows.map(row => postSummary(
    row.item, true, row.visibility, row.authorId, row.editorIds,
  )), uid);
  return { posts: posts.length, bodies };
}
