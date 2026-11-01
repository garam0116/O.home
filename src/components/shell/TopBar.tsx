'use client';
// 상단 바 — 기획서 3장(계층 메뉴) + 4.0(프로필 드롭다운 · 편집모드 · 그리드 토글)
// 로고 클릭 = 메인 이동 (v1.5) · 상위 메뉴 클릭 = 첫 하위 페이지 이동 (v1.8)
// 편집모드 중 페이지 이동 시도 → 종료 확인 모달 (v1.8)
import React, { useEffect, useRef, useState } from 'react';
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
  const visMenu = menu.slice(0, visCount);
  const moreMenu = menu.slice(visCount);

  return (
    <header className="topbar">
      {/* 로고 — 텍스트·서브타이틀·정렬은 환경설정 > 디자인 (5.2) */}
      <div className="brand" onClick={() => nav('/')}>
        {siteLoaded && site.title}
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
          <div className="user-chip" onClick={() => setMenuOpen(o => !o)}>
            {/* 기본 아바타는 이니셜 없이 단색/그라데이션 (v1.9) */}
            <div className="avatar" style={!avatarSrc && user.avatarColor ? { background: user.avatarColor } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            {user.nickname} <span style={{ fontSize: 9, color: '#8d939d' }}>▾</span>
          </div>
          <div className={`user-menu ${menuOpen ? 'open' : ''}`}>
            <button onClick={() => { setMenuOpen(false); nav('/mypage'); }}>정보수정</button>
            {isAdmin && (
              <>
                {/* 편집모드 항목은 지원 페이지에서만 노출 (편집 중이면 끄기 위해 항상 표시) */}
                {(editAvailable || editOn) && (
                  <button onClick={() => { setMenuOpen(false); toggleEdit(); }}>
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
    </header>
  );
}
