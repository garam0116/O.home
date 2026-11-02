'use client';
// 상단 바 — 기획서 3장(계층 메뉴) + 4.0(프로필 드롭다운 · 편집모드 · 그리드 토글)
// 로고 클릭 = 메인 이동 (v1.5) · 상위 메뉴 클릭 = 첫 하위 페이지 이동 (v1.8)
// 편집모드 중 페이지 이동 시도 → 종료 확인 모달 (v1.8)
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useSiteSettings } from '@/lib/siteStore';
import { useMainStore } from '@/lib/mainStore';
import { useBlobUrl } from '@/lib/blobStore';
import { KToggle } from '@/components/ui/Kit';
import { isRailPage } from '@/lib/widgetZone';
import { useSiteMenu, useSiteNav, UserArea, useBrandFit, type SiteMenuItem } from './siteNav';

export function TopBar() {
  const { state, editOn, gridOn, setGridOn, requestExit, setCenterAlign } = useMainStore();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);       // 모바일 메뉴 패널 (≡) — 메뉴리스트 위젯 대체
  // 메뉴 관리(5.2)·다중 게시판·섹션·커스텀 링크 — 메뉴 카드(PC 2단형)와 공용 (v2.7)
  const { menu } = useSiteMenu();
  const [site, , siteLoaded] = useSiteSettings();    // 로고 텍스트/서브/정렬 (5.2)
  // 로고 이미지 (v2.2 사용자 요청) — 모바일용만 있으면 PC는 텍스트, 모바일은 이미지
  const logoPcRaw = useBlobUrl(site.logoImage);
  const logoMRaw = useBlobUrl(site.logoImageM);
  const logoPc = logoPcRaw || logoMRaw;
  const logoM = logoPcRaw && logoMRaw && logoMRaw !== logoPcRaw ? logoMRaw : undefined;
  const brandRef = useRef<HTMLAnchorElement>(null);
  const brandFit = useBrandFit(brandRef, `${site.title}|${site.subtitle}|${logoPc ?? ''}|${siteLoaded}`);

  // 편집모드 중에는 이동 전에 종료 확인 (v1.8) · 같은 메뉴 재클릭 = 페이지만 다시 그림 (v1.9)
  const nav = useSiteNav();

  // 상위 메뉴 개수 무제한 (v1.9) — 바 폭을 넘치는 항목은 「⋯」 드롭다운으로 자동 이동 (priority+)
  const gnbRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visCount, setVisCount] = useState(menu.length);
  const menuKey = menu.map(m => m.label).join('|');
  useEffect(() => {
    const gnbEl = gnbRef.current, mEl = measureRef.current;
    if (!gnbEl || !mEl) return;
    const GAP = 2;
    const compute = () => {
      const avail = gnbEl.clientWidth;
      const kids = Array.from(mEl.children) as HTMLElement[];
      if (avail <= 0) {                            // gnb 숨김(모바일)·미표시 상태 — 측정 불가 시 전체 표시
        setVisCount(kids.length - 1);
        return;
      }
      const moreW = kids[kids.length - 1]?.offsetWidth ?? 40;   // 마지막 = ⋯ 측정용
      const widths = kids.slice(0, -1).map(k => k.offsetWidth);
      const total = widths.reduce((a, w) => a + w, 0) + GAP * Math.max(0, widths.length - 1);
      let count = widths.length;
      if (total > avail) {
        const limit = avail - moreW - GAP;
        let used = 0; count = 0;
        for (const w of widths) {
          if (used + w > limit) break;
          used += w + GAP; count++;
        }
      }
      setVisCount(c => (c === count ? c : count));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(gnbEl); ro.observe(mEl);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuKey]);
  // 모바일 메뉴 패널 — 페이지가 바뀌면 닫고, 열려 있는 동안 뒤 화면 스크롤 잠금
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', esc);
    return () => { html.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [navOpen]);

  const visMenu = menu.slice(0, visCount);
  const moreMenu = menu.slice(visCount);

  return (
    <header className="topbar">
      {/* 로고 — 텍스트·서브타이틀·정렬은 환경설정 > 디자인 (5.2) */}
      {/* 로고 이미지 (v2.2) — 지정하면 텍스트 대신 이미지 · 모바일용이 따로 있으면 620px 이하에서 교체.
          텍스트 로고는 폭이 모자라면 글자 크기·간격을 함께 줄여 맞춘다 (useBrandFit) */}
      {/* 진짜 링크(<a href="/">)로 둔다 (v2.5 사용자 요청) — 아이폰에서 꾹 누르면 「새로운 탭에서 열기」 메뉴가 뜨고,
          PC에서도 휠 클릭·Ctrl/⌘ 클릭으로 새 탭에서 열 수 있다. 보통 클릭은 기존처럼 앱 안에서 이동(nav). */}
      <a href="/" className={`brand ${logoPc ? 'has-img' : ''}`} ref={brandRef}
        onClick={e => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault(); nav('/');
        }}
        style={{ '--brand-fit': brandFit } as React.CSSProperties}>
        {siteLoaded && (logoPc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`brand-img ${logoM ? 'pc' : ''}`} src={logoPc} alt={site.title} draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoM && <img className="brand-img m" src={logoM} alt={site.title} draggable={false} />}
          </>
        ) : site.title)}
        {siteLoaded && site.subtitle && <small className={`al-${site.align}`}>{site.subtitle}</small>}
      </a>

      <nav className="gnb" ref={gnbRef}>
        {visMenu.map(item =>
          item.children ? (
            <div className="grp" key={item.label}>
              {/* 상위 클릭 → 첫 하위 페이지 (v1.8) */}
              <button onClick={() => nav(item.children![0].href)}>
                {item.label}
              </button>
              <div className="sub">
                {item.children.map(c => (
                  <button key={c.href} onClick={() => nav(c.href)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              key={item.label}
              className={pathname === item.href ? 'on' : ''}
              onClick={() => nav(item.href!)}
            >
              {item.label}
            </button>
          )
        )}
        {/* 넘친 상위 메뉴 — ⋯ 드롭다운 (그룹은 캡션+하위, 단독은 바로 이동) */}
        {moreMenu.length > 0 && (
          <div className="grp more">
            <button aria-label="더보기">
              ⋯
            </button>
            <div className="sub">
              {moreMenu.map(item =>
                item.children ? (
                  <div className="sub-grp" key={item.label}>
                    <div className="sub-cap">{item.label}</div>
                    {item.children.map(c => (
                      <button key={c.href} onClick={() => nav(c.href)}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button key={item.label} onClick={() => nav(item.href!)}>
                    {item.label}
                  </button>
                ))}
            </div>
          </div>
        )}
        {/* 폭 측정용 사본 (보이지 않음) — 마지막 항목은 ⋯ 버튼 폭 */}
        <div className="gnb gnb-measure" ref={measureRef} aria-hidden>
          {menu.map(item => <button key={item.label} tabIndex={-1}>{item.label}{item.children && <span> ▾</span>}</button>)}
          <button tabIndex={-1}>⋯</button>
        </div>
      </nav>

      {/* 위젯 추가 — 그리드 토글 왼쪽 (v1.9 사용자 확정: 본문 하단 버튼 대체) */}
      {editOn && (pathname === '/' || isRailPage(pathname)) && (
        <button className="btn btn-ghost" style={{ height: 27, padding: '0 11px', fontSize: 10.5, whiteSpace: 'nowrap' }}
          onClick={() => window.dispatchEvent(new Event('ohome-add-widget'))}>＋ 위젯</button>
      )}
      {/* 가운데 정렬 — 가운데 열 위젯을 캔버스 한가운데로, 다른 페이지 본문을 화면 한가운데로 (사용자 요청) */}
      <KToggle
        className={`grid-chip ${editOn && (pathname === '/' || isRailPage(pathname)) ? 'show' : ''}`}
        label="가운데 정렬"
        checked={!!state.centerBody}
        onChange={setCenterAlign}
      />
      {/* 그리드 토글 — 위젯이 있는 페이지에서 편집모드 켰을 때 (v1.9 · 모든 페이지 v2.4) */}
      <KToggle
        className={`grid-chip ${editOn && (pathname === '/' || isRailPage(pathname)) ? 'show' : ''}`}
        label="그리드"
        checked={gridOn}
        onChange={setGridOn}
      />
      {/* 편집중 표시 — 클릭 시 종료 확인 (v1.8) */}
      <span className={`edit-flag ${editOn ? 'show' : ''}`} onClick={() => requestExit()}>
        ✎ 편집중
      </span>

      {/* 사용자 영역 — 비로그인: 로그인 버튼 / 로그인: 프로필 드롭다운 (3장 주석, 4.0) */}
      <UserArea nav={nav} onOpen={() => setNavOpen(false)} />

      {/* 모바일 메뉴 버튼 — 아이콘: Lucide 「menu」 (ISC 라이선스) */}
      <button className="m-nav-btn" aria-label="메뉴 열기" aria-expanded={navOpen}
        onClick={() => setNavOpen(o => !o)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>
      {/* 상단바에 backdrop-filter가 있어 fixed 패널이 바 안에 갇히므로 body로 내보낸다 */}
      {navOpen && createPortal(
        <MobileNav menu={menu} pathname={pathname} onNav={href => { setNavOpen(false); nav(href); }} onClose={() => setNavOpen(false)} />,
        document.body,
      )}
    </header>
  );
}

type MenuItem = SiteMenuItem;

/** 모바일 메뉴 패널 — 오른쪽에서 열림. 하위 메뉴는 펼침/접힘, 현재 페이지가 속한 그룹은 처음부터 펼침 */
function MobileNav({ menu, pathname, onNav, onClose }: {
  menu: MenuItem[]; pathname: string; onNav: (href: string) => void; onClose: () => void;
}) {
  const cur = pathname + (typeof window !== 'undefined' ? window.location.search : '');
  const isCur = (href?: string) => !!href && (href === cur || href === pathname);
  const [open, setOpen] = useState<string | null>(() => menu.find(m => m.children?.some(c => isCur(c.href)))?.label ?? null);
  return (
    <div className="m-nav" role="dialog" aria-modal="true" aria-label="메뉴">
      <div className="m-nav-dim" onClick={onClose} />
      <nav className="m-nav-panel">
        <div className="m-nav-head">
          <button className="m-nav-x" aria-label="메뉴 닫기" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <div className="m-nav-list">
          {menu.map(m => m.children ? (
            <div key={m.label} className={`m-nav-grp ${open === m.label ? 'open' : ''} ${m.children.some(c => isCur(c.href)) ? 'on' : ''}`}>
              <button className="m-nav-top" aria-expanded={open === m.label}
                onClick={() => setOpen(o => (o === m.label ? null : m.label))}>{m.label}</button>
              <div className="m-nav-sub">
                {m.children.map(c => (
                  <button key={c.href} className={isCur(c.href) ? 'on' : ''} onClick={() => onNav(c.href)}>{c.label}</button>
                ))}
              </div>
            </div>
          ) : (
            <button key={m.label} className={`m-nav-top ${isCur(m.href) ? 'on' : ''}`} onClick={() => onNav(m.href!)}>{m.label}</button>
          ))}
        </div>
      </nav>
    </div>
  );
}
