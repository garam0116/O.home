'use client';
// 일기 쓰기 (4.14) — 페이지형
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED } from '@/lib/diaryStore';
import { DiaryForm } from '@/components/diary/DiaryForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function DiaryWritePage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>DIARY</PageTitle><p>일기는 관리자만 쓸 수 있습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>WRITE DIARY</PageTitle><EditableDesc k="diary-write-desc" def="일기 쓰기" /></div>
      <DiaryForm initial={null}
        onCancel={() => router.push('/diary')}
        onSave={v => {
          const p: DiaryPost = { id: newId(), ...v };
          setPosts([p, ...posts]);
          toast('일기가 등록되었습니다');
          router.push('/diary');
        }} />
    </section>
  );
}
