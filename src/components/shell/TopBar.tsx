'use client';
// 상단 바 — 기획서 3장(계층 메뉴) + 4.0(프로필 드롭다운 · 편집모드 · 그리드 토글)
// 로고 클릭 = 메인 이동 (v1.5) · 상위 메뉴 클릭 = 첫 하위 페이지 이동 (v1.8)
// 편집모드 중 페이지 이동 시도 → 종료 확인 모달 (v1.8)
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { boardEntries, useMenuSettings, buildMenu } from '@/lib/menuStore';
import { useBoards } from '@/lib/boardStore';
import { useSections, sectionMenuEntries } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries } from '@/lib/linkStore';
import { useSiteSettings } from '@/lib/siteStore';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useBlobUrl } from '@/lib/blobStore';
import { refreshPage } from '@/lib/pageRefresh';
import { KToggle } from '@/components/ui/Kit';

export function TopBar() {
  const { user, isAdmin, logout } = useAuth();
  const { editOn, editAvailable, gridOn, setGridOn, toggleEdit, requestExit, guardNav } = useMainStore();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);       // 모바일 메뉴 패널 (≡) — 메뉴리스트 위젯 대체
  const [menuSet, , menuLoaded] = useMenuSettings(); // 메뉴 관리 (5.2) — 노출·순서·이름
  const { boards, loaded: boardsLoaded } = useBoards(); // 다중 게시판 (5.2) — 게시판 그룹에 동적 반영
  const { map: secMap } = useSections();
  const { links } = useCustomLinks();                    // 커스텀 링크 (v2.0 사용자 요청)                 // 여러 개로 만든 섹션 (v2.0) — 갤러리·다이어리 등
  // 저장 설정 로드 전에는 메뉴·로고를 그리지 않음 — 새로고침 시 기본 구성이 깜빡이는 것 방지 (v1.9)
  const ready = menuLoaded && boardsLoaded;
  const menu = ready
    ? buildMenu(menuSet, [...boardEntries(boards), ...sectionMenuEntries(secMap), ...linkEntries(links)], { loggedIn: !!user, isAdmin, id: user?.id })
    : [];
  const [site, , siteLoaded] = useSiteSettings();    // 로고 텍스트/서브/정렬 (5.2)
  const avatarSrc = useBlobUrl(user?.avatarUrl);     // 프로필 이미지 (마이페이지, v1.9)
  // 로고 이미지 (v2.2 사용자 요청) — 모바일용만 있으면 PC는 텍스트, 모바일은 이미지
  const logoPcRaw = useBlobUrl(site.logoImage);
  const logoMRaw = useBlobUrl(site.logoImageM);
  const logoPc = logoPcRaw || logoMRaw;
  const logoM = logoPcRaw && logoMRaw && logoMRaw !== logoPcRaw ? logoMRaw : undefined;
  const brandRef = useRef<HTMLDivElement>(null);
  const brandFit = useBrandFit(brandRef, `${site.title}|${site.subtitle}|${logoPc ?? ''}|${siteLoaded}`);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  // 편집모드 중에는 이동 전에 종료 확인 (v1.8)
  // 지금 보고 있는 메뉴를 다시 누르면 그 페이지를 새로 불러옴 — 다시 접속하는 느낌 (v1.9 사용자 요청)
  const nav = (href: string) => {
    // 커스텀 링크에 다른 사이트 풀주소를 걸 수 있다 (v2.0) — 외부는 새 창으로
    if (/^https?:\/\//.test(href)) { window.open(href, '_blank'); return; }
    if (guardNav(href)) return;
    // 같은 메뉴 재클릭 — 브라우저 새로고침 대신 페이지만 처음 상태로 다시 그림 (BGM이 끊기지 않게, v1.9).
    // **쿼리까지 비교해야 한다** (v2.0 사용자 문의로 발견) — 경로만 보면 /board?b=2 에서 /board 를
    // 눌렀을 때 '같은 메뉴'로 착각해 이동이 통째로 막힌다. 여러 개로 만든 게시판·갤러리·다이어리가
    // 전부 같은 경로에 쿼리로 갈리므로, 기본 항목으로 돌아갈 수가 없었다.
    const cur = pathname + window.location.search;
    if (href === cur) { refreshPage(); return; }
    router.push(href);
  };

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
  useEffect(() => { setNavOpen(false); setMenuOpen(false); }, [pathname]);
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
      <div className={`brand ${logoPc ? 'has-img' : ''}`} ref={brandRef} onClick={() => nav('/')}
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
      </div>

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
      {editOn && pathname === '/' && (
        <button className="btn btn-ghost" style={{ height: 27, padding: '0 11px', fontSize: 10.5, whiteSpace: 'nowrap' }}
          onClick={() => window.dispatchEvent(new Event('ohome-add-widget'))}>＋ 위젯</button>
      )}
      {/* 그리드 토글 — 메인에서 편집모드 켰을 때만 (v1.9) */}
      <KToggle
        className={`grid-chip ${editOn && pathname === '/' ? 'show' : ''}`}
        label="그리드"
        checked={gridOn}
        onChange={setGridOn}
      />
      {/* 편집중 표시 — 클릭 시 종료 확인 (v1.8) */}
      <span className={`edit-flag ${editOn ? 'show' : ''}`} onClick={() => requestExit()}>
        ✎ 편집중
      </span>

      {/* 사용자 영역 — 비로그인: 로그인 버튼 / 로그인: 프로필 드롭다운 (3장 주석, 4.0) */}
      {user ? (
        <div className="user-wrap" ref={userRef}>
          <div className="user-chip" onClick={() => { setNavOpen(false); setMenuOpen(o => !o); }}>
            {/* 기본 아바타는 이니셜 없이 단색/그라데이션 (v1.9) */}
            <div className="avatar" style={!avatarSrc && user.avatarColor ? { background: user.avatarColor } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            {/* 모바일에서는 사진만 — 닉네임·▾는 숨겨 로고 자리를 남김 */}
            <span className="user-name">{user.nickname} <span style={{ fontSize: 9, color: '#8d939d' }}>▾</span></span>
          </div>
          <div className={`user-menu ${menuOpen ? 'open' : ''}`}>
            <button onClick={() => { setMenuOpen(false); nav('/mypage'); }}>정보수정</button>
            {isAdmin && (
              <>
                {/* 편집모드 항목은 지원 페이지에서만 노출 (편집 중이면 끄기 위해 항상 표시) */}
                {(editAvailable || editOn) && (
                  <button className="um-edit" onClick={() => { setMenuOpen(false); toggleEdit(); }}>
                    편집모드 {editOn ? '끄기' : '켜기'}
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); nav('/settings'); }}>환경설정</button>
                <button onClick={() => { setMenuOpen(false); nav('/admin/posts'); }}>전체 게시글 관리</button>
              </>
            )}
            <button onClick={() => { setMenuOpen(false); logout(); }}>로그아웃</button>
          </div>
        </div>
      ) : (
        <button className="login-link" onClick={() => nav('/login')}>로그인</button>
      )}

      {/* 모바일 메뉴 버튼 — 아이콘: Lucide 「menu」 (ISC 라이선스) */}
      <button className="m-nav-btn" aria-label="메뉴 열기" aria-expanded={navOpen}
        onClick={() => { setMenuOpen(false); setNavOpen(o => !o); }}>
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

type MenuItem = ReturnType<typeof buildMenu>[number];

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

/**
 * 텍스트 로고 자동 맞춤 (v2.2 사용자 제보 — 모바일에서 「INTOXICATION」처럼 긴 로고가 오른쪽으로 넘쳐
 * 화면이 옆으로 밀리고 잘렸다). 로고 칸이 받은 폭보다 글자가 넓으면 그 비율만큼 --brand-fit을 낮춰
 * 글자 크기·자간(em 단위라 함께 줄어듦)을 줄인다. 넉넉하면 1 그대로라 PC 모습은 바뀌지 않는다.
 */
function useBrandFit(ref: React.RefObject<HTMLDivElement | null>, key: string) {
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--brand-fit', '1');   // 원래 크기에서 잰다
        const need = el.scrollWidth, have = el.clientWidth;
        const next = need > have + 1 && have > 0 ? Math.max(0.45, Math.floor((have / need) * 1000) / 1000) : 1;
        el.style.setProperty('--brand-fit', String(next));
        setFit(f => (f === next ? f : next));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [ref, key]);
  return fit;
}
