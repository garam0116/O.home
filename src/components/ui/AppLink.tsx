'use client';
/**
 * 사이트 안 링크는 새로고침 없이 앱 안에서 이동한다 (사용자 요청 — 자관 상세 LOG·LOREBOOK 위젯에서 글로 갈 때
 * 페이지가 통째로 다시 불러와져 느렸다. 목록·메인 위젯처럼 router.push로 통일).
 *
 *  - AppLink: 진짜 <a href>로 그린다 — 꾹 누르기·휠 클릭·Ctrl/⌘ 클릭으로 새 탭 열기는 그대로 되고,
 *    보통 클릭만 앱 안 이동으로 바꾼다 (상단바 로고와 같은 규칙, v2.5).
 *  - InternalLinkCatcher: 글 본문처럼 HTML로 그리는 곳의 링크도 같은 규칙으로 (셸에 하나만 둔다).
 *
 * 그대로 두는 것: 바깥 사이트, 새 탭(target), 내려받기(download), /api/, 같은 화면 안 #이동, 쓰기 중인 편집기 안.
 */
import React, { useEffect, useRef } from 'react';
import { useSiteNav } from '@/components/shell/siteNav';

const plainClick = (e: MouseEvent | React.MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** 앱 안에서 옮겨 갈 링크면 이동할 경로(/rels/3?x#y), 아니면 null — 브라우저 기본 동작에 맡긴다 */
function appPathOf(a: HTMLAnchorElement): string | null {
  const raw = a.getAttribute('href');
  if (!raw) return null;
  const target = a.getAttribute('target');
  if (target && target !== '_self') return null;
  if (a.hasAttribute('download')) return null;
  let u: URL;
  try { u = new URL(raw, window.location.href); } catch { return null; }
  // 같은 사이트의 http(s) 주소만 — javascript: 같은 주소는 절대 router로 넘기지 않는다
  if (u.origin !== window.location.origin || !/^https?:$/.test(u.protocol)) return null;
  if (u.pathname.startsWith('/api/')) return null;
  // 같은 화면 안의 #이동은 브라우저가 스크롤하게 둔다
  if (u.hash && u.pathname === window.location.pathname && u.search === window.location.search) return null;
  return u.pathname + u.search + u.hash;
}

type AppLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export const AppLink = React.forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink({ onClick, ...rest }, ref) {
  const nav = useSiteNav();
  return (
    <a ref={ref} {...rest} onClick={e => {
      onClick?.(e);
      if (e.defaultPrevented || !plainClick(e)) return;
      const path = appPathOf(e.currentTarget);
      if (!path) return;
      e.preventDefault();
      nav(path);
    }} />
  );
});

/** 셸 전역 — HTML로 그린 본문 속 사이트 안 링크도 앱 안 이동으로. 이미 처리한 클릭(AppLink·next/link)은 건너뛴다 */
export function InternalLinkCatcher() {
  const nav = useSiteNav();
  const navRef = useRef(nav);
  useEffect(() => { navRef.current = nav; });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || !plainClick(e)) return;
      const el = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(el instanceof HTMLAnchorElement)) return;
      // 쓰기 화면의 편집기 안 링크는 누를 때 이동하지 않는다
      if (el.isContentEditable) return;
      const path = appPathOf(el);
      if (!path) return;
      e.preventDefault();
      navRef.current(path);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
