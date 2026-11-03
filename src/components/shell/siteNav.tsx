'use client';
// 상단바·메뉴 카드(PC 2단형, v2.7) 공용 — 메뉴 구성 · 이동 규칙 · 사용자 영역(프로필 드롭다운)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { boardEntries, useMenuSettings, buildMenu } from '@/lib/menuStore';
import { useBoards, boardHref, MAIN_BOARD_ID } from '@/lib/boardStore';
import { useLocalList, BOARD_SEED, type Post } from '@/lib/postStore';
import { useSections, sectionMenuEntries } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries } from '@/lib/linkStore';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useBlobUrl } from '@/lib/blobStore';
import { refreshPage } from '@/lib/pageRefresh';

export type SiteMenuItem = ReturnType<typeof buildMenu>[number];

/** 메뉴 관리(노출·순서·이름) + 게시판·섹션·커스텀 링크 반영. 저장 설정 로드 전에는 빈 목록 (깜빡임 방지, v1.9) */
export function useSiteMenu(): { menu: SiteMenuItem[]; ready: boolean } {
  const { user, isAdmin, known } = useAuth();
  const [menuSet, , menuLoaded] = useMenuSettings();
  const { boards, loaded: boardsLoaded } = useBoards();
  const { map: secMap } = useSections();
  const { links } = useCustomLinks();
  // 누구인지 알기 전에 그리면 회원 메뉴가 빠졌다가 나중에 끼어든다
  const ready = menuLoaded && boardsLoaded && known;
  const menu = ready
    ? buildMenu(menuSet, [...boardEntries(boards), ...sectionMenuEntries(secMap), ...linkEntries(links)], { loggedIn: !!user, isAdmin, id: user?.id })
    : [];
  return { menu, ready };
}

/** 게시판 메뉴 글 수 — 게시판 주소(href) → 그 게시판에 속한 글 전체 수. 게시판 목록과 같은 기준.
 *  메뉴 카드(PC)와 모바일 메뉴가 같이 쓴다. 글을 아직 못 읽었으면 빈 맵 */
export function useBoardCounts(): Map<string, number> {
  const { boards } = useBoards();
  const [posts, , postsLoaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  return useMemo(() => {
    const m = new Map<string, number>();
    if (!postsLoaded) return m;
    const per = new Map<string, number>();
    for (const p of posts) { const b = p.boardId ?? MAIN_BOARD_ID; per.set(b, (per.get(b) ?? 0) + 1); }
    for (const b of boards) m.set(boardHref(b.id, boards), per.get(b.id) ?? 0);
    return m;
  }, [posts, postsLoaded, boards]);
}

/**
 * 메뉴 이동 — 편집모드 중이면 종료 확인 (v1.8) · 외부 주소는 새 창 (v2.0) ·
 * 지금 보고 있는 메뉴를 다시 누르면 페이지만 처음 상태로 다시 그림 (v1.9 — BGM 유지).
 * 쿼리까지 비교한다 (v2.0) — /board?b=2 에서 /board 를 눌렀을 때 같은 메뉴로 착각하지 않게.
 */
export function useSiteNav() {
  const { guardNav } = useMainStore();
  const router = useRouter();
  const pathname = usePathname();
  return (href: string) => {
    if (/^https?:\/\//.test(href)) { window.open(href, '_blank'); return; }
    if (guardNav(href)) return;
    const cur = pathname + window.location.search;
    if (href === cur) { refreshPage(); return; }
    router.push(href);
  };
}

/** 사용자 영역 — 비로그인: 로그인 버튼 / 로그인: 프로필 드롭다운 (3장 주석, 4.0) · 상단바와 메뉴 카드가 같이 쓴다 */
export function UserArea({ nav, onOpen, className }: {
  nav: (href: string) => void;
  /** 드롭다운을 열 때 (상단바: 모바일 메뉴 패널 닫기) */
  onOpen?: () => void;
  className?: string;
}) {
  const { user, isAdmin, logout, known } = useAuth();
  const { editOn, editAvailable, toggleEdit } = useMainStore();
  const pathname = usePathname();
  const avatarSrc = useBlobUrl(user?.avatarUrl);     // 프로필 이미지 (마이페이지, v1.9)
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => { setOpen(false); }, [pathname]);

  // 누구인지 아직 모르면 같은 크기의 빈칸 — 로그인한 사람에게 「로그인」 버튼이 번쩍이지 않게
  if (!user && !known) return <span className={`login-link auth-wait ${className ?? ''}`} aria-hidden="true">로그인</span>;
  if (!user) return <button className={`login-link ${className ?? ''}`} onClick={() => nav('/login')}>로그인</button>;
  return (
    <div className={`user-wrap ${className ?? ''}`} ref={ref}>
      <div className="user-chip" onClick={() => { onOpen?.(); setOpen(o => !o); }}>
        {/* 기본 아바타는 이니셜 없이 단색/그라데이션 (v1.9) */}
        <div className="avatar" style={!avatarSrc && user.avatarColor ? { background: user.avatarColor } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        {/* 모바일에서는 사진만 — 닉네임·▾는 숨겨 로고 자리를 남김 */}
        <span className="user-name">{user.nickname} <span style={{ fontSize: 9, color: '#8d939d' }}>▾</span></span>
      </div>
      <div className={`user-menu ${open ? 'open' : ''}`}>
        <button onClick={() => { setOpen(false); nav('/mypage'); }}>정보수정</button>
        {isAdmin && (
          <>
            {/* 편집모드 항목은 지원 페이지에서만 노출 (편집 중이면 끄기 위해 항상 표시) */}
            {(editAvailable || editOn) && (
              <button className="um-edit" onClick={() => { setOpen(false); toggleEdit(); }}>
                편집모드 {editOn ? '끄기' : '켜기'}
              </button>
            )}
            <button onClick={() => { setOpen(false); nav('/settings'); }}>환경설정</button>
            <button onClick={() => { setOpen(false); nav('/admin/posts'); }}>전체 포스팅 관리</button>
          </>
        )}
        <button onClick={() => { setOpen(false); logout(); }}>로그아웃</button>
      </div>
    </div>
  );
}

/**
 * 텍스트 로고 자동 맞춤 (v2.2 사용자 제보 — 모바일에서 「INTOXICATION」처럼 긴 로고가 오른쪽으로 넘쳐
 * 화면이 옆으로 밀리고 잘렸다). 로고 칸이 받은 폭보다 글자가 넓으면 그 비율만큼 --brand-fit을 낮춰
 * 글자 크기·자간(em 단위라 함께 줄어듦)을 줄인다. 넉넉하면 1 그대로라 PC 모습은 바뀌지 않는다.
 */
export function useBrandFit(ref: React.RefObject<HTMLElement | null>, key: string) {
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
