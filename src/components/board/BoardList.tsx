'use client';
// 일반 게시판 목록 (4.2 / 5.2 다중 게시판) — 공지 필터 · 검색 · 비밀글 마스킹 · 접기 표시 · 페이지네이션
// /board/b/<게시판 주소> 로 게시판 구분 (없으면 기본 게시판, v2.4) · 리스트 스킨: 기본형 / 갤러리형 1·2 (v2.3)
// 옛 주소 /board?b=<id> 로 들어오면 새 주소로 바꿔 준다
// 게시판 통합 검색(`/search?q=`, 메인 검색 위젯)도 이 화면을 기본형 스킨으로 그대로 쓴다 — 목록과 같은 모양
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, Post, fmtListDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor, postMatches,
} from '@/lib/postStore';
import {
  useBoardSettings, useBoards, boardBadgeStyle, boardHref, MAIN_BOARD_ID, BoardPerm, perPageOf,
  findBoardByKey, postNumbers, postHref,
} from '@/lib/boardStore';
import { useMenuSettings, canViewHref } from '@/lib/menuStore';
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

/** 호버(PC)·터치(모바일) 때만 나타나는 오른쪽 화살표 — 반투명 원 + 흰 화살표 (v2.5 사용자 요청) */
function Chevron() {
  return (
    <span className="go" aria-hidden>
      <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8h9.5M8.5 4 12.5 8 8.5 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** `searchAll` — 게시판 통합 검색 모드 (메인 검색 위젯 → `/search?q=`).
 *  게시판 하나 대신 이 방문자가 볼 수 있는 모든 게시판의 글에서 찾고, 스킨은 늘 기본형(리스트)으로 그린다 */
export function BoardInner({ searchAll = false }: { searchAll?: boolean }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const params = useSearchParams();
  const pathname = usePathname();
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
  const canon = boardsLoaded && !searchAll ? boardHref(bid, boards) : null;
  const cur = key ? `/board/b/${want}` : want ? `/board?b=${want}` : '/board';
  useEffect(() => {
    if (canon && cur !== canon) router.replace(canon);
  }, [canon, cur, router]);

  // 댓글 수 — 댓글은 글과 따로 저장된다 (v2.0). 옛 글 안에 남아 있던 것도 함께 센다
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const cmtCount = (p: Post) => commentsFor(cmtRows, 'post', p.id, p.comments).length;
  const { st: boardSet } = useBoardSettings();   // 시스템 뱃지 색 (환경설정 > 게시판 관리)
  const [cat, setCat] = useState('전체');
  /* 페이지 번호·검색어는 주소(`?page=3&q=단어`)에 둔다 (v2.5 사용자 요청) — 컴포넌트 상태로만 두면 글을 읽고
     뒤로가기(iOS 스와이프 포함)했을 때 목록이 새로 그려지며 1페이지·검색 전으로 돌아갔다.
     1페이지이거나 검색어가 없으면 그 값은 주소에서 뺀다.
     push가 아니라 replace로 바꿔서, 페이지를 넘길 때마다 방문 기록이 쌓이지는 않게 한다 */
  const page = Math.max(1, parseInt(params.get('page') ?? '', 10) || 1);
  const q = (params.get('q') ?? '').trim();
  const setUrl = (next: { page?: number; q?: string }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.page !== undefined) {
      if (next.page <= 1) sp.delete('page'); else sp.set('page', String(next.page));
    }
    if (next.q !== undefined) {
      const v = next.q.trim();
      if (v) sp.set('q', v); else sp.delete('q');
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setPage = (n: number) => setUrl({ page: n });

  // 게시판 전환 시 분류 초기화 — 페이지·검색어는 새 게시판 주소에 없으니 저절로 비워진다
  const [prevBid, setPrevBid] = useState(bid);
  if (prevBid !== bid) { setPrevBid(bid); setCat('전체'); }

  /* 통합 검색에서는 메뉴에서 감춘 게시판의 글은 뺀다 — 메뉴·위젯·페이지 차단과 같은 판정(canViewHref).
     「주소로는 열람 허용」 게시판도 감춘 것이므로 목록에 띄우지 않는다 */
  const [menuSet, , menuLoaded] = useMenuSettings();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const searchable = new Set(boards.filter(b => canViewHref(menuSet, boardHref(b.id, boards), viewer)).map(b => b.id));
  const boardKey = [...searchable].join(',');

  // 권한 3단계 — mock 단계에선 로그인 전제 (로드뷰 4.10과 동일 규칙)
  const allow = (p: BoardPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);

  const visible = useMemo(() => {
    const inBoard = searchAll
      ? (id: string) => boardKey.split(',').includes(id)
      : (id: string) => id === board.id;
    let list = posts.filter(p => inBoard(p.boardId ?? MAIN_BOARD_ID));
    // 통합 검색은 검색어가 있을 때만 결과를 보여 준다 — 빈 검색어로 전체 글이 쏟아지지 않게
    if (searchAll && !q) list = [];
    if (cat === '공지') list = list.filter(p => p.notice);
    // 제목·작성자·태그(v2.0)·본문 — 본문은 화면에 보이는 글자만, 비밀글 본문은 읽을 수 있는 사람만
    if (q) {
      const k = q.toLowerCase();
      list = list.filter(p => postMatches(p, k, isAdmin || (!!p.authorId && p.authorId === user?.id)));
    }
    // 공지 상단 고정 + 최신순
    return list.sort((a, b) =>
      (b.notice ? 1 : 0) - (a.notice ? 1 : 0) || b.date.localeCompare(a.date));
  }, [posts, board.id, cat, q, searchAll, boardKey, isAdmin, user?.id]);

  // 페이지당 글 수 — 환경설정 > 게시판 관리에서 모든 게시판 공통으로 지정 (v2.3)
  const perPage = perPageOf(boardSet);
  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  // 글이 지워져 페이지 수가 줄었거나 아직 불러오는 중이면 마지막 페이지로 맞춰 보여 준다 (주소는 그대로)
  const curPage = Math.min(page, totalPages);
  const pageList = visible.slice((curPage - 1) * perPage, curPage * perPage);
  /* 비밀글 열람 (v2.0 발견) — authorId 없는 비밀글은 비로그인 방문자에게도 열렸다.
     둘 다 undefined라 `undefined === undefined`가 참이었기 때문 */
  const canRead = (p: Post) => !p.secret || isAdmin || (!!p.authorId && p.authorId === user?.id);

  if (!boardsLoaded || (searchAll && !menuLoaded)) return <section className="page board-page" />;
  // 통합 검색 결과는 늘 기본형 리스트로 — 게시판마다 스킨이 달라도 한 목록에 섞이므로
  const skin = searchAll ? 'list' : board.skin;
  const boardName = (p: Post) => boards.find(b => b.id === (p.boardId ?? MAIN_BOARD_ID))?.name ?? '';

  const postBadge = (p: Post) => (p.notice || p.secret) ? (
    <span style={boardBadgeStyle(boardSet.system[p.notice ? 0 : 1])}>
      {boardSet.system[p.notice ? 0 : 1].label}
    </span>
  ) : null;

  return (
    <section className="page board-page">
      {searchAll ? (
        <div className="page-head">
          <PageTitle href="/search">SEARCH</PageTitle>
          <p>{q ? `‘${q}’ 검색 결과 ${visible.length}개 · 모든 게시판의 제목·작성자·태그·본문` : '검색어를 입력하세요 · 모든 게시판의 제목·작성자·태그·본문에서 찾습니다'}</p>
        </div>
      ) : (
        <div className="page-head">
          <PageTitle href={boardHref(board.id, boards)}>{board.id === MAIN_BOARD_ID ? 'BOARD' : board.name}</PageTitle>
          <EditableDesc k={board.id === MAIN_BOARD_ID ? 'board-desc' : `board-desc-${board.id}`} def={board.desc} />
        </div>
      )}
      <div className="toolrow">
        <div className="seg">
          {['전체', '공지'].map(c => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setPage(1); }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar key={searchAll ? q : bid} initial={q} onSearch={v => setUrl({ q: v, page: 1 })} />
          {!searchAll && allow(board.permWrite) && !!user && (
            <button className="btn btn-dark" onClick={() => router.push(board.id === MAIN_BOARD_ID ? '/board/write' : `${boardHref(board.id, boards)}/write`)}>✎ WRITE</button>
          )}
        </div>
      </div>

      {skin === 'gallery' || skin === 'gallery2' ? (
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
                  <small>{fmtListDate(p.date)}</small>
                </div>
                <Chevron />
              </div>
            );
          })}
          {pageList.length === 0 && (
            <div className="panel" style={{ gridColumn: '1 / -1', padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>게시글이 없습니다</div>
          )}
        </div>
      ) : (
        /* 기본형 스킨 — 리스트 행 (글씨색은 게시판 관리에서 지정 가능, v1.9) */
        <div className="panel board-list flush" style={!searchAll && board.fg ? { color: board.fg } : undefined}>
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
                {/* 통합 검색 — 어느 게시판 글인지 태그 자리 끝에 작게 */}
                {searchAll && boardName(p) && <span className="tags bsrc">{boardName(p)}</span>}
              </div>
              <span className="who">{p.author}</span>
              <span className="dt">{fmtListDate(p.date)}</span>
              <Chevron />
            </div>
          ))}
          {pageList.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>
              {searchAll ? (q ? '검색 결과가 없습니다' : '검색어를 입력하세요') : '게시글이 없습니다'}
            </div>
          )}
        </div>
      )}
      <Pager page={curPage} total={totalPages} onChange={setPage} />
    </section>
  );
}
