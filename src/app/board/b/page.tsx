'use client';
// `/board/b`만 치고 들어온 경우 — 게시판을 고르지 않았으니 기본 게시판으로 (v2.4)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BoardKeyIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/board'); }, [router]);
  return <section className="page" />;
}
