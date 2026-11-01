'use client';
// 게시판 본문 폭 (v2.3 사용자 요청) — 환경설정 > 디자인의 px 값을 CSS 변수 --board-w로 건다.
// 목록과 글 상세가 같은 변수를 보므로 한쪽만 바뀌는 일이 없다(동기화). 디자인 탭 미리보기도 즉시 반영.
import { useEffect } from 'react';
import { useSiteSettings, boardWOf } from '@/lib/siteStore';

export function BoardWidth() {
  const [site] = useSiteSettings();
  const w = boardWOf(site);
  useEffect(() => {
    document.documentElement.style.setProperty('--board-w', `${w}px`);
  }, [w]);
  return null;
}
