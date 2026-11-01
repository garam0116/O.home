'use client';
// 자관 상세 (4.5) — 2인: 헤더 블러 + 대형 타이틀 + 좌우 카드 + 중앙 일러(전신/일러 토글) + AU
// 하단: TIMELINE (v1.8) + 역극·로그 연동 리스트 · 다인(3인+): 멤버 리스트형
// 관리자: 멤버 추가(내/상대 캐릭터) · 타임라인 항목 추가
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeProvider';
import { useLocalList, newId } from '@/lib/postStore';
import {
  Relation, REL_SEED, Character, CHAR_SEED, RelMember, RelSideSlot, TlItem, findChar, Visibility, CharGrant,
  auMember, auStyle, fullShadow,
  RelAu, RelCpTag, charWithAu, CP_LABEL,
  findByKey, charPath, relDday, relDdayDate, auPathOf, auKeyOf, relPath,
} from '@/lib/charStore';
import { putBlob } from '@/lib/blobStore';
import { GrantsEditor } from '@/components/chars/GrantsEditor';
import { TrpgLog, TRPG_SEED } from '@/lib/galleryStore';
import { RpRoom, RP_SEED } from '@/lib/rpStore';
import { useFonts } from '@/lib/fontStore';
import { Tip, KInput, KTextarea, KSelect, KRadio, KCheck } from '@/components/ui/Kit';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { ColorField } from '@/components/ui/ColorField';
import { withAlpha } from '@/lib/color';
import { DragList } from '@/components/ui/DragList';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg, CropEditor, type CropValue } from '@/components/ui/CropEditor';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';
import { useSectionTitle, sectionHref, MAIN_SEC } from '@/lib/sectionStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { useNoKey, maxNo, itemPath } from '@/lib/itemNo';

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

/** 캐릭터 대표 이미지 — 등록돼 있으면 실제 이미지, 없을 때만 기존 플레이스홀더 */
function CharFace({ c, className, style }: {
  c?: Character; className?: string; style?: React.CSSProperties;
}) {
  const rep = c?.thumbId ?? c?.arts?.[0];
  if (!rep) return <div className={`${className ?? ''} ph ${c?.thumbClass ?? ''}`} style={style} />;
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      <CroppedBlobImg fileRef={rep} crop={c?.thumbCrop} />
    </div>
  );
}

/** hex → "r,g,b" (말풍선 --cc 용) */
function rgbTriple(hex: string): string {
  const m = hex.replace('#', '');
  const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return `${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)}`;
}

/** 프로필에 덧붙일 메모 — 「회원 ○○ 연결됨」처럼 알려 줄 게 있을 때만.
 *  예전엔 상대 캐릭터를 등록하면 「상대 캐릭터」라고 적어 뒀는데, 상대 캐릭터 자리에 있는 게
 *  상대 캐릭터인 건 굳이 적을 일이 아니라 뺐다 (v2.0 사용자 요청 — 이미 저장된 것도 안 보이게) */
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

const noteOf = (m: RelMember) => (m.linkedNote === '상대 캐릭터' ? '' : m.linkedNote ?? '');

function MiniProf({ member, char, isAdmin, onGo, onRemove, auUnregistered, side, onMoveSide, onFaceCrop }: {
  member: RelMember; char?: Character; isAdmin: boolean; onGo: () => void; onRemove: () => void;
  auUnregistered?: boolean;   // AU 선택 중인데 이 캐릭터의 AU 프로필이 미등록 (v1.9)
  side?: 'l' | 'r';           // 페어에서 지금 어느 자리인지 (좌우 옮기기 메뉴용, v2.0)
  onMoveSide?: () => void;
  onFaceCrop?: (ref: string) => void;   // 얼굴칸(1:1) 크롭 다시 잡기 (v2.0)
}) {
  const { familyOf } = useFonts();   // 이름은 캐릭터 프로필에서 지정한 폰트로
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
  // 대표 이미지 = 프로필 사진 · 나머지 아트 = 아래 썸네일 줄 (없으면 줄 자체를 만들지 않는다)
  const arts = char?.arts ?? [];
  const rep = char?.thumbId ?? arts[0];
  const rest = arts.filter(a => a !== rep);
  const gallery = (rep ? [rep, ...rest] : rest).filter(Boolean);
  if (!char) return null;
  if (auUnregistered) {
    return (
      <div className="panel mini-prof" onClick={onGo} style={{ cursor: 'pointer', textAlign: 'center', padding: '44px 20px' }}>
        <b style={{ fontSize: 15, letterSpacing: '.08em', fontFamily: familyOf(char.fontId) }}>{char.name}</b>
        <p className="hint" style={{ marginTop: 10 }}>이 AU의 프로필이 아직 등록되지 않았습니다<br />카드를 누르면 캐릭터 페이지에서 등록할 수 있습니다</p>
      </div>
    );
  }
  return (
    <div className="panel mini-prof" onClick={onGo} style={{ cursor: 'pointer' }}
      onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}>
      <div className="hd">
        {rep ? (
          <div className="face" data-tip="클릭하면 원본 보기"
            style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
            onClick={e => { e.stopPropagation(); setLb(0); }}>
            {/* 얼굴칸은 1:1 — 캐릭터의 3:4 썸네일 크롭을 그대로 쓰면 어긋나므로
                자관에서 따로 잡아 둔 값이 있으면 그것을 쓴다 (우클릭 > 썸네일 위치) */}
            <CroppedBlobImg fileRef={rep} crop={member.faceCrop ?? char.thumbCrop} />
          </div>
        ) : (
          <div className={`face ph ${char.thumbClass}`} />
        )}
        <div>
          {/* 자관 이름 폰트를 우선 쓰고, 미지정이면 캐릭터 프로필 폰트를 쓴다 */}
          <b style={{
            fontFamily: familyOf(member.nameFontId ?? char.fontId), fontSize: member.nameSize ?? undefined,
            // 굵기는 끌 수 있다 (v2.0 사용자 요청) — 기본은 지금처럼 굵게(<b>)
            fontWeight: (member.nameBold ?? true) ? undefined : 400,
          }}>
            {char.name}
          </b>
          {char.sub && <small>{char.sub}</small>}
          {noteOf(member) && <small>{noteOf(member)}</small>}
        </div>
      </div>
      <div className="specs">
        {char.specs.map(s => <div key={s.label}><b>{s.label}</b> {s.value}</div>)}
      </div>
      {/* 캐릭터의 지금 색 팔레트를 그대로 읽는다 (v2.0 사용자 발견).
          예전엔 멤버를 추가할 때 복사해 둔 member.palette 스냅샷을 보여 줘서, 캐릭터 쪽에서 색을
          지우거나 더 넣어도 자관 페이지는 추가 당시 상태에 멈춰 있었다("지웠는데 안 사라져",
          "더 등록해도 추가로 안 떠"의 원인). 옛 저장분은 캐릭터에 색이 하나도 없을 때만 fallback */}
      <div className="palette-row" data-tip="캐릭터 테마색 팔레트">
        {/* `?? `(nullish)로 판단 — 빈 배열은 "색을 다 지웠다"는 뜻이라 그대로 비워야 한다.
            length로 보면 전부 지웠을 때 옛 스냅샷이 되살아난다 (v2.0 사용자 재신고) */}
        {/* 색 점 테두리 — 캐릭터의 colorBd 설정을 여기서도 (v2.0 사용자 요청: 카드 배경과
            구분 안 되는 색이면 자관 상세에서도 테두리가 필요하다). 마름모(clip-path)라
            box-shadow가 잘리므로, 바깥 마름모를 테두리색으로 깔고 안쪽 마름모에 색을 얹는다 */}
        {(char.colors ?? member.palette).map(p => {
          const bd = char.colorBd === 'none' ? null : (char.colorBd ?? 'rgba(0,0,0,.14)');
          return (
            <Tip key={p.hex + p.label} tip={p.label}>
              <span className="gem" style={{ background: bd ?? p.hex }}>
                {bd && <i style={{ background: p.hex }} />}
              </span>
            </Tip>
          );
        })}
      </div>
      <div className="kw-row">
        {member.keywords.map(k => <span key={k} className="pill">{k}</span>)}
      </div>
      {member.desc && <div className="rel-desc">{member.desc}</div>}
      {/* 대표를 뺀 나머지 아트 — 없으면 줄 자체를 만들지 않는다 (빈 칸이 자리를 먹지 않게) */}
      {rest.length > 0 && (
        <div className="card-thumbs">
          {rest.map((r, i) => (
            <div key={r} className="t" data-tip="클릭하면 원본 보기"
              style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
              onClick={e => { e.stopPropagation(); setLb((rep ? 1 : 0) + i); }}>
              <BlobImg fileRef={r} ph="" label="" />
            </div>
          ))}
        </div>
      )}
      {lb !== null && <Lightbox srcs={gallery} index={lb} onClose={() => setLb(null)} />}

      {/* 우클릭 메뉴 — 관리자만 (멤버 제거) */}
      {ctx && createPortal(
        <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">{char.name}</div>
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
        {isAdmin ? <><b style={{ fontSize: 20, display: 'block', marginBottom: 6 }}>＋</b>멤버 추가<br /><small>내 캐릭터 또는 상대 캐릭터</small></> : '멤버 미정'}
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
  const [chars, setChars, charsLoaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [logs] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [rooms] = useLocalList<RpRoom>('ohome.rp.v1', RP_SEED);
  // 소속 자관 목록 — 큰 글씨·삭제 후 돌아갈 곳
  const tt = useSectionTitle('rels', findByKey(rels, id)?.secId, 'RELATIONS');
  const [auId, setAuId] = useState('base');
  const [oneMode, setOneMode] = useState<boolean | null>(null);
  // 멤버 얼굴칸(1:1) 크롭 편집 (v2.0)
  const [faceEdit, setFaceEdit] = useState<{ charId: string; ref: string; crop?: CropValue } | null>(null);
  // 타임라인 항목 우클릭 메뉴 (v2.0 사용자 요청) — 수정·삭제. 늘 떠 있는 [삭제] 글자는 없앴다
  const [tlCtx, setTlCtx] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [tlEditIdx, setTlEditIdx] = useState<number | null>(null);   // null이면 새로 추가
  useEffect(() => {
    if (!tlCtx) return;
    const close = () => setTlCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setTlCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [tlCtx]);
  // 관리자 추가 모달
  const [memberOpen, setMemberOpen] = useState(false);
  const [mMode, setMMode] = useState<'exist' | 'new'>('exist');
  const [mCharId, setMCharId] = useState('');
  const [mQuery, setMQuery] = useState('');   // 기존 캐릭터 검색어
  const [mQuote, setMQuote] = useState('');
  const [mName, setMName] = useState('');
  const [mSub, setMSub] = useState('');
  const [mColor, setMColor] = useState('#8a7f70');
  const [mGrants, setMGrants] = useState<CharGrant[]>([]); // 새 상대 캐릭터 회원 권한 (v1.9)
  const [tlOpen, setTlOpen] = useState(false);
  const [tEra, setTEra] = useState('');
  const [tDesc, setTDesc] = useState('');
  // 한마디는 핑퐁식으로 여러 개 (사용자 요청)
  const [tSays, setTSays] = useState<{ id: string; charId: string; text: string }[]>([]);
  const [tlSort, setTlSort] = useState(false); // 타임라인 정렬 모드 (드래그앤드롭)
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
  const [auCp, setAuCp] = useState<RelCpTag>('cp');       // 새 AU의 CP/NCP (v1.9)
  const [delAsk, setDelAsk] = useState(false);   // 자관 삭제 확인
  const [auDelAsk, setAuDelAsk] = useState<string | null>(null);  // AU 삭제 확인 (v2.0 — 자관 삭제와 별개)
  const del = useConfirmDelete();                // 멤버·타임라인 등 개별 삭제 확인

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
  useEffect(() => {
    if (!bgG1 && !bgG2) return;
    setPageBg({ g1: bgG1 ?? '#2b3038', g2: bgG2 ?? '#121418', angle: bgAngle ?? 180 });
    return () => setPageBg(null);
  }, [bgG1, bgG2, bgAngle, setPageBg]);

  // 삭제된 캐릭터를 가리키는 멤버 자동 정리 — 카드도 안 뜨고 [＋ 멤버 추가]도
  // 안 나오는 유령 슬롯이 남지 않게 (캐릭터 삭제 기능 도입에 따른 정합성 보정)
  useEffect(() => {
    if (!loaded || !charsLoaded || !rel) return;
    const alive = rel.members.filter(m => chars.some(c => c.id === m.charId));
    if (alive.length !== rel.members.length) {
      setRels(rels.map(r => (r.id === rel.id ? { ...r, members: alive } : r)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, charsLoaded, rel?.id, rel?.members.length, chars.length]);

  const isDuo = rel ? (rel.kind ? rel.kind === 'pair' : rel.members.length === 2) : false;
  const au = rel?.aus.find(a => a.id === auId) ?? rel?.aus[0];
  // AU별 프로필 데이터 (v1.9) — base(원본)는 Relation 최상위, 그 외 AU는 aus 항목에 저장
  const isBaseAu = (au?.id ?? 'base') === 'base';
  const auArts = (isBaseAu ? rel?.arts : au?.arts) ?? [];
  // AU별 이름/본문 폰트·전신 앞뒤 (v2.0 사용자 제보 — 분리가 안 되던 것) — 미지정이면 자관 기본
  const auFont = (isBaseAu ? undefined : au?.fontId) ?? rel?.fontId;
  const auBodyFont = (isBaseAu ? undefined : au?.bodyFontId) ?? rel?.bodyFontId;
  const auFullFront = (isBaseAu ? undefined : au?.fullFront) ?? rel?.fullFront;
  const auTimeline = (isBaseAu ? rel?.timeline : au?.timeline) ?? [];
  const curArt = auArts[Math.min(artIdx, Math.max(0, auArts.length - 1))];
  /** 이 장의 위치만 저장 — 참조를 키로 두어 다른 장·AU 것은 그대로 (v2.0) */
  const saveArtCrop = (ref: string, c: CropValue | undefined) => updateRel({
    artCrops: (() => {
      const next = { ...(rel!.artCrops ?? {}) };
      if (c) next[ref] = c; else delete next[ref];
      return next;
    })(),
  });
  const auCpTag: RelCpTag | undefined = au?.cp ?? rel?.cp;
  const showTimeline = !au?.hideTimeline;
  const ddayDate = au?.ddayDate ?? rel?.ddayDate;
  const dday = relDday(ddayDate);
  const ddayDateLabel = relDdayDate(ddayDate);
  const freeBlocks = (isBaseAu ? rel?.freeBlocks : au?.freeBlocks) ?? rel?.freeBlocks ?? [];
  // 전신이 하나도 등록되지 않았으면 전신 모드를 두지 않는다 —
  // 빈 자리에 「○○ 전신」 자리표시자를 세우는 대신 대표 일러스트만 보여 준다 (사용자 확정)
  const fullRefOf = (cid: string) =>
    (isBaseAu ? rel?.members.find(x => x.charId === cid)?.fullImgId : au?.fulls?.[cid]);
  const hasFull = !!rel?.members.some(m => fullRefOf(m.charId));
  const single = hasFull ? (oneMode ?? rel?.illustMode === 'one') : true;

  // 멤버 캐릭터 — AU 선택 시 그 캐릭터의 AU 프로필(이름·사진 등)로 합성해 표시 (v1.9)
  const auCharKey = rel && !isBaseAu && au ? `${rel.id}:${au.id}` : null;
  const charOf = (cid: string) => {
    const c = findChar(chars, cid);
    return c && auCharKey ? charWithAu(c, auCharKey) : c;
  };
  // AU 선택 중 그 캐릭터의 AU 프로필 미등록 여부 + 캐릭터 페이지 링크(au 유지) (v1.9)
  const auUnregOf = (cid: string) => !!auCharKey && !findChar(chars, cid)?.auProfiles?.[auCharKey];
  // 캐릭터 별명 주소 우선 (v2.0) — 없으면 id 그대로
  const charHref = (cid: string) => {
    const base = charPath(charOf(cid) ?? { id: cid });
    return `${base}${auPathOf(rels, auCharKey)}`;   // AU는 /chars/{…}/au/{자관}/{번호} (v2.4)
  };
  const sideOf = (cid: string) => (isDuo && rel?.members[1]?.charId === cid ? 'r' : 'l');
  const sideSlotOf = (side: 'l' | 'r') =>
    (!isBaseAu && au?.sideSlots?.[side]) || rel?.sideSlots?.[side];

  const relLogs = useMemo(() => logs.filter(l => l.relId === rel?.id), [logs, rel]);
  // 역극 연동 (4.9) — 내가 참여한 방 + 공개 전환된 완결 방만 (비참여 방은 존재 자체 비노출)
  const relRooms = useMemo(() => rooms.filter(rm => rm.relId === rel?.id
    && ((user && rm.memberIds.includes(user.id)) || (rm.status === 'done' && rm.isPublic))),
    [rooms, rel, user]);

  if (!loaded) return <section className="page" />;
  if (!rel || (rel.visibility === 'private' && !isAdmin) || (rel.visibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>자관을 찾을 수 없거나 열람 권한이 없습니다</p></div>
      </section>
    );
  }

  const updateRel = (patch: Partial<Relation>) =>
    setRels(rels.map(r => (r.id === rel.id ? { ...r, ...patch } : r)));
  // AU별 프로필 데이터 갱신 (v1.9) — base는 최상위 필드, 그 외 AU는 aus 항목에
  const patchAuData = (p: { arts?: string[]; timeline?: TlItem[] }) => {
    if (isBaseAu) updateRel(p);
    else updateRel({ aus: rel.aus.map(a => (a.id === au!.id ? { ...a, ...p } : a)) });
  };

  /* ---------- 멤버 추가 (내 캐릭터 or 새 상대 캐릭터) ---------- */
  const candidates = chars.filter(c => !rel.members.some(m => m.charId === c.id));
  const addMember = () => {
    let cid = mCharId;
    if (mMode === 'new') {
      if (!mName.trim()) { toast('상대 캐릭터 이름을 입력해 주세요'); return; }
      // 상대 캐릭터 간단 등록 (own:false — 내 캐릭터 리스트에는 표시되지 않음, 4.4)
      const nc: Character = {
        id: newId(), name: mName.trim(), sub: mSub.trim(), color: mColor,
        // 입력한 색은 대표 테마색(color)으로만 쓴다 — 예전엔 팔레트(colors)에도 「테마색」이라는
        // 이름으로 한 칸 자동 등록해서, 포인트 컬러로 넣은 값이 팔레트에 멋대로 들어가 있었다
        // (v2.0 사용자 요청). 팔레트는 캐릭터 수정에서 직접 넣는다
        colors: [], specs: [], tabs: [],
        basicHtml: '', visibility: 'public', thumbClass: '', own: false,
        grants: mGrants.length ? mGrants : undefined, // 회원 권한 — 역극 플레이/편집 (v1.9)
      };
      setChars([...chars, nc]);
      cid = nc.id;
    }
    if (!cid) { toast('추가할 캐릭터를 선택해 주세요'); return; }
    const ch = chars.find(c => c.id === cid);
    updateRel({
      members: [...rel.members, {
        charId: cid, quote: mQuote.trim(), keywords: [], desc: '',
        // 팔레트는 캐릭터 쪽을 그대로 읽어 쓴다 — 여기서 복사해 두면 나중에 캐릭터 색을 바꿔도
        // 자관 페이지가 따라오지 않는다. 입력한 색을 「테마색」이라는 이름으로 팔레트에 자동
        // 등록하던 것도 없앴다 (v2.0 사용자 요청 — 포인트 컬러로 넣은 값이 테마색으로 들어가 버림)
        palette: [],
        // linkedNote는 「회원 ○○ 연결됨」처럼 알려 줄 게 있을 때만 — 상대 캐릭터라고 적어 두던 건 없앴다 (v2.0)
      }],
    });
    setMemberOpen(false);
    setMCharId(''); setMQuery(''); setMQuote(''); setMName(''); setMSub('');
    toast('멤버가 추가되었습니다');
  };

  /* ---------- 타임라인 항목 추가·수정 (설명/한마디 중 하나 필수 — 4.5) ---------- */
  const closeTl = () => { setTlOpen(false); setTlEditIdx(null); setTEra(''); setTDesc(''); setTSays([]); };
  const addTlItem = () => {
    const says = tSays.filter(x => x.charId && x.text.trim()).map(({ charId, text }) => ({ charId, text: text.trim() }));
    if (!tDesc.trim() && says.length === 0) { toast('설명 또는 한마디 중 하나는 입력해 주세요'); return; }
    const item: TlItem = {
      era: tEra.trim() || undefined,
      desc: tDesc.trim() || undefined,
      says,
    };
    const editing = tlEditIdx;
    patchAuData({
      timeline: editing == null
        ? [...auTimeline, item]
        : auTimeline.map((x, i) => (i === editing ? item : x)),
    });
    closeTl();
    toast(editing == null ? '타임라인 항목이 추가되었습니다' : '타임라인 항목이 수정되었습니다');
  };

  /* 우클릭 > 수정 — 그 항목을 추가 모달에 그대로 올려 놓는다 */
  const openTlEdit = (i: number) => {
    const it = auTimeline[i];
    if (!it) return;
    setTEra(it.era ?? '');
    setTDesc(it.desc ?? '');
    setTSays(it.says.map(sy => ({ id: newId(), charId: sy.charId, text: sy.text })));
    setTlEditIdx(i);
    setTlOpen(true);
  };

  const removeMember = (cid: string) => {
    const c = charOf(cid);
    const name = c?.name ?? '멤버';
    del.ask(`멤버 「${name}」를 제거하시겠습니까?`,
      () => updateRel({
        members: rel.members.filter(m => m.charId !== cid),
        // 오른쪽 지정이 걸려 있던 캐릭터가 빠지면 지정도 함께 푼다
        pairRight: rel.pairRight === cid ? undefined : rel.pairRight,
      }),
      c?.own
        // 내 캐릭터 — 이 자관에 등록한 정보만 지운다 (사용자 확정)
        ? '이 자관에 등록한 정보(한마디·키워드·소개·전신·색)만 지웁니다. 캐릭터 자체와 다른 자관의 정보는 그대로입니다.'
        : '자관에서만 빠지며 캐릭터 자체는 삭제되지 않습니다.');
  };

  /* 페어 좌우 배치 (v2.0 사용자 요청) — 예전에는 등록 순서가 곧 자리라, 처음 넣은 캐릭터는
     오른쪽 카드에서 추가해도 무조건 왼쪽에 들어갔다. pairRight로 오른쪽에 둘 캐릭터를 지정한다. */
  // 한마디·대사 색·전신 위치는 AU마다 다를 수 있다 (v2.0) — 이 AU 값이 있으면 그것으로 갈아 끼운다
  const asAu = (m: RelMember | null) => (m && !isBaseAu ? auMember(m, au) : m);
  const nameFontOf = (charId: string) =>
    familyOf(asAu(rel.members.find(m => m.charId === charId) ?? null)?.nameFontId ?? charOf(charId)?.fontId);
  // 색·배경도 AU마다 따로 (v2.0 사용자 요청) — AU에 정해 둔 게 없으면 자관 기본이 그대로 나온다
  const auSt = auStyle(rel, au);
  const pairSlots: (RelMember | null)[] = isDuo
    ? (rel.pairRight
      ? [asAu(rel.members.find(m => m.charId !== rel.pairRight) ?? null),
        asAu(rel.members.find(m => m.charId === rel.pairRight) ?? null)]
      : [asAu(rel.members[0] ?? null), asAu(rel.members[1] ?? null)])
    : [];

  /** 이 멤버를 반대쪽 자리로 (좌 ↔ 우).
   *  오른쪽을 왼쪽으로 옮길 때는 **반대쪽 캐릭터를 오른쪽으로 지정**한다 (v2.0 사용자 제보) —
   *  예전에는 지정을 지우기만 해서, 등록 순서상 원래 오른쪽이던 캐릭터(보통 두 번째로 넣은
   *  상대 캐릭터)는 지워도 그대로 오른쪽이라 아무 일도 일어나지 않았다. */
  const moveSide = (cid: string) => {
    const nowRight = pairSlots[1]?.charId === cid;
    const other = rel.members.find(m => m.charId !== cid)?.charId;
    updateRel({ pairRight: nowRight ? other : cid });
  };

  /** 얼굴칸(1:1) 크롭 다시 잡기 — 캐릭터의 3:4 썸네일과 별개로 이 자관에만 저장 (v2.0) */
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

      {/* 관리자 액션 (좌상단) */}
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

      {/* AU 하나만 삭제 (v2.0 사용자 발견) — 자관 삭제와 확실히 구분되게 무엇이 남는지까지 적는다 */}
      <ConfirmModal open={auDelAsk !== null}
        title={`AU 「${rel.aus.find(a => a.id === auDelAsk)?.label ?? ''}」를 삭제하시겠습니까?`}
        body="이 AU의 일러·타임라인이 함께 삭제되며 복구할 수 없습니다. 자관과 다른 AU는 그대로 남습니다."
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
        body={`「${rel.name}」 자관 전체가 삭제됩니다 — 타임라인·AU ${rel.aus.length}개가 모두 함께 사라지며 복구할 수 없습니다. 연동된 캐릭터 자체는 삭제되지 않습니다.`}
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            setRels(rels.filter(r => r.id !== rel.id));
            router.push(sectionHref('rels', rel.secId ?? MAIN_SEC));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />

      <div className="rel-hero">
        {isDuo && (pairSlots[0]?.quote || (!pairSlots[0] && sideSlotOf('l')?.quote)) && (
          <div className="quote l" style={{
            color: pairSlots[0] ? pairSlots[0].quoteColor : sideSlotOf('l')?.quoteColor,
            ['--q-mark' as string]: pairSlots[0] ? pairSlots[0].quoteMarkColor : sideSlotOf('l')?.quoteMarkColor,
          } as React.CSSProperties}>{pairSlots[0] ? pairSlots[0].quote : sideSlotOf('l')?.quote}</div>
        )}
        {/* CP/NCP 뱃지 — 자관명 위 가운데 (v2.0 사용자 요청) · 색은 자관 수정에서 */}
        {auCpTag && (
          <div className="cp-top">
            <span className="pill" style={auSt.cpTagBg || auSt.cpTagFg
              ? { background: auSt.cpTagBg, color: auSt.cpTagFg, borderColor: auSt.cpTagBg }
              : undefined}>{CP_LABEL[auCpTag]}</span>
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
        {dday && ddayDateLabel && <div className="rel-dday-detail" style={{ color: auSt.ddayColor }}>
          {dday.startsWith('D-') ? 'UNTIL' : 'SINCE'} {ddayDateLabel} · {dday}
        </div>}
        {isDuo && (pairSlots[1]?.quote || (!pairSlots[1] && sideSlotOf('r')?.quote)) && (
          <div className="quote r" style={{
            color: pairSlots[1] ? pairSlots[1].quoteColor : sideSlotOf('r')?.quoteColor,
            ['--q-mark' as string]: pairSlots[1] ? pairSlots[1].quoteMarkColor : sideSlotOf('r')?.quoteMarkColor,
          } as React.CSSProperties}>{pairSlots[1] ? pairSlots[1].quote : sideSlotOf('r')?.quote}</div>
        )}
      </div>

      {isDuo ? (
        <div className="rel-body" style={{ fontFamily: familyOf(auBodyFont) }}>
          {pairSlots[0]
            ? <MiniProf member={pairSlots[0]} char={charOf(pairSlots[0].charId)} isAdmin={isAdmin}
                auUnregistered={auUnregOf(pairSlots[0].charId)}
                side="l" onMoveSide={() => moveSide(pairSlots[0]!.charId)}
                onFaceCrop={ref => setFaceEdit({ charId: pairSlots[0]!.charId, ref, crop: pairSlots[0]!.faceCrop })}
                onGo={() => router.push(charHref(pairSlots[0]!.charId))}
                onRemove={() => removeMember(pairSlots[0]!.charId)} />
            : sideSlotOf('l') ? <SideSlotCard slot={sideSlotOf('l')!} />
              : <EmptyCard isAdmin={isAdmin} onAdd={() => setMemberOpen(true)} />}
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
          {pairSlots[1]
            ? <MiniProf member={pairSlots[1]} char={charOf(pairSlots[1].charId)} isAdmin={isAdmin}
                auUnregistered={auUnregOf(pairSlots[1].charId)}
                side="r" onMoveSide={() => moveSide(pairSlots[1]!.charId)}
                onFaceCrop={ref => setFaceEdit({ charId: pairSlots[1]!.charId, ref, crop: pairSlots[1]!.faceCrop })}
                onGo={() => router.push(charHref(pairSlots[1]!.charId))}
                onRemove={() => removeMember(pairSlots[1]!.charId)} />
            : sideSlotOf('r') ? <SideSlotCard slot={sideSlotOf('r')!} />
              : <EmptyCard isAdmin={isAdmin} onAdd={() => setMemberOpen(true)} />}
        </div>
      ) : (
        /* 다인 자관 — 프로토타입 multi-body: 좌 멤버 리스트(430px) + 우 그룹 일러 */
        <div className="multi-body" style={{ fontFamily: familyOf(auBodyFont) }}>
          <div className="panel flush" style={{ padding: '6px 0' }}>
            {rel.members.map(m => {
              const c = charOf(m.charId);
              if (!c) return null;
              const unreg = auUnregOf(m.charId);
              return (
                <div key={m.charId} className="mrow" style={{ ['--cc' as string]: rgbTriple(c.color) }}
                  onClick={() => router.push(charHref(m.charId))}>
                  <div className={`face ph ${c.thumbClass}`}>
                    {!unreg && (c.arts?.[0] ?? c.thumbId) && (
                      <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass} />
                    )}
                  </div>
                  <div className="nm">
                    {unreg ? (
                      /* AU 프로필 미등록 (v1.9) — 원본 프로필 대신 등록 안내 */
                      <>
                        <b style={{ fontFamily: nameFontOf(m.charId) }}>{findChar(chars, m.charId)?.name}</b>
                        <small>이 AU의 프로필 미등록 — 눌러서 등록</small>
                      </>
                    ) : (
                      <>
                        <b style={{ fontFamily: nameFontOf(m.charId) }}>{c.name}</b><i>{c.sub}</i>
                        <small>{c.specs.slice(0, 3).map(s => s.value).join(' · ')}</small>
                        {(m.quote || noteOf(m) || m.keywords[0]) && (
                          <span className="ext">{m.quote || noteOf(m) || m.keywords[0]}</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="gem-mini">
                    {(c.colors ?? []).slice(0, 3).map(p => <i key={p.hex + p.label} style={{ background: p.hex }} />)}
                  </div>
                  {isAdmin && (
                    <span className="rm" onClick={e => { e.stopPropagation(); removeMember(m.charId); }}>제거</span>
                  )}
                </div>
              );
            })}
            {isAdmin && rel.members.length < 6 && (
              <div className="mrow add" onClick={() => setMemberOpen(true)}>＋ ADD MEMBER (최대 6인)</div>
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

      {/* 타임라인 (v1.8) */}
      {showTimeline && <div className={`panel timeline ${!isDuo ? 'multi' : ''}`} style={{ fontFamily: familyOf(auBodyFont) }}>
        <div className="rel-tabs">
          <button className="on"><span className="lb-pc">TIMELINE</span><span className="lb-m">T</span></button>
          {isAdmin && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* 이 줄의 버튼은 홈 공통 버튼과 같은 세로 크기(35px)로 — 탭 줄에서만 작아 보이던 것 */}
              {auTimeline.length > 1 && (
                <button className={`btn ${tlSort ? 'btn-accent' : 'btn-ghost'}`}
                  style={{ height: 35, padding: '0 14px', fontSize: 11.5 }}
                  onClick={() => setTlSort(v => !v)}>
                  <span className="lb-pc">{tlSort ? '정렬 완료' : '⠿ 정렬'}</span>
                  <span className="lb-m">⠿</span>
                </button>
              )}
              <button className="btn btn-dark" style={{ height: 35, padding: '0 14px', fontSize: 11.5 }} data-tip="기록 추가" onClick={() => setTlOpen(true)}><span className="lb-pc">＋ ADD RECORD</span><span className="lb-m">＋</span></button>
            </span>
          )}
        </div>

        {tlSort ? (
            /* 정렬 모드 — 드래그앤드롭으로 순서 변경 (4.5) */
            <DragList
              items={auTimeline.map((item, i) => ({ item, key: `tl-${i}` }))}
              keyOf={x => x.key}
              onReorder={list => patchAuData({ timeline: list.map(x => x.item) })}
              render={({ item }) => (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '8px 6px', border: '1.5px dashed var(--line)', borderRadius: 9, marginBottom: 6, background: '#fff' }}>
                  <span className="drag-h">⠿</span>
                  <div style={{ minWidth: 0 }}>
                    {item.era && <div className="era">{item.era}</div>}
                    <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.desc || item.says.map(s => s.text).join(' / ')}
                    </div>
                  </div>
                </div>
              )} />
          ) : (
          <div>
            {auTimeline.map((item, i) => (
              /* 수정·삭제는 우클릭 메뉴로 (v2.0 사용자 요청) — 늘 떠 있는 [삭제] 글자는 없앴다 */
              <div className="tl-item" key={i}
                onContextMenu={e => {
                  if (!isAdmin) return;
                  e.preventDefault();
                  setTlCtx({ x: e.clientX, y: e.clientY, idx: i });
                }}>
                {item.era && <div className="era">{item.era}</div>}
                {item.desc && <div className="desc">{item.desc}</div>}
                {item.says.map((s, j) => {
                  const c = charOf(s.charId);
                  return (
                    <div key={j} className={`tl-say ${sideOf(s.charId)}`}
                      style={{ ['--cc' as string]: rgbTriple(c?.color ?? '#5d636d') }}>
                      <div className="who" style={{ fontFamily: nameFontOf(s.charId) }}>{c?.name}</div>
                      <div className="bub">{s.text}</div>
                    </div>
                  );
                })}
              </div>
            ))}
            {auTimeline.length === 0 && <p className="hint">타임라인이 비어 있습니다 — 우상단 [＋ ADD RECORD]로 추가</p>}
          </div>
          )}
      </div>}

      {freeBlocks.map(block => (
        <section key={block.id} className="panel rel-free-block">
          {block.title && <h3>{block.title}</h3>}
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html) }} />
        </section>
      ))}

      {/* 역극 · 로그 연동 리스트 (4.5) — 역극: 내 참여 방 + 공개 전환된 완결 방.
          AU마다 숨길 수 있다 (v2.0 사용자 요청 — AU 관리의 체크박스). 둘 다 숨기면 칸 자체가 없다 */}
      {!(au?.hideRp && au?.hideLog) && (
      <div className="g2" style={{ marginTop: 16 }}>
        {!au?.hideRp && (
        <div className="panel widget" style={{ margin: 0, ...(au?.hideLog ? { gridColumn: '1/-1' } : null) }}>
          <h4>역극 <span className="more" onClick={() => router.push('/rp')}>더보기 ›</span></h4>
          {relRooms.length > 0 ? relRooms.map(rm => (
            <div key={rm.id} className="dday-row" style={{ cursor: 'pointer' }} onClick={() => router.push('/rp')}>
              <span>{rm.title}</span>
              <b style={{ fontSize: 11, color: 'var(--faint)' }}>
                {rm.status === 'done' ? (rm.isPublic ? '완결 · 공개' : '완결') : '진행중'}
              </b>
            </div>
          )) : (
            <p className="hint" style={{ margin: 0 }}>이 자관 기반으로 진행된 역극이 여기에 표시됩니다</p>
          )}
        </div>
        )}
        {!au?.hideLog && (
        <div className="panel widget" style={{ margin: 0, ...(au?.hideRp ? { gridColumn: '1/-1' } : null) }}>
          <h4>로그 <span className="more" onClick={() => router.push('/trpg')}>더보기 ›</span></h4>
          {relLogs.length > 0 ? relLogs.map(l => (
            <div key={l.id} className="dday-row" style={{ cursor: 'pointer' }} onClick={() => router.push(itemPath('/trpg', l))}>
              {/* 번호 없이 제목만 — 연동 리스트에서는 순번이 의미가 없다 (사용자 확정) */}
              <span>{l.title}</span>
              <b style={{ fontSize: 11, color: 'var(--faint)' }}>{l.date?.replace(/-/g, '.') ?? ''}</b>
            </div>
          )) : <p className="hint" style={{ margin: 0 }}>연동된 로그가 없습니다 — 로그 등록 시 자관을 선택하면 여기에 표시</p>}
        </div>
        )}
      </div>
      )}

      {/* ---------- 멤버 추가 모달 ---------- */}
      <Modal open={memberOpen} onClose={() => setMemberOpen(false)} small title="멤버 추가"
        dirty={!!(mCharId || mName || mQuote)}
        desc="내 캐릭터를 연동하거나, 상대(타인) 캐릭터를 간단 등록 — 상대 캐릭터는 내 캐릭터 리스트에 표시되지 않음"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMemberOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={addMember}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <KRadio name="mm" value="exist" current={mMode} onChange={v => setMMode(v as 'exist')} label="기존 캐릭터" />
            <KRadio name="mm" value="new" current={mMode} onChange={v => setMMode(v as 'new')} label="새 상대 캐릭터" />
          </div>
          {mMode === 'exist' ? (
            <div>
              {/* 검색형 선택 — 인풋으로 거르고 아래 리스트에서 클릭 */}
              <KInput placeholder="캐릭터 검색" value={mQuery} onChange={e => setMQuery(e.target.value)} />
              <div style={{ marginTop: 6, maxHeight: 190, overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: 9 }}>
                {candidates
                  .filter(c => {
                    const s = mQuery.trim().toLowerCase();
                    return !s || c.name.toLowerCase().includes(s) || (c.sub ?? '').toLowerCase().includes(s);
                  })
                  .map(c => (
                    <div key={c.id} onClick={() => setMCharId(mCharId === c.id ? '' : c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', cursor: 'pointer',
                        background: mCharId === c.id ? 'rgba(127,127,127,.12)' : undefined,
                        borderBottom: '1px dashed var(--line)', transition: '.13s',
                      }}>
                      <i style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, fontStyle: 'normal', flexShrink: 0 }} />
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{c.sub}{!c.own && ' · 상대'}</small>
                      {mCharId === c.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                    </div>
                  ))}
                {candidates.length === 0 && <p className="hint" style={{ padding: 10 }}>추가할 수 있는 캐릭터가 없습니다</p>}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <KInput placeholder="이름" value={mName} onChange={e => setMName(e.target.value)} />
                <KInput placeholder="한 줄 소개 (선택)" value={mSub} onChange={e => setMSub(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                <span className="cp-lb">테마색</span>
                <ColorField value={mColor} onChange={setMColor} />
              </div>
              {/* 회원 권한 — 역극 플레이 / 편집까지 (3차 회원-캐릭터 연결, v1.9) */}
              <div>
                <label className="k-label" style={{ marginBottom: 7 }}>회원 권한 (선택)</label>
                <GrantsEditor value={mGrants} onChange={setMGrants} />
              </div>
            </>
          )}
          <KInput placeholder="캐릭터 한마디 (선택 — 타이틀 옆 인용구)" value={mQuote} onChange={e => setMQuote(e.target.value)} />
        </div>
      </Modal>

      {/* ---------- 타임라인 항목 추가 모달 (가운데 · 한마디 핑퐁 다중) ---------- */}
      <Modal open={tlOpen} onClose={closeTl} title={tlEditIdx == null ? '타임라인 항목 추가' : '타임라인 항목 수정'}
        desc="설명 / 한마디 중 하나는 필수 · 시기 라벨은 선택 · 한마디는 여러 개 추가 가능"
        dirty={!!(tEra || tDesc || tSays.some(x => x.text))}
        actions={<>
          <button className="btn btn-ghost" onClick={closeTl}>CANCEL</button>
          <button className="btn btn-dark" onClick={addTlItem}>{tlEditIdx == null ? 'ADD' : 'SAVE'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <KInput placeholder="시기 라벨 (선택)" value={tEra} onChange={e => setTEra(e.target.value)} />
          <KTextarea placeholder="설명" value={tDesc} onChange={e => setTDesc(e.target.value)} style={{ minHeight: 80 }} />
          <label className="k-label" style={{ margin: 0 }}>한마디 — 캐릭터를 바꿔가며 주고받는 대화로 쌓을 수 있습니다</label>
          {tSays.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={130} value={s.charId} placeholder="발화 캐릭터"
                onChange={v => setTSays(l => l.map(x => x.id === s.id ? { ...x, charId: v } : x))}
                options={rel.members.map(m => {
                  const c = charOf(m.charId);
                  return { value: m.charId, label: c?.name ?? m.charId };
                })} />
              <KInput placeholder="대사" value={s.text}
                onChange={e => setTSays(l => l.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))} />
              <span className="fx" onClick={() => setTSays(l => l.filter(x => x.id !== s.id))}>✕</span>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
            onClick={() => {
              // 새 줄의 기본 화자는 직전 화자와 번갈아 (핑퐁)
              const last = tSays[tSays.length - 1]?.charId;
              const ids = rel.members.map(m => m.charId);
              const next = last ? ids[(ids.indexOf(last) + 1) % ids.length] : ids[0] ?? '';
              setTSays(l => [...l, { id: newId(), charId: next, text: '' }]);
            }}>＋ ADD LINE</button>
        </div>
      </Modal>

      {/* ---------- AU 추가/관리 모달 (v1.8 — AU별 이미지·카드 분리는 후속) ---------- */}
      <Modal open={auOpen} onClose={() => setAuOpen(false)} small title="AU 관리"
        dirty={!!(auLabel || auCatch)}
        desc="AU를 클릭하면 프로필 전체(일러·타임라인·CP/NCP)가 그 AU의 것으로 전환됩니다 — 일러·캐치프레이즈는 그 AU를 선택한 상태에서 EDIT"
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
                {/* AU별 CP/NCP — 이름 줄 오른쪽 정렬 (v1.9 사용자 요청) */}
                <div className="mini-seg" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                    <button key={t} className={(a.cp ?? rel.cp) === t ? 'on' : ''}
                      onClick={() => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, cp: t } : x)) })}>{CP_LABEL[t]}</button>
                  ))}
                </div>
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
                      }, '이 AU의 일러·타임라인이 함께 삭제되며 복구할 수 없습니다.')}>✕</span>
                  </>
                )}
              </div>
              {/* 상세 하단의 연동 리스트 숨김 (v2.0 사용자 요청) — 이 AU를 보는 동안만 적용 */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <KCheck label={<span style={{ fontSize: 11.5 }}>역극 리스트 숨김</span>} checked={!!a.hideRp}
                  onChange={v => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, hideRp: v || undefined } : x)) })} />
                <KCheck label={<span style={{ fontSize: 11.5 }}>로그 리스트 숨김</span>} checked={!!a.hideLog}
                  onChange={v => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, hideLog: v || undefined } : x)) })} />
                <KCheck label={<span style={{ fontSize: 11.5 }}>타임라인 숨김</span>} checked={!!a.hideTimeline}
                  onChange={v => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, hideTimeline: v || undefined } : x)) })} />
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput placeholder="AU 이름" value={auLabel} onChange={e => setAuLabel(e.target.value)} style={{ maxWidth: 130 }} />
              <KInput placeholder="캐치프레이즈" value={auCatch} onChange={e => setAuCatch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="mini-seg">
                {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                  <button key={t} className={auCp === t ? 'on' : ''} onClick={() => setAuCp(t)}>{CP_LABEL[t]}</button>
                ))}
              </div>
              <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }} onClick={() => {
                if (!auLabel.trim()) { toast('AU 이름을 입력해 주세요'); return; }
                // AU 번호 — 자관 안에서 만든 순서대로 (주소 /rels/{…}/au/{번호}, v2.4)
                const na: RelAu = {
                  id: newId(), no: maxNo(rel.aus.filter(a => a.id !== 'base')) + 1,
                  label: auLabel.trim(), catchphrase: auCatch.trim(), cp: auCp, timeline: [],
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

      {/* 타임라인 우클릭 메뉴 (v2.0) */}
      {tlCtx && auTimeline[tlCtx.idx] && createPortal(
        <div className="ctx-menu on" style={{ left: tlCtx.x, top: tlCtx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">{auTimeline[tlCtx.idx].era || '타임라인 항목'}</div>
          <button onClick={() => { const i = tlCtx.idx; setTlCtx(null); openTlEdit(i); }}>수정</button>
          <button className="danger" onClick={() => {
            const i = tlCtx.idx;
            setTlCtx(null);
            del.ask('타임라인 항목을 삭제하시겠습니까?',
              () => patchAuData({ timeline: auTimeline.filter((_, j) => j !== i) }));
          }}>삭제</button>
        </div>,
        document.body,
      )}

      {/* 멤버 얼굴칸(1:1) 크롭 — 캐릭터의 3:4 썸네일과 별개로 이 자관에만 저장 (v2.0) */}
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
