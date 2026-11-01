'use client';
// 그림백업 수정 (4.11) — 작성자 또는 관리자만
import React from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { BackupForm } from '@/components/backup/BackupForm';
import { PageTitle } from '@/components/ui/PageText';
import { useNoKey } from '@/lib/itemNo';

export default function BackupEditPage() {
  const { id: rawKey } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [posts, , loaded] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  // 주소는 번호 (v2.4) — 예전 id 주소로 들어오면 번호 주소로 바꿔 둔다
  const id = useNoKey(posts, rawKey, k => `/gallery/${k}/edit`);
  const p = posts.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  // authorId가 없는 글 + 비로그인이면 둘 다 undefined라 통과하던 것 (v2.0 발견)
  if (!p || !(isAdmin || (!!p.authorId && p.authorId === user?.id))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>게시물을 찾을 수 없거나 수정 권한이 없습니다</p></div>
      </section>
    );
  }
  return <BackupForm initial={p} />;
}
