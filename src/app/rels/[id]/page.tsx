'use client';
// 자관 상세 (4.5) — 2인: 헤더 블러 + 대형 타이틀 + 좌우 카드 + 중앙 일러(전신/일러 토글) + AU
// 다인(3인+): 멤버 리스트형 · 관리자: 멤버 추가(이름·사진 직접 입력)
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeProvider';
import { useLocalList, newId } from '@/lib/postStore';
import {
  Relation, REL_SEED, RelMember, RelSideSlot,
  auMember, auStyle, fullShadow,
  RelAu,
  findByKey, relDday, relDdayDate, auKeyOf, relPath,
} from '@/lib/relStore';
import { putBlob } from '@/lib/blobStore';
import { useFonts } from '@/lib/fontStore';
import { KInput } from '@/components/ui/Kit';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { withAlpha } from '@/lib/color';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg, CropEditor, type CropValue } from '@/components/ui/CropEditor';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';
import { BackArrow } from '@/components/ui/BackArrow';
import { useSectionTitle, sectionHref, MAIN_SEC } from '@/lib/sectionStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { useNoKey, maxNo } from '@/lib/itemNo';
import { safeLink } from '@/lib/link';
import { useHeaderTone } from '@/lib/headerTone';
import { useRelFeeds, RelAnnivColumn, RelAnnivStrip, RelFeedWidget } from '@/components/rels/RelWidgets';

/** 전신 이미지 — 비율 유지, 하단 정렬, 크기 %는 자관 수정 미리보기에서 지정 (v1.9) */
// 전신 그림자는 「그림자 직접 지정」의 색·강도를 따른다 (v2.0 사용자 요청) — 자관명 그림자와 같은 설정
function FullImg({ refId, scale, offX = 0, offY = 0, shadow }: { refId: string; scale: number; offX?: number; offY?: number; shadow?: string }) {
  const url = useBlobUrl(refId);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" draggable={false} style={{
      position: 'absolute', bottom: `${offY}%`, left: `calc(50% + ${offX}%)`, transform: 'translateX(-50%)',
      height: `${scale}%`, maxWidth: 'none',
      filter: shadow,
    }} />
  );
}

/** 얼굴칸(1:1) 크롭 편집기 — 파일 참조를 주소로 바꿔 CropEditor에 넘긴다 (v2.0) */
function FaceCropModal({ fileRef, crop, onClose, onApply }: {
  fileRef: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return <CropEditor open src={url} aspect="1:1" initial={crop} onClose={onClose} onApply={onApply} />;
}

/** 중앙 일러 위치 편집기 (v2.0) — 실제 표시 영역의 비율 그대로 열어야 보이는 대로 맞출 수 있다 */
function RelArtCropModal({ fileRef, ratio, crop, onClose, onApply }: {
  fileRef: string; ratio: number; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return (
    <CropEditor open src={url} aspect={ratio} aspectLabel="상세 화면과 같은 비율"
      initial={crop} onClose={onClose} onApply={onApply} />
  );
}

function MiniProf({ member, isAdmin, onEdit, onRemove, side, onMoveSide, onFaceCrop }: {
  member: RelMember; isAdmin: boolean; onEdit: () => void; onRemove: () => void;
  side?: 'l' | 'r';           // 페어에서 지금 어느 자리인지 (좌우 옮기기 메뉴용, v2.0)
  onMoveSide?: () => void;
  onFaceCrop?: (ref: string) => void;   // 얼굴칸(1:1) 크롭 다시 잡기 (v2.0)
}) {
  const [lb, setLb] = useState<number | null>(null);
  // 멤버 제거는 우클릭 메뉴로 — 카드 아래에 상시 노출하면 정보가 아닌 것이 자리를 먹는다 (사용자 확정)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [ctx]);
  const rep = member.photoId;
  return (
    <div className="panel mini-prof"
      onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}>
      <div className="hd">
        {rep ? (
          <div className="face" data-tip="클릭하면 원본 보기"
            style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
            onClick={e => { e.stopPropagation(); setLb(0); }}>
            <CroppedBlobImg fileRef={rep} crop={member.faceCrop} />
          </div>
        ) : (
          <div className="face ph" />
        )}
        <div>
          {/* 이름 폰트·굵기는 모든 자관에서 하나로 통일 (사용자 요청) — 크기만 멤버별로 */}
          <b style={{ fontSize: member.nameSize ?? undefined }}>
            {member.name}
          </b>
          {/* 캐릭터 기능이 있던 때 넣은 멤버는 이름이 비어 있다 — 관리자에게만 채우라고 알려 준다 */}
          {!member.name && isAdmin && <small>이름 미입력 — 우클릭 › 이름·사진 수정</small>}
        </div>
      </div>
      {member.keywords.length > 0 && (
        <div className="kw-row">
          {member.keywords.map(k => <span key={k} className="pill">{k}</span>)}
        </div>
      )}
      {member.desc && <div className="rel-desc">{member.desc}</div>}
      {lb !== null && rep && <Lightbox srcs={[rep]} index={lb} onClose={() => setLb(null)} />}

      {/* 우클릭 메뉴 — 관리자만 (멤버 제거) */}
      {ctx && createPortal(
        <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">{member.name || '멤버'}</div>
          <button onClick={() => { setCtx(null); onEdit(); }}>이름·사진 수정</button>
          {onFaceCrop && rep && (
            <button onClick={() => { setCtx(null); onFaceCrop(rep); }}>썸네일 위치 조정</button>
          )}
          {onMoveSide && (
            <button onClick={() => { setCtx(null); onMoveSide(); }}>
              {side === 'r' ? '왼쪽으로 옮기기' : '오른쪽으로 옮기기'}
            </button>
          )}
          <button className="danger" onClick={() => { setCtx(null); onRemove(); }}>멤버 제거</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** 페어에서 멤버가 비었을 때 자리 카드 */
function EmptyCard({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div className="panel mini-prof" style={{
      display: 'grid', placeItems: 'center', minHeight: 320,
      border: '2px dashed var(--line)', background: 'rgba(252,252,253,.6)', cursor: isAdmin ? 'pointer' : undefined,
    }} onClick={() => { if (isAdmin) onAdd(); }}>
      <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 12.5, padding: 20 }}>
        {isAdmin ? <><b style={{ fontSize: 20, display: 'block', marginBottom: 6 }}>＋</b>멤버 추가<br /><small>인물 이름 · 사진</small></> : '멤버 미정'}
      </div>
    </div>
  );
}

function SideSlotCard({ slot }: { slot: RelSideSlot }) {
  return (
    <div className="panel side-slot-card">
      <div className="side-slot-image">
        <CroppedBlobImg fileRef={slot.imgId} crop={slot.crop} ph="" />
      </div>
      {slot.name && <b className="side-slot-name">{slot.name}</b>}
    </div>
  );
}

export default function RelDetailPage() {
  const { id: rawKey } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { familyOf } = useFonts();
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  // 주소는 별명 또는 번호 (v2.4) — 예전 id 주소로 들어오면 바꿔 둔다
  const id = useNoKey(rels, rawKey, k => `/rels/${k}`, { slug: true });
  // 소속 자관 목록 — 큰 글씨·삭제 후 돌아갈 곳
  const tt = useSectionTitle('rels', findByKey(rels, id)?.secId, 'RELATIONS');
  const [auId, setAuId] = useState('base');
  const [oneMode, setOneMode] = useState<boolean | null>(null);
  // 멤버 얼굴칸(1:1) 크롭 편집 (v2.0)
  const [faceEdit, setFaceEdit] = useState<{ charId: string; ref: string; crop?: CropValue } | null>(null);
  // 관리자 멤버 추가·수정 모달 — 인물 이름·사진을 직접 넣는다 (editId가 있으면 그 멤버 수정)
  const [memberOpen, setMemberOpen] = useState(false);
  const [mEditId, setMEditId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mQuote, setMQuote] = useState('');
  const [mPhoto, setMPhoto] = useState<{ ref?: string; file?: File; url?: string }>({});
  const [mSaving, setMSaving] = useState(false);
  const [artIdx, setArtIdx] = useState(0);
  /* 중앙 일러 우클릭 → 상세에 보일 위치 조정 (v2.0 사용자 요청).
     리스트 썸네일 좌표만 잡을 수 있고 상세는 못 잡던 것 — 여러 장이면 보고 있는 장을 잡는다.
     표시 영역은 화면 높이에 따라 달라지므로 고정 비율이 아니라 **실제 상자 비율**로 연다. */
  const [artCtx, setArtCtx] = useState<{ x: number; y: number; ref: string } | null>(null);
  const [artCropOpen, setArtCropOpen] = useState<{ ref: string; ratio: number } | null>(null);
  const artBoxRef = useRef<HTMLDivElement>(null);
  const artBoxRatio = () => {
    const r = artBoxRef.current?.getBoundingClientRect();
    return r && r.height > 1 ? r.width / r.height : 3 / 4;
  };
  useEffect(() => {
    if (!artCtx) return;
    const close = () => setArtCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setArtCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', key); };
  }, [artCtx]);
  const [auOpen, setAuOpen] = useState(false);
  const [auLabel, setAuLabel] = useState('');
  const [auCatch, setAuCatch] = useState('');
  const [delAsk, setDelAsk] = useState(false);   // 자관 삭제 확인
  const [auDelAsk, setAuDelAsk] = useState<string | null>(null);  // AU 삭제 확인 (v2.0 — 자관 삭제와 별개)
  const del = useConfirmDelete();                // 멤버·AU 등 개별 삭제 확인

  // 별명 주소로도 열린다 (v2.0 사용자 요청 — 주소를 나중에 바꿔도 옛 주소가 살아 있게)
  const rel = findByKey(rels, id);

  // 자관별 페이지 테마 (4.18 방식) — 별도 테마컬러면 홈 전체 팔레트를 임시 전환, 벗어나면 원복.
  // AU별 (v1.9): AU에 테마를 지정했으면 그것, 미지정이면 base(원본) 테마 따라가기
  const { setPageTheme, setPageBg } = useTheme();
  const themeAu = rel?.aus.find(a => a.id === auId);
  const auTheme = themeAu && themeAu.id !== 'base' ? themeAu.theme : undefined;
  const effThemeMode = auTheme?.mode ?? rel?.themeMode;
  const effThemeColor = auTheme ? auTheme.color : rel?.themeColor;
  const pageColor = effThemeMode === 'custom' && effThemeColor ? effThemeColor : null;
  const pageTone = auTheme ? auTheme.tone : rel?.themeTone;
  useEffect(() => {
    setPageTheme(pageColor, pageTone);
    return () => setPageTheme(null);
  }, [pageColor, pageTone, setPageTheme]);

  // 자관별 페이지 배경 (v2.0 사용자 요청) — 이 페이지에 있는 동안만, 벗어나면 원래 배경으로
  // 색·배경은 AU마다 따로 정할 수 있다 (v2.0 사용자 요청) — 정한 게 없으면 자관 기본
  const themeAuStyle = rel ? auStyle(rel, rel.aus.find(a => a.id === auId)) : undefined;
  const bgG1 = themeAuStyle?.pageBgG1;
  const bgG2 = themeAuStyle?.pageBgG2;
  const bgAngle = themeAuStyle?.pageBgAngle;
  /* 테마컬러 자관은 헤더 끝색을 단색으로 이어 칠한다 (v3.5 사용자 확정 시안 B) —
     헤더가 투명해진 자리에 테마 그라데이션이 드러나 끊겨 보이던 것. 배경을 직접 지정해 뒀으면 그것이 우선 */
  const hdrAu = rel?.aus.find(a => a.id === auId);
  const hdrIsBase = (hdrAu?.id ?? 'base') === 'base';
  const headerTone = useHeaderTone({
    enabled: !!pageColor && !bgG1 && !bgG2,
    imgRef: (hdrIsBase ? rel?.headerImgId : hdrAu?.headerImgId) ?? undefined,
    crop: hdrIsBase ? rel?.headerCrop : hdrAu?.headerCrop,
    g1: themeAuStyle?.headerBgG1, g2: themeAuStyle?.headerBgG2, angle: themeAuStyle?.headerBgAngle,
  });
  useEffect(() => {
    if (bgG1 || bgG2) {
      setPageBg({ g1: bgG1 ?? '#2b3038', g2: bgG2 ?? '#121418', angle: bgAngle ?? 180 });
    } else if (headerTone) {
      setPageBg({ g1: headerTone, g2: headerTone, angle: 180 });
    } else return;
    return () => setPageBg(null);
  }, [bgG1, bgG2, bgAngle, headerTone, setPageBg]);

  const isDuo = rel ? (rel.kind ? rel.kind === 'pair' : rel.members.length === 2) : false;
  const au = rel?.aus.find(a => a.id === auId) ?? rel?.aus[0];
  // AU별 프로필 데이터 (v1.9) — base(원본)는 Relation 최상위, 그 외 AU는 aus 항목에 저장
  const isBaseAu = (au?.id ?? 'base') === 'base';
  const auArts = (isBaseAu ? rel?.arts : au?.arts) ?? [];
  // AU별 이름/본문 폰트·전신 앞뒤 (v2.0 사용자 제보 — 분리가 안 되던 것) — 미지정이면 자관 기본
  const auFont = (isBaseAu ? undefined : au?.fontId) ?? rel?.fontId;
  const auBodyFont = (isBaseAu ? undefined : au?.bodyFontId) ?? rel?.bodyFontId;
  const auFullFront = (isBaseAu ? undefined : au?.fullFront) ?? rel?.fullFront;
  const curArt = auArts[Math.min(artIdx, Math.max(0, auArts.length - 1))];
  /** 이 장의 위치만 저장 — 참조를 키로 두어 다른 장·AU 것은 그대로 (v2.0) */
  const saveArtCrop = (ref: string, c: CropValue | undefined) => updateRel({
    artCrops: (() => {
      const next = { ...(rel!.artCrops ?? {}) };
      if (c) next[ref] = c; else delete next[ref];
      return next;
    })(),
  });
  // LOG / LOREBOOK 바로가기 — 예전 CP/NCP 뱃지 자리 (사용자 요청으로 CP/NCP 대체)
  const logHref = safeLink(rel?.logUrl);
  const lorebookHref = safeLink(rel?.lorebookUrl);
  const ddayDate = au?.ddayDate ?? rel?.ddayDate;
  const dday = relDday(ddayDate);
  const ddayDateLabel = relDdayDate(ddayDate);
  const freeBlocks = (isBaseAu ? rel?.freeBlocks : au?.freeBlocks) ?? rel?.freeBlocks ?? [];
  /* 2인 자관 위젯 (v3.3 사용자 확정) — 기념일 · LOG/LOREBOOK 탭.
     위젯이 생기면 자관명 위 LOG·LOREBOOK 버튼과 이름 아래 SINCE 한 줄은 그리지 않는다 (같은 내용이 위젯에 있다) */
  const { feeds: [logFeed, loreFeed], sources: feedSources } = useRelFeeds([rel?.logUrl, rel?.lorebookUrl]);
  const feedOn = logFeed.state !== 'none' || loreFeed.state !== 'none';
  const annivOn = !!dday;
  const firstLog = logFeed.state === 'ok' ? logFeed.first : undefined;
  // 전신이 하나도 등록되지 않았으면 전신 모드를 두지 않는다 —
  // 빈 자리에 「○○ 전신」 자리표시자를 세우는 대신 대표 일러스트만 보여 준다 (사용자 확정)
  const fullRefOf = (cid: string) =>
    (isBaseAu ? rel?.members.find(x => x.charId === cid)?.fullImgId : au?.fulls?.[cid]);
  const hasFull = !!rel?.members.some(m => fullRefOf(m.charId));
  const single = hasFull ? (oneMode ?? rel?.illustMode === 'one') : true;

  const sideSlotOf = (side: 'l' | 'r') =>
    (!isBaseAu && au?.sideSlots?.[side]) || rel?.sideSlots?.[side];

  if (!loaded) return <section className="page" />;
  if (!rel || (rel.visibility === 'private' && !isAdmin) || (rel.visibility === 'member' && !user)) {
    return (
      <section className="page">
        {/* 상단바가 없는 화면이라(v2.8) 여기에도 뒤로가기 */}
        <div style={{ margin: '4px 0 10px' }}><BackArrow to={tt.href} label="자관 목록으로" /></div>
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>자관을 찾을 수 없거나 열람 권한이 없습니다</p></div>
      </section>
    );
  }

  const updateRel = (patch: Partial<Relation>) =>
    setRels(rels.map(r => (r.id === rel.id ? { ...r, ...patch } : r)));
  // AU별 프로필 데이터 갱신 (v1.9) — base는 최상위 필드, 그 외 AU는 aus 항목에
  const patchAuData = (p: { arts?: string[] }) => {
    if (isBaseAu) updateRel(p);
    else updateRel({ aus: rel.aus.map(a => (a.id === au!.id ? { ...a, ...p } : a)) });
  };

  /* ---------- 멤버 추가·수정 (인물 이름 + 사진) ---------- */
  const openMember = (m?: RelMember) => {
    setMEditId(m?.charId ?? null);
    setMName(m?.name ?? '');
    setMQuote(m?.quote ?? '');
    setMPhoto(m?.photoId ? { ref: m.photoId } : {});
    setMemberOpen(true);
  };
  const saveMember = async () => {
    if (!mName.trim()) { toast('인물 이름을 입력해 주세요'); return; }
    setMSaving(true);
    try {
      const photoId = mPhoto.file ? await putBlob(mPhoto.file) : mPhoto.ref;
      if (mEditId) {
        updateRel({
          members: rel.members.map(m => (m.charId === mEditId
            ? {
              ...m, name: mName.trim(), quote: mQuote.trim(), photoId,
              // 사진을 바꾸면 예전 사진에 맞춰 잡아 둔 얼굴칸 위치는 풀어 준다
              faceCrop: photoId === m.photoId ? m.faceCrop : undefined,
            }
            : m)),
        });
        toast('멤버 정보가 수정되었습니다');
      } else {
        updateRel({
          members: [...rel.members, {
            charId: newId(), name: mName.trim(), photoId,
            quote: mQuote.trim(), keywords: [], desc: '',
          }],
        });
        toast('멤버가 추가되었습니다');
      }
      setMemberOpen(false);
    } catch {
      toast('사진을 저장하지 못했습니다');
    } finally {
      setMSaving(false);
    }
  };

  const removeMember = (cid: string) => {
    const name = rel.members.find(m => m.charId === cid)?.name || '멤버';
    del.ask(`멤버 「${name}」를 제거하시겠습니까?`,
      () => updateRel({
        members: rel.members.filter(m => m.charId !== cid),
        // 오른쪽 지정이 걸려 있던 멤버가 빠지면 지정도 함께 푼다
        pairRight: rel.pairRight === cid ? undefined : rel.pairRight,
      }),
      '이 자관에 등록한 정보(이름·사진·한마디·전신)가 함께 지워집니다.');
  };

  /* 페어 좌우 배치 (v2.0 사용자 요청) — 예전에는 등록 순서가 곧 자리라, 처음 넣은 멤버는
     오른쪽 카드에서 추가해도 무조건 왼쪽에 들어갔다. pairRight로 오른쪽에 둘 멤버를 지정한다. */
  // 한마디·대사 색·전신 위치는 AU마다 다를 수 있다 (v2.0) — 이 AU 값이 있으면 그것으로 갈아 끼운다
  const asAu = (m: RelMember | null) => (m && !isBaseAu ? auMember(m, au) : m);
  // 멤버 이름은 자관 어디서나 같은 폰트로 (사용자 요청)
  const NAME_FONT = 'var(--serif)';
  // 색·배경도 AU마다 따로 (v2.0 사용자 요청) — AU에 정해 둔 게 없으면 자관 기본이 그대로 나온다
  const auSt = auStyle(rel, au);
  const pairSlots: (RelMember | null)[] = isDuo
    ? (rel.pairRight
      ? [asAu(rel.members.find(m => m.charId !== rel.pairRight) ?? null),
        asAu(rel.members.find(m => m.charId === rel.pairRight) ?? null)]
      : [asAu(rel.members[0] ?? null), asAu(rel.members[1] ?? null)])
    : [];
  /** 페어 인용구 — 멤버가 있으면 멤버 한마디, 없으면 빈 자리 카드의 한마디.
   *  PC는 히어로 양옆(.quote), 모바일은 카드 위/아래(.rel-mq)에 같은 내용을 그린다 */
  const quoteEl = (i: 0 | 1, cls: string) => {
    if (!isDuo) return null;
    const src = pairSlots[i] ?? sideSlotOf(i === 0 ? 'l' : 'r');
    if (!src?.quote) return null;
    return (
      <div className={cls} style={{
        color: src.quoteColor,
        ['--q-mark' as string]: src.quoteMarkColor,
      } as React.CSSProperties}>{src.quote}</div>
    );
  };

  /** 이 멤버를 반대쪽 자리로 (좌 ↔ 우).
   *  오른쪽을 왼쪽으로 옮길 때는 **반대쪽 멤버를 오른쪽으로 지정**한다 (v2.0 사용자 제보) —
   *  예전에는 지정을 지우기만 해서, 등록 순서상 원래 오른쪽이던 멤버는
   *  지워도 그대로 오른쪽이라 아무 일도 일어나지 않았다. */
  const moveSide = (cid: string) => {
    const nowRight = pairSlots[1]?.charId === cid;
    const other = rel.members.find(m => m.charId !== cid)?.charId;
    updateRel({ pairRight: nowRight ? other : cid });
  };

  /** 얼굴칸(1:1) 크롭 다시 잡기 (v2.0) */
  const saveFaceCrop = (cid: string, c: CropValue) => {
    /* AU를 보는 중이면 **그 AU에만** 저장 (v2.0 사용자 제보 — 원본에서 위치를 바꾸면 AU도
       같이 바뀌었다). 표시는 auMember가 mset 값을 우선하므로, 정하지 않은 AU는 원본을 따른다 */
    if (!isBaseAu && au) {
      updateRel({
        aus: rel.aus.map(a => (a.id === au.id
          ? { ...a, mset: { ...a.mset, [cid]: { ...a.mset?.[cid], faceCrop: c } } }
          : a)),
      });
      return;
    }
    updateRel({ members: rel.members.map(m => (m.charId === cid ? { ...m, faceCrop: c } : m)) });
    setFaceEdit(null);
  };

  return (
    <section className="page page-rel-detail">
      {/* 헤더 이미지 (v1.5) — 풀폭 블러 + 아래로 페이드아웃.
          AU별 완전 분리 (v1.9 사용자 확정): AU는 자기 헤더만 — base 것을 물려받지 않음.
          이미지가 없으면 아무것도 안 그리는 게 기본(v2.0) — 다만 자관 수정에서 배경 그라데이션을
          직접 지정해 뒀으면(base 소관, AU 무관) 그걸로 대신한다 */}
      {(() => {
        const hdrId = isBaseAu ? rel.headerImgId : (au?.headerImgId ?? undefined);
        const hdrCrop = isBaseAu ? rel.headerCrop : au?.headerCrop;
        if (hdrId) {
          return (
            <div className="rel-backdrop">
              <div className="img custom">
                <CroppedBlobImg fileRef={hdrId} crop={hdrCrop} ph="" />
              </div>
            </div>
          );
        }
        if (!auSt.headerBgG1 && !auSt.headerBgG2) return null;
        return (
          <div className="rel-backdrop">
            <div className="img custom" style={{
              background: `linear-gradient(${auSt.headerBgAngle ?? 180}deg, ${auSt.headerBgG1 ?? '#3a4150'}, ${auSt.headerBgG2 ?? '#1a1d22'})`,
            }} />
          </div>
        );
      })()}

      {(rel.aus.length > 1 || isAdmin) && (
        <div className="au-list">
          {/* AU 네모에 대표 이미지를 넣는다 (v2.0 사용자 요청 — 색만 들어가 있어 밋밋했다).
              원본은 자관 썸네일(잡아 둔 크롭 그대로), 그 외 AU는 그 AU의 첫 아트 = 대표 이미지.
              등록된 이미지가 없으면 예전처럼 색 플레이스홀더가 그대로 나온다 */}
          {rel.aus.map((a, i) => {
            const isBase = a.id === 'base';
            const thumb = isBase ? (rel.thumbId ?? rel.arts?.[0]) : a.arts?.[0];
            return (
              <div key={a.id} className={`au-item ${auId === a.id ? 'on' : ''}`}
                onClick={() => { setAuId(a.id); setArtIdx(0); }}>
                <CroppedBlobImg fileRef={thumb} crop={isBase ? rel.thumbCrop : undefined}
                  ph={['cool', 'pale', 'red'][i % 3]} />
                <small>{a.label}</small>
              </div>
            );
          })}
          {isAdmin && (
            <div className="au-item add" data-tip="AU 추가/관리" onClick={() => setAuOpen(true)}>＋</div>
          )}
        </div>
      )}

      {/* 왼쪽 위 — 뒤로가기(누구에게나, v2.8) + 관리자 액션.
          자관 상세는 상단바 없이 전체 화면이라(v2.8, 모바일 포함) 목록으로 돌아갈 길을 여기 둔다.
          브라우저 뒤로가기가 아니라 늘 이 자관의 목록으로 (사용자 요청 — 수정·저장 뒤 누르면 수정 화면으로 되돌아갔다) */}
      <div className="rel-tl">
      <BackArrow to={tt.href} label="자관 목록으로" />
      {isAdmin && (
        <div className="rel-admin-actions">
          {/* AU 선택 중이면 그 AU의 일러·캐치프레이즈를 편집 (v1.9) */}
          <button className="btn btn-dark" style={{ height: 30, padding: '0 13px', fontSize: 11 }}
            onClick={() => router.push(`${relPath(rel)}${isBaseAu ? '' : `/au/${auKeyOf(rel, au!.id)}`}/edit`)}>
            {isBaseAu ? 'EDIT' : `EDIT ${au!.label}`}
          </button>
          {/* AU를 보는 중이면 지워지는 것도 그 AU다 (v2.0 사용자 발견 — 자관이 통째로 지워졌다).
              EDIT은 AU를 따라가는데 DELETE만 안 따라가서, AU 화면에서 누르면 자관 전체가 날아갔다.
              버튼 글씨에도 무엇이 지워지는지 그대로 쓴다 */}
          <button className="btn btn-dark" style={{ height: 30, padding: '0 13px', fontSize: 11 }}
            onClick={() => (isBaseAu ? setDelAsk(true) : setAuDelAsk(au!.id))}>
            {isBaseAu ? 'DELETE' : `DELETE ${au!.label}`}
          </button>
        </div>
      )}
      </div>

      {/* AU 하나만 삭제 (v2.0 사용자 발견) — 자관 삭제와 확실히 구분되게 무엇이 남는지까지 적는다 */}
      <ConfirmModal open={auDelAsk !== null}
        title={`AU 「${rel.aus.find(a => a.id === auDelAsk)?.label ?? ''}」를 삭제하시겠습니까?`}
        body="이 AU의 일러·카드 정보가 함께 삭제되며 복구할 수 없습니다. 자관과 다른 AU는 그대로 남습니다."
        onClose={() => setAuDelAsk(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            const gone = auDelAsk!;
            updateRel({ aus: rel.aus.filter(a => a.id !== gone) });
            if (auId === gone) setAuId('base');
            setAuDelAsk(null);
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setAuDelAsk(null) },
        ]} />

      <ConfirmModal open={delAsk} title="자관을 삭제하시겠습니까?"
        body={`「${rel.name}」 자관 전체가 삭제됩니다 — AU ${rel.aus.length}개가 모두 함께 사라지며 복구할 수 없습니다.`}
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            setRels(rels.filter(r => r.id !== rel.id));
            router.push(sectionHref('rels', rel.secId ?? MAIN_SEC));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />

      <div className={`rel-hero${isDuo ? ' wgt-on' : ''}`}>
        {quoteEl(0, 'quote l')}
        {/* LOG / LOREBOOK 바로가기 — 자관명 위 가운데 (예전 CP/NCP 뱃지 자리 · 색은 자관 수정에서) */}
        {!isDuo && (logHref || lorebookHref) && (
          <div className="rel-links">
            {[['LOG', logHref], ['LOREBOOK', lorebookHref]].map(([lb, href]) => href && (
              <a key={lb} href={href} className="pill" style={auSt.cpTagBg || auSt.cpTagFg
                ? { background: auSt.cpTagBg, color: auSt.cpTagFg, borderColor: auSt.cpTagBg }
                : undefined}>{lb}</a>
            ))}
          </div>
        )}
        {/* 자관명·캐치프레이즈 글씨색 — 직접 지정 시 (v1.9 사용자 요청, 미지정: 테마) */}
        {/* 이름 그림자 — 색·강도 직접 지정 (v2.0 사용자 요청, 미지정: 검정 60% · 기존과 동일) */}
        {/* 이름 자체는 AU마다 다르게 붙일 수 있다 (v2.0 사용자 요청) — 안 정했으면 자관 이름 그대로 */}
        <h1 style={{
          fontFamily: familyOf(auFont), color: auSt.nameColor,
          textShadow: `0 4px 30px ${withAlpha(auSt.nameShadowColor ?? '#000000', 0.6 * ((auSt.nameShadow ?? 100) / 100))}`,
        }}>{(!isBaseAu && au?.name?.trim()) || rel.name}</h1>
        <div className="catch" style={{ color: auSt.cpColor }}>
          {au?.catchphrase || rel.catchphrase}
        </div>
        {!isDuo && dday && ddayDateLabel && <div className="rel-dday-detail" style={{ color: auSt.ddayColor }}>
          {dday.startsWith('D-') ? 'UNTIL' : 'SINCE'} {ddayDateLabel} · {dday}
        </div>}
        {quoteEl(1, 'quote r')}
      </div>

      {/* 모바일 — 기념일은 이름 아래 가로 띠 (PC는 왼쪽 카드 아래 세로 타임라인) */}
      {isDuo && annivOn && (
        <div className="rw-m rw-m-strip">
          <RelAnnivStrip startDate={ddayDate} firstLog={firstLog} color={auSt.ddayColor} tab={auSt.wgtColor} />
        </div>
      )}

      {isDuo ? (
        <div className={`rel-body${annivOn || feedOn ? ' has-wgt' : ''}`} style={{ fontFamily: familyOf(auBodyFont) }}>
          {/* 모바일 전용 인용구 — 왼쪽 멤버는 카드 위, 오른쪽 멤버는 카드 아래 (PC는 히어로 쪽) */}
          {quoteEl(0, 'rel-mq l')}
          {quoteEl(1, 'rel-mq r')}
          <div className="rel-side l">
          {pairSlots[0]
            ? <MiniProf member={pairSlots[0]} isAdmin={isAdmin}
                side="l" onMoveSide={() => moveSide(pairSlots[0]!.charId)}
                onFaceCrop={ref => setFaceEdit({ charId: pairSlots[0]!.charId, ref, crop: pairSlots[0]!.faceCrop })}
                onEdit={() => openMember(rel.members.find(m => m.charId === pairSlots[0]!.charId))}
                onRemove={() => removeMember(pairSlots[0]!.charId)} />
            : sideSlotOf('l') ? <SideSlotCard slot={sideSlotOf('l')!} />
              : <EmptyCard isAdmin={isAdmin} onAdd={() => openMember()} />}
          {annivOn && (
            <div className="rw-slot rw-pc">
              <RelAnnivColumn startDate={ddayDate} firstLog={firstLog} color={auSt.ddayColor} tab={auSt.wgtColor} />
            </div>
          )}
          </div>
          <div className={`rel-center ${single ? 'one-mode' : ''}`}
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--line-dark)' }}>
            {/* 전신 — 등록 이미지(AU별 우선) + 크기/앞뒤는 자관 수정의 미리보기에서 (v1.9) */}
            {pairSlots.map((sl, i) => {
              const cid = sl?.charId ?? '';
              // 전신 위치·크기도 AU 값 우선 (v2.0) — sl이 이미 AU 값으로 갈아 끼운 멤버다
              const m = sl ?? rel.members.find(x => x.charId === cid);
              // AU는 자기 전신만 — base 전신을 물려받지 않음 (v1.9 사용자 확정)
              const fullRef = isBaseAu ? m?.fullImgId : au?.fulls?.[cid];
              if (!fullRef) return null;   // 등록 안 된 전신은 자리도 만들지 않는다
              const front = (auFullFront ?? pairSlots[1]?.charId) === cid;
              return (
                <div key={i} className={`fb fb-${i === 0 ? 'l' : 'r'}`}
                  style={{ background: 'transparent', zIndex: front ? 3 : 2 }}>
                  <FullImg refId={fullRef} scale={m?.fullScale ?? 90} offX={m?.fullOffX ?? 0} offY={m?.fullOffY ?? 0}
                    shadow={fullShadow(auSt.nameShadowColor, auSt.nameShadow)} />
                </div>
              );
            })}
            <div className="single" ref={artBoxRef} style={{ cursor: auArts.length > 1 ? 'pointer' : undefined }}
              onClick={() => { const n = auArts.length; if (n > 1) setArtIdx(i => (i + 1) % n); }}
              onContextMenu={e => {
                if (!isAdmin || !curArt) return;
                e.preventDefault();
                setArtCtx({ x: e.clientX, y: e.clientY, ref: curArt });
              }}>
              {auArts.length > 0 ? (
                <>
                  {/* 잡아 둔 위치가 있으면 그대로 (v2.0) — 없으면 예전처럼 통째로 */}
                  <CroppedBlobImg fileRef={auArts[Math.min(artIdx, auArts.length - 1)]} crop={rel.artCrops?.[curArt]} ph="" label="MAIN ILLUST" />
                  {auArts.length > 1 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                      {auArts.map((_, i) => (
                        <i key={i} style={{ width: i === Math.min(artIdx, auArts.length - 1) ? 16 : 6, height: 6, borderRadius: 4, background: i === Math.min(artIdx, auArts.length - 1) ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s' }} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="ph" style={{ position: 'absolute', inset: 0 }}><span>MAIN ILLUST</span></div>
              )}
            </div>
            {/* 스위치 색 — 자관별 지정(EDIT) 없으면 테마·포인트색 (v1.9).
                전신이 하나도 없으면 고를 것이 없으므로 스위치 자체를 숨긴다 */}
            {hasFull && (
              <div className="illu-toggle seg" style={{
                ['--illu-bg' as string]: auSt.illuBg,
                ['--illu-on' as string]: auSt.illuOn,
              } as React.CSSProperties}>
                <button className={!single ? 'on' : ''} onClick={() => setOneMode(false)}>전신</button>
                <button className={single ? 'on' : ''} onClick={() => setOneMode(true)}>일러스트</button>
              </div>
            )}
          </div>
          <div className="rel-side r">
          {pairSlots[1]
            ? <MiniProf member={pairSlots[1]} isAdmin={isAdmin}
                side="r" onMoveSide={() => moveSide(pairSlots[1]!.charId)}
                onFaceCrop={ref => setFaceEdit({ charId: pairSlots[1]!.charId, ref, crop: pairSlots[1]!.faceCrop })}
                onEdit={() => openMember(rel.members.find(m => m.charId === pairSlots[1]!.charId))}
                onRemove={() => removeMember(pairSlots[1]!.charId)} />
            : sideSlotOf('r') ? <SideSlotCard slot={sideSlotOf('r')!} />
              : <EmptyCard isAdmin={isAdmin} onAdd={() => openMember()} />}
          {feedOn && (
            <div className="rw-slot rw-pc">
              <RelFeedWidget log={logFeed} lore={loreFeed} fit tab={auSt.wgtColor} />
            </div>
          )}
          </div>
          {/* 모바일 — LOG/LOREBOOK은 카드 아래 전체 폭 */}
          {feedOn && (
            <div className="rw-m rw-m-feed">
              <RelFeedWidget log={logFeed} lore={loreFeed} tab={auSt.wgtColor} />
            </div>
          )}
        </div>
      ) : (
        /* 다인 자관 — 프로토타입 multi-body: 좌 멤버 리스트(430px) + 우 그룹 일러 */
        <div className="multi-body" style={{ fontFamily: familyOf(auBodyFont) }}>
          <div className="panel flush" style={{ padding: '6px 0' }}>
            {rel.members.map(m => (
              <div key={m.charId} className="mrow"
                style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                onClick={() => { if (isAdmin) openMember(m); }}>
                <div className="face ph">
                  {m.photoId && <CroppedBlobImg fileRef={m.photoId} crop={m.faceCrop} ph="" />}
                </div>
                <div className="nm">
                  <b style={{ fontFamily: NAME_FONT }}>{m.name || (isAdmin ? '이름 미입력' : '')}</b>
                  {(m.quote || m.keywords[0]) && (
                    <span className="ext">{m.quote || m.keywords[0]}</span>
                  )}
                </div>
                {isAdmin && (
                  <span className="rm" onClick={e => { e.stopPropagation(); removeMember(m.charId); }}>제거</span>
                )}
              </div>
            ))}
            {isAdmin && rel.members.length < 6 && (
              <div className="mrow add" onClick={() => openMember()}>＋ ADD MEMBER (최대 6인)</div>
            )}
          </div>

          {/* 우: 그룹 일러 — 여러 장이면 클릭 넘김 + 도트 */}
          <div className="multi-illust" ref={artBoxRef}
            style={{ cursor: auArts.length > 1 ? 'pointer' : undefined }}
            onClick={() => { const n = auArts.length; if (n > 1) setArtIdx(i => (i + 1) % n); }}
            onContextMenu={e => {
              if (!isAdmin || !curArt) return;
              e.preventDefault();
              setArtCtx({ x: e.clientX, y: e.clientY, ref: curArt });
            }}>
            {auArts.length > 0 ? (
              <>
                <CroppedBlobImg fileRef={auArts[Math.min(artIdx, auArts.length - 1)]} crop={rel.artCrops?.[curArt]} ph="" label="GROUP ILLUST" />
                {auArts.length > 1 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                    {auArts.map((_, i) => (
                      <i key={i} style={{ width: i === Math.min(artIdx, auArts.length - 1) ? 16 : 6, height: 6, borderRadius: 4, background: i === Math.min(artIdx, auArts.length - 1) ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s' }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ph" style={{ position: 'absolute', inset: 0 }}><span>GROUP ILLUST</span></div>
            )}
          </div>
        </div>
      )}

      {/* LOG·LOREBOOK 목록을 불러오는 보이지 않는 부품 */}
      {feedSources}

      {freeBlocks.map(block => (
        <section key={block.id} className="panel rel-free-block">
          {block.title && <h3>{block.title}</h3>}
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html) }} />
        </section>
      ))}

      {/* ---------- 멤버 추가·수정 모달 — 인물 이름 + 사진 ---------- */}
      <Modal open={memberOpen} onClose={() => setMemberOpen(false)} small title={mEditId ? '멤버 수정' : '멤버 추가'}
        dirty={!!(mName || mQuote || mPhoto.file)}
        desc="인물 이름과 사진을 넣습니다 — 사진은 카드의 얼굴칸(1:1)에 들어가며, 위치는 카드 우클릭 > 썸네일 위치 조정"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMemberOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" disabled={mSaving} onClick={saveMember}>{mEditId ? 'SAVE' : 'ADD'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{
              width: 76, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0,
              border: '1.5px dashed var(--line)', cursor: 'pointer', display: 'grid', placeItems: 'center',
            }} data-tip="눌러서 사진 선택">
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setMPhoto({ file: f, url: URL.createObjectURL(f) });
                  e.target.value = '';
                }} />
              {mPhoto.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mPhoto.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : mPhoto.ref
                  ? <BlobImg fileRef={mPhoto.ref} ph="" label="" />
                  : <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>PHOTO</span>}
            </label>
            <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 0 }}>
              <KInput placeholder="인물 이름" value={mName} onChange={e => setMName(e.target.value)} />
              {(mPhoto.ref || mPhoto.file) && (
                <button className="btn btn-ghost" style={{ height: 26, padding: '0 10px', fontSize: 10.5, justifySelf: 'start' }}
                  onClick={() => setMPhoto({})}>사진 빼기</button>
              )}
            </div>
          </div>
          <KInput placeholder="한마디 (선택 — 타이틀 옆 인용구)" value={mQuote} onChange={e => setMQuote(e.target.value)} />
        </div>
      </Modal>

      {/* ---------- AU 추가/관리 모달 (v1.8 — AU별 이미지·카드 분리는 후속) ---------- */}
      <Modal open={auOpen} onClose={() => setAuOpen(false)} small title="AU 관리"
        dirty={!!(auLabel || auCatch)}
        desc="AU를 클릭하면 프로필 전체(일러·카드)가 그 AU의 것으로 전환됩니다 — 일러·캐치프레이즈는 그 AU를 선택한 상태에서 EDIT"
        actions={<button className="btn btn-dark" onClick={() => setAuOpen(false)}>닫기</button>}>
        <div style={{ display: 'grid', gap: 8 }}>
          {rel.aus.map(a => (
            <div key={a.id} style={{ display: 'grid', gap: 7, padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* AU 이름·캐치프레이즈는 등록할 때만 받고 그 뒤로는 고칠 곳이 없었다 (v2.0 사용자 발견).
                    등록 폼과 같은 자리에서 바로 고치게 한다 */}
                <KInput value={a.label}
                  onChange={e => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, label: e.target.value } : x)) })}
                  style={{ width: 110, fontSize: 12, padding: '5px 9px', flexShrink: 0 }} />
                <KInput value={a.id === 'base' ? rel.catchphrase : a.catchphrase} placeholder="캐치프레이즈"
                  onChange={e => {
                    const v = e.target.value;
                    // 원본의 캐치프레이즈는 자관 본체에 있다 — 둘이 어긋나지 않게 함께 고친다
                    updateRel({
                      ...(a.id === 'base' ? { catchphrase: v } : {}),
                      aus: rel.aus.map(x => (x.id === a.id ? { ...x, catchphrase: v } : x)),
                    });
                  }}
                  style={{ fontSize: 11.5, padding: '5px 9px', minWidth: 0, flex: 1 }} />
                {a.id !== 'base' && (
                  <>
                    {/* 순서 변경 (v2.0 사용자 요청) — 원본(base)은 항상 맨 앞 고정 */}
                    <span className="fx" style={{ flexShrink: 0, opacity: rel.aus.indexOf(a) <= 1 ? .3 : 1 }}
                      data-tip="위로"
                      onClick={() => {
                        const i = rel.aus.findIndex(x => x.id === a.id);
                        if (i <= 1) return;   // 0 = base
                        const next = [...rel.aus];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        updateRel({ aus: next });
                      }}>▲</span>
                    <span className="fx" style={{ flexShrink: 0, opacity: rel.aus.indexOf(a) >= rel.aus.length - 1 ? .3 : 1 }}
                      data-tip="아래로"
                      onClick={() => {
                        const i = rel.aus.findIndex(x => x.id === a.id);
                        if (i < 1 || i >= rel.aus.length - 1) return;
                        const next = [...rel.aus];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        updateRel({ aus: next });
                      }}>▼</span>
                    <span className="fx" style={{ flexShrink: 0 }}
                      onClick={() => del.ask(`AU 「${a.label}」를 삭제하시겠습니까?`, () => {
                        updateRel({ aus: rel.aus.filter(x => x.id !== a.id) });
                        if (auId === a.id) setAuId('base');
                      }, '이 AU의 일러·카드 정보가 함께 삭제되며 복구할 수 없습니다.')}>✕</span>
                  </>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput placeholder="AU 이름" value={auLabel} onChange={e => setAuLabel(e.target.value)} style={{ maxWidth: 130 }} />
              <KInput placeholder="캐치프레이즈" value={auCatch} onChange={e => setAuCatch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }} onClick={() => {
                if (!auLabel.trim()) { toast('AU 이름을 입력해 주세요'); return; }
                // AU 번호 — 자관 안에서 만든 순서대로 (주소 /rels/{…}/au/{번호}, v2.4)
                const na: RelAu = {
                  id: newId(), no: maxNo(rel.aus.filter(a => a.id !== 'base')) + 1,
                  label: auLabel.trim(), catchphrase: auCatch.trim(),
                };
                updateRel({ aus: [...rel.aus, na] });
                setAuLabel(''); setAuCatch('');
              }}>＋ ADD AU</button>
            </div>
          </div>
        </div>
      </Modal>

{/* 중앙 일러 우클릭 — 상세에 보일 위치 (v2.0 사용자 요청). 여러 장이면 보고 있는 장 */}
      {artCtx && createPortal(
        <div className="ctx-menu on" style={{ left: artCtx.x, top: artCtx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">중앙 일러{auArts.length > 1 ? ` ${Math.min(artIdx, auArts.length - 1) + 1}/${auArts.length}` : ''}</div>
          <button onClick={() => { setArtCropOpen({ ref: artCtx.ref, ratio: artBoxRatio() }); setArtCtx(null); }}>
            이미지 위치 조정
          </button>
          {rel.artCrops?.[artCtx.ref] && (
            <button onClick={() => { saveArtCrop(artCtx.ref, undefined); setArtCtx(null); }}>위치 지정 해제</button>
          )}
        </div>,
        document.body,
      )}
      {artCropOpen && (
        <RelArtCropModal fileRef={artCropOpen.ref} ratio={artCropOpen.ratio} crop={rel.artCrops?.[artCropOpen.ref]}
          onClose={() => setArtCropOpen(null)}
          onApply={c => { saveArtCrop(artCropOpen.ref, c); setArtCropOpen(null); }} />
      )}

      {/* 멤버 얼굴칸(1:1) 크롭 (v2.0) */}
      {faceEdit && (
        <FaceCropModal fileRef={faceEdit.ref} crop={faceEdit.crop}
          onClose={() => setFaceEdit(null)}
          onApply={c => saveFaceCrop(faceEdit.charId, c)} />
      )}

      {/* 삭제 확인 — DOM 마지막에 렌더해 다른 모달(AU 관리 등) 위에 뜨게 */}
      {del.element}
    </section>
  );
}
