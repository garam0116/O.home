'use client';
// 아카이브 상세 (사용자 요청 · 시안 C) — 목록에서 이름을 누르면 오는 페이지.
// · 왼쪽: 확대 미리보기(StatusFrame, 스크립트 실행 없음) + 같은 탭 안의 이전·다음 글
// · 오른쪽: 이름·설명·카테고리, [글자 고치기 | HTML] 탭, 「원래대로」·「HTML 복사」
// 고친 글자·날짜·시간은 **복사용**이다 — 원본 글은 바뀌지 않는다(저장 버튼 없음). 새로고침·다른 글로 가면 원래대로.
// 관리자는 여기서도 카테고리를 옮길 수 있다(글의 catId만 바꿈 — 목록 카드의 이동과 같은 창).
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { ArchiveItem, ARCHIVE_KEY, ARCHIVE_SEED, UNCAT, tabOf, useArchiveSettings } from '@/lib/archiveStore';
import { textSlots, editSlots, setDT, findDT } from '@/lib/archiveText';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { StatusFrame } from '@/components/archive/StatusFrame';
import { ArIcon, copyText, MoveCatModal } from '@/components/archive/archiveUi';
import { CodeEditor } from '@/components/ui/CodeEditor';
import { useToast } from '@/components/ui/Toast';

function Detail({ it, prev, next, catLabel, canMove, onMove }: {
  it: ArchiveItem; prev?: ArchiveItem; next?: ArchiveItem; catLabel: string;
  canMove: boolean; onMove: () => void;
}) {
  const toast = useToast();
  const [html, setHtml] = useState(it.html);
  const [tab, setTab] = useState<'text' | 'code'>('text');
  const [done, setDone] = useState(false);
  const slots = useMemo(() => textSlots(html), [html]);
  const dirty = html !== it.html;

  // 날짜·시간은 한 칸으로 묶는다 — 같은 날짜가 여러 곳에 있어도 함께 바뀐다
  const dtCount = slots.filter(s => s.dt.date || s.dt.time).length;
  const curDate = slots.find(s => s.dt.date)?.dt.date ?? '';
  const curTime = slots.find(s => s.dt.time)?.dt.time ?? '';
  const setAllDT = (date: string, time: string) => setHtml(h => editSlots(h, t => {
    const f = findDT(t);
    if (!f.date && !f.time) return undefined;
    return setDT(t, f.date ? date : '', f.time ? time : '');
  }));
  const setSlot = (i: number, v: string) => setHtml(h => editSlots(h, (t, j) => (j === i ? v : undefined)));

  const copy = async () => {
    if (await copyText(html)) {
      setDone(true); setTimeout(() => setDone(false), 1400);
      toast(dirty ? '고친 HTML을 복사했습니다' : 'HTML을 복사했습니다');
    } else toast('복사가 막혀 있습니다 — HTML 탭에서 직접 선택해 주세요');
  };

  const back = `/archive?c=${encodeURIComponent(it.catId)}`;
  const link = (x: ArchiveItem) => `/archive/${encodeURIComponent(x.id)}`;

  return (
    <section className="page ar-dt">
      <nav className="ar-crumb" aria-label="위치">
        <Link href={back}>← ARCHIVE</Link>
        <span aria-hidden>/</span>
        <Link href={back}>{catLabel}</Link>
        <span aria-hidden>/</span>
        <b>{it.name || '이름 없음'}</b>
      </nav>

      <div className="ar-dt-grid">
        <div className="ar-dt-l">
          <div className="ar-stage">
            <StatusFrame html={html} fit="width" title={it.name} />
          </div>
          <div className="ar-pn">
            {prev ? <Link href={link(prev)}>← {prev.name || '이름 없음'}</Link> : <span />}
            {next ? <Link href={link(next)}>{next.name || '이름 없음'} →</Link> : <span />}
          </div>
        </div>

        <aside className="ar-dt-r">
          <div>
            <h1 className="ar-dt-nm">{it.name || '이름 없음'}</h1>
            {it.desc && <p className="ar-dt-ds">{it.desc}</p>}
            <div className="ar-dt-cat">
              <span>카테고리</span><b>{catLabel}</b>
              {canMove && (
                <button type="button" className="ar-dt-mv" onClick={onMove}>{ArIcon.move}이동</button>
              )}
            </div>
          </div>

          <div className="ar-tabs2" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'on' : ''}
              onClick={() => setTab('text')}>글자 고치기</button>
            <button type="button" role="tab" aria-selected={tab === 'code'} className={tab === 'code' ? 'on' : ''}
              onClick={() => setTab('code')}>HTML</button>
          </div>

          {tab === 'text' ? (
            <div className="ar-slots">
              {dtCount > 0 && (
                <div className="ar-dtbox">
                  <div className="ar-dtbox-h"><span className="ar-chip">날짜·시간</span>
                    {dtCount > 1 ? `${dtCount}곳 · 함께 바뀝니다` : '찾은 날짜·시간'}</div>
                  <div className={`ar-dtbox-in${curDate && curTime ? '' : ' one'}`}>
                    {curDate && <input type="date" className="k-input" aria-label="날짜" value={curDate}
                      onChange={e => e.target.value && setAllDT(e.target.value, '')} />}
                    {curTime && <input type="time" className="k-input" aria-label="시간" value={curTime}
                      onChange={e => e.target.value && setAllDT('', e.target.value)} />}
                  </div>
                </div>
              )}
              {slots.length === 0 ? (
                <p className="ar-note">고칠 글자가 없습니다</p>
              ) : (
                <div className="ar-slot-list">
                  {slots.map((s, i) => (
                    <label key={i} className="ar-f">
                      <span>글자 {i + 1}</span>
                      <input className="k-input" value={s.text} onChange={e => setSlot(i, e.target.value)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <CodeEditor fit fileName="archive.html" value={html} onChange={setHtml} />
          )}

          <div className="ar-dt-act">
            <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => setHtml(it.html)}>원래대로</button>
            <button type="button" className="btn btn-dark ar-dt-copy" onClick={copy}>
              {done ? ArIcon.done : ArIcon.copy}HTML 복사
            </button>
          </div>
          <p className="ar-note">고친 내용은 복사에만 쓰입니다 — 원본은 바뀌지 않습니다</p>
        </aside>
      </div>
    </section>
  );
}

export default function ArchiveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const key = decodeURIComponent(id ?? '');
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems, loaded] = useLocalList<ArchiveItem>(ARCHIVE_KEY, ARCHIVE_SEED);
  const [st] = useArchiveSettings();
  const [moving, setMoving] = useState(false);
  // 상세 주소(/archive/id)는 메뉴에 없으니 목록 메뉴의 공개범위로 막는다 — 훅이라 다른 return보다 먼저
  const blocked = useHrefBlock('/archive');

  const cats = st.cats;
  const it = items.find(x => x.id === key);
  const tabId = it ? tabOf(it, cats) : UNCAT;
  const same = useMemo(() => items.filter(x => tabOf(x, cats) === tabId), [items, cats, tabId]);
  const idx = it ? same.findIndex(x => x.id === it.id) : -1;

  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!it) {
    return (
      <section className="page ar-dt">
        <nav className="ar-crumb"><Link href="/archive">← ARCHIVE</Link></nav>
        <p className="ar-none">찾을 수 없는 글입니다 — 지워졌거나 볼 수 없는 글입니다</p>
      </section>
    );
  }

  const catLabel = cats.find(c => c.id === tabId)?.label ?? '분류 없음';
  const move = (catId: string) => {
    setItems(items.map(x => (x.id === it.id ? { ...x, catId } : x)));
    setMoving(false);
    toast(`「${cats.find(c => c.id === catId)?.label ?? ''}」(으)로 옮겼습니다`);
  };

  return (
    <>
      {/* 글이 바뀌면(이전·다음) 고치던 내용을 버리고 새로 시작한다 */}
      <Detail key={it.id + '\n' + it.html} it={it} prev={same[idx - 1]} next={same[idx + 1]}
        catLabel={catLabel} canMove={isAdmin} onMove={() => setMoving(true)} />
      {moving && (
        <MoveCatModal name={it.name} catId={tabId} cats={cats} onMove={move} onClose={() => setMoving(false)} />
      )}
    </>
  );
}
