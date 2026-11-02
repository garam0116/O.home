'use client';
// 좌우 위젯 레일 (v2.4 사용자 요청) — 메인의 왼쪽·오른쪽 열 위젯을 다른 페이지에서도 같은 자리에 고정한다.
// 메인과 같은 1180px 틀·같은 절대 좌표로 그려 위치가 픽셀 단위로 같다. 본문은 좌우 위젯 사이 구간에 들어가고,
// 그 폭은 위젯 크기에서 매번 계산된다 — 좌우 위젯을 좁히면 본문이 넓어진다.
// 모바일(620px 이하)에서는 위젯을 메인에서만 보여 주므로 이 레일은 CSS로 꺼진다.
// layout에서 페이지(PageFrame) 바깥을 감싸 — 페이지를 옮겨 다녀도 위젯이 다시 그려지지 않는다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMainStore } from '@/lib/mainStore';
import { useSiteSettings, boardWOf } from '@/lib/siteStore';
import { isRailPage, railWidgets, railBounds } from '@/lib/widgetZone';
import { WidgetFrame } from '@/components/main/WidgetFrame';
import { renderWidget } from '@/components/main/widgets';
import { MemberBox } from '@/components/main/MemberBox';
import { WidgetEditLayer, useWidgetCtx } from '@/components/main/WidgetEditLayer';

export function RailHost({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, editOn, gridOn } = useMainStore();
  const onPage = isRailPage(pathname);
  const side = useMemo(() => (onPage ? railWidgets(state.widgets) : []), [onPage, state.widgets]);
  const active = side.length > 0;
  const { left, right } = railBounds(side);
  const { ctx, setCtx, openCtx } = useWidgetCtx(side);

  // 위젯 아래 끝까지 페이지가 길어지게 — 본문이 짧아도 위젯이 잘리지 않는다
  const canvasRef = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!active || !el) return;
    const measure = () => {
      let b = 0;
      el.querySelectorAll<HTMLElement>(':scope > .wgt').forEach(w => { b = Math.max(b, w.offsetTop + w.offsetHeight); });
      setBottom(b);
    };
    const ro = new ResizeObserver(measure);
    el.querySelectorAll(':scope > .wgt').forEach(w => ro.observe(w));
    measure();
    return () => ro.disconnect();
  }, [active, side]);

  useEffect(() => {
    document.body.classList.toggle('rails-on', active);
    return () => document.body.classList.remove('rails-on');
  }, [active]);

  return (
    // 구조는 늘 같게 두고 클래스만 바꾼다 — 첫 좌우 위젯을 추가하는 순간 페이지(작성 중인 글 등)가 다시 그려지지 않게
    <div className={`rail-host ${active ? 'on' : ''}`} onClick={() => ctx && setCtx(null)}
      style={{
        '--rail-l': `${left}px`, '--rail-r': `${right}px`,
        ...(active ? { minHeight: bottom + 28 + 60 } : {}),
      } as React.CSSProperties}>
      {active && (
        <div ref={canvasRef} className={`main-grid abs rail-canvas ${gridOn ? 'gridlines' : ''}`}
          style={{ height: Math.max(bottom, 1) }}>
          {side.map(w => (
            <WidgetFrame key={w.id} conf={w} mobileOrder={0} rail onCtx={openCtx}>
              {w.type === 'member' ? <MemberBox /> : renderWidget(w)}
            </WidgetFrame>
          ))}
        </div>
      )}
      <div className="rail-body">{children}</div>
      {onPage && editOn && <WidgetEditLayer ctx={ctx} setCtx={setCtx} enabled={side} sideOnly />}
      {(onPage || pathname === '/') && editOn && <RailWidthHint />}
    </div>
  );
}

/** 편집모드 안내 — 지금 좌우 위젯 배치로 다른 페이지 본문이 몇 px인지, 게시판 본문 폭보다 좁은지 (v2.4) */
function RailWidthHint() {
  const { state } = useMainStore();
  const [site] = useSiteSettings();
  const boardW = boardWOf(site);
  const side = railWidgets(state.widgets);
  if (!side.length) return null;
  const { left, right } = railBounds(side);
  const w = Math.round(right - left);
  const short = boardW - w;
  return (
    <div className={`rail-hint ${short > 0 ? 'warn' : ''}`}>
      다른 페이지 본문 영역 <b>{w}px</b>
      {short > 0
        ? <> · 게시판 본문 폭({boardW}px)보다 <b>{short}px</b> 좁습니다 — 좌우 위젯을 좁히면 넓어집니다</>
        : <> · 게시판 본문 폭({boardW}px) 유지</>}
    </div>
  );
}
