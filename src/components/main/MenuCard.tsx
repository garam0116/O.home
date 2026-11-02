'use client';
// 메뉴 카드 (v2.7 사용자 요청 — PC 2단형 레이아웃, 시안 D5 「짧은 카드 + 옆 펼침」)
// 로고 · 대메뉴 · 사용자 영역을 카드 한 장에 담고, 하위 메뉴는 마우스를 올리면 옆으로 펼친다(누르면 접힘).
// 게시판 메뉴는 오른쪽에 글 수를 적는다.
// 위젯이라 편집모드에서 좌우 열 안에서만 옮길 수 있다(가운데 열 금지 · 삭제 불가 — WidgetFrame/WidgetEditLayer).
// 스크롤해도 화면의 같은 자리(맨 위에 있을 때 위치)에 그대로 보인다(사용자 요청 · 편집모드 중에는 끔). 모바일은 CSS로 숨기고 상단바 ≡가 대신한다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { WidgetConf } from '@/lib/mainStore';
import { useMainStore } from '@/lib/mainStore';
import { useSiteSettings } from '@/lib/siteStore';
import { useBlobUrl } from '@/lib/blobStore';
import { useBoards, boardHref, MAIN_BOARD_ID } from '@/lib/boardStore';
import { useLocalList, BOARD_SEED, type Post } from '@/lib/postStore';
import { sideOf } from '@/lib/widgetZone';
import { useSiteMenu, useSiteNav, UserArea, useBrandFit } from '@/components/shell/siteNav';

/** 카드가 화면보다 길 때 카드 아래쪽과 화면 아래 사이 간격 (px) */
const STICK_GAP = 16;

export function MenuCard({ conf }: { conf: WidgetConf }) {
  const { menu } = useSiteMenu();
  const nav = useSiteNav();
  const pathname = usePathname();
  const { editOn } = useMainStore();
  const [site, , siteLoaded] = useSiteSettings();
  const logoRaw = useBlobUrl(site.logoImage);
  const logoMRaw = useBlobUrl(site.logoImageM);
  const logo = logoRaw || logoMRaw;
  const brandRef = useRef<HTMLAnchorElement>(null);
  const brandFit = useBrandFit(brandRef, `${site.title}|${site.subtitle}|${logo ?? ''}|${siteLoaded}|${conf.w ?? 230}`);
  const cardRef = useRef<HTMLDivElement>(null);
  // 오른쪽 열에 두면 하위 메뉴를 왼쪽으로 펼친다 — 화면 밖으로 나가지 않게
  const right = sideOf(conf) === 3;
  // 메뉴를 눌러 이동하면 펼친 하위 메뉴를 접는다 (사용자 요청 — 클릭한 버튼에 포커스가 남아 펼침이 유지되고,
  // 다른 대메뉴에 마우스를 올리면 두 펼침이 겹쳐 보였다). 마우스가 그 대메뉴를 벗어나면 다시 펼칠 수 있다.
  const [shut, setShut] = useState<string | null>(null);
  const go = (label: string, href: string) => {
    setShut(label);
    (document.activeElement as HTMLElement | null)?.blur?.();
    nav(href);
  };

  // 게시판 메뉴 오른쪽 글 수 (사용자 요청) — 게시판 목록과 같은 기준(그 게시판에 속한 글 전체)
  const { boards } = useBoards();
  const [posts, , postsLoaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!postsLoaded) return m;
    const per = new Map<string, number>();
    for (const p of posts) { const b = p.boardId ?? MAIN_BOARD_ID; per.set(b, (per.get(b) ?? 0) + 1); }
    for (const b of boards) m.set(boardHref(b.id, boards), per.get(b.id) ?? 0);
    return m;
  }, [posts, postsLoaded, boards]);
  const countOf = (href?: string) => {
    const n = href ? counts.get(href) : undefined;
    return n == null ? null : <span className="mc-cnt">{n}</span>;
  };

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const isCur = (href?: string) => !!href && (href === pathname + search || href === pathname);

  // 화면 고정 — 위젯은 캔버스 절대 좌표라 CSS fixed/sticky를 쓸 수 없으므로, 스크롤 영역(#appMain) 기준으로
  // 스크롤한 만큼 아래로 옮겨 페이지 맨 위에 있을 때의 화면 위치를 그대로 지킨다.
  // 그 위치에서 카드가 화면 아래로 넘치면 카드 아래쪽을 화면 아래에 맞춘다(넘친 부분이 안 보이게 되지 않도록).
  useEffect(() => {
    const card = cardRef.current;
    const wrap = card?.parentElement;
    const sc = document.getElementById('appMain');
    if (!card || !wrap || !sc) return;
    if (editOn) { card.style.transform = ''; return; }
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (window.matchMedia('(max-width:620px)').matches) { card.style.transform = ''; return; }
        const top = wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top;
        const vh = sc.clientHeight, ch = card.offsetHeight;
        const home = top + sc.scrollTop;   // 스크롤 0일 때 카드의 화면 위치
        const stick = Math.min(home, vh - STICK_GAP - ch);
        const off = Math.max(0, stick - top);
        card.style.transform = off ? `translateY(${Math.round(off)}px)` : '';
      });
    };
    run();
    sc.addEventListener('scroll', run, { passive: true });
    window.addEventListener('resize', run);
    const ro = new ResizeObserver(run);
    ro.observe(card);
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', run);
      window.removeEventListener('resize', run);
      ro.disconnect();
      card.style.transform = '';
    };
  }, [editOn, pathname]);

  return (
    <div ref={cardRef} className={`menu-card ${right ? 'mc-right' : ''}`}>
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
            <div key={m.label} className={`mc-item ${m.children ? 'mc-grp' : ''} ${on ? 'on' : ''} ${shut === m.label ? 'shut' : ''}`}
              onMouseLeave={() => { if (shut === m.label) setShut(null); }}>
              {/* 상위 클릭 → 첫 하위 페이지 (상단바와 같은 규칙, v1.8) */}
              <button className="mc-top" onClick={() => go(m.label, m.children ? m.children[0].href : m.href!)}>
                <span className="mc-lbl">{m.label}</span>{!m.children && countOf(m.href)}
              </button>
              {m.children && (
                <div className="mc-sub">
                  {m.children.map(c => (
                    <button key={c.href} className={isCur(c.href) ? 'on' : ''} onClick={() => go(m.label, c.href)}>
                      <span className="mc-lbl">{c.label}</span>{countOf(c.href)}
                    </button>
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
