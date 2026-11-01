'use client';
// `/playlog/p`만 치고 들어온 경우 — 목록을 고르지 않았으니 기본 목록으로 (v2.4)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlaylogKeyIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/playlog'); }, [router]);
  return <section className="page" />;
}
