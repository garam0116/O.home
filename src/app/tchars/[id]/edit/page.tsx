'use client';
// TRPG 캐릭터 수정 (v1.9 — 페이지형)
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { TCharForm } from '@/components/trpg/TCharForm';
import { useLocalList } from '@/lib/postStore';
import { TrpgChar, TCHAR_SEED } from '@/lib/tcharStore';
import { useNoKey } from '@/lib/itemNo';

export default function TCharEditPage() {
  const { id: rawKey } = useParams<{ id: string }>();
  // 주소는 번호 (v2.4) — /tchars/{번호}/edit. 예전 id 주소로 들어오면 번호 주소로 바꿔 둔다
  const [tchars] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const id = useNoKey(tchars, rawKey, k => `/tchars/${k}/edit`);
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>TRPG CHARACTERS</PageTitle><p>관리자 전용 페이지</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-edit-desc" def="캐릭터 수정" />
      </div>
      <TCharForm editId={id} />
    </section>
  );
}
