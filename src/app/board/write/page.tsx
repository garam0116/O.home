'use client';
// 게시판 글쓰기/수정 (4.2 / 5.2 다중 게시판) — MD/HTML 모드 선택 + 미리보기 팝업 + 접기/비밀글/공지 설정
// ?edit=<글 id> 로 진입하면 수정 모드 (작성자·관리자만)
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, BOARD_SEED, Post, newId, FoldType } from '@/lib/postStore';
import { useBoards, boardHref, MAIN_BOARD_ID, postNumbers, findPostByKey, findBoardByKey } from '@/lib/boardStore';
import { allocNo } from '@/lib/itemNo';
import { renderBody } from '@/lib/sanitize';
import { KInput, KTextarea, KCheck } from '@/components/ui/Kit';
import { CropEditor, CropImg, CropValue } from '@/components/ui/CropEditor';
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import { CodeEditor } from '@/components/ui/CodeEditor';
import { RichEditor } from '@/components/ui/RichEditor';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { FileDrop } from '@/components/ui/FileDrop';
import { useBlobUrl } from '@/lib/blobStore';
import { putThumbnail } from '@/lib/thumbnail';

/** 에디터가 다루지 못해 정리될 만한 태그·속성이 있는가 — 전환 경고 판단 (인트로와 같은 기준) */
const hasRichHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|div|span|section|article|video|audio|details|summary|font|center)\b/i.test(html)
  || /\s(style|class|id)\s*=/i.test(html);

function isImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch { return false; }
}

/** ISO → 로컬 날짜 'YYYY-MM-DD' (date 입력값) */
const toDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 고른 날짜 + 기준 시각(시·분·초)으로 ISO — 같은 날 글끼리 순서가 유지되게 시각은 살린다 */
const withDay = (day: string, base: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(base);
  t.setFullYear(y, m - 1, d);
  return t.toISOString();
};

function WriteInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  /* 주소 (v2.4) — 새 글 `/board/write` · `/board/b/{게시판}/write`, 수정 `/board/{번호}/edit`.
     옛 주소(`?b=`, `?edit=`)로 들어오면 아래에서 새 주소로 바꿔 준다 */
  const route = useParams<{ key?: string; id?: string }>();
  const editKey = route.id ? decodeURIComponent(route.id) : params.get('edit');
  const [posts, setPosts, postsLoaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const nums = useMemo(() => postNumbers(posts), [posts]);
  const editing = editKey ? findPostByKey(posts, editKey, nums) : undefined;
  const editPid = editing?.id ?? null;
  const { boards, loaded: boardsLoaded } = useBoards();
  const wantBoard = route.key ? decodeURIComponent(route.key) : params.get('b');
  const bid = editing?.boardId ?? (wantBoard ? findBoardByKey(wantBoard, boards)?.id : undefined) ?? MAIN_BOARD_ID;
  const board = boards.find(b => b.id === bid) ?? boards[0];

  // 지금 주소로 맞추기 — 수정은 글 번호, 새 글은 게시판 주소 아래
  const canon = editKey
    ? (editing ? `/board/${nums.get(editing.id) ?? editing.id}/edit` : null)
    : boardsLoaded ? (board.id === MAIN_BOARD_ID ? '/board/write' : `${boardHref(board.id, boards)}/write`) : null;
  const qs = params.toString();
  const cur = (typeof window === 'undefined' ? '' : window.location.pathname) + (qs ? `?${qs}` : '');
  useEffect(() => {
    if (canon && decodeURIComponent(cur) !== canon) router.replace(canon);
  }, [canon, cur, router]);
  // 대표 썸네일 비율 — 갤러리형 게시판은 카드와 같은 5:6, 기본형은 목록 썸네일과 같은 16:9 (v2.3)
  const galleryThumb = board.skin === 'gallery' || board.skin === 'gallery2';
  const thumbRatio = galleryThumb ? '5/6' : '16/9';
  const [title, setTitle] = useState('');
  const [writeMode, setWriteMode] = useState<'editor' | 'md' | 'html'>('editor'); // 에디터가 기본
  const [body, setBody] = useState('');
  const [pvOpen, setPvOpen] = useState(false);   // 게시 전 미리보기 팝업 (사용자 요청)
  const [askRich, setAskRich] = useState<null | (() => void)>(null);   // 정리 경고 후 실행할 전환
  const [secret, setSecret] = useState(false);
  const [notice, setNotice] = useState(false);
  // 게시 일자 (사용자 요청) — 기본은 오늘, 과거·미래 날짜로 지정 가능
  const [day, setDay] = useState(() => toDay(new Date().toISOString()));
  // 태그 (v2.0 사용자 요청) — 쉼표로 구분해 입력, 저장할 때 배열로
  const [tagsText, setTagsText] = useState('');
  const parseTags = (s: string) =>
    [...new Set(s.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
  const [foldType, setFoldType] = useState<FoldType | 'none'>('none');
  const [foldLabel, setFoldLabel] = useState('');
  // 대표 이미지 — 별도 업로드 또는 본문 이미지 선택 + 16:9 썸네일 크롭
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const [thumbInput, setThumbInput] = useState('');
  const thumbInvalid = !!thumbInput.trim() && !isImageUrl(thumbInput.trim());
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(undefined);
  const [cropOpen, setCropOpen] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const thumbUrl = useBlobUrl(thumbSrc);
  // 본문 이미지 목록 — HTML <img> + Markdown 이미지
  const bodyImages = useMemo(() => {
    const out: string[] = [];
    for (const m of body.matchAll(/<img[^>]*src=["']([^"']+)["']/gi)) out.push(m[1]);
    for (const m of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) out.push(m[1]);
    return [...new Set(out)];
  }, [body]);

  // 수정 모드 — 저장본 로드가 끝나면 폼을 한 번 채움 (본문은 저장 모드 그대로: md→Markdown, html→HTML)
  const hydrated = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    if (!editPid || !postsLoaded || hydrated.current) return;
    const p = posts.find(x => x.id === editPid);
    if (!p) return;
    hydrated.current = true;
    setTitle(p.title); setBody(p.body);
    // 에디터로 쓴 글은 에디터로 다시 연다 — 예전에는 무조건 HTML 소스가 떠서
    // 에디터로 쓴 글을 수정하면 갑자기 태그가 보였다 (authored 없는 옛 글은 지금까지대로 HTML)
    setWriteMode(p.mode === 'md' ? 'md' : (p.authored === 'editor' ? 'editor' : 'html'));
    setSecret(p.secret); setNotice(p.notice);
    setDay(toDay(p.date));
    setFoldType(p.fold?.type ?? 'none'); setFoldLabel(p.fold?.label ?? '');
    setTagsText((p.tags ?? []).join(', '));
    setThumbSrc(p.thumbSrc); setThumbCrop(p.thumbCrop);
    setThumbInput(p.thumbSrc && isImageUrl(p.thumbSrc) ? p.thumbSrc : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPid, postsLoaded, posts]);

  const preview = useMemo(() => renderBody(writeMode === 'md' ? 'md' : 'html', body), [writeMode, body]);

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>WRITE</PageTitle><p>글쓰기는 로그인 후 이용할 수 있습니다</p></div>
      </section>
    );
  }

  const post = async () => {
    if (thumbBusy || saving.current) return;
    if (thumbInvalid) { toast('썸네일은 올바른 http(s) 이미지 URL을 입력해 주세요'); return; }
    if (!title.trim() || !body.trim()) { toast('제목과 내용을 입력해 주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { toast('일자를 입력해 주세요'); return; }
    if (editing) {
      // 수정 — 작성자 본인만 (관리자도 타인 글은 삭제만, v1.9). 작성자/댓글/소속 게시판은 유지 · 일자는 바꿀 수 있다
      if (editing.authorId !== user.id) { toast('수정은 작성자 본인만 할 수 있습니다'); return; }
      setPosts(posts.map(p => (p.id === editing.id ? {
        ...p,
        title: title.trim(), body,
        mode: writeMode === 'md' ? 'md' : 'html',
        authored: writeMode === 'editor' ? 'editor' : undefined,
        secret, notice: isAdmin ? notice : p.notice,
        date: day === toDay(p.date) ? p.date : withDay(day, p.date),
        tags: parseTags(tagsText),
        fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
        thumbSrc, thumbCrop,
      } : p)));
      toast('수정되었습니다');
      router.push(`/board/${nums.get(editing.id) ?? editing.id}`);
      return;
    }
    // 글 번호는 서버 카운터에서 받는다 (v2.4) — 못 보는 글과 번호가 겹치지 않게
    saving.current = true;   // 번호를 받는 사이 두 번 눌러 글이 둘 생기지 않게
    const no = await allocNo('ohome.board.v1', posts).finally(() => { saving.current = false; });
    const p: Post = {
      id: newId(), title: title.trim(), body,
      mode: writeMode === 'md' ? 'md' : 'html',
      author: user.nickname, authorId: user.id, date: withDay(day, new Date().toISOString()),
      secret, notice: isAdmin && notice,
      tags: parseTags(tagsText),
      fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
      comments: [],
      boardId: board.id,   // 소속 게시판 (5.2 다중 게시판)
      thumbSrc, thumbCrop,
      no,   // 글 번호 (v2.4) — 주소 /board/{번호}
    };
    setPosts([p, ...posts]);
    toast('등록되었습니다');
    router.push(`/board/${p.no}`);
  };

  return (
    <section className="page">
      {/* 큰 글씨 — 추가 게시판이면 그 이름(메뉴 관리 타이틀·이름이 우선), 누르면 그 게시판으로 복귀
          (v2.0 사용자 제보 — 「글쓰기에서 큰제목을 눌러도 안 돌아가고, 제목도 원래 것이 뜬다」) */}
      <div className="page-head"><PageTitle href={boardHref(board.id, boards)}>{board.id === MAIN_BOARD_ID ? (editing ? 'EDIT' : 'WRITE') : board.name}</PageTitle><EditableDesc k="board-write-desc" def="에디터 / Markdown / HTML — 스크립트는 저장 시 자동 제거" /></div>
      <div className="write-grid">
        {/* 좌: 본문 */}
        <div className="panel" style={{ padding: 24 }}>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>제목</label>
            <KInput value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>모드</label>
            <div className="mini-seg">
              {/* HTML로 쓴 글을 에디터로 열면 다루지 못하는 태그가 정리된다 — 되돌릴 수 없어 물어본다 (v2.0) */}
              <button className={writeMode === 'editor' ? 'on' : ''} onClick={() => {
                if (writeMode === 'html' && hasRichHtml(body)) { setAskRich(() => () => setWriteMode('editor')); return; }
                setWriteMode('editor');
              }}>에디터</button>
              <button className={writeMode === 'md' ? 'on' : ''} onClick={() => setWriteMode('md')}>Markdown</button>
              <button className={writeMode === 'html' ? 'on' : ''} onClick={() => setWriteMode('html')}>HTML</button>
            </div>
            {/* 미리보기 — 팝업으로 연다 (사용자 요청: SAVE 옆에서 이 자리로 이동, 「편집 가능 미리보기」는 삭제) */}
            <div className="mini-seg">
              {writeMode === 'html' && <button className="on" aria-pressed="true">코드</button>}
              <button onClick={() => setPvOpen(true)}>미리보기</button>
            </div>
          </div>
          {/* 본문 상자는 일정 높이까지만 늘고 그 뒤는 안에서 스크롤 (사용자 요청) */}
          {writeMode === 'editor' ? (
            <div className="write-editor">
              <RichEditor value={body} onChange={setBody} placeholder='내용을 작성하세요 — 이미지 삽입 가능 (스크립트 불허 6.3)' />
            </div>
          ) : writeMode === 'html' ? (
            // HTML 코드 — VS Code 느낌의 편집기 (사용자 요청)
            <CodeEditor value={body} onChange={setBody} placeholder='<div>HTML 코드를 작성/붙여넣기...</div>' />
          ) : (
            <KTextarea autoGrow={false} className="write-md"
              placeholder='마크다운으로 작성...'
              value={body} onChange={e => setBody(e.target.value)}
            />
          )}
          <div style={{ marginTop: 14 }}>
            <label className="k-label" style={{ marginBottom: 7 }}>썸네일 (선택)</label>
            <FileDrop accept="image/*" label={thumbBusy ? '썸네일 저장 중…' : '썸네일 이미지 업로드'}
              onFiles={async files => {
                if (!files[0] || thumbBusy) return;
                setThumbBusy(true);
                try {
                  const ref = await putThumbnail(files[0]);
                  setThumbSrc(ref); setThumbCrop(undefined); setThumbInput('');
                } catch (e) {
                  toast(`썸네일을 저장하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
                } finally { setThumbBusy(false); }
              }} />
            <label className="k-label" htmlFor="thumbnail-url" style={{ marginTop: 10 }}>이미지 URL</label>
            <KInput id="thumbnail-url" type="url" placeholder="https://example.com/image.jpg"
              value={thumbInput} disabled={thumbBusy}
              aria-invalid={thumbInvalid} aria-describedby={thumbInvalid ? 'thumbnail-url-error' : undefined}
              onChange={e => {
                const value = e.target.value;
                setThumbInput(value);
                setThumbSrc(isImageUrl(value.trim()) ? value.trim() : undefined);
                setThumbCrop(undefined);
              }} style={{ width: '100%' }} />
            {thumbInvalid && <p id="thumbnail-url-error" role="alert" className="hint">올바른 http(s) 이미지 URL을 입력해 주세요</p>}
            {thumbUrl && (
              <div style={{ marginTop: 10 }}>
                <button type="button" aria-label="썸네일 위치 조정" disabled={thumbBusy}
                  onClick={() => setCropOpen(true)}
                  style={{ display: 'block', position: 'relative', width: galleryThumb ? 140 : 200, maxWidth: '100%', aspectRatio: thumbRatio, overflow: 'hidden', borderRadius: 8 }}>
                  <CropImg src={thumbUrl} crop={thumbCrop} />
                </button>
                <button type="button" className="btn btn-ghost" disabled={thumbBusy}
                  onClick={() => { setThumbSrc(undefined); setThumbCrop(undefined); setThumbInput(''); }}>썸네일 삭제</button>
              </div>
            )}
          </div>
          {bodyImages.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label className="k-label" style={{ marginBottom: 7 }}>본문에서 썸네일 선택</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {bodyImages.map(src => (
                  <div key={src}
                    data-tip={thumbSrc === src ? '썸네일 위치 조정' : '대표로 선택'}
                    onClick={() => { if (thumbBusy) return; setThumbInput(''); if (thumbSrc !== src) { setThumbSrc(src); setThumbCrop(undefined); } setCropOpen(true); }}
                    style={{
                      width: galleryThumb ? 80 : 104, aspectRatio: thumbRatio, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                      position: 'relative', flexShrink: 0,
                      outline: thumbSrc === src ? '2px solid var(--accent)' : '1px solid var(--line)', outlineOffset: 2,
                    }}>
                    <CropImg src={src} crop={thumbSrc === src ? thumbCrop : undefined} />
                    {thumbSrc === src && (
                      <span style={{
                        position: 'absolute', right: 4, top: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
                        background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 999,
                      }}>대표</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* 우: 설정 */}
        <div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>설정</h4>
            <div className="form-row">
              <label className="k-label" style={{ width: 60 }}>일자</label>
              <KInput type="date" value={day} onChange={e => setDay(e.target.value)} style={{ flex: 1 }} />
            </div>
            {/* 태그 (v2.0 사용자 요청) — 목록의 작성자 왼쪽에 나열되고 검색에 걸린다 */}
            <div className="form-row">
              <label className="k-label" style={{ width: 60 }}>태그</label>
              <KInput value={tagsText} onChange={e => setTagsText(e.target.value)}
                placeholder="쉼표로 구분" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              <KCheck label="비밀글 (관리자와 나만 열람)" checked={secret} onChange={setSecret} />
              {isAdmin && <KCheck label="공지로 고정" checked={notice} onChange={setNotice} />}
            </div>
          </div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>접기 (6.2)</h4>
            <div style={{ display: 'grid', gap: 9 }}>
              <KCheck label="스포일러 접기" checked={foldType === 'spoiler'}
                onChange={v => setFoldType(v ? 'spoiler' : 'none')} />
              <KCheck label="수위 주의 접기" checked={foldType === 'adult'}
                onChange={v => setFoldType(v ? 'adult' : 'none')} />
              <KCheck label="직접 입력 문구" checked={foldType === 'custom'}
                onChange={v => setFoldType(v ? 'custom' : 'none')} />
              {foldType === 'custom' && (
                <KInput placeholder="접기 문구" value={foldLabel} onChange={e => setFoldLabel(e.target.value)} />
              )}
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-onbk"
              onClick={() => router.push(editing ? `/board/${nums.get(editing.id) ?? editing.id}` : boardHref(board.id, boards))}>CANCEL</button>
            <button className="btn btn-accent" disabled={thumbBusy} onClick={post}>{editing ? 'SAVE' : 'POST'}</button>
          </div>
        </div>
      </div>

      {/* HTML → 에디터 전환 경고 (v2.0) — 다루지 못하는 태그는 편집 순간 정리된다 */}
      <ConfirmModal open={askRich !== null} title="여기서 편집하면 일부 태그가 정리됩니다"
        body="에디터는 굵게·목록·제목·이미지 같은 기본 서식만 다룹니다. 표·div·style·class 등은 편집하는 순간 정리되며 되돌릴 수 없습니다. HTML을 그대로 두려면 취소하세요."
        onClose={() => setAskRich(null)}
        buttons={[
          { label: 'CANCEL', kind: 'ghost', onClick: () => setAskRich(null) },
          { label: '계속', kind: 'accent', onClick: () => { askRich?.(); setAskRich(null); } },
        ]} />

      {/* 게시 전 미리보기 — 아래에 줄줄 나오던 실시간 미리보기 대신 팝업으로 (사용자 요청) */}
      <Modal open={pvOpen} onClose={() => setPvOpen(false)} className="pv-modal"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setPvOpen(false)}>계속 편집</button>
          <button className="btn btn-accent" disabled={thumbBusy} onClick={() => { setPvOpen(false); post(); }}>{editing ? 'SAVE' : 'POST'}</button>
        </>}>
        <div className="pv-title">{title.trim() || '(제목 없음)'}</div>
        {body.trim()
          ? <div className="post-body" dangerouslySetInnerHTML={{ __html: preview }} />
          : <p className="pv-empty">아직 작성한 내용이 없습니다.</p>}
      </Modal>

      {/* 대표 썸네일 위치 지정 — 갤러리형 5:6 / 기본형 16:9 (v2.3) */}
      {cropOpen && thumbUrl && (
        <CropEditor open src={thumbUrl} aspect={galleryThumb ? 5 / 6 : '16:9'} aspectLabel={galleryThumb ? '5:6' : undefined} initial={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
    </section>
  );
}

export default function BoardWritePage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><WriteInner /></Suspense>;
}
