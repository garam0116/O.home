'use client';
// 편집모드 공통 레이어 — 우클릭 메뉴(겹침 순서·그리드 무시·설정·삭제) · 삭제 경고 · 위젯 추가 모달.
// 메인과 다른 페이지(좌우 위젯 레일, v2.4)가 같이 쓴다. sideOnly면 추가 위치가 왼쪽·오른쪽 열로 제한된다
// (다른 페이지의 중앙은 본문 자리라 중앙 위젯은 메인에서만 보인다).
import React, { useCallback, useEffect, useState } from 'react';
import { useMainStore, WidgetConf, WidgetType, WIDGET_META, MULTI_TYPES, widgetLabel } from '@/lib/mainStore';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { KRadio } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';

const ADDABLE: WidgetType[] = ['banner', 'memo', 'ddaycard', 'dday', 'todo', 'freetext', 'deco', 'diary', 'latest', 'search', 'member'];   // banner: 여러 개 추가 (v2.0 사용자 요청) · member: 꺼냈다 뺐다 (v2.1)
/** 내용 설정 모달이 있는 위젯 — 우클릭 「설정」 노출 대상 (v1.9) */
const EDITABLE: WidgetType[] = ['banner', 'memo', 'dday', 'ddaycard', 'todo', 'freetext', 'deco', 'search', 'latest'];

export type WidgetCtx = { id: string; x: number; y: number } | null;

/** 우클릭 메뉴 상태 — openCtx는 처음 우클릭한 위젯에 z 기본값을 줘 겹침 조정 대상으로 만든다 */
export function useWidgetCtx(enabled: WidgetConf[]) {
  const { state, updateWidget } = useMainStore();
  const [ctx, setCtx] = useState<WidgetCtx>(null);
  const openCtx = useCallback((id: string, x: number, y: number) => {
    const me = state.widgets.find(v => v.id === id);
    if (me && me.z == null && me.type !== 'member') {
      const zs = enabled.map(v => v.z ?? 0);
      updateWidget(id, { z: Math.max(...zs, 0) + 1 });
    }
    setCtx({ id, x, y });
  }, [state.widgets, enabled, updateWidget]);
  return { ctx, setCtx, openCtx };
}

export function WidgetEditLayer({ ctx, setCtx, enabled, sideOnly }: {
  ctx: WidgetCtx;
  setCtx: (v: WidgetCtx) => void;
  enabled: WidgetConf[];
  sideOnly?: boolean;
}) {
  const { state, updateWidget, addWidget, removeWidget } = useMainStore();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<WidgetType>('freetext');
  const [addCol, setAddCol] = useState<'1' | '2' | '3'>('3');
  const [delAsk, setDelAsk] = useState<WidgetConf | null>(null);   // 우클릭 삭제 경고 (v1.9)

  // 위젯 추가 — 상단바의 [＋ 위젯] 버튼(그리드 토글 왼쪽)이 이벤트로 연다 (v1.9 사용자 확정)
  useEffect(() => {
    const open = () => setAddOpen(true);
    window.addEventListener('ohome-add-widget', open);
    return () => window.removeEventListener('ohome-add-widget', open);
  }, []);

  // 모달을 열 때 선택돼 있던 종류가 이미 추가된 것이면 항상 가능한 자유 텍스트로 (v1.9)
  useEffect(() => {
    if (!addOpen) return;
    if (!MULTI_TYPES.includes(addType) && state.widgets.some(w => w.type === addType)) setAddType('freetext');
    if (sideOnly && addCol === '2') setAddCol('3');
  }, [addOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 우클릭 겹침 순서 조정 (v1.8) — z가 있는 위젯들 사이에서 이동
  const zOp = (mode: 'top' | 'bottom' | 'up' | 'down') => {
    if (!ctx) return;
    const all = enabled.filter(w => w.z != null);
    const me = enabled.find(w => w.id === ctx.id);
    if (!me) return;
    const zs = all.map(w => w.z!);
    const cur = me.z ?? 0;
    if (mode === 'top') updateWidget(me.id, { z: (zs.length ? Math.max(...zs) : 0) + 1 });
    if (mode === 'bottom') updateWidget(me.id, { z: Math.max(0, (zs.length ? Math.min(...zs) : 1) - 1) });
    if (mode === 'up') {
      const hi = zs.filter(z => z > cur);
      if (hi.length) {
        const nz = Math.min(...hi);
        const other = all.find(w => w.z === nz)!;
        updateWidget(other.id, { z: cur });
        updateWidget(me.id, { z: nz });
      }
    }
    if (mode === 'down') {
      const lo = zs.filter(z => z < cur);
      if (lo.length) {
        const nz = Math.max(...lo);
        const other = all.find(w => w.z === nz)!;
        updateWidget(other.id, { z: cur });
        updateWidget(me.id, { z: nz });
      }
    }
    setCtx(null);
  };

  const me = ctx ? enabled.find(w => w.id === ctx.id) : undefined;

  return (
    <>
      {/* 우클릭 컨텍스트 메뉴 (겹침 순서 v1.8 · 그리드 무시 v1.9 · 설정·삭제 v1.9 사용자 확정) */}
      {ctx && me && (
        <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          {/* 어떤 위젯인지 표시 — 중복 추가 위젯은 번호로 구분 (v1.9) */}
          <div className="ctx-ttl">{widgetLabel(state.widgets, me)}</div>
          <div className="sep" />
          <button onClick={() => zOp('top')}>맨위로</button>
          <button onClick={() => zOp('up')}>위로</button>
          <button onClick={() => zOp('down')}>아래로</button>
          <button onClick={() => zOp('bottom')}>맨아래로</button>
          {/* 텍스트·이미지 같은 장식 요소를 그리드에 안 붙게 자유 배치 (v1.9 사용자 확정) */}
          <button onClick={() => { updateWidget(me.id, { freeMove: !me.freeMove }); setCtx(null); }}>
            {me.freeMove ? '그리드 반영' : '그리드 무시'}
          </button>
          {(EDITABLE.includes(me.type) || (!me.fixed && me.type !== 'menu')) && <div className="sep" />}
          {/* 내용 편집 — 편집모드에서도 우클릭으로 설정 모달을 연다 (v1.9 사용자 확정) */}
          {EDITABLE.includes(me.type) && (
            <button onClick={() => {
              window.dispatchEvent(new CustomEvent('ohome-widget-edit', { detail: { id: me.id } }));
              setCtx(null);
            }}>설정</button>
          )}
          {/* 메뉴 카드(PC 2단형)는 지우면 사이트를 돌아다닐 수 없어서 삭제 불가 (v2.7) — 끄려면 환경설정에서 1단형으로 */}
          {!me.fixed && me.type !== 'menu' && (
            <button className="danger" onClick={() => { setDelAsk(me); setCtx(null); }}>위젯 삭제</button>
          )}
        </div>
      )}

      {/* 위젯 삭제 경고 (v1.9 — 모든 삭제는 경고 모달) */}
      <ConfirmModal open={delAsk !== null}
        title={`「${delAsk ? widgetLabel(state.widgets, delAsk) : ''}」 위젯을 삭제할까요?`}
        body="위젯이 메인과 모든 페이지에서 삭제됩니다. 삭제는 편집 종료 시 「저장 후 종료」를 선택해야 확정되고, 「저장하지 않고 종료」를 선택하면 되돌아옵니다."
        onClose={() => setDelAsk(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { if (delAsk) removeWidget(delAsk.id); setDelAsk(null); toast('위젯이 삭제되었습니다 — 편집 종료 시 저장하면 확정됩니다'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(null) },
        ]} />

      {/* 위젯 추가 모달 (4.0 · 중복 방지 v1.9 — 이미지·자유 텍스트만 여러 개 가능) */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} small
        title="위젯 추가"
        desc={sideOnly
          ? '종류와 배치 열을 선택 — 이 페이지에서는 왼쪽·오른쪽 열에만 추가할 수 있습니다 (중앙은 메인에서)'
          : '종류와 배치 열을 선택 — 이미 추가한 위젯은 다시 추가할 수 없음 (이미지·자유 텍스트 제외)'}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            if (!MULTI_TYPES.includes(addType) && state.widgets.some(w => w.type === addType)) return;
            const id = addWidget(addType, Number(addCol) as 1 | 2 | 3);
            setAddOpen(false);
            toast('위젯이 추가되었습니다 — 우클릭 메뉴에서 설정·삭제할 수 있습니다');
            // 추가 위치가 화면 밖(열 하단)일 수 있어 새 위젯으로 스크롤 (v1.9 사용자 피드백)
            setTimeout(() => document.querySelector(`[data-wid="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
          }}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 7, marginBottom: 14 }}>
          {ADDABLE.map(t => {
            const taken = !MULTI_TYPES.includes(t) && state.widgets.some(w => w.type === t);
            return (
              <KRadio key={t} name="wgt-type" value={t} current={addType} disabled={taken}
                onChange={v => setAddType(v as WidgetType)}
                label={<span>
                  <b style={{ fontSize: 12.5 }}>{WIDGET_META[t].title}</b>{' '}
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{WIDGET_META[t].desc}</small>
                  {taken && <span className="pill" style={{ marginLeft: 6 }}>추가됨</span>}
                  {MULTI_TYPES.includes(t) && <span className="pill" style={{ marginLeft: 6 }}>중복 추가 가능</span>}
                </span>} />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <KRadio name="wgt-col" value="1" current={addCol} onChange={v => setAddCol(v as '1')} label="왼쪽 열" />
          {!sideOnly && <KRadio name="wgt-col" value="2" current={addCol} onChange={v => setAddCol(v as '2')} label="중앙" />}
          <KRadio name="wgt-col" value="3" current={addCol} onChange={v => setAddCol(v as '3')} label="오른쪽 열" />
        </div>
      </Modal>
    </>
  );
}
