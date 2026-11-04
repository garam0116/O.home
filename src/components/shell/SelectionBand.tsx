'use client';
// 반칸 형광펜 (v3.8 사용자 요청 — 환경설정 > 디자인 「드래그 효과」) — 글자를 끌어 선택하면
// 선택된 글줄마다 글자 아래 절반(46~96% 높이)에만 포인트색 띠를 깐다.
// ::selection으로는 이 모양을 만들 수 없어서(선택 영역의 밑줄은 굵기만 바뀌고 위로 올라가지 않는다)
// 선택 영역은 비워 두고(theme.ts selectionVars) 여기서 화면 고정 띠(.sel-band)를 겹쳐 그린다.
// 효과가 반칸 형광펜(--sel-fx: half)일 때만 동작하고, 입력칸(input·textarea) 안의 선택은 건너뛴다.
// 스크롤 영역에 가려진 글자 위로 띠가 삐져나오지 않게, 글자를 감싼 스크롤 영역의 경계로 잘라서 그린다.
import { useEffect } from 'react';

const TOP = 0.46, HEIGHT = 0.5;

type Box = { l: number; t: number; r: number; b: number };

/** 글자를 감싼 조상 중 넘치는 내용을 잘라내는 상자들의 겹친 영역 (화면 좌표) */
function clipBox(el: Element | null): Box {
  let box: Box = { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const r = e.getBoundingClientRect();
    box = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) };
  }
  return box;
}

export function SelectionBand() {
  useEffect(() => {
    const bands: HTMLDivElement[] = [];
    let raf = 0;
    const clear = () => { for (const b of bands.splice(0)) b.remove(); };

    const draw = () => {
      raf = 0;
      const sel = document.getSelection();
      const has = !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
      if (!has && !bands.length) return;   // 선택 없는 스크롤마다 스타일을 읽지 않게
      clear();
      if (!has || getComputedStyle(document.documentElement).getPropertyValue('--sel-fx').trim() !== 'half') return;
      const act = document.activeElement;
      if (act instanceof HTMLInputElement || act instanceof HTMLTextAreaElement) return;
      const range = sel!.getRangeAt(0);
      const common = range.commonAncestorContainer;
      const rootEl = common.nodeType === Node.ELEMENT_NODE ? common as Element : common.parentElement;
      if (!rootEl) return;
      const clip = clipBox(rootEl);
      const frag = document.createDocumentFragment();
      const add = (c: DOMRect) => {
        const top = c.top + c.height * TOP, bottom = top + c.height * HEIGHT;
        const box = { l: Math.max(c.left, clip.l), t: Math.max(top, clip.t), r: Math.min(c.right, clip.r), b: Math.min(bottom, clip.b) };
        if (box.r - box.l < 1 || box.b - box.t < 1) return;
        const d = document.createElement('div');
        d.className = 'sel-band';
        d.style.cssText = `left:${box.l}px;top:${box.t}px;width:${box.r - box.l}px;height:${box.b - box.t}px`;
        frag.appendChild(d); bands.push(d);
      };
      // 글자 조각마다 따로 잰다 — range.getClientRects()는 감싼 요소 상자까지 섞여 띠가 겹쳐 진해진다
      const texts: Text[] = common.nodeType === Node.TEXT_NODE ? [common as Text] : [];
      if (!texts.length) {
        const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (range.intersectsNode(n)) texts.push(n as Text);
      }
      const r = document.createRange();
      for (const n of texts) {
        if (!n.data.trim()) continue;
        r.setStart(n, n === range.startContainer ? range.startOffset : 0);
        r.setEnd(n, n === range.endContainer ? range.endOffset : n.length);
        for (const c of r.getClientRects()) add(c);
      }
      document.body.appendChild(frag);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

    document.addEventListener('selectionchange', schedule);
    window.addEventListener('scroll', schedule, true);   // #appMain 등 안쪽 스크롤도 잡는다
    window.addEventListener('resize', schedule);
    return () => {
      document.removeEventListener('selectionchange', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, []);
  return null;
}
