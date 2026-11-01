'use client';
// 일반 게시판 목록 — 화면은 components/board/BoardList (통합 검색 `/search`와 같이 쓴다)
import React, { Suspense } from 'react';
import { BoardInner } from '@/components/board/BoardList';

export default function BoardPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><BoardInner /></Suspense>;
}
