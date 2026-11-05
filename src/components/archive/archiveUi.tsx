'use client';
// 아카이브 목록(app/archive)과 상세(app/archive/[id])가 함께 쓰는 아이콘 · 복사 · 카테고리 이동 창
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { KSelect } from '@/components/ui/Kit';
import type { ArchiveCat } from '@/lib/archiveStore';

export const ArIcon = {
  copy: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
      <path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" /></svg>
  ),
  done: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  edit: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h3.5L18.5 9 15 5.5 5 15.5z" /></svg>,
  del: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>,
  /** 카테고리 이동 — 폴더로 들어가는 화살표 */
  move: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18V9.5A1.5 1.5 0 0 0 18.5 8h-7l-2-2.5h-4A1.5 1.5 0 0 0 4 7z" />
      <path d="M10 13.5h5M13 11.5l2 2-2 2" /></svg>
  ),
};

/** 클립보드 — 막힌 환경(오래된 브라우저·일부 앱 화면)에서는 숨긴 입력칸으로 복사한다 */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** 카테고리 이동 창 (사용자 요청) — 글의 catId만 바꾼다. 지금 카테고리는 목록에서 뺀다 */
export function MoveCatModal({ name, catId, cats, onMove, onClose }: {
  name: string; catId: string; cats: ArchiveCat[];
  onMove: (catId: string) => void; onClose: () => void;
}) {
  const opts = cats.filter(c => c.id !== catId);
  const [to, setTo] = useState(opts[0]?.id ?? '');
  const from = cats.find(c => c.id === catId)?.label ?? '분류 없음';
  return (
    <Modal open small title="카테고리 이동" onClose={onClose}
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn btn-dark" disabled={!to} onClick={() => onMove(to)}>MOVE</button>
      </>}>
      {opts.length === 0 ? (
        <p className="ar-mv-none">옮길 카테고리가 없습니다 — 환경설정 &gt; 콘텐츠 &gt; 아카이브에서 카테고리를 먼저 추가해 주세요</p>
      ) : (
        <div className="ar-mv">
          <p>「{name || '이름 없음'}」 · 지금 <b>{from}</b></p>
          <label className="ar-f"><span>옮길 곳</span>
            <KSelect value={to} onChange={setTo} options={opts.map(c => ({ value: c.id, label: c.label }))} />
          </label>
        </div>
      )}
    </Modal>
  );
}
