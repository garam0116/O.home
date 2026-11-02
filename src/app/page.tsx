'use client';
// 메인 페이지 (4.0 위젯 시스템) — 고정 요소(배너·회원정보창) + 자유 배치 위젯 + 편집모드
import React, { useEffect, useState } from 'react';
import { useMainStore, WidgetConf } from '@/lib/mainStore';
import { WidgetFrame } from '@/components/main/WidgetFrame';
import { renderWidget } from '@/components/main/widgets';
import { MemberBox } from '@/components/main/MemberBox';
import { WidgetEditLayer, useWidgetCtx } from '@/components/main/WidgetEditLayer';

export default function MainPage() {
  const { state, gridOn, updateWidget } = useMainStore();

  // 메뉴리스트 위젯은 그리지 않음 — 모바일 메뉴는 상단바 ≡ 버튼이 대신함 (저장 데이터는 보존)
  const enabled = state.widgets.filter(w => w.enabled && w.type !== 'menu');
  const byCol = (c: 1 | 2 | 3) => enabled.filter(w => w.col === c);
  const mOrder = (id: string) => {
    // 고정 슬라이드 배너는 모바일에서 항상 맨 위 (회원정보창 -1보다 앞)
    if (state.widgets.find(w => w.id === id)?.fixed) return -2;
    const i = state.mobileOrder.indexOf(id);
    return i === -1 ? 99 : i;
  };

  // 우클릭 메뉴·위젯 추가 모달은 다른 페이지(좌우 위젯 레일)와 공통 (v2.4)
  const { ctx, setCtx, openCtx } = useWidgetCtx(enabled);

  const frame = (w: WidgetConf, className?: string) => (
    <WidgetFrame key={w.id} conf={w} mobileOrder={mOrder(w.id)} className={className}
      onCtx={openCtx}>
      {renderWidget(w)}
    </WidgetFrame>
  );

  // PC 절대배치 (v1.9 사용자 확정) — 모든 위젯에 절대 좌표가 있으면 캔버스 모드:
  // 문서 흐름 없음(겹침 허용·서로 밀지 않음). 좌표가 없는 저장분은 아래 effect가
  // 기존 열 흐름 렌더 위치를 1회 스냅샷해 마이그레이션. 모바일은 CSS가 흐름 스택으로 복원.
  const absMode = enabled.length > 0 && enabled.every(w => w.ax != null && w.ay != null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (absMode) return;
    const t = setTimeout(() => {
      const gr = gridRef.current?.getBoundingClientRect();
      if (!gr || gr.width < 100) return;   // 모바일/미측정 상태에서는 스냅샷하지 않음
      enabled.forEach(w => {
        if (w.ax != null) return;
        const el = document.querySelector(`[data-wid="${w.id}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        updateWidget(w.id, {
          ax: Math.round(r.left - gr.left), ay: Math.round(r.top - gr.top),
          w: w.w ?? Math.max(160, Math.round(r.width)), h: w.h ?? Math.max(80, Math.round(r.height)),
          tx: 0, ty: 0,
        }, { persist: true });
      });
    }, 250);   // 폰트·이미지 로드 후 안정된 레이아웃에서 측정
    return () => clearTimeout(t);
  }, [absMode, enabled.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // 실제 렌더 높이로 캔버스 바닥을 잰다 — 높이 자동 위젯(디데이)이 길어지면 캔버스·페이지도 같이 길어진다
  const [measuredBottom, setMeasuredBottom] = useState(0);
  useEffect(() => {
    const grid = gridRef.current;
    if (!absMode || !grid) return;
    const measure = () => {
      let b = 0;
      grid.querySelectorAll<HTMLElement>(':scope > .wgt').forEach(el => { b = Math.max(b, el.offsetTop + el.offsetHeight); });
      setMeasuredBottom(b);
    };
    const ro = new ResizeObserver(measure);
    grid.querySelectorAll(':scope > .wgt').forEach(el => ro.observe(el));
    measure();
    return () => ro.disconnect();
  }, [absMode, enabled]);
  const canvasH = absMode
    ? Math.max(400, measuredBottom, ...enabled.filter(w => w.type !== 'dday' && w.type !== 'ddaycard').map(w => (w.ay ?? 0) + (w.h ?? 200))) + 40
    : undefined;

  return (
    <section className="page page-main-wrap" onClick={() => setCtx(null)}>
      <div ref={gridRef} className={`main-grid ${absMode ? 'abs' : ''} ${gridOn ? 'gridlines' : ''}`}
        style={{ marginTop: 12, ...(canvasH ? { height: canvasH } : {}) }}>
        {absMode ? (
          /* 절대배치 캔버스 — 위젯 전부 직속, 좌표는 각자 ax/ay */
          enabled.map(w =>
            w.type === 'member'
              ? <WidgetFrame key={w.id} conf={w} mobileOrder={-1} onCtx={(id, x, y) => setCtx({ id, x, y })}><MemberBox /></WidgetFrame>
              : frame(w, w.type === 'menu' ? 'wgt-hide-pc' : undefined))
        ) : (
          <>
            {/* (마이그레이션 전 1회용) 기존 열 흐름 렌더 — 위치 스냅샷 후 절대배치로 전환 */}
            <div>
              {byCol(1).map(w => frame(w, w.type === 'menu' ? 'wgt-hide-pc' : undefined))}
            </div>
            <div>
              {byCol(2).map(w =>
                w.type === 'banner' ? frame(w) : null
              )}
              <div className="g2" style={{ marginTop: 10 }}>
                {byCol(2).filter(w => w.type !== 'banner').map(w => frame(w))}
              </div>
            </div>
            <div>
              {byCol(3).map(w =>
                w.type === 'member'
                  ? <WidgetFrame key={w.id} conf={w} mobileOrder={-1} onCtx={(id, x, y) => setCtx({ id, x, y })}><MemberBox /></WidgetFrame>
                  : frame(w)
              )}
            </div>
          </>
        )}
      </div>

      <WidgetEditLayer ctx={ctx} setCtx={setCtx} enabled={enabled} />
    </section>
  );
}
