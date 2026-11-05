'use client';
// 아카이브 (사용자 요청) — 여러 카테고리를 한 페이지에 묶는 게시판.
// 탭 = 카테고리(환경설정 > 콘텐츠 > 아카이브에서 관리). 탭을 누르면 그 카테고리에 넣은 글만 보인다.
// 글 모양은 하나 — HTML(상태창 등) 미리보기 + 이름·설명 + HTML 복사. 미리보기는 components/archive/StatusFrame.
// 이름을 누르면 상세(app/archive/[id]) — 확대 미리보기 · 글자·날짜·시간 고쳐 복사 (원본은 그대로).
// 관리자는 카드에서 수정 · 카테고리 이동 · 삭제를 한다. 한 줄 3개(휴대폰 2개).
// 머리글·탭 줄은 다른 페이지와 같은 .page-head + .toolrow > .seg 라서 「페이지 헤더 모양」 설정을 그대로 따른다.
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import {
  ArchiveItem, ARCHIVE_KEY, ARCHIVE_SEED, UNCAT, tabOf, useArchiveSettings,
} from '@/lib/archiveStore';
import { SearchBar, KInput, KSelect } from '@/components/ui/Kit';
import { CodeEditor } from '@/components/ui/CodeEditor';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { StatusFrame } from '@/components/archive/StatusFrame';
import { ArIcon as Icon, copyText, MoveCatModal } from '@/components/archive/archiveUi';

function ArchiveCard({ it, canEdit, onEdit, onMove, onDelete }: {
  it: ArchiveItem; canEdit: boolean; onEdit: () => void; onMove: () => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (await copyText(it.html)) {
      setDone(true); setTimeout(() => setDone(false), 1400);
      toast('HTML을 복사했습니다');
    } else toast('복사가 막혀 있습니다 — 수정 창에서 직접 선택해 주세요');
  };
  return (
    <article className="ar-card">
      <div className="ar-fwrap">
        <StatusFrame html={it.html} title={it.name} />
        {/* 수정·이동·삭제는 관리자에게만, 미리보기 오른쪽 아래(상태창이 칸 바닥에 붙으므로 늘 상태창 위)에 — 마우스를 올리면 보인다(터치 기기는 늘 보임).
            제목 줄에는 복사 아이콘 하나만 두어 이름이 덜 잘린다 */}
        {canEdit && (
          <div className="ar-adm">
            <button type="button" onClick={onEdit} aria-label={`${it.name} 수정`} data-tip="수정">{Icon.edit}</button>
            <button type="button" onClick={onMove} aria-label={`${it.name} 카테고리 이동`} data-tip="카테고리 이동">{Icon.move}</button>
            <button type="button" onClick={onDelete} aria-label={`${it.name} 삭제`} data-tip="삭제">{Icon.del}</button>
          </div>
        )}
      </div>
      <div className="ar-meta">
        <Link className="ar-nm" href={`/archive/${encodeURIComponent(it.id)}`}>{it.name || '이름 없음'}</Link>
        <div className="ar-ic">
          <button type="button" className={done ? 'on' : ''} onClick={copy}
            aria-label={`${it.name} HTML 복사`} data-tip="HTML 복사">{done ? Icon.done : Icon.copy}</button>
        </div>
        <div className="ar-ds">{it.desc}</div>
      </div>
    </article>
  );
}

/** 보관·수정 창 — 왼쪽 입력, 오른쪽 실시간 미리보기 */
function ArchiveEditor({ init, cats, onSave, onClose }: {
  init: ArchiveItem; cats: { id: string; label: string }[];
  onSave: (it: ArchiveItem) => void; onClose: () => void;
}) {
  const [it, setIt] = useState(init);
  const set = (p: Partial<ArchiveItem>) => setIt(s => ({ ...s, ...p }));
  const dirty = JSON.stringify(it) !== JSON.stringify(init);
  const ok = it.html.trim() !== '' && it.name.trim() !== '';
  const catOpts = cats.some(c => c.id === it.catId) ? cats : [...cats, { id: it.catId, label: '분류 없음' }];
  return (
    <Modal open title={init.id ? '수정' : '보관'} onClose={onClose} dirty={dirty} className="ar-modal"
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn btn-dark" disabled={!ok} onClick={() => onSave({ ...it, name: it.name.trim(), desc: it.desc.trim() })}>SAVE</button>
      </>}>
      <div className="ar-ed">
        <div className="ar-ed-l">
          <label className="ar-f"><span>카테고리</span>
            <KSelect value={it.catId} onChange={v => set({ catId: v })}
              options={catOpts.map(c => ({ value: c.id, label: c.label }))} />
          </label>
          <label className="ar-f"><span>이름</span>
            <KInput value={it.name} onChange={e => set({ name: e.target.value })} placeholder="예: 벨그레이브 · 화이트 카드" />
          </label>
          <label className="ar-f"><span>설명</span>
            <KInput value={it.desc} onChange={e => set({ desc: e.target.value })} placeholder="한 줄 설명" />
          </label>
          {/* HTML 코드 편집기 — 내용만큼 늘다가 최대 높이(.ce-wrap.fit)를 넘으면 안에서 스크롤 (사용자 요청) */}
          <div className="ar-f"><span>HTML</span>
            <CodeEditor fit fileName="archive.html" value={it.html}
              onChange={v => set({ html: v })} placeholder="<div>상태창 HTML을 붙여 넣으세요</div>" />
          </div>
        </div>
        <div className="ar-ed-r">
          <span className="ar-f"><span>미리보기</span></span>
          {it.html.trim()
            ? <StatusFrame html={it.html} fit="width" />
            : <p className="ar-empty">HTML을 붙여 넣으면 여기에 미리보기가 뜹니다</p>}
          <p className="ar-note">스크립트는 실행되지 않습니다 — HTML과 CSS만 그려집니다</p>
        </div>
      </div>
    </Modal>
  );
}

export default function ArchivePage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems, loaded] = useLocalList<ArchiveItem>(ARCHIVE_KEY, ARCHIVE_SEED);
  const [st] = useArchiveSettings();
  const [tab, setTab] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ArchiveItem | null>(null);
  const [moving, setMoving] = useState<ArchiveItem | null>(null);
  const del = useConfirmDelete();

  // 상세에서 「← ARCHIVE」로 돌아오면 그 글의 탭을 연다 (/archive?c=카테고리id)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setTab(c);
  }, []);

  const cats = st.cats;
  // 지운 카테고리에 있던 글은 「분류 없음」 탭에 모인다 — 그런 글이 있을 때만 탭이 생긴다
  const hasUncat = items.some(it => tabOf(it, cats) === UNCAT);
  const tabs = hasUncat ? [...cats, { id: UNCAT, label: '분류 없음' }] : cats;
  const cur = tabs.find(t => t.id === tab)?.id ?? tabs[0]?.id ?? UNCAT;

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter(it => tabOf(it, cats) === cur)
      .filter(it => !k || it.name.toLowerCase().includes(k) || it.desc.toLowerCase().includes(k));
  }, [items, cats, cur, q]);

  if (!loaded) return <section className="page" />;

  const openNew = () => setEditing({
    id: '', catId: cur === UNCAT ? (cats[0]?.id ?? UNCAT) : cur, name: '', desc: '', html: '',
    author: user?.nickname ?? '', authorId: user?.id ?? '', date: '',
  });
  const save = (it: ArchiveItem) => {
    if (it.id) setItems(items.map(x => (x.id === it.id ? it : x)));
    else setItems([{ ...it, id: newId(), date: new Date().toISOString() }, ...items]);
    setEditing(null);
    if (it.catId !== cur && it.catId !== UNCAT) setTab(it.catId);
    toast(it.id ? '수정했습니다' : '보관했습니다');
  };
  /** 카테고리 이동 (사용자 요청) — catId만 바꾼다. 옮긴 뒤에도 지금 탭에 머문다 */
  const move = (it: ArchiveItem, catId: string) => {
    setItems(items.map(x => (x.id === it.id ? { ...x, catId } : x)));
    setMoving(null);
    toast(`「${cats.find(c => c.id === catId)?.label ?? ''}」(으)로 옮겼습니다`);
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>ARCHIVE</PageTitle>
        <EditableDesc k="archive-desc" def="카테고리별로 모아 둔 상태창" />
      </div>

      <div className="toolrow">
        <div className="seg ar-tabs" role="tablist">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === cur}
              className={t.id === cur ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="toolrow-act">
          <SearchBar placeholder="이름·설명 검색" onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={openNew}>＋ WRITE</button>}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="ar-none">{q ? '검색 결과가 없습니다' : '아직 보관한 것이 없습니다'}</p>
      ) : (
        <div className="ar-grid">
          {shown.map(it => (
            <ArchiveCard key={it.id} it={it} canEdit={isAdmin}
              onEdit={() => setEditing(it)}
              onMove={() => setMoving(it)}
              onDelete={() => del.ask(`「${it.name}」을(를) 삭제하시겠습니까?`,
                () => setItems(items.filter(x => x.id !== it.id)), '삭제하면 복구할 수 없습니다.')} />
          ))}
        </div>
      )}

      {editing && (
        <ArchiveEditor init={editing} cats={cats} onSave={save} onClose={() => setEditing(null)} />
      )}
      {moving && (
        <MoveCatModal name={moving.name} catId={tabOf(moving, cats)} cats={cats}
          onMove={c => move(moving, c)} onClose={() => setMoving(null)} />
      )}
      {del.element}
    </section>
  );
}
