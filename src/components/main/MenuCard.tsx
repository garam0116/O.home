'use client';
// 메뉴 카드 (v2.7 사용자 요청 — PC 2단형 레이아웃, 시안 D5 「짧은 카드 + 옆 펼침」)
// 로고 · 대메뉴 · 사용자 영역을 카드 한 장에 담고, 하위 메뉴는 마우스를 올리면 옆으로 펼친다(누르면 접힘).
// 게시판 메뉴는 오른쪽에 글 수를 적는다.
// 모양 5종(기본 · Ink · Halo · Prism · Thread)은 환경설정 > 디자인 「메뉴 카드 모양」에서 고른다 (v3.0) — 스타일은 globals.css의 .mc-s-*.
// 위젯이라 편집모드에서 좌우 열 안에서만 옮길 수 있다(가운데 열 금지 · 삭제 불가 — WidgetFrame/WidgetEditLayer).
// 스크롤해도 화면의 같은 자리(맨 위에 있을 때 위치)에 그대로 보인다(사용자 요청 · 편집모드 중에는 끔). 모바일은 CSS로 숨기고 상단바 ≡가 대신한다.
import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { WidgetConf } from '@/lib/mainStore';
import { useMainStore } from '@/lib/mainStore';
import { useSiteSettings, type MenuCardStyle } from '@/lib/siteStore';
import { useBlobUrl } from '@/lib/blobStore';
import { sideOf } from '@/lib/widgetZone';
import { useSiteMenu, useSiteNav, UserArea, useBrandFit, useBoardCounts } from '@/components/shell/siteNav';

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
  const counts = useBoardCounts();
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

  // 카드 모양 (v3.0 사용자 요청) — 환경설정 > 디자인 「메뉴 카드 모양」. 구성은 같고 장식 요소만 모양별로 덧붙인다
  const style: MenuCardStyle = site.mCard ?? 'basic';
  const listRef = useRef<HTMLElement>(null);
  const menuKey = menu.map(m => `${m.label}:${m.children?.length ?? 0}`).join('|');
  useCardMotion(style, cardRef, listRef, `${menuKey}|${pathname}|${editOn}`);

  return (
    <div ref={cardRef} className={`menu-card mc-s-${style} ${right ? 'mc-right' : ''}`}>
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
      <nav className="mc-list" ref={listRef}>
        {/* Prism — 마우스를 따라 움직이는 빛줄기 (useCardMotion이 위치를 옮긴다) */}
        {style === 'prism' && <><span className="mc-glow" aria-hidden /><span className="mc-beam" aria-hidden /></>}
        {menu.map((m, i) => {
          const on = m.children ? m.children.some(c => isCur(c.href)) : isCur(m.href);
          // Ink — 하위 메뉴 글 수 막대의 기준(그 묶음에서 가장 많은 글 수)
          const max = Math.max(1, ...(m.children ?? []).map(c => counts.get(c.href) ?? 0));
          return (
            <div key={m.label} className={`mc-item ${m.children ? 'mc-grp' : ''} ${on ? 'on' : ''} ${shut === m.label ? 'shut' : ''}`}
              onMouseLeave={() => { if (shut === m.label) setShut(null); }}>
              {/* 상위 클릭 → 첫 하위 페이지 (상단바와 같은 규칙, v1.8) */}
              <button className="mc-top" onClick={() => go(m.label, m.children ? m.children[0].href : m.href!)}>
                {style === 'ink' && <span className="mc-no" aria-hidden>{roman(i + 1)}</span>}
                {style === 'halo' && <span className="mc-dot" aria-hidden />}
                <span className="mc-lbl">{m.label}</span>{!m.children && countOf(m.href)}
                {style === 'ink' && <span className="mc-arw" aria-hidden>→</span>}
                {style === 'thread' && m.children && <span className="mc-wire" aria-hidden />}
              </button>
              {m.children && (
                <div className="mc-sub">
                  {m.children.map(c => {
                    const n = counts.get(c.href);
                    return (
                      <button key={c.href} className={isCur(c.href) ? 'on' : ''} onClick={() => go(m.label, c.href)}>
                        <span className="mc-lbl">{c.label}</span>{countOf(c.href)}
                        {style === 'ink' && n != null && <span className="mc-bar" aria-hidden><i style={{ width: `${Math.round(n / max * 100)}%` }} /></span>}
                      </button>
                    );
                  })}
                  {style === 'thread' && <span className="mc-star" aria-hidden />}
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

/** 로마 숫자 (Ink 모양의 대메뉴 번호) — 소문자 */
function roman(n: number): string {
  const t: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, r] of t) while (n >= v) { out += r; n -= v; }
  return out;
}

/**
 * 모양별 움직임 (v3.0) — CSS만으로 안 되는 부분
 *  · halo:   마우스 위치를 --mx/--my로 (카드 · 펼친 하위 메뉴 각각). 손을 떼면 현재 메뉴 자리로
 *  · prism:  빛줄기(.mc-glow/.mc-beam)를 마우스가 올라간 대메뉴로, 손을 떼면 현재 메뉴로(없으면 숨김)
 *  · thread: 대메뉴 이름 폭을 --lw로 — 하위 메뉴로 뻗는 점선이 이름 끝에서 시작하게(이름을 덮지 않게, 사용자 요청)
 *            큰 ◆(.mc-star)의 높이를 --sy로 — 마우스를 올린 하위 항목, 손을 떼면 선택한 항목(없으면 첫 항목) (사용자 확정 시안 C)
 *            하위 메뉴 높이를 --sub-dy로 — 첫 하위 항목 가운데를 대메뉴 가운데(가로 점선)에 픽셀 단위로 맞춘다.
 *            두 값 모두 CSS 마디 위치(round(down, 50%, 1px))와 같은 방식으로 정수 픽셀을 쓴다 (v4.4 시안 D-2)
 */
function useCardMotion(style: MenuCardStyle, cardRef: React.RefObject<HTMLDivElement | null>, listRef: React.RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const card = cardRef.current, list = listRef.current;
    if (!card || !list) return;
    const curTop = () => list.querySelector<HTMLElement>('.mc-item.on > .mc-top');
    const offs: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(ev, fn); offs.push(() => el.removeEventListener(ev, fn));
    };

    if (style === 'halo') {
      const setAt = (el: HTMLElement, x: number, y: number) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${Math.round(x - r.left)}px`);
        el.style.setProperty('--my', `${Math.round(y - r.top)}px`);
      };
      const home = () => {
        const t = curTop();
        if (!t) { card.style.removeProperty('--mx'); card.style.removeProperty('--my'); return; }
        const r = t.getBoundingClientRect();
        setAt(card, r.left + 30, r.top + r.height / 2);
      };
      on(card, 'mousemove', e => {
        const sub = (e.target as Element).closest?.('.mc-sub') as HTMLElement | null;
        setAt(sub ?? card, e.clientX, e.clientY);
      });
      on(card, 'mouseleave', home);
      home();
      document.fonts?.ready.then(home);
    }

    if (style === 'prism') {
      const marks = [...list.querySelectorAll<HTMLElement>('.mc-glow, .mc-beam')];
      // 대메뉴(.mc-item)의 목록 안 위치로 — .mc-top은 .mc-item 기준이라 offsetTop이 늘 0
      const moveTo = (top: HTMLElement | null) => {
        const item = top?.parentElement ?? null;
        list.querySelectorAll('.mc-item.lit').forEach(x => x.classList.remove('lit'));
        for (const el of marks) {
          el.style.opacity = item ? '' : '0';
          if (!item || !top) continue;
          el.style.transform = `translateY(${item.offsetTop}px)`;
          el.style.height = `${top.offsetHeight}px`;
        }
        item?.classList.add('lit');
      };
      list.querySelectorAll<HTMLElement>('.mc-item').forEach(it =>
        on(it, 'mouseenter', () => moveTo(it.querySelector<HTMLElement>('.mc-top'))));
      on(list, 'mouseleave', () => moveTo(curTop()));
      moveTo(curTop());
      document.fonts?.ready.then(() => moveTo(curTop()));
    }

    let ro: ResizeObserver | null = null;
    if (style === 'thread') {
      const measure = () => list.querySelectorAll<HTMLElement>('.mc-grp > .mc-top').forEach(t => {
        const l = t.querySelector<HTMLElement>('.mc-lbl');
        if (l) t.style.setProperty('--lw', `${l.offsetWidth}px`);
      });
      ro = new ResizeObserver(measure);
      list.querySelectorAll('.mc-lbl').forEach(l => ro!.observe(l));
      measure();

      // 큰 ◆ 자리 — 하위 메뉴는 닫혀 있으면(display:none) 잴 수 없으므로 펼치는 순간(대메뉴에 올리거나 포커스)에 잰다
      list.querySelectorAll<HTMLElement>('.mc-grp').forEach(item => {
        const sub = item.querySelector<HTMLElement>(':scope > .mc-sub');
        if (!sub?.querySelector('.mc-star')) return;
        const btns = [...sub.querySelectorAll<HTMLElement>(':scope > button')];
        const place = (b?: HTMLElement) => {
          const t = b ?? btns.find(x => x.classList.contains('on')) ?? btns[0];
          if (!t) return;
          sub.style.setProperty('--sy', `${t.offsetTop + Math.floor(t.offsetHeight / 2)}px`);
          btns.forEach(x => x.classList.toggle('at', x === t));
          item.classList.toggle('star0', t === btns[0]);
        };
        // 첫 하위 항목의 마디 줄(버튼 위 + 높이 절반 내림)을 대메뉴 마디 줄에 맞춘다 — 펼쳐져 있어야 잴 수 있다
        const align = () => {
          const top = item.querySelector<HTMLElement>(':scope > .mc-top'), b0 = btns[0];
          if (!top || !b0 || !sub.offsetParent) return;
          const want = top.getBoundingClientRect().top + Math.floor(top.offsetHeight / 2);
          const got = b0.getBoundingClientRect().top + Math.floor(b0.offsetHeight / 2);
          const cur = parseFloat(getComputedStyle(sub).top) || 0;
          if (Math.round(want - got)) sub.style.setProperty('--sub-dy', `${Math.round(cur + want - got)}px`);
        };
        on(item, 'mouseenter', () => { align(); place(); });
        on(item, 'focusin', () => align());
        on(item, 'focusin', e => { const b = (e.target as HTMLElement).closest?.('.mc-sub > button') as HTMLElement | null; place(b ?? undefined); });
        btns.forEach(b => on(b, 'mouseenter', () => place(b)));
        on(sub, 'mouseleave', () => place());
        place();
      });
    }

    return () => {
      offs.forEach(f => f());
      ro?.disconnect();
      card.style.removeProperty('--mx'); card.style.removeProperty('--my');
    };
  }, [style, cardRef, listRef, key]);
}
