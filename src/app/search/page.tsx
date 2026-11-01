'use client';
// 게시판 통합 검색 결과 (메인 검색 위젯 → `/search?q=단어`) — 게시판 목록과 같은 화면(갤러리형 1)을 쓴다.
// `/board/search`가 아닌 이유: `/board` 아래 주소는 기본 게시판의 메뉴 공개범위를 따라가서,
// 기본 게시판을 감추면 다른 게시판 검색까지 막힌다
import React, { Suspense } from 'react';
import { BoardInner } from '@/components/board/BoardList';

export default function SearchPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><BoardInner searchAll /></Suspense>;
}
