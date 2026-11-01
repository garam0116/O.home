'use client';
// 맨 위로 버튼 — BGM 플레이어 바로 위에 붙어 다님 (사용자 요청)
// 스크롤은 #appMain 안에서 일어나므로(7장) 그 영역을 기준으로 표시·이동
// 플레이어 위치·크기(접기/펼치기, PC/모바일, 왼쪽/오른쪽 배치)가 바뀌면 ResizeObserver로 따라감
import React, { useEffect, useRef, useState } from 'react';

const GAP = 10;      // 플레이어와의 간격
const EDGE = 12;     // 플레이어가 없거나 화면 폭을 꽉 채울 때 가장자리 여백
const SHOW_AT = 240; // 이만큼 내려가면 표시

type Pos = { bottom: number; side: 'left' | 'right'; inset: number };

export function TopButton({ anchor, left, hide }: { anchor: React.RefObject<HTMLElement | null> | null; left?: boolean; hide?: boolean }) {
  const [show, setShow] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos>({ bottom: 20, side: left ? 'left' : 'right', inset: 20 });

  // 스크롤 위치 감시
  useEffect(() => {
    const main = document.getElementById('appMain');
    const check = () => setShow((main?.scrollTop ?? 0) > SHOW_AT || window.scrollY > SHOW_AT);
    check();
    main?.addEventListener('scroll', check, { passive: true });
    window.addEventListener('scroll', check, { passive: true });
    return () => {
      main?.removeEventListener('scroll', check);
      window.removeEventListener('scroll', check);
    };
  }, []);

  // 플레이어 바로 위 좌표 계산
  useEffect(() => {
    const el = anchor?.current ?? null;
    const side: 'left' | 'right' = left ? 'left' : 'right';
    const measure = () => {
      if (!el || !el.isConnected) { setPos({ bottom: 20, side, inset: 20 }); return; }
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const full = r.width >= vw * 0.9; // 모바일 풀폭 바
      const inset = full ? EDGE : side === 'left' ? r.left : vw - r.right;
      // 원형 레코드판일 때는 버튼을 디스크 가운데 위에 맞춤
      const bw = btnRef.current?.offsetWidth ?? 34;
      const center = !full && r.width < 70 ? (r.width - bw) / 2 : 0;
      setPos({ bottom: window.innerHeight - r.top + GAP, side, inset: Math.max(0, inset + center) });
    };
    measure();
    const ro = el ? new ResizeObserver(measure) : null;
    if (el) ro!.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [anchor, left]);

  const toTop = () => {
    document.getElementById('appMain')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`top-btn ${show && !hide ? 'on' : ''}`}
      aria-label="맨 위로"
      data-tip="맨 위로"
      onClick={toTop}
      style={{ bottom: pos.bottom, [pos.side]: pos.inset }}
    >
      <svg viewBox="0 0 24 24" aria-hidden><path d="M6 15l6-6 6 6" /></svg>
    </button>
  );
}
