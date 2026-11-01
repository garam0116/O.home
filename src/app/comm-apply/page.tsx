'use client';
// 신청자 리스트 (4.18 v1.9) — 마감일 크게 + 상태 뱃지(고정폭) + 신청자/신청일 + 커미션 종류 +
// 잠금 픽토그램(커스텀 툴팁) · 우측 필터 사이드(상태별+커미션별 동시 적용) ·
// 드래그 정렬은 편집모드에서만 · 공개범위는 환경설정 > 커미션 탭
// v2.0: 휴지통 — 끝난 신청을 한 번에 치우고, 보관 기간(환경설정 > 커미션) 동안은 되돌릴 수 있다.
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useLocalList } from '@/lib/postStore';
import {
  Applicant, APPLY_SEED, CommItem, COMM_SEED, useCommSettings, badgeStyle, maskName,
  applyVis, APPLY_VIS_LABEL, inTrash, trashExpired, trashLeft,
} from '@/lib/commStore';
import { SearchBar, Tip } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

/** 잠금 픽토그램 (선 아이콘) */
function LockIcon({ open }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      {open
        ? <path d="M8 11V7a4 4 0 0 1 7.6-1.7" />
        : <path d="M8 11V7a4 4 0 0 1 8 0v4" />}
    </svg>
  );
}

export default function CommApplyPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const toast = useToast();
  const del = useConfirmDelete();   // 모든 삭제는 경고 모달 (v1.9)
  const [apps, setApps, loaded] = useLocalList<Applicant>('ohome.commapply.v1', APPLY_SEED);
  const [comms] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings, , setLoaded] = useCommSettings();
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<string>('all');
  const [fComm, setFComm] = useState<string>('all');

  const trashDays = settings.trashDays ?? 30;

  // 보관 기간이 지난 신청은 목록을 열 때 정리한다 (v2.0) — 쓰기 권한이 있는 관리자만
  useEffect(() => {
    if (!loaded || !setLoaded || !isAdmin) return;
    const gone = trashExpired(apps, trashDays);
    if (gone.length) setApps(apps.filter(a => !gone.includes(a)));
    // 목록이 바뀔 때마다 확인 — 조건이 맞을 때만 한 번 지운다
  }, [loaded, setLoaded, isAdmin, apps, trashDays, setApps]);

  if (!loaded || !setLoaded) return <section className="page" />;

  // 리스트 공개범위 (환경설정 > 커미션 — 4.18)
  if ((settings.applyVisibility === 'private' && !isAdmin)
    || (settings.applyVisibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>APPLICANTS</PageTitle><p>
          {settings.applyVisibility === 'private' ? '비공개 리스트입니다' : '멤버공개 — 로그인 후 열람할 수 있습니다'}
        </p></div>
      </section>
    );
  }

  // 비권한자에게는 마스킹된 표기 (공개 글자 수만큼만 — 4.18 v1.9)
  const dispName = (a: Applicant) => (isAdmin ? a.name : maskName(a.name, a.nameOpen ?? 1));

  // 휴지통은 관리자만 볼 수 있다 — 목록에서는 빠진 신청이다
  const trashView = fStatus === 'trash' && isAdmin;
  const trashed = apps.filter(inTrash);
  const live = apps.filter(a => !inTrash(a));
  const pool = trashView ? trashed : live;

  const query = q.trim().toLowerCase();
  const shown = pool
    .filter(a => trashView || fStatus === 'all' || a.badgeId === fStatus)
    .filter(a => fComm === 'all' || a.commId === fComm)
    // 검색도 보이는 표기 기준 — 마스킹된 글자로 이름이 새지 않게
    .filter(a => !query || dispName(a).toLowerCase().includes(query));

  const commName = (id?: string) => comms.find(x => x.id === id)?.name ?? '';
  const cntS = (sid: string) => live.filter(a => sid === 'all' || a.badgeId === sid).length;
  const cntC = (cid: string) => pool.filter(a => cid === 'all' || a.commId === cid).length;

  const statusLabel = settings.applyBadges.find(b => b.id === fStatus)?.label;
  // 완료(done)만 일괄 휴지통 대상 (v2.0 사용자 발견) — 다른 상태 필터에서도 버튼이 뜨면서
  // 대기·작업중인 신청까지 한꺼번에 휴지통에 들어가던 문제. "완료" 뱃지는 고정 id라 라벨을
  // 바꿔도 안전하게 걸 수 있다
  const canBulkTrash = fStatus === 'done';

  /* 완료로 보고 있는 신청을 한 번에 휴지통으로 (v2.0 사용자 요청 — 끝난 신청 정리용) */
  const toTrash = () => {
    const ids = new Set(shown.map(a => a.id));
    if (!ids.size) return;
    del.ask(
      `${statusLabel ? `「${statusLabel}」 ` : '지금 목록에 보이는 '}신청 ${ids.size}건을 휴지통으로 옮기시겠습니까?`,
      () => {
        const at = new Date().toISOString();
        setApps(apps.map(a => (ids.has(a.id) ? { ...a, trashedAt: at } : a)));
        toast(`${ids.size}건을 휴지통으로 옮겼습니다`);
      },
      `휴지통에서 되돌릴 수 있고, ${trashDays}일이 지나면 사라집니다.`,
      '휴지통으로',   // 지우는 게 아니라 옮기는 것이라 확인 버튼 문구도 그렇게
    );
  };

  const restore = (a: Applicant) => {
    setApps(apps.map(x => (x.id === a.id ? { ...x, trashedAt: undefined } : x)));
    toast('목록으로 되돌렸습니다');
  };

  const dropOne = (a: Applicant) =>
    del.ask(`${dispName(a)} 님의 신청을 완전히 삭제하시겠습니까?`,
      () => { setApps(apps.filter(x => x.id !== a.id)); toast('삭제되었습니다'); },
      '되돌릴 수 없습니다.');

  const emptyTrash = () =>
    del.ask(`휴지통의 신청 ${trashed.length}건을 완전히 삭제하시겠습니까?`,
      () => { setApps(live); toast('휴지통을 비웠습니다'); },
      '되돌릴 수 없습니다.');

  const row = (a: Applicant) => {
    const badge = settings.applyBadges.find(b => b.id === a.badgeId);
    const vis = applyVis(a);
    // 본인 열람 — 지정 회원(selfId)만, 미지정 구버전 데이터는 로그인 회원 허용
    const canSee = isAdmin || vis === 'public'
      || (vis === 'self' && !!user && (a.selfId ? user.id === a.selfId : true));
    return (
      <div className="ap-row" key={a.id}
        style={{ width: '100%', cursor: 'pointer' }}
        onClick={() => { if (!editOn) router.push(`/comm-apply/${a.id}`); }}>
        {/* 드래그 핸들 — 편집모드에서만 표시 (휴지통에선 순서를 만질 일이 없다) */}
        {editOn && !trashView && <span className="drag-h">⠿</span>}
        <div className="dl">
          <small>DEADLINE</small>
          <b>{a.deadline ? a.deadline.replace(/-/g, '.') : '—'}</b>
        </div>
        <span className="bwrap">
          {badge && <span style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</span>}
        </span>
        <div className="who">
          <b>{dispName(a)}</b>
          {(a.appliedDate || a.source) && (
            <small>{[a.appliedDate && `신청 ${a.appliedDate.replace(/-/g, '.')}`, a.source].filter(Boolean).join(' · ')}</small>
          )}
        </div>
        <span className="kind">{commName(a.commId)}</span>
        {trashView ? (
          <span className="ap-trash" onClick={e => e.stopPropagation()}>
            <small>{trashLeft(a, trashDays)}일 남음</small>
            <button className="btn btn-ghost" onClick={() => restore(a)}>되돌리기</button>
            <button className="btn btn-ghost" onClick={() => dropOne(a)}>완전삭제</button>
          </span>
        ) : (
          <span className="lock" onClick={e => e.stopPropagation()}>
            {/* 공개범위 안내만 — 내용은 툴팁에 노출하지 않음 (비공개 의미 유지, 사용자 확정) */}
            <Tip dd tip={APPLY_VIS_LABEL[vis]}>
              <span style={{ color: canSee ? 'var(--accent)' : 'var(--faint)' }}><LockIcon open={canSee} /></span>
            </Tip>
          </span>
        )}
      </div>
    );
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>APPLICANTS</PageTitle>
        <EditableDesc k="commapply-desc" def="신청 순번 공개 리스트 — 내용은 비공개" />
        <div className="head-actions">
          <SearchBar placeholder="신청자 검색" onSearch={setQ} />
          {isAdmin && (trashView
            ? trashed.length > 0 && <button className="btn btn-ghost" onClick={emptyTrash}>휴지통 비우기</button>
            : (
              <>
                {canBulkTrash && shown.length > 0 && (
                  <button className="btn btn-ghost" onClick={toTrash}>
                    {statusLabel ? `「${statusLabel}」 ` : ''}{shown.length}건 휴지통으로
                  </button>
                )}
                <button className="btn btn-dark" onClick={() => router.push('/comm-apply/new')}>＋ ADD APPLICANT</button>
              </>
            ))}
        </div>
      </div>

      <div className="ap-layout">
        {/* overflow visible — 잠금 아이콘 커스텀 툴팁이 카드 밖으로 나올 수 있게 */}
        <div className="panel" style={{ padding: '8px 18px', overflow: 'visible' }}>
          {editOn && isAdmin && !trashView ? (
            <DragList items={shown} keyOf={a => a.id}
              onReorder={list => {
                // 필터 없는 상태 기준으로만 저장 (부분 필터 중엔 그 순서를 앞으로)
                const rest = apps.filter(a => !list.some(x => x.id === a.id));
                setApps([...list, ...rest]);
              }}
              render={row} />
          ) : (
            shown.map(a => row(a))
          )}
          {shown.length === 0 && (
            <p className="hint" style={{ padding: 14 }}>
              {trashView ? '휴지통이 비어 있습니다' : '표시할 신청이 없습니다'}
            </p>
          )}
        </div>

        {/* 우측 필터 사이드 — 상태별 + 커미션 종류별 동시 적용 (4.18) */}
        <div className="panel tagside" style={{ padding: 16 }}>
          <h4>진행 상태</h4>
          <div className={`tag ${fStatus === 'all' ? 'on' : ''}`} onClick={() => setFStatus('all')}>전체 <small>{cntS('all')}</small></div>
          {settings.applyBadges.map(b => (
            <div key={b.id} className={`tag ${fStatus === b.id ? 'on' : ''}`} onClick={() => setFStatus(b.id)}>
              {b.label} <small>{cntS(b.id)}</small>
            </div>
          ))}
          {/* 휴지통 — 관리자에게만, 보관 기간이 지나면 자동으로 사라진다 (v2.0) */}
          {isAdmin && (
            <div className={`tag ${trashView ? 'on' : ''}`} onClick={() => setFStatus(trashView ? 'all' : 'trash')}>
              휴지통 <small>{trashed.length}</small>
            </div>
          )}
          <h4 style={{ marginTop: 18 }}>커미션 종류</h4>
          <div className={`tag ${fComm === 'all' ? 'on' : ''}`} onClick={() => setFComm('all')}>전체 <small>{cntC('all')}</small></div>
          {comms.map(cm => (
            <div key={cm.id} className={`tag ${fComm === cm.id ? 'on' : ''}`} onClick={() => setFComm(cm.id)}>
              {cm.name} <small>{cntC(cm.id)}</small>
            </div>
          ))}
        </div>
      </div>
      {del.element}
    </section>
  );
}
