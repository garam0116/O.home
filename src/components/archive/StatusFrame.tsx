'use client';
/**
 * 아카이브 카드의 HTML 미리보기 — 붙여 넣은 HTML을 그대로 그린다.
 *
 * · 격리: iframe(srcdoc)에 `sandbox="allow-same-origin"`만 준다. **allow-scripts가 없어 스크립트·인라인
 *   이벤트는 하나도 실행되지 않는다.** 같은 출처로 두는 이유는 부모가 안쪽 문서 크기를 직접 재기 위해서다
 *   (로그 백업처럼 높이 리포터 스크립트를 넣을 필요가 없다). 스크립트가 없으니 안쪽에서 부모로 손을 뻗을 길도 없다.
 * · 맞춤(fit='box'): 칸(4:3)은 고정이고, 상태창은 비율 그대로 줄여 칸 안에 통째로 넣는다(키우지는 않는다).
 *   가로는 가운데, 세로는 **칸 바닥에 붙인다** — 상태창이 끝나자마자 제목이 오고 한 줄의 제목 높이가 같다.
 * · 맞춤(fit='width'): 폭에만 맞추고 높이는 내용만큼 (작성 창 미리보기).
 * · 스크롤·바탕·그림자 없음 — 안쪽 문서의 여백·스크롤을 끄고 바탕을 투명하게 둔다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** 상태창을 처음 펼쳐 볼 폭 — 이보다 넓게 짠 HTML은 그 폭을 그대로 쓴다 */
const BASE_W = 440;

const docOf = (html: string) =>
  '<!doctype html><html><head><meta charset="utf-8">'
  + '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{display:flow-root}</style>'
  + `</head><body>${html}</body></html>`;

export function StatusFrame({ html, fit = 'box', title }: {
  html: string; fit?: 'box' | 'width'; title?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  const srcDoc = useMemo(() => docOf(html), [html]);

  /** 안쪽 문서의 실제 크기 — 폭이 기본보다 넓게 짜인 HTML이면 그 폭으로 펼쳐 다시 잰다 */
  const measure = useCallback(() => {
    const f = frameRef.current;
    const doc = f?.contentDocument;
    if (!f || !doc?.body) return;
    // 바깥 문서는 overflow:hidden이라 documentElement.scrollWidth가 넘친 폭을 놓칠 때가 있다 —
    // body의 scrollWidth도 함께 본다 (width:400px + 안쪽 여백처럼 기본 폭을 넘는 상태창의 오른쪽이 잘리던 문제)
    const w = Math.max(BASE_W, Math.ceil(doc.documentElement.scrollWidth), Math.ceil(doc.body.scrollWidth));
    if (Math.abs(f.offsetWidth - w) > 1) f.style.width = `${w}px`;
    const h = Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height));
    setSize(s => (s && s.w === w && s.h === h ? s : { w, h: Math.max(1, h) }));
  }, []);

  const onLoad = useCallback(() => {
    measure();
    // 웹폰트가 늦게 오면 글줄이 바뀌어 높이가 달라진다 — 한 번 더 잰다
    try { void frameRef.current?.contentDocument?.fonts?.ready.then(measure); } catch { /* 무시 */ }
  }, [measure]);

  useEffect(() => { setSize(null); }, [srcDoc]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setBoxW(el.clientWidth); setBoxH(el.clientHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let style: React.CSSProperties = { width: BASE_W, height: 1, opacity: 0 };
  let boxStyle: React.CSSProperties | undefined;
  if (size && boxW) {
    const s = fit === 'box'
      ? Math.min(1, boxW / size.w, boxH / size.h)
      : Math.min(1, boxW / size.w);
    const x = (boxW - size.w * s) / 2;
    const y = fit === 'box' ? boxH - size.h * s : 0;
    style = { width: size.w, height: size.h, transform: `translate(${x}px,${y}px) scale(${s})` };
    if (fit === 'width') boxStyle = { height: size.h * s };
  }

  return (
    <div ref={boxRef} className={`ar-frame ${fit === 'box' ? 'box' : 'auto'}`} style={boxStyle}>
      <iframe ref={frameRef} srcDoc={srcDoc} sandbox="allow-same-origin" scrolling="no"
        title={title ?? 'HTML 미리보기'} tabIndex={-1} aria-hidden={!title}
        onLoad={onLoad} style={style} />
    </div>
  );
}
