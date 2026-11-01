'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useBoards, MAIN_BOARD_ID, postNumbers, postHref } from '@/lib/boardStore';
import { BOARD_SEED, Post, useLocalList } from '@/lib/postStore';

/** 작성일 — 저장값은 UTC(ISO)라 앞 10글자를 자르면 한국 시간 오전 9시 전 글이 하루 전 날짜로 나온다.
 *  보는 사람의 현지 날짜로 바꿔 표시한다 */
const ymdLocal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
import { KInput, KSelect, Pager } from '@/components/ui/Kit';

const PER_PAGE = 20;

function PostList() {
  const { isAdmin } = useAuth();
  const { boards, loaded: boardsLoaded } = useBoards();
  const [posts, setPosts, postsLoaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const nums = postNumbers(posts);   // 글 주소는 번호로 (v2.4)
  const [query, setQuery] = useState('');
  const [boardId, setBoardId] = useState('');
  const [page, setPage] = useState(1);
  const boardOptions = boards.map(b => ({ value: b.id, label: b.name }));
  const missingBoards = [...new Set(posts.map(p => p.boardId ?? MAIN_BOARD_ID))]
    .filter(id => !boards.some(b => b.id === id));
  const boardName = (id: string) => boards.find(b => b.id === id)?.name ?? `삭제된 게시판 (${id})`;
  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();
    return posts.filter(p =>
      (!boardId || (p.boardId ?? MAIN_BOARD_ID) === boardId) &&
      (!key || p.title.toLowerCase().includes(key) || p.author.toLowerCase().includes(key)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [posts, boardId, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const move = (post: Post, destination: string) => {
    if (!isAdmin || !postsLoaded || !boardsLoaded || !boards.some(b => b.id === destination)) return;
    if ((post.boardId ?? MAIN_BOARD_ID) === destination) return;
    setPosts(posts.map(p => p.id === post.id ? { ...p, boardId: destination } : p));
  };

  return (
    <>
      <div className="toolrow" style={{ flexWrap: 'wrap', gap: 12 }}>
        <KSelect value={boardId} onChange={value => { setBoardId(value); setPage(1); }}
          options={[
            { value: '', label: '전체 게시판' },
            ...boardOptions,
            ...missingBoards.map(id => ({ value: id, label: boardName(id) })),
          ]} />
        <KInput aria-label="제목 또는 작성자 검색" placeholder="제목·작성자 검색" value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }} />
      </div>
      {!postsLoaded || !boardsLoaded ? <p role="status">게시글을 불러오는 중…</p> : (
        <>
          <p className="hint">총 {filtered.length}개 · 게시판을 선택하면 바로 이동합니다</p>
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr>
                {['제목', '현재 게시판', '작성자', '작성일', '게시판 이동'].map(label =>
                  <th key={label} scope="col" style={{ padding: 12, whiteSpace: 'nowrap' }}>{label}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(post => {
                  const currentBoard = post.boardId ?? MAIN_BOARD_ID;
                  return (
                    <tr key={post.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: 12 }}>
                        <Link href={postHref(post, nums)}>{post.secret && '🔒 '}{post.notice && '[공지] '}{post.title}</Link>
                      </td>
                      <td style={{ padding: 12 }}>{boardName(currentBoard)}</td>
                      <td style={{ padding: 12 }}>{post.author}</td>
                      <td style={{ padding: 12, whiteSpace: 'nowrap' }}><time dateTime={post.date}>{ymdLocal(post.date)}</time></td>
                      <td style={{ padding: 12 }}>
                        <KSelect value={currentBoard} onChange={value => move(post, value)}
                          options={[
                            ...(!boards.some(b => b.id === currentBoard)
                              ? [{ value: currentBoard, label: boardName(currentBoard) }] : []),
                            ...boardOptions,
                          ]} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center' }}>게시글이 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager page={currentPage} total={totalPages} onChange={setPage} />
        </>
      )}
    </>
  );
}

export default function AdminPostsPage() {
  const { isAdmin, ready } = useAuth();
  return (
    <section className="page">
      <div className="page-head"><h1>전체 게시글 관리</h1></div>
      {!ready ? <p role="status">권한을 확인하는 중…</p>
        : !isAdmin ? <p>관리자만 접근할 수 있습니다</p>
          : <><p><Link href="/settings">환경설정</Link></p><PostList /></>}
    </section>
  );
}
