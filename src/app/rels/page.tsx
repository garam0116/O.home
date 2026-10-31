'use client';
// EditableDesc 주입
// 자관 리스트 (4.5) — 4:3 가로 썸네일 · 공개범위 3단계 · 멤버 색 점
import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Relation, REL_SEED, relDday, relPath } from '@/lib/charStore';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { SearchBar } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

function RelsInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { editOn } = useMainStore();
  const [relsAll, setRelsAll] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  // 여러 개로 만든 자관 목록 — 주소의 ?s= 가 가리키는 것만, 저장은 이 목록 자리만 교체
  const sec = useSectionParam('rels');
  const rels = filterSection(relsAll, sec.id);
  const setRels = sectionSetter(relsAll, sec.id, setRelsAll);
  const [q, setQ] = useState('');

  const visible = rels
    .filter(r => isAdmin || r.visibility !== 'private')
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  // 편집모드 카드 드래그 정렬 (v1.9)
  const sort = useCardSort(visible, next => setRels(mergeOrder(rels, next)), editOn && isAdmin);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'RELATIONS' : sec.name}</PageTitle>
        <EditableDesc k="rels-desc" def="자관 목록 · 4:3 가로 썸네일 · 공개범위: 전체공개/멤버공개/나만보기" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/rels/new' + secQuery('rels', sec.id))}>＋ ADD RELATION</button>}
        </div>
      </div>
      <div className="g3 rels-grid">
        {visible.map((r, i) => {
          const memberLocked = r.visibility === 'member' && !user;
          const priv = r.visibility === 'private';
          const dday = relDday(r.ddayDate);
          const safeLink = (value?: string) => {
            const url = value?.trim();
            if (!url) return undefined;
            if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || url.startsWith('#') || url.startsWith('?')) return url;
            return undefined;
          };
          const logUrl = safeLink(r.logUrl);
          const lorebookUrl = safeLink(r.lorebookUrl);
          const sp = sort(i) as { style?: React.CSSProperties };
          return (
            <div key={r.id} className="rel-card" {...sort(i)}
              style={{ ...(priv ? { opacity: .45 } : undefined), ...sp.style }}
              onClick={() => {
                if (editOn) return;
                if (memberLocked) { toast('멤버공개 — 로그인 후 열람할 수 있습니다'); return; }
                router.push(relPath(r));
              }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <CroppedBlobImg fileRef={r.thumbId || r.arts?.[0]} crop={r.thumbCrop} ph={r.thumbClass}
                  label={priv ? '나만보기' : memberLocked ? '멤버공개' : '4:3'} />
              </div>
              <div className="nm">
                {/* 리스트에서는 기본 폰트로 통일 — 개별 이름 폰트는 상세에서만 */}
                <b>
                  {r.name}
                  {r.visibility === 'member' && <span className="pill" style={{ marginLeft: 6 }}>멤버</span>}
                  {/* 디데이는 자관명 옆에 표시 (v2.0 사용자 요청) */}
                  {dday && <span className="rel-dday" style={{ marginLeft: 6 }}>{dday}</span>}
                </b>
                {(priv || memberLocked) && <span>
                  {priv ? '관리자에게만 표시됨' : '로그인 시 열람 가능'}
                </span>}
                {(logUrl || lorebookUrl) && (
                  <div className="rel-card-links">
                    {logUrl && <a href={logUrl}
                      onClick={e => e.stopPropagation()}>LOG</a>}
                    {lorebookUrl && <a href={lorebookUrl}
                      onClick={e => e.stopPropagation()}>LOREBOOK</a>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function RelsPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><RelsInner /></Suspense>;
}
