'use client';
// 환경설정 미리보기 iframe 안쪽 (v3.1) — 부모(설정 화면)가 보내는 저장 전 값을 받아 그린다.
// 미리보기가 아닌 보통 화면에서는 아무 일도 하지 않는다.
import React, { useEffect, useState } from 'react';
import { isPreviewFrame, PREVIEW_MSG, PreviewState } from '@/lib/previewFrame';
import { applyPreviewSettings } from '@/lib/settingStore';

export function PreviewBridge() {
  useEffect(() => {
    if (!isPreviewFrame()) return;
    const root = document.documentElement;
    root.classList.add('ohome-preview');
    let want: Record<string, string> = {};
    let applying = false;
    /* 이 안의 테마 프로바이더도 저장본을 한 번 칠한다 — 늦게 칠해도 부모 값이 이기게,
       <html> 스타일이 바뀌면 받은 값과 다른 칸만 다시 덮는다 (같은 값이면 건드리지 않아 되풀이되지 않음) */
    const paint = () => {
      if (applying) return;
      applying = true;
      try {
        const st = root.style;
        for (const [k, v] of Object.entries(want)) if (st.getPropertyValue(k) !== v) st.setProperty(k, v);
        for (let i = st.length - 1; i >= 0; i--) {
          const k = st[i];
          if (k.startsWith('--') && !(k in want)) st.removeProperty(k);
        }
      } finally { applying = false; }
    };
    const mo = new MutationObserver(paint);
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });

    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const d = e.data as PreviewState | null;
      if (!d || d.type !== PREVIEW_MSG) return;
      want = d.css;
      paint();
      // 웹폰트 — 부모가 불러 둔 것과 같은 id로 맞춘다 (저장 전 고른 폰트도 바로 보이게)
      d.fonts.forEach(f => {
        let el = document.getElementById(f.id);
        if (f.href) {
          if (!el || el.tagName !== 'LINK') {
            el?.remove();
            el = Object.assign(document.createElement('link'), { id: f.id, rel: 'stylesheet' });
            document.head.appendChild(el);
          }
          if ((el as HTMLLinkElement).href !== f.href) (el as HTMLLinkElement).href = f.href;
        } else if (f.css != null) {
          if (!el || el.tagName !== 'STYLE') {
            el?.remove();
            el = Object.assign(document.createElement('style'), { id: f.id });
            document.head.appendChild(el);
          }
          if (el.textContent !== f.css) el.textContent = f.css;
        }
      });
      applyPreviewSettings(d.settings);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: PREVIEW_MSG, ready: true }, window.location.origin);
    return () => { mo.disconnect(); window.removeEventListener('message', onMsg); };
  }, []);
  return null;
}

/** 미리보기 iframe 안에서는 그리지 않을 것 (BGM 재생·관리자 접속 때 도는 정리 작업 등) */
export function NotInPreview({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { setOk(!isPreviewFrame()); }, []);
  return ok ? <>{children}</> : null;
}
