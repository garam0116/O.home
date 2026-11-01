'use client';
// 커미션 수정 (4.18) — 페이지형
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { CommForm } from '@/components/comm/CommForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';
import { useNoKey, itemPath } from '@/lib/itemNo';

export default function CommEditPage() {
  const { id: rawKey } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems, loaded] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  // 주소는 번호 (v2.4) — 예전 id 주소로 들어오면 번호 주소로 바꿔 둔다
  const id = useNoKey(items, rawKey, k => `/comm/${k}/edit`);
  const [settings] = useCommSettings();
  const c = items.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !c) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>COMMISSION</PageTitle><p>커미션을 찾을 수 없거나 권한이 없습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>EDIT COMMISSION</PageTitle><p>{c.name}</p></div>
      <CommForm initial={c} settings={settings}
        onCancel={() => router.push(itemPath('/comm', c))}
        onSave={v => {
          setItems(items.map(x => (x.id === c.id ? { ...x, ...v } : x)));
          toast('저장되었습니다');
          router.push(itemPath('/comm', c));
        }} />
    </section>
  );
}
