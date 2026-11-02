'use client';
// 메뉴 카드 (v2.7 사용자 요청 — PC 2단형 레이아웃, 시안 D5 「짧은 카드 + 옆 펼침」)
// 로고 · 대메뉴 · 사용자 영역을 카드 한 장에 담고, 하위 메뉴는 마우스를 올리면 옆으로 펼친다.
// 위젯이라 편집모드에서 좌우 열 안에서만 옮길 수 있다(가운데 열 금지 · 삭제 불가 — WidgetFrame/WidgetEditLayer).
// 스크롤해도 따라오지 않고 놓인 자리에 그대로 있다(사용자 요청). 모바일은 CSS로 숨기고 상단바 ≡가 대신한다.
import React, { useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { WidgetConf } from '@/lib/mainStore';
import { useSiteSettings } from '@/lib/siteStore';
import { useBlobUrl } from '@/lib/blobStore';
import { sideOf } from '@/lib/widgetZone';
import { useSiteMenu, useSiteNav, UserArea, useBrandFit } from '@/components/shell/siteNav';

export function MenuCard({ conf }: { conf: WidgetConf }) {
  const { menu } = useSiteMenu();
  const nav = useSiteNav();
  const pathname = usePathname();
  const [site, , siteLoaded] = useSiteSettings();
  const logoRaw = useBlobUrl(site.logoImage);
  const logoMRaw = useBlobUrl(site.logoImageM);
  const logo = logoRaw || logoMRaw;
  const brandRef = useRef<HTMLAnchorElement>(null);
  const brandFit = useBrandFit(brandRef, `${site.title}|${site.subtitle}|${logo ?? ''}|${siteLoaded}|${conf.w ?? 230}`);
  // 오른쪽 열에 두면 하위 메뉴를 왼쪽으로 펼친다 — 화면 밖으로 나가지 않게
  const right = sideOf(conf) === 3;

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const isCur = (href?: string) => !!href && (href === pathname + search || href === pathname);


  return (
    <div className={`menu-card ${right ? 'mc-right' : ''}`}>
      {/* 로고 — 상단바와 같은 설정(텍스트·서브타이틀·이미지). 진짜 링크라 새 탭 열기도 된다 (v2.5와 같은 규칙) */}
      <a href="/" className={`brand mc-brand ${logo ? 'has-img' : ''}`} ref={brandRef}
        onClick={e => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault(); nav('/');
        }}
        style={{ '--brand-fit': brandFit } as React.CSSProperties}>
        {siteLoaded && (logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="brand-img" src={logo} alt={site.title} draggable={false} />
          : site.title)}
        {siteLoaded && site.subtitle && <small className={`al-${site.align}`}>{site.subtitle}</small>}
      </a>
      <div className="mc-hr" />
      <nav className="mc-list">
        {menu.map(m => {
          const on = m.children ? m.children.some(c => isCur(c.href)) : isCur(m.href);
          return (
            <div key={m.label} className={`mc-item ${m.children ? 'mc-grp' : ''} ${on ? 'on' : ''}`}>
              {/* 상위 클릭 → 첫 하위 페이지 (상단바와 같은 규칙, v1.8) */}
              <button className="mc-top" onClick={() => nav(m.children ? m.children[0].href : m.href!)}>{m.label}</button>
              {m.children && (
                <div className="mc-sub">
                  {m.children.map(c => (
                    <button key={c.href} className={isCur(c.href) ? 'on' : ''} onClick={() => nav(c.href)}>{c.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="mc-foot"><UserArea nav={nav} /></div>
    </div>
  );
}
