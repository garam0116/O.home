'use client';
// EditableDesc 주입
// 자관 리스트 (4.5) — 4:3 가로 썸네일 · 공개범위 3단계 · 멤버 색 점
import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Relation, REL_SEED, relDday, relPath } from '@/lib/charStore';
import { useSectionParam, filterSection, sectionSetter, sectionHref, MAIN_SEC, secSubHref } from '@/lib/sectionStore';
import { SearchBar } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';
import { OrderMenu, orderNoOf, moveToOrder } from '@/components/ui/OrderMenu';
import { useLatestUpdates, fmtUpdate } from '@/lib/relUpdates';

/** 카드 링크로 쓸 수 있는 주소만 — http(s)·사이트 안 경로·#·? */
const safeLink = (value?: string) => {
  const url = value?.trim();
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || url.startsWith('#') || url.startsWith('?')) return url;
  return undefined;
};

function RelsInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { editOn } = useMainStore();
  const [relsAll, setRelsAll] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  // 여러 개로 만든 자관 목록 — 주소(`/rels/r/별명`, v2.4)가 가리키는 것만, 저장은 이 목록 자리만 교체
  const sec = useSectionParam('rels');
  const rels = filterSection(relsAll, sec.id);
  const setRels = sectionSetter(relsAll, sec.id, setRelsAll);
  const [q, setQ] = useState('');

  const visible = rels
    .filter(r => isAdmin || r.visibility !== 'private')
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  // 편집모드 카드 드래그 정렬 (v1.9)
  const sort = useCardSort(visible, next => setRels(mergeOrder(rels, next)), editOn && isAdmin);

  // LOG·LOREBOOK 게시판의 가장 최근 업데이트 날짜 (v2.1 사용자 요청) — 둘 중 늦은 날짜 하나
  const { latest, sources } = useLatestUpdates(
    visible.map(r => [safeLink(r.logUrl), safeLink(r.lorebookUrl)]), isAdmin);

  /* ---------- 순서 번호 · 다른 목록으로 이동 (v2.1 사용자 요청) ----------
     우클릭(관리자) 또는 편집모드 카드의 ⋮ 버튼 — 드래그가 안 되는 모바일에서도 쓸 수 있게.
     다른 목록으로 보내면 그 목록의 맨 뒤에 붙는다 (1st → 2nd 등). */
  const [ordFor, setOrdFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const ordIdx = ordFor ? visible.findIndex(r => r.id === ordFor.id) : -1;
  const openOrder = (e: React.MouseEvent, id: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setOrdFor({ id, x: e.clientX, y: e.clientY });
  };
  const applyOrder = (wanted: number) => {
    if (ordIdx >= 0) setRels(mergeOrder(rels, moveToOrder(visible, ordIdx, wanted)));
    setOrdFor(null);
  };
  const otherSecs = sec.items.filter(s => s.id !== sec.id);
  const moveToSec = (id: string, target: string) => {
    const it = relsAll.find(r => r.id === id);
    if (!it) return;
    // 기본 목록은 소속 표시를 남기지 않는다 (예전 데이터와 같은 모습) — undefined로 두지 않고 아예 뺀다
    const { secId: _old, ...rest } = it;
    void _old;
    const moved: Relation = target === MAIN_SEC ? rest : { ...rest, secId: target };
    setRelsAll([...relsAll.filter(r => r.id !== id), moved]);
    setOrdFor(null);
    toast(`「${it.name}」을(를) ${sec.items.find(s => s.id === target)?.name ?? '다른 목록'}(으)로 옮겼습니다`);
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'RELATIONS' : sec.name}</PageTitle>
        <EditableDesc k="rels-desc" def="자관 목록 · 4:3 가로 썸네일 · 공개범위: 전체공개/멤버공개/나만보기" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push(secSubHref('rels', sec.id, 'new'))}>＋ ADD RELATION</button>}
        </div>
      </div>
      <div className="g3 rels-grid">
        {visible.map((r, i) => {
          const memberLocked = r.visibility === 'member' && !user;
          const priv = r.visibility === 'private';
          const dday = relDday(r.ddayDate);
          const logUrl = safeLink(r.logUrl);
          const lorebookUrl = safeLink(r.lorebookUrl);
          const sp = sort(i) as { style?: React.CSSProperties };
          const upd = latest[i];
          return (
            <div key={r.id} className="rel-card" {...sort(i)}
              style={{ ...(priv ? { opacity: .45 } : undefined), ...sp.style }}
              onContextMenu={e => openOrder(e, r.id)}
              onClick={() => {
                if (editOn) return;
                if (memberLocked) { toast('멤버공개 — 로그인 후 열람할 수 있습니다'); return; }
                router.push(relPath(r));
              }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <CroppedBlobImg fileRef={r.thumbId || r.arts?.[0]} crop={r.thumbCrop} ph={r.thumbClass}
                  label={priv ? '나만보기' : memberLocked ? '멤버공개' : '4:3'} />
                {/* 편집모드 — 순서 번호·다른 목록으로 이동 (우클릭과 같은 메뉴, 모바일용) */}
                {editOn && isAdmin && (
                  <button type="button" className="rel-card-menu" title="순서 · 목록 이동"
                    onClick={e => { e.stopPropagation(); openOrder(e, r.id); }}>⋮</button>
                )}
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
                    {/* 두 게시판 중 가장 최근 업데이트 (v2.1 사용자 요청) — 링크 줄 오른쪽 빈 자리 */}
                    {upd != null && (
                      <em className="rel-card-upd" title="LOG · LOREBOOK 중 가장 최근 업데이트">
                        LATEST <time>{fmtUpdate(upd)}</time>
                      </em>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {sources}
      {ordFor && ordIdx >= 0 && (
        <OrderMenu at={ordFor} current={orderNoOf(ordIdx)} total={visible.length}
          onApply={applyOrder} onClose={() => setOrdFor(null)}>
          <div className="sep" style={{ margin: '8px 0 4px' }} />
          <div className="ctx-ttl" style={{ padding: '4px 0 4px' }}>다른 목록으로 이동</div>
          {otherSecs.length
            ? otherSecs.map(s => (
              <button key={s.id} onClick={() => moveToSec(ordFor.id, s.id)}>→ {s.name}</button>
            ))
            : <p className="ord-hint" style={{ textAlign: 'left' }}>
              다른 자관 목록이 없습니다 — 환경설정에서 목록을 추가하면 여기로 옮길 수 있습니다
            </p>}
        </OrderMenu>
      )}
    </section>
  );
}

export default function RelsPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><RelsInner /></Suspense>;
}
