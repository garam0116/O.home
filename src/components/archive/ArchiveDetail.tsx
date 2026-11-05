'use client';
// 아카이브 상세 팝업 (사용자 요청 · 시안 C를 팝업으로) — 목록에서 이름을 누르면 페이지 이동 없이 위에 뜬다.
// · 왼쪽: 확대 미리보기(StatusFrame, 스크립트 실행 없음) + 같은 탭(검색 결과) 안의 이전·다음 글
// · 오른쪽: 카테고리(관리자는 이동), [글자 고치기 | HTML] 탭
// 고친 글자·날짜·시간은 **복사용**이다 — 원본 글은 바뀌지 않는다(저장 버튼 없이 「HTML 복사」).
// 창을 닫거나 다른 글로 넘기면 원래대로 돌아간다.
import React, { useMemo, useState } from 'react';
import type { ArchiveItem } from '@/lib/archiveStore';
import { textSlots, editSlots, setDT, findDT } from '@/lib/archiveText';
import { StatusFrame } from '@/components/archive/StatusFrame';
import { ArIcon, copyText } from '@/components/archive/archiveUi';
import { CodeEditor } from '@/components/ui/CodeEditor';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export function ArchiveDetail({ it, prev, next, catLabel, canMove, onMove, onNav, onClose }: {
  it: ArchiveItem; prev?: ArchiveItem; next?: ArchiveItem; catLabel: string;
  canMove: boolean; onMove: () => void;
  /** 이전·다음 글로 넘기기 */
  onNav: (id: string) => void;
  onClose: () => void;
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

  return (
    <Modal open title={it.name || '이름 없음'} desc={it.desc || undefined} onClose={onClose} className="ar-dt-modal"
      actions={<>
        <span className="ar-note">고친 내용은 복사에만 쓰입니다 — 원본은 바뀌지 않습니다</span>
        <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => setHtml(it.html)}>원래대로</button>
        <button type="button" className="btn btn-dark ar-dt-copy" onClick={copy}>
          {done ? ArIcon.done : ArIcon.copy}HTML 복사
        </button>
      </>}>
      <button type="button" className="ar-dt-x" onClick={onClose} aria-label="닫기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="ar-dt">
        <div className="ar-dt-grid">
          <div className="ar-dt-l">
            <div className="ar-stage">
              <StatusFrame html={html} fit="width" title={it.name} />
            </div>
            <div className="ar-pn">
              {prev ? <button type="button" onClick={() => onNav(prev.id)}>← {prev.name || '이름 없음'}</button> : <span />}
              {next ? <button type="button" onClick={() => onNav(next.id)}>{next.name || '이름 없음'} →</button> : <span />}
            </div>
          </div>

          <div className="ar-dt-r">
            <div className="ar-dt-cat">
              <span>카테고리</span><b>{catLabel}</b>
              {canMove && (
                <button type="button" className="ar-dt-mv" onClick={onMove}>{ArIcon.move}이동</button>
              )}
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
          </div>
        </div>
      </div>
    </Modal>
  );
}
