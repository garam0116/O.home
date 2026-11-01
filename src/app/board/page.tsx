'use client';
// 일반 게시판 목록 (4.2 / 5.2 다중 게시판) — 공지 필터 · 검색 · 비밀글 마스킹 · 접기 표시 · 페이지네이션
// /board/b/<게시판 주소> 로 게시판 구분 (없으면 기본 게시판, v2.4) · 리스트 스킨: 기본형 / 갤러리형 1·2 (v2.3)
// 옛 주소 /board?b=<id> 로 들어오면 새 주소로 바꿔 준다
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, Post, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import {
  useBoardSettings, useBoards, boardBadgeStyle, boardHref, MAIN_BOARD_ID, BoardPerm, perPageOf,
  findBoardByKey, postNumbers, postHref,
} from '@/lib/boardStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

/** 본문에서 첫 이미지 추출 — 갤러리 스킨 썸네일용 (HTML img / MD 이미지) */
function firstImage(body: string): string | null {
  const html = /<img[^>]*src=["']([^"']+)["']/i.exec(body);
  if (html) return html[1];
  const md = /!\[[^\]]*\]\(([^)\s]+)/.exec(body);
  return md ? md[1] : null;
}

function BoardInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const params = useSearchParams();
  // 주소의 게시판 — `/board/b/{key}`(별명·이름에서 만든 값·id) 또는 옛 `?b={id}` (v2.4)
  const { key } = useParams<{ key?: string }>();
  const want = key ? decodeURIComponent(key) : params.get('b');
  const { boards, loaded: boardsLoaded } = useBoards();
  const board = (want ? findBoardByKey(want, boards) : undefined) ?? boards[0];
  const bid = board.id;
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  // 글 번호 (v2.4) — 글 주소 /board/{번호}
  const nums = useMemo(() => postNumbers(posts), [posts]);

  /* 옛 주소·id 주소로 들어오면 지금 주소로 바꿔 둔다 (v2.4) — 공유해 둔 `/board?b=id` 링크도 열리고,
     주소창에는 `/board/b/별명`이 남는다. 없는 게시판이면 기본 게시판으로 */
  const canon = boardsLoaded ? boardHref(bid, boards) : null;
  const cur = key ? `/board/b/${want}` : want ? `/board?b=${want}` : '/board';
  useEffect(() => {
    if (canon && cur !== canon) router.replace(canon);
  }, [canon, cur, router]);

  // 댓글 수 — 댓글은 글과 따로 저장된다 (v2.0). 옛 글 안에 남아 있던 것도 함께 센다
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const cmtCount = (p: Post) => commentsFor(cmtRows, 'post', p.id, p.comments).length;
  const { st: boardSet } = useBoardSettings();   // 시스템 뱃지 색 (환경설정 > 게시판 관리)
  const [cat, setCat] = useState('전체');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // 게시판 전환 시 필터·페이지 초기화
  const [prevBid, setPrevBid] = useState(bid);
  if (prevBid !== bid) { setPrevBid(bid); setCat('전체'); setQ(''); setPage(1); }

  // 권한 3단계 — mock 단계에선 로그인 전제 (로드뷰 4.10과 동일 규칙)
  const allow = (p: BoardPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);

  const visible = useMemo(() => {
    let list = posts.filter(p => (p.boardId ?? MAIN_BOARD_ID) === board.id);
    if (cat === '공지') list = list.filter(p => p.notice);
    if (q) {
      const k = q.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(k) ||
        p.author.toLowerCase().includes(k) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(k)) ||   // 태그 검색 (v2.0 사용자 요청)
        (!p.secret && p.body.toLowerCase().includes(k)));
    }
    // 공지 상단 고정 + 최신순
    return list.sort((a, b) =>
      (b.notice ? 1 : 0) - (a.notice ? 1 : 0) || b.date.localeCompare(a.date));
  }, [posts, board.id, cat, q]);

  // 페이지당 글 수 — 환경설정 > 게시판 관리에서 모든 게시판 공통으로 지정 (v2.3)
  const perPage = perPageOf(boardSet);
  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const pageList = visible.slice((page - 1) * perPage, page * perPage);
  /* 비밀글 열람 (v2.0 발견) — authorId 없는 비밀글은 비로그인 방문자에게도 열렸다.
     둘 다 undefined라 `undefined === undefined`가 참이었기 때문 */
  const canRead = (p: Post) => !p.secret || isAdmin || (!!p.authorId && p.authorId === user?.id);

  if (!boardsLoaded) return <section className="page board-page" />;

  const postBadge = (p: Post) => (p.notice || p.secret) ? (
    <span style={boardBadgeStyle(boardSet.system[p.notice ? 0 : 1])}>
      {boardSet.system[p.notice ? 0 : 1].label}
    </span>
  ) : null;

  return (
    <section className="page board-page">
      <div className="page-head">
        <PageTitle href={boardHref(board.id, boards)}>{board.id === MAIN_BOARD_ID ? 'BOARD' : board.name}</PageTitle>
        <EditableDesc k={board.id === MAIN_BOARD_ID ? 'board-desc' : `board-desc-${board.id}`} def={board.desc} />
      </div>
      <div className="toolrow">
        <div className="seg">
          {['전체', '공지'].map(c => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setPage(1); }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar onSearch={v => { setQ(v); setPage(1); }} />
          {allow(board.permWrite) && !!user && (
            <button className="btn btn-dark" onClick={() => router.push(board.id === MAIN_BOARD_ID ? '/board/write' : `${boardHref(board.id, boards)}/write`)}>✎ WRITE</button>
          )}
        </div>
      </div>

      {board.skin === 'gallery' || board.skin === 'gallery2' ? (
        /* 갤러리형 스킨 (v2.3 — 티켓형 대체) — 3열 5:6 카드, 그림 위에 제목·날짜.
           1 = 하단 옅은 그림자 + 흰 글씨 · 2 = 반투명 흰 띠 + 글씨.
           뱃지는 공지·비밀·접힘일 때만 왼쪽 위에 작게 — 모든 카드에 붙으면 시선이 흩어진다 */
        <div className={`bgal ${board.skin === 'gallery2' ? 'bgal-2' : 'bgal-1'}`}>
          {pageList.map(p => {
            const readable = canRead(p);
            // 대표 이미지(직접 선택 + 크롭) 우선, 없으면 본문 첫 이미지
            const thumb = readable ? (p.thumbSrc ?? firstImage(p.body)) : null;
            const badge = postBadge(p) ?? (p.fold ? <span style={boardBadgeStyle(boardSet.system[2])}>{boardSet.system[2].label}</span> : null);
            return (
              <div className={`bgal-card${thumb ? '' : ' no-thumb'}`} key={p.id}
                onClick={() => { if (readable) router.push(postHref(p, nums)); }}>
                {thumb
                  ? <CroppedBlobImg fileRef={thumb} crop={p.thumbSrc ? p.thumbCrop : undefined} />
                  : <span className="bgal-ph">{readable ? (p.title.trim()[0] ?? '·') : '🔒'}</span>}
                {badge && <div className="bgal-badge">{badge}</div>}
                <div className="bgal-tx" style={board.fg && board.skin === 'gallery2' ? { color: board.fg } : undefined}>
                  <b>
                    {readable ? <>{p.secret && '🔒 '}{p.title}</> : '비밀글입니다'}
                    {readable && cmtCount(p) > 0 && <span className="cmt">{cmtCount(p)}</span>}
                  </b>
                  <small>{fmtDate(p.date)}</small>
                </div>
              </div>
            );
          })}
          {pageList.length === 0 && (
            <div className="panel" style={{ gridColumn: '1 / -1', padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>게시글이 없습니다</div>
          )}
        </div>
      ) : (
        /* 기본형 스킨 — 리스트 행 (글씨색은 게시판 관리에서 지정 가능, v1.9) */
        <div className="panel board-list flush" style={board.fg ? { color: board.fg } : undefined}>
          {pageList.map(p => (
            <div className="brow" key={p.id} onClick={() => { if (canRead(p)) router.push(postHref(p, nums)); }}>
              <span className="cat">{postBadge(p)}</span>
              {/* 제목 칸 안에서 태그를 오른쪽 끝(=작성자 바로 왼쪽)에 정렬 (v2.0 사용자 요청) —
                  칸을 따로 만들면 행마다 그리드가 독립이라 작성자 열이 태그 길이만큼 어긋난다 */}
              <div className="tcell">
                {canRead(p) && p.thumbSrc && (
                  <div className="board-thumb">
                    <CroppedBlobImg fileRef={p.thumbSrc} crop={p.thumbCrop} />
                  </div>
                )}
                {canRead(p) ? (
                  <b>
                    {p.secret && '🔒 '}{p.title}
                    {cmtCount(p) > 0 && <span className="cmt">{cmtCount(p)}</span>}
                    {p.fold && <span style={{ ...boardBadgeStyle(boardSet.system[2]), marginLeft: 6 }}>{boardSet.system[2].label}</span>}
                  </b>
                ) : (
                  <b style={{ color: 'var(--faint)' }}>🔒 비밀글입니다</b>
                )}
                {canRead(p) && (p.tags ?? []).length > 0 && (
                  <span className="tags">{(p.tags ?? []).map(t => <i key={t}>#{t}</i>)}</span>
                )}
              </div>
              <span className="who">{p.author}</span>
              <span className="dt">{fmtDate(p.date)}</span>
            </div>
          ))}
          {pageList.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>게시글이 없습니다</div>
          )}
        </div>
      )}
      <Pager page={page} total={totalPages} onChange={setPage} />
    </section>
  );
}

export default function BoardPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><BoardInner /></Suspense>;
}
