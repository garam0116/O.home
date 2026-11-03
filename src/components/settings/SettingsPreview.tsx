'use client';
// 환경설정 디자인 그룹 미리보기 (v3.1 사용자 요청) — PC / 모바일.
//
// 같은 사이트를 iframe으로 띄우고(주소에 미리보기 표시), 설정 화면에서 바꾼 저장 전 값을 넘겨 준다.
//  · 테마 색·배경·역할 폰트 = 이 문서 <html>에 칠해진 CSS 변수를 그대로 복사
//  · 웹폰트 = 이 문서가 불러 둔 폰트 <link>/<style>
//  · 로고·메뉴 모양·게시판 폭 등 = 사이트 드래프트 + settingStore 드래프트 값
// iframe 안 앱은 저장을 하지 않는다(lib/previewFrame). 화면 크기는 실제 기기 폭으로 그리고 줄여서 보여 준다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PREVIEW_MSG, PREVIEW_PARAM, PreviewState } from '@/lib/previewFrame';
import { settingDraftValues, DRAFT_EVT } from '@/lib/settingStore';
import { useSiteDraft } from '@/lib/siteStore';

export type PreviewDevice = 'pc' | 'm';
const SIZE: Record<PreviewDevice, { w: number; h: number }> = {
  pc: { w: 1280, h: 800 },
  m: { w: 390, h: 844 },
};

function collectState(site: unknown, siteDirty: boolean): PreviewState {
  const css: Record<string, string> = {};
  const st = document.documentElement.style;
  for (let i = 0; i < st.length; i++) {
    const k = st[i];
    if (k.startsWith('--')) css[k] = st.getPropertyValue(k);
  }
  const fonts: PreviewState['fonts'] = [];
  document.head.querySelectorAll<HTMLElement>('link[id^="ohome-"], style[id^="ohome-font-"]').forEach(el => {
    if (el.tagName === 'LINK') fonts.push({ id: el.id, href: (el as HTMLLinkElement).href });
    else fonts.push({ id: el.id, css: el.textContent ?? '' });
  });
  const settings = settingDraftValues();
  if (siteDirty) settings['ohome.site.v1'] = site;
  return { type: PREVIEW_MSG, css, fonts, settings };
}

export function SettingsPreview({ device, onDevice }: {
  device: PreviewDevice; onDevice: (d: PreviewDevice) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [nonce, setNonce] = useState(0);
  const { site, dirty: siteDirty } = useSiteDraft();
  const latest = useRef({ site: site as unknown, siteDirty });
  latest.current = { site, siteDirty };

  const send = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(collectState(latest.current.site, latest.current.siteDirty), window.location.origin);
    } catch { /* 아직 로드 전 */ }
  }, []);

  // 미리보기가 준비됐다고 알려 오면 지금 상태를 보낸다
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if ((e.data as { type?: string; ready?: boolean })?.type === PREVIEW_MSG) send();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [send]);

  // 바뀔 때마다 보낸다 — 테마(<html> 스타일)·폰트(<head>)·드래프트 값
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const later = () => { if (t) clearTimeout(t); t = setTimeout(send, 60); };
    const mo = new MutationObserver(later);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    mo.observe(document.head, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener(DRAFT_EVT, later);
    window.addEventListener('ohome-site', later);
    return () => {
      if (t) clearTimeout(t);
      mo.disconnect();
      window.removeEventListener(DRAFT_EVT, later);
      window.removeEventListener('ohome-site', later);
    };
  }, [send]);
  useEffect(() => { send(); }, [site, siteDirty, send]);

  // 칸 크기에 맞춰 줄인다
  const size = SIZE[device];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 24, h = el.clientHeight - 24;
      setScale(Math.max(0.15, Math.min(1, w / size.w, h / size.h)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h]);

  return (
    <aside className="setx-pv" aria-label="미리보기">
      <div className="setx-pv-head">
        <span className="setx-eyebrow">PREVIEW</span>
        <div className="mini-seg">
          <button className={device === 'pc' ? 'on' : ''} onClick={() => onDevice('pc')}>PC</button>
          <button className={device === 'm' ? 'on' : ''} onClick={() => onDevice('m')}>모바일</button>
        </div>
        <button className="setx-icon" data-tip="처음 화면으로" aria-label="미리보기 새로고침"
          onClick={() => setNonce(n => n + 1)}>↻</button>
      </div>
      <div className="setx-pv-box" ref={box}>
        <div className={`setx-pv-dev ${device}`} style={{ width: size.w * scale, height: size.h * scale }}>
          <iframe key={nonce} ref={frame} title="사이트 미리보기"
            src={`/?${PREVIEW_PARAM}=1`}
            style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} />
        </div>
      </div>
      <p className="setx-pv-note">바꾸는 대로 바로 보입니다 · 미리보기 안에서 바꾼 것은 저장되지 않습니다</p>
    </aside>
  );
}
