'use client';
// 환경설정 (기획서 5장) — 0차: 「디자인」 탭(테마) 실동작.
// 나머지 카테고리는 해당 기능 마일스톤에서 함께 구현.
import React, { Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { useAuth, inviteCode, setInviteCode } from '@/lib/auth';
import { useMembers, memberNumbers, memberPath } from '@/lib/members';
import { useTheme } from '@/lib/ThemeProvider';
import { ThemeVars, BG_DIM, CARD_ALPHA } from '@/lib/theme';
import { hexToHsl } from '@/lib/color';
import { ColorField } from '@/components/ui/ColorField';
import { KStep, KToggle, KInput, LiveInput, KTextarea, KSelect, KCheck, Pager } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useMainStore, WidgetConf, WIDGET_META, MULTI_TYPES, widgetLabel, menuCardHeight } from '@/lib/mainStore';
import { useSiteMenu } from '@/components/shell/siteNav';
import { useConfirmDelete, ConfirmModal, Modal } from '@/components/ui/Modal';
import { exportBackup, importBackup, resetGroups, RESET_CONTENT, RESET_EXTRA } from '@/lib/backup';
import { newId } from '@/lib/postStore';
import {
  useBoardSettings, boardBadgeStyle, BoardBadge, BoardHeadStyle,
  useBoards, Board, BoardPerm, MAIN_BOARD_ID, BOARD_SKINS, BOARD_PER_PAGE, perPageOf, BOARD_BOX_DEF, boxAlphaOf,
  boardHref, boardKeys, findBoardByKey,
} from '@/lib/boardStore';
import { useThreadSettings, ThreadWork, THREAD_SEED, ThreadCat, threadBadgeStyle, threadCats, threadCatsPatch } from '@/lib/threadStore';
import {
  useMenuSettings, MenuSettings, MenuPerm, MenuVis,
  MenuGroupNode, MenuLeaf, defaultTree, newGroupId, menuLabelFor, extraBoardHref, boardEntries,
  IMG_PROTECT_AREAS,
} from '@/lib/menuStore';
import { FEATURES } from '@/lib/menu';
import { SectionsBlock } from '@/components/settings/SectionList';
import { useSavePart, useSavePartHost } from '@/components/settings/saveParts';
import { SettingsPreview, PreviewDevice } from '@/components/settings/SettingsPreview';
import { BackArrow } from '@/components/ui/BackArrow';
import { isPreviewFrame } from '@/lib/previewFrame';
import { useSections, sectionsOf, sectionMenuEntries, MAIN_SEC, inSection, cleanSlug } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries, toInternalPath } from '@/lib/linkStore';
import { useSiteDraft, useSiteSettings, BOARD_W, boardWOf, MOBILE_NAV_STYLES, MENU_CARD_STYLES } from '@/lib/siteStore';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { allBlobs, putBlobAs, useBlobUrl } from '@/lib/blobStore';
import { fileDrop } from '@/lib/dnd';
import { useLocalList } from '@/lib/postStore';
import {
  TextSettingEditor, DdayEditor, DdayCardEditor, TodoEditor, BannerEditor, DecoEditor, LatestEditor,
} from '@/components/main/widgetEditors';
import { useBgm, BgmTrack, parseVideoId, ytThumb } from '@/lib/bgmStore';
import { useFonts, fontCssUrl, isFontFaceCode, fontFaceName, FontDef, FontRole, ROLE_LABEL, FOLLOW_MENU, FOLLOW_TITLE } from '@/lib/fontStore';
import { useToast } from '@/components/ui/Toast';
import { getPageText, setPageText } from '@/components/ui/PageText';
import { resyncCommentMeta } from '@/lib/securityMigrate';
import { putBlob } from '@/lib/blobStore';
import { useImageSource } from '@/components/ui/ImageSource';
import {
  getSetting, setSetting, pushLocalSettings, unsyncedSettingKeys, SETTING_KEYS,
  beginSettingDraft, endSettingDraft, settingDraftDirty, commitSettingDraft, discardSettingDraft, DRAFT_EVT,
  withSettingDraftPaused, settingDraftDirtyKeys,
} from '@/lib/settingStore';
import { isServerMode, createBackend, backend } from '@/lib/backend';
import type { BackendConfig, BackendKind } from '@/lib/backend/types';
import { CONTENT_COLLECTIONS } from '@/lib/backend/types';
import { visFloorOf } from '@/lib/visFloor';
import { validateConfig, configFileText, saveLocalConfig, parseFirebaseSnippet, serverConfig, serverConfigSource } from '@/lib/serverConfig';
import { migrateTo, findOrphanFiles } from '@/lib/transfer';
import { FIRESTORE_RULES, STORAGE_RULES } from '@/lib/firebaseRules';
import { SCHEMA_SQL } from '@/lib/schemaSql';

/* ---------- 환경설정 구성 (v3.1 사용자 요청 — 전체 화면 · 4그룹 · 저장 하나) ----------
   예전 탭 11개를 그룹 4개로 묶었다. 그룹을 고르면 그 그룹의 항목이 한 장으로 이어지고, 옆 목차가 스크롤을 따라간다.
   주소는 /settings/그룹 — 예전 탭 주소(/settings/menu 등)로 들어와도 해당 그룹의 그 항목으로 간다. */
type GroupId = 'site' | 'design' | 'content' | 'manage';
interface SetSection { id: string; label: string }
const GROUPS: { id: GroupId; label: string; icon: string; sections: SetSection[] }[] = [
  { id: 'site', label: '사이트', icon: '◇', sections: [
    // 메인 페이지 탭은 모바일 표시·나열 순서만 다루므로 「모바일 메인 페이지」로, 위젯 아래에 둔다 (v3.1 사용자 요청)
    { id: 'basic', label: '기본 정보' }, { id: 'widgets', label: '위젯' }, { id: 'main', label: '모바일 메인 페이지' },
  ] },
  { id: 'design', label: '디자인', icon: '◈', sections: [
    { id: 'theme', label: '테마·색' }, { id: 'layout', label: '레이아웃' },
    { id: 'detail', label: '세부 요소' }, { id: 'pagehead', label: '페이지 헤더' }, { id: 'fonts', label: '폰트 설정' }, { id: 'fontlib', label: '폰트 라이브러리' },
  ] },
  { id: 'content', label: '콘텐츠', icon: '▤', sections: [
    { id: 'menu', label: '메뉴' }, { id: 'board', label: '카테고리' }, { id: 'trpg', label: 'TRPG' },
    { id: 'threads', label: '감상타래' }, { id: 'bgm', label: 'BGM' },
  ] },
  { id: 'manage', label: '관리', icon: '⚙', sections: [
    { id: 'members', label: '회원·보안' }, { id: 'backup', label: '데이터 백업' },
  ] },
];
/** 주소 한 칸 → 그룹·항목. 그룹 이름이면 그 그룹 맨 위, 예전 탭 주소(menu·bgm…)면 그 항목으로 */
function routeOf(slug: string | null | undefined): { group: GroupId; section?: string } | null {
  if (!slug) return null;
  const g = GROUPS.find(x => x.id === slug);
  if (g) return { group: g.id };
  const legacy: Record<string, string> = {
    '디자인': 'theme', '메인 페이지': 'main', '위젯': 'widgets', '메뉴 관리': 'menu', '게시판 관리': 'board',
    'TRPG': 'trpg', '감상타래': 'threads', '폰트': 'fonts', 'BGM': 'bgm', '회원/보안': 'members', '데이터 백업': 'backup',
    boardhead: 'pagehead',   // v3.2 첫 이름(카테고리 헤더) 주소
  };
  const sec = legacy[slug] ?? slug;
  const owner = GROUPS.find(x => x.sections.some(sc => sc.id === sec));
  return owner ? { group: owner.id, section: sec } : null;
}

/**
 * 맨 위 [저장] 하나로 저장하는 설정 키 (v3.1 — 예전엔 탭마다 따로였다).
 * 설정 화면이 열려 있는 동안 이 키들에 들어오는 저장은 settingStore가 붙잡아 두고(화면에는 바로 보인다)
 * [저장]으로 한꺼번에 저장한다. 테마·사이트(로고 등)·역할 폰트는 각자의 드래프트가 있어 따로 확정한다.
 * 회원 태그·테마 보관함은 「목록에 넣고 빼기」라 누르는 즉시 저장한다.
 */
const DRAFT_KEYS: readonly string[] = [
  'ohome.main.v1', 'ohome.fonts.v2', 'ohome.menuset.v1', 'ohome.links.v1', 'ohome.sections.v1',
  'ohome.boards.v1', 'ohome.boardset.v1', 'ohome.threadset.v1', 'ohome.pagetext.v1', 'ohome.bgm.v1',
  'ohome.invite.v1', 'ohome.repo.v1',
];
/** 저장 안 된 키 → 그룹 (메뉴의 「저장 안 된 변경」 점) */
const KEY_GROUP: Record<string, GroupId> = {
  'ohome.main.v1': 'site', 'ohome.fonts.v2': 'design', 'ohome.invite.v1': 'manage', 'ohome.repo.v1': 'manage',
};
/** 사이트 드래프트 칸 중 레이아웃(디자인 그룹)에 있는 것 — 나머지(탭 제목·로고 등)는 사이트 그룹 */
const SITE_LAYOUT_FIELDS = ['boardW', 'mNav', 'mNavCovers', 'mCard'];

/** 숨길 수 없는 항목 — 설정 첫 화면이라 늘 메뉴에 있어야 한다 (예전 「디자인」 탭과 같은 규칙) */
const LOCKED_SEC = 'theme';
const groupOfSec = (id: string) => GROUPS.find(g => g.sections.some(s => s.id === id))!;
const secLabel = (id: string) => groupOfSec(id)?.sections.find(s => s.id === id)?.label ?? id;
interface CtxItem { label: string; fn: () => void }

/** 설정 화면이 사라질 때 드래프트를 버리는 예약 — 곧바로 다시 그려지는 설정 화면이 있으면 취소한다 */
let draftEndTimer: ReturnType<typeof setTimeout> | null = null;

/** 블록·드롭다운 그림자 프리셋 — 숫자 칸에서 다른 값을 넣으면 선택창은 '직접 지정'으로 보인다 */
const SHADOW_PRESETS = [
  { value: '0', label: '없음' }, { value: '30', label: '약하게' },
  { value: '50', label: '보통' }, { value: '100', label: '강하게' },
];
/** 갤러리·감상타래 고르는 탭 — 이보다 많아지면 줄이 넘어가므로 선택창으로 바꿔 보여 준다 */
const TAB_MAX = 4;

/** 색 항목 한 쌍 렌더 헬퍼 */
function CP({ label, k, def }: { label?: string; k: keyof ThemeVars; def?: string }) {
  const { state, setVar } = useTheme();
  // def: 값이 없을 때 실제로 적용되는 기본색 (예: 입력 포커스 = 포인트색)
  const field = <ColorField value={String(state.vars[k] ?? def ?? '#888888')} onChange={hex => setVar(k, hex as never)} />;
  // 라벨과 입력칸을 한 덩어리로 — 줄이 넘어가도 라벨만 윗줄 끝에 남지 않는다 (v3.2 사용자 요청)
  return label ? <span className="cp-item"><span className="cp-lb">{label}</span>{field}</span> : field;
}

/* ---------- 설정 줄 오른쪽 컨트롤 정렬 (v3.2 사용자 요청 — 「배치가 중구난방」) ----------
   Ctl  : 컨트롤 묶음. PC에서는 줄 오른쪽에 붙고 안쪽 줄들은 왼쪽 끝이 맞는다. 좁으면 이름 아래로.
   Line : 묶음 안의 한 줄.
   Item : 「라벨 + 컨트롤」 한 쌍 — 라벨 칸 폭이 고정이라 위아래 줄의 입력칸이 같은 열에 선다. */
function Ctl({ children }: { children: React.ReactNode }) {
  return <div className="set-ctl">{children}</div>;
}
function Line({ children }: { children: React.ReactNode }) {
  return <div className="ctl-line">{children}</div>;
}
function Item({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <span className="cp-item"><span className="cp-lb">{label}</span>{children}</span>;
}

/**
 * 위젯 스타일 (v2.0 사용자 요청) — 메인·사이드에 얹히는 카드의 배경·타이틀색·본문색·테두리.
 *
 * 색을 안 정하면 `--wg-*`가 카드 색을 그대로 가리키므로 지금까지와 똑같이 보인다. 그래서 값이
 * 비어 있을 때 입력란에는 **지금 실제로 쓰이는 카드 색**을 채워 둔다 — 처음 열었을 때 엉뚱한
 * 회색이 아니라 화면에 보이는 그 색이 나와야 조금만 바꿔 쓰기 쉽다.
 * 테두리는 켤 때만 그린다(끄면 지금처럼 그림자만).
 */
function WidgetStyleRow() {
  const { state, setVar } = useTheme();
  const v = state.vars;
  /* 위젯 탭 맨 위 (v2.6) — 2열 격자: 배경·타이틀 / 본문·(빈칸) / 테두리 토글·테두리 색.
     토글도 「라벨 + 컨트롤」 한 쌍으로 넣어 배경·본문과 같은 라벨 열·입력 열에 선다 (v3.3 사용자 요청 — 시안 B).
     켜면 같은 줄 오른쪽 칸에 테두리 색이 붙는다 */
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>위젯 카드 색</b>
        <small>메인·사이드에 얹히는 카드 — 비워 두면 카드 색을 그대로 따라갑니다</small></div>
      <div className="cp-grid2">
        <CP label="배경" k="wgBg" def={v.cardBg ?? '#fbfbfc'} />
        <CP label="타이틀" k="wgTitle" def={v.pageDesc ?? '#8a8f98'} />
        <CP label="본문" k="wgFg" def={v.cardFg ?? '#1d2025'} />
        <span className="cp-item" aria-hidden="true" />
        <Item label="테두리">
          <KToggle checked={!!v.wgBorder} onChange={b => setVar('wgBorder', b)} />
        </Item>
        {v.wgBorder && <CP label="색" k="wgBd" def="#e6e8ec" />}
      </div>
    </div>
  );
}

/**
 * BGM 플레이어 색 (v2.6 사용자 요청 — 디자인 탭에서 BGM 탭 맨 위로 이동).
 * 값은 그대로 테마 값이라 포인트 자동 모드에서는 포인트 컬러를 따라 다시 파생된다.
 */
function BgmStyleRow() {
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>플레이어 색</b>
        <small>화면 구석 미니 플레이어와 팝업 리스트의 색</small></div>
      <div className="cp-grid2">
        <CP label="배경" k="bgmBg" />
        <CP label="글씨" k="bgmFg" />
        <CP label="아이콘" k="bgmIc" />
        <CP label="볼륨바" k="bgmVol" />
      </div>
    </div>
  );
}

/** 역할 폰트 한 줄 — 폰트 + 굵기 + 크기 배율 (5.1, 폰트별 체감 크기 보정) */
function FontRoleRow({ role }: { role: FontRole }) {
  const { fonts, roles, setRole, familyOf } = useFonts();
  const cfg = roles[role];
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>{ROLE_LABEL[role].label}</b>{ROLE_LABEL[role].desc && <small>{ROLE_LABEL[role].desc}</small>}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {/* 폰트 이름이 길어도 줄이 넘어가지 않게 상한을 둔다 — 넘치면 … (v2.0 사용자 요청) */}
        <KSelect minWidth={170} value={cfg.id} onChange={v => setRole(role, { id: v })}
          options={[
            ...(role === 'dropdown' ? [{ value: FOLLOW_MENU, label: <span>메뉴 폰트와 동일</span> }] : []),
            ...(role === 'pagetitle' || role === 'posttitle' ? [{ value: FOLLOW_TITLE, label: <span>타이틀 폰트와 동일</span> }] : []),
            ...fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> })),
          ]} />
        {/* 굵기 — 폰트 선택·크기와 한 줄이라 버튼 나열 대신 선택창 (줄바꿈 방지) */}
        <KSelect minWidth={112} value={cfg.weight === undefined ? '' : String(cfg.weight)}
          onChange={v => setRole(role, { weight: v ? Number(v) : undefined })}
          options={[
            { value: '', label: '굵기: 기본' }, { value: '300', label: '굵기: 가늘게' },
            { value: '400', label: '굵기: 보통' }, { value: '700', label: '굵기: 굵게' },
          ]} />
        <KStep value={cfg.scale ?? 100} min={80} max={130} step={5} suffix="%"
          onChange={v => setRole(role, { scale: v })} />
      </div>
    </div>
  );
}

/* ---------- 디자인 그룹 (v3.1 — 예전 「디자인」 탭 하나를 테마·색 / 레이아웃 / 세부 요소 / 폰트로 나눔) ----------
   저장은 모두 화면 맨 위 [저장] 하나로 (테마·사이트·역할 폰트 드래프트를 설정 화면이 함께 확정한다) */

/** 테마·색 — 모드·테마 보관함·포인트·배경·카드·상단메뉴·드롭다운·페이지 타이틀 */
function ThemePane() {
  const {
    state, setMode, setPointAccent, setPointTone, pointLevel, setPointLevel, setVar,
    resetMode, presets, savePreset, applyPreset, removePreset,
  } = useTheme();
  const backgroundSource = useImageSource(url => {
    setVar('bgType', 'image');
    setVar('bgImageId', url);
  });
  const toast = useToast();
  const del = useConfirmDelete();
  const [resetOpen, setResetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetSel, setPresetSel] = useState('');
  const modeBtn = (m: typeof state.mode, label: string) => (
    <button className={state.mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
  );
  return (
    <div className="set-sec">
      <div className="d">바꾸는 대로 화면과 미리보기에 바로 보입니다 · 포인트 컬러·배경 이미지는 모드를 바꿔도 이어집니다</div>

      <div className="set-row">
        <div className="l"><b>모드</b><small>포인트 컬러·배경 이미지·모서리 등은 전환해도 유지</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="seg in-panel seg-1line">
            {modeBtn('light', '라이트')}
            {modeBtn('dark', '다크')}
            {modeBtn('point', '포인트 자동')}
            {modeBtn('custom', '커스텀')}
          </div>
          <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 11 }}
            onClick={() => setResetOpen(true)}>선택 리셋</button>
        </div>
      </div>

      {/* 테마 프리셋 — 이름으로 저장해 두고 드롭다운에서 커스텀으로 적용 (v1.9) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>테마 저장해두기</b><small>현재 색 구성을 이름으로 보관 — 적용하면 커스텀 모드에 불러옵니다</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 저장된 테마 컨트롤은 왼쪽에 등장 — 테마 이름/KEEP 위치는 고정 (사용자 확정) */}
          {presets.length > 0 && (
            <>
              <KSelect minWidth={140} value={presetSel} onChange={setPresetSel}
                options={[{ value: '', label: '저장한 테마' }, ...presets.map(p => ({ value: p.id, label: p.name }))]} />
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                onClick={() => { if (presetSel) { applyPreset(presetSel); toast('커스텀 모드에 적용했습니다 — 저장하려면 맨 위 [저장]'); } }}>APPLY</button>
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11, marginRight: 10 }}
                onClick={() => {
                  const p = presets.find(x => x.id === presetSel);
                  if (p) del.ask(`테마 「${p.name}」를 삭제하시겠습니까?`, () => { removePreset(p.id); setPresetSel(''); });
                }}>DELETE</button>
            </>
          )}
          {/* 인풋·버튼 세로 크기 통일 (35px) */}
          <KInput placeholder="테마 이름" value={presetName} onChange={e => setPresetName(e.target.value)}
            style={{ width: 120, height: 35, boxSizing: 'border-box' }} />
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
            onClick={() => {
              if (!presetName.trim()) { toast('테마 이름을 입력해 주세요'); return; }
              savePreset(presetName.trim());
              setPresetName('');
              toast('테마가 보관함에 저장되었습니다');
            }}>KEEP</button>
        </div>
      </div>

      {/* 선택 리셋 — 모드를 골라 그 모드의 수정값만 초기화 */}
      <ConfirmModal open={resetOpen} wide title="어떤 테마를 초기화할까요?"
        body="선택한 모드의 수정값만 초기 상태로 돌아갑니다. 확정은 맨 위 [저장]을 눌러야 저장됩니다."
        onClose={() => setResetOpen(false)}
        buttons={[
          { label: '라이트', kind: 'ghost', onClick: () => { resetMode('light'); setResetOpen(false); } },
          { label: '다크', kind: 'ghost', onClick: () => { resetMode('dark'); setResetOpen(false); } },
          { label: '포인트 자동', kind: 'ghost', onClick: () => { resetMode('point'); setResetOpen(false); } },
          { label: '커스텀', kind: 'ghost', onClick: () => { resetMode('custom'); setResetOpen(false); } },
          { label: 'CANCEL', kind: 'dark', onClick: () => setResetOpen(false) },
        ]} />
      {del.element}

      <div className="set-row">
        <div className="l"><b>포인트 자동 톤</b><small>포인트 자동 모드를 다크 느낌으로 깔지, 라이트 느낌으로 깔지</small></div>
        <div className="mini-seg">
          <button className={state.pointTone === 'dark' ? 'on' : ''} onClick={() => setPointTone('dark')}>다크 느낌</button>
          <button className={state.pointTone === 'light' ? 'on' : ''} onClick={() => setPointTone('light')}>라이트 느낌</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>포인트 자동 가독성</b><small>글씨와 배경의 대비 기준 — 표준은 글씨 4.5:1 · 보조 3:1, 높음은 7:1 · 4.5:1 (기준에 못 미치는 글씨만 자동 보정)</small></div>
        <div className="mini-seg">
          <button className={pointLevel === 'std' ? 'on' : ''} onClick={() => setPointLevel('std')}>표준</button>
          <button className={pointLevel === 'high' ? 'on' : ''} onClick={() => setPointLevel('high')}>높음</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>포인트 컬러</b><small>포인트 자동 모드의 기준색 — 변경 즉시 재파생 (직접 지정한 항목은 유지)</small></div>
        <div className="cp-group">
          <Item label="색">
            <ColorField value={state.vars.accent}
              onChange={hex => state.mode === 'point' ? setPointAccent(hex) : setVar('accent', hex)} />
          </Item>
        </div>
      </div>

      {/* 배경 — 그라데이션(각도) / 이미지(블러) 선택 (v1.9) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }} tabIndex={0}
        onDragOver={e => e.preventDefault()} {...backgroundSource.handlers}>
        <div className="l"><b>배경</b><small>그라데이션(시작→끝·각도) 또는 이미지(업로드·블러)</small></div>
        <Ctl>
          <div className="mini-seg">
            <button className={(state.vars.bgType ?? 'gradient') === 'gradient' ? 'on' : ''}
              onClick={() => setVar('bgType', 'gradient')}>그라데이션</button>
            <button className={state.vars.bgType === 'image' ? 'on' : ''}
              onClick={() => setVar('bgType', 'image')}>이미지</button>
          </div>
          {(state.vars.bgType ?? 'gradient') === 'gradient' ? (
            <>
              <div className="cp-group">
                <Item label="시작"><CP k="bgG1" /></Item>
                <Item label="끝"><CP k="bgG2" /></Item>
              </div>
              <Item label="각도">
                <KStep value={state.vars.bgAngle ?? 180} min={0} max={360} step={15} suffix="°"
                  onChange={v => setVar('bgAngle', v)} />
              </Item>
            </>
          ) : (
            <>
              <input id="themeBgFile" type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) setVar('bgImageId', await putBlob(f));
                  e.target.value = '';
                }} />
              <Line>
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                onClick={() => document.getElementById('themeBgFile')?.click()}>
                {state.vars.bgImageId ? 'CHANGE' : 'UPLOAD'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => backgroundSource.open()}>🔗 URL</button>
              {state.vars.bgImageId && (
                <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                  onClick={() => setVar('bgImageId', undefined)}>REMOVE</button>
              )}
              </Line>
              {/* 블러·덮개는 한 줄에 (v3.4 사용자 요청) */}
              <Line>
              <Item label="블러">
                <KStep value={state.vars.bgBlur ?? 0} min={0} max={30} step={2} suffix="px"
                  onChange={v => setVar('bgBlur', v)} />
              </Item>
              {/* 사진 덮개 (v2.0 사용자 요청) — 다크 계열은 어둡게, 라이트 계열은 밝게 눌러 준다 */}
              <Item label={hexToHsl(state.vars.bgG2).l < 0.5 ? '어둡게' : '밝게'}>
                <KStep value={state.vars.bgDim ?? BG_DIM} min={0} max={80} step={5} suffix="%"
                  onChange={v => setVar('bgDim', v)} />
              </Item>
              </Line>
            </>
          )}
        </Ctl>
        {backgroundSource.element}
      </div>

      {/* 카드 색 — 패널·게시판 리스트·필터 등 공통 (v1.9) */}
      <div className="set-row">
        <div className="l"><b>카드</b><small>패널·카테고리 목록·필터 카드의 배경과 글씨색 — 보조 글씨색은 자동 파생 · 불투명도 100%면 비침 없음, 배경 색의 투명도와 곱해지며 위젯 카드에도 적용</small></div>
        <Ctl>
          <div className="cp-group">
            <CP label="배경" k="cardBg" />
            <CP label="글씨" k="cardFg" />
          </div>
          {/* 카드 배경 불투명도 (v3.4 사용자 요청 — 시안 2) */}
          <Item label="불투명도">
            <KStep value={state.vars.cardAlpha ?? CARD_ALPHA} min={0} max={100} step={2} suffix="%"
              onChange={v => setVar('cardAlpha', v)} />
          </Item>
        </Ctl>
      </div>

      <div className="set-row">
        <div className="l"><b>상단메뉴</b></div>
        <div className="cp-group">
          <CP label="배경" k="topBg" />
          <CP label="글씨" k="topFg" />
          <CP label="호버 글씨" k="topHv" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>하위메뉴 드롭다운</b></div>
        <div className="cp-group">
          <CP label="배경" k="ddBg" />
          <CP label="글씨" k="ddFg" />
          <CP label="호버" k="ddHv" />
        </div>
      </div>

      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>페이지 타이틀</b><small>각 메뉴 상단 큰 제목과 설명 문구</small></div>
        <Ctl>
          <Line>
          {/* 헤더 표시 옵션 (v1.9): 둘 다 / 제목만 / 설명만 / 안 띄움 */}
          <KSelect minWidth={96} value={state.vars.pageHead ?? 'both'}
            onChange={v => setVar('pageHead', v as 'both' | 'title' | 'desc' | 'none')}
            options={[
              { value: 'both', label: '둘 다' }, { value: 'title', label: '제목만' },
              { value: 'desc', label: '설명만' }, { value: 'none', label: '안 띄움' },
            ]} />
          {/* 모바일에서만 헤더를 생략할지 (v1.9 사용자 요청) */}
          <Item label="모바일">
            <KSelect minWidth={80} value={state.vars.pageHeadM ?? 'same'}
              onChange={v => setVar('pageHeadM', v as 'same' | 'none')}
              options={[{ value: 'same', label: '동일' }, { value: 'none', label: '생략' }]} />
          </Item>
          </Line>
          <div className="cp-group">
            <CP label="제목" k="pageTitle" />
            <CP label="설명" k="pageDesc" />
          </div>
        </Ctl>
      </div>

      </div>
  );
}

/** 사이트 기본 정보 — 브라우저 탭 제목·아이콘·크롤링 설명·로고 (예전 디자인 탭에서 분리, v3.1) */
function SiteBasicPane() {
  return (
    <div className="set-sec">
      {/* 브라우저 탭 제목 (v1.9 사용자 요청) — 비우면 「로고 텍스트 — 개인홈」 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>브라우저 탭 제목</b><small>탭·즐겨찾기에 표시되는 이름 — 비우면 「로고 텍스트 — 개인홈」</small></div>
        <DocTitleControl />
      </div>

      {/* 브라우저 탭 아이콘 (v2.0 사용자 요청) — 지정 전에는 배포 기본 아이콘이 뜬다 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>브라우저 탭 아이콘</b><small>탭·즐겨찾기·휴대폰 홈 화면 아이콘에 함께 쓰임 — 정사각형 PNG(180×180 이상) 권장, 비우면 기본 아이콘</small></div>
        <FaviconControl />
      </div>

      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>크롤링 설명 문구</b><small>카톡·디스코드 등에 링크 공유 시 제목 아래 뜨는 한 줄 — 비우면 서브타이틀, 그것도 비었으면 기본 문구</small></div>
        <CrawlDescControl />
      </div>

      {/* 로고 — 텍스트/서브타이틀/정렬/글씨색 (5.2) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>로고</b><small>상단바 로고 텍스트·아랫줄 서브타이틀·정렬</small></div>
        <Ctl>
          <LogoControls />
          <CP label="글씨" k="topBrand" />
        </Ctl>
      </div>

      {/* 로고 이미지 (v2.2 사용자 요청) — 지정하면 로고 텍스트 대신 표시 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>로고 이미지</b><small>지정하면 상단바에 로고 텍스트 대신 이미지를 표시 — 가로로 긴 투명 PNG 권장, 높이는 상단바에 맞춰 자동 축소 · 모바일을 비우면 PC 이미지를 그대로 사용</small></div>
        <LogoImageControls />
      </div>

      </div>
  );
}

/** 레이아웃 — PC 레이아웃·메뉴 모양·게시판 폭 (v3.1) */
function LayoutPane() {
  return (
    <div className="set-sec">
      <PcLayoutRow />
      {/* PC 2단형 메뉴 카드 모양 (v3.0 사용자 요청) */}
      <MenuCardRow />

      {/* 모바일 메뉴 모양 (v2.9 사용자 요청) — Cover를 고르면 상위 메뉴별 커버 이미지 칸이 이어서 나온다 */}
      <MobileNavRow />

      <BoardWidthRow />
    </div>
  );
}

/** 세부 요소 — 입력 포커스·스크롤바·검색창·버튼·모서리·그림자 (v3.1) */
/** 페이지 헤더 (v3.2 사용자 요청) — 모든 페이지 맨 위 제목·설명·탭·버튼의 모양. 사이트 공통.
 *  값은 처음 카테고리 전용으로 만들 때의 자리(ohome.boardset.v1)에 들어가 맨 위 [저장]으로 함께 저장된다 */
const HEAD_STYLES: { id: BoardHeadStyle; name: string; sub: string; desc: string }[] = [
  { id: 'basic', name: '기본', sub: '지금 모양', desc: '왼쪽 제목 · 분류 버튼 · 검색 · WRITE 버튼' },
  { id: 'mast', name: '마스트헤드', sub: '잡지 표지형', desc: '이탤릭 큰 제목 · 가는 선 위 밑줄 탭과 글자 버튼 · 카테고리 목록엔 「BOARD · 글 수」 머리글' },
  { id: 'emblem', name: '각인', sub: '가운데 엠블럼', desc: '✦ 장식선 · 넓은 자간의 가운데 제목 · 이탤릭 설명 · 가운데로 모은 탭과 둥근 버튼' },
];
function PageHeadPane() {
  const { st, setHeadStyle } = useBoardSettings();
  const cur = st.headStyle ?? 'basic';
  return (
    <div className="set-sec">
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>헤더 모양</b><small>카테고리·로드비·다이어리·자관·갤러리·감상타래·TRPG 등 모든 페이지 상단에 공통 적용 — 글씨색은 「테마·색 &gt; 페이지 타이틀」, 제목·설명 표시 여부는 같은 칸의 표시 옵션을 따릅니다.</small></div>
        <div className="bh-pick" role="radiogroup" aria-label="페이지 헤더 모양">
          {HEAD_STYLES.map(h => (
            <button key={h.id} type="button" role="radio" aria-checked={cur === h.id}
              className={`bh-pick-card${cur === h.id ? ' on' : ''}`} onClick={() => setHeadStyle(h.id)}>
              <span className={`bh-thumb bh-thumb-${h.id}`} aria-hidden>
                {h.id === 'basic' && <><i className="t" /><span className="r"><i className="seg" /><i className="btn" /></span></>}
                {h.id === 'mast' && <><i className="eb" /><i className="t" /><span className="r"><i className="tab" /><i className="w" /></span></>}
                {h.id === 'emblem' && <><i className="orn" /><i className="t" /><i className="d" /><span className="r"><i className="c" /><i className="tab" /><i className="c" /></span></>}
              </span>
              <b>{h.name}<small>{h.sub}</small></b>
              <span className="bh-pick-desc">{h.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailPane() {
  const { state, setVar } = useTheme();
  return (
    <div className="set-sec">
      {/* 입력 포커스 (v1.9 사용자 요청) — 인풋·텍스트에리어·드롭다운·에디터 공통 */}
      <div className="set-row">
        <div className="l"><b>입력 포커스</b><small>인풋·드롭다운을 선택했을 때의 테두리색과 강조 링<br />번짐: 은은하게 번지는 링 · 라인: 선명한 실선 링 · 테두리만: 링 없이 테두리 색만 바뀜</small></div>
        {/* 색 / 링 방식·두께 / 미리보기 — 라벨 열을 맞춘 세 줄 (v3.2 사용자 요청) */}
        <Ctl>
          <CP label="색" k="focusColor" def={state.vars.accent} />
          <Line>
            {/* 링 방식 — 선택창으로 (각 방식의 뜻은 왼쪽 설명에) */}
            <Item label="링">
              <KSelect minWidth={96} value={state.vars.focusRing ?? 'glow'}
                onChange={v => setVar('focusRing', v as 'glow' | 'line' | 'none')}
                options={[
                  { value: 'glow', label: '번짐' }, { value: 'line', label: '라인' }, { value: 'none', label: '테두리만' },
                ]} />
            </Item>
            {(state.vars.focusRing ?? 'glow') !== 'none' && (
              <Item label="두께">
                <KStep value={state.vars.focusW ?? 3} min={1} max={6} step={1} suffix="px"
                  onChange={v => setVar('focusW', v)} />
              </Item>
            )}
          </Line>
          <Item label="미리보기"><KInput className="ctl-preview" defaultValue="눌러서 확인" /></Item>
        </Ctl>
      </div>

      {/* 이미지 편집(크롭) 배경 (v1.9 사용자 요청) — 투명 PNG 위치 지정 시 보이는 판 */}
      <div className="set-row">
        <div className="l"><b>이미지 편집 배경</b><small>썸네일·헤더 위치 지정 화면의 판 — 투명 이미지에서 보임</small></div>
        <div className="cp-group">
          <CP label="배경" k="cropBg" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>스크롤바</b></div>
        <div className="cp-group">
          <CP label="색" k="sbThumb" />
          <CP label="테두리" k="sbBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>검색창</b><small>카테고리·리스트 공통 검색 인풋 — 라이트/다크 전환 시 자동 연동</small></div>
        {/* 4항목은 한 줄에 안 들어가 밀림 — 2×2 그리드 정렬 (열 맞춤) */}
        <div className="cp-grid2">
          <CP label="배경" k="searchBg" />
          <CP label="글씨" k="searchFg" />
          <CP label="아이콘" k="searchIc" />
          <CP label="테두리" k="searchBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>스위치 탭</b><small>카테고리 공지·갤러리 보기 전환 등 — 고른 쪽은 아래 진한 버튼색을 그대로 따라갑니다</small></div>
        <div className="cp-group">
          <CP label="배경" k="segBg" />
          <CP label="글씨" k="segFg" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>진한 버튼</b><small>등록·저장 버튼과 체크박스·선택 필터 칩 공통</small></div>
        <div className="cp-group">
          <CP label="버튼" k="btnDark" />
          <CP label="글씨" k="btnDarkFg" />
          <CP label="호버" k="btnDarkHv" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>모서리 둥글기</b><small>카드/버튼 radius</small></div>
        <KStep value={state.vars.radius} min={0} max={30} onChange={v => setVar('radius', v)} />
      </div>

      {/* 그림자 설정 — 블록/드롭다운 나란히 묶음 */}
      <div className="set-row">
        <div className="l"><b>블록 그림자</b><small>패널·카드·배너·모달의 드롭섀도우 세기 — 0%는 그림자 없음</small></div>
        {/* 색 / 세기 두 줄 — 아래 「드롭다운 그림자」의 세기 줄과 열이 맞음 */}
        <Ctl>
          <Item label="색"><ColorField value={state.vars.shColor ?? '#000000'} onChange={hex => setVar('shColor', hex)} /></Item>
          <Line>
            <Item label="세기">
            <KSelect minWidth={96} value={String(state.vars.shadow)} placeholder="직접 지정"
              onChange={v => setVar('shadow', Number(v))} options={SHADOW_PRESETS} /></Item>
            <KStep value={state.vars.shadow} min={0} max={200} step={10} suffix="%" onChange={v => setVar('shadow', v)} />
          </Line>
        </Ctl>
      </div>

      <div className="set-row">
        <div className="l"><b>드롭다운 그림자</b><small>하위메뉴·프로필 메뉴·셀렉트 팝업·달력 — 블록 그림자와 별개, 없음도 가능</small></div>
        <Ctl>
          <Line>
            <Item label="세기">
            <KSelect minWidth={96} value={String(state.vars.ddShadow ?? 100)} placeholder="직접 지정"
              onChange={v => setVar('ddShadow', Number(v))} options={SHADOW_PRESETS} /></Item>
            <KStep value={state.vars.ddShadow ?? 100} min={0} max={200} step={10} suffix="%" onChange={v => setVar('ddShadow', v)} />
          </Line>
        </Ctl>
      </div>

      </div>
  );
}

/** 폰트 설정 — 사이트 역할 폰트 (v3.1). 폰트 라이브러리는 바로 아래 별도 칸(fontlib)에서 관리 */
function FontsPane() {
  return (
    <>
      <div className="set-sec">
        <div className="d">사이트 곳곳의 글씨 — 아래 「폰트 라이브러리」에 등록한 폰트 중에서 고르고 굵기·크기를 보정합니다</div>
        {/* 사이트 역할 폰트 (5.1) — 폰트 라이브러리(내장+직접 등록)에서 선택 + 굵기·크기 보정 */}
      <FontRoleRow role="title" />
      <FontRoleRow role="pagetitle" />
      <FontRoleRow role="subtitle" />
      <FontRoleRow role="logosub" />
      <FontRoleRow role="menu" />
      <FontRoleRow role="dropdown" />
      <FontRoleRow role="posttitle" />
      <FontRoleRow role="body" />

      </div>
    </>
  );
}

/** 게시판 본문 폭 (v2.3 사용자 요청) — 목록·글 상세 공통(동기화). 다른 디자인 항목처럼 미리보기 즉시, SAVE로 저장 */
function BoardWidthRow() {
  const { site, set } = useSiteDraft();
  return (
    <div className="set-row">
      <div className="l"><b>카테고리 본문 폭</b><small>카테고리 목록과 포스팅 상세에 같은 폭으로 적용 — 기본 {BOARD_W.def}px · 모바일은 화면 폭 그대로</small></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {site.boardW != null && site.boardW !== BOARD_W.def && (
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => set({ boardW: undefined })}>기본값</button>
        )}
        <KStep value={boardWOf(site)} min={BOARD_W.min} max={BOARD_W.max} step={10} suffix="px"
          onChange={v => set({ boardW: v })} />
      </div>
    </div>
  );
}

/** 메인 페이지 탭 (v1.9 확정) — 모바일 표시 토글 + 모바일 세로 나열 순서
    토글은 모바일에서만 뺀다(사용자 확정) — PC 메인 구성은 편집모드의 [＋ 위젯]·우클릭 삭제로 */
function MainPagePane() {
  const { state, setMobileOff, setMobileOrder, resetMain } = useMainStore();
  const toast = useToast();
  const [resetAsk, setResetAsk] = useState(false);   // 기본 구성 확인 (v1.9)
  // 모바일 순서 목록: 고정 슬라이드 배너도 포함 (v2.9 사용자 요청) · 회원정보창은 고정 배너 바로 아래를 따라감
  const orderable = state.mobileOrder
    .map(id => state.widgets.find(w => w.id === id))
    .filter((w): w is NonNullable<typeof w> => !!w && w.type !== 'menu' && w.type !== 'member');   // 메뉴리스트는 상단바 ≡로 대체
  const onReorder = (ids: string[]) => {
    // 목록에 안 보이는 항목(메뉴 카드 등)은 원래 자리에 그대로 두고 보이는 항목만 새 순서로 채운다
    const shown = new Set(ids); let k = 0;
    setMobileOrder(state.mobileOrder.map(id => (shown.has(id) ? ids[k++] : id)));
  };

  return (
    <div className="set-sec">
      {/* 제목 + 설명은 다른 탭과 똑같은 흐름(h3 → .d)으로 두고, 기본 구성 버튼만 우상단에 띄움
          (버튼 높이가 제목줄을 늘려 설명문이 떨어져 보이던 문제 — v1.9 사용자 피드백) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 11 }}
          onClick={() => setResetAsk(true)}>기본 구성</button>
      </div>
      <ConfirmModal open={resetAsk} title="메인 페이지를 기본 구성으로 되돌릴까요?"
        body="추가한 위젯과 배치·크기·모바일 순서가 전부 처음 상태로 돌아갑니다. 맨 위 [저장]을 누르기 전에는 [되돌리기]로 되돌릴 수 있습니다."
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: 'RESET', kind: 'accent', onClick: () => { resetMain(); setResetAsk(false); toast('기본 구성으로 바꿨습니다 — 맨 위 [저장]을 눌러야 저장됩니다'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
      <div className="d">모바일 표시 여부 + 모바일 세로 나열 순서 — ⠿ 드래그로 순서 변경</div>

      {/* 메인 레이아웃은 고정 캔버스 하나 — 반응형 옵션 제거 (v1.9, PC/모바일 두 가지만) */}
      <DragList
        items={orderable}
        keyOf={w => w.id}
        onReorder={list => onReorder(list.map(w => w.id))}
        render={(w, i) => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="mw-no">{i + 1}</span>
              <span className="drag-h">⠿</span>
              <div>
                {/* 뱃지는 이름 옆에 — b가 블록이라 사이에 두면 설명문 줄로 내려감 (v1.9 사용자 피드백) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b>{widgetLabel(state.widgets, w)}</b>
                  {MULTI_TYPES.includes(w.type) && <span className="pill">중복 추가 가능</span>}
                </div>
                <small>{WIDGET_META[w.type].desc}</small>
              </div>
            </div>
            <KToggle checked={!w.mOff} onChange={v => setMobileOff(w.id, !v)} />
          </div>
        )}
      />
      <p className="hint">토글을 끄면 <b>모바일에서만</b> 빠지고 PC 메인에는 그대로 표시됩니다 · 순서는 <b>모바일 세로 나열 순서</b> — PC 배치는 메인에서 편집모드로 자유 조정</p>
      <p className="hint">메인에서 위젯을 완전히 빼거나 더하려면 편집모드에서 — 추가는 상단바 [＋ 위젯], 삭제는 위젯 우클릭 → 위젯 삭제</p>
      <p className="hint">회원정보창은 순서 목록에 없고 모바일에서 항상 기본 슬라이드 배너(삭제 불가) 바로 아래에 표시됩니다</p>
    </div>
  );
}

/**
 * PC 레이아웃 (v2.7 사용자 요청) — 1단형(상단 메뉴) / 2단형(메뉴 카드).
 * 2단형은 메인과 좌우 위젯이 뜨는 페이지에서만 적용되고, 레일 없는 페이지(자관·로드비·다이어리·환경설정·글쓰기)와
 * 모바일은 늘 지금 화면 그대로. 처음 2단형으로 바꾸면 메뉴 카드를 왼쪽 열 맨 위에 두고 그 열 위젯을 아래로 내린다.
 * 메인 페이지 설정(ohome.main.v1)이라 다른 설정과 같이 맨 위 [저장]으로 저장한다. 디자인 › 레이아웃에 둔다(v3.1).
 */
function PcLayoutRow() {
  const { state, setPcLayout } = useMainStore();
  const { menu } = useSiteMenu();
  const cur = state.pcLayout ?? 'top';
  const pick = (m: 'top' | 'side') => { if (m !== cur) setPcLayout(m, menuCardHeight(menu.length)); };
  return (
    <div className="set-row">
      <div className="l"><b>PC 레이아웃</b>
        {/* 한 줄이면 PC에서 라벨이 안 줄어들어(.set-row .l flex-shrink:0) 버튼이 패널 밖으로 밀린다 — 의미 단위로 개행 */}
        <small>
          2단형 = 메뉴를 상단바 대신 메뉴 카드로<br />
          메뉴 카드는 편집모드에서 좌우 열 안으로만 이동<br />
          자관·로드비·다이어리·환경설정·글쓰기 화면과 모바일은 1단형 그대로
        </small></div>
      <div className="seg in-panel seg-1line">
        <button className={cur === 'top' ? 'on' : ''} onClick={() => pick('top')}>1단형</button>
        <button className={cur === 'side' ? 'on' : ''} onClick={() => pick('side')}>2단형</button>
      </div>
    </div>
  );
}

/** 위젯 탭 — 메인 위젯들의 내용·설정값을 한곳에서 관리 (메인 페이지의 관리 모달과 같은 데이터) */
function WidgetsPane() {
  const { state, setSettingsOrder } = useMainStore();
  // 설정값이 있는 위젯만 — 실데이터 연동 위젯(DIARY)과 메뉴리스트·회원정보창은 설정값 없음
  const base = state.widgets.filter(w =>
    (['banner', 'memo', 'dday', 'ddaycard', 'todo', 'freetext', 'deco', 'latest'] as const).some(t => t === w.type));
  // 목록 순서 (사용자 요청) — 설정하기 편하도록 이 탭에서만 쓰는 순서. 메인 배치·모바일 순서는 그대로.
  // 저장된 순서에 없는 위젯(새로 추가한 것)은 기존 순서대로 뒤에 붙는다
  const ord = state.settingsOrder ?? [];
  const rank = (id: string) => { const i = ord.indexOf(id); return i < 0 ? ord.length : i; };
  const editable = base.map((w, i) => ({ w, i }))
    .sort((a, b) => rank(a.w.id) - rank(b.w.id) || a.i - b.i)
    .map(x => x.w);

  const editorOf = (w: WidgetConf) => {
    switch (w.type) {
      case 'memo':
      case 'freetext': return <TextSettingEditor conf={w} />;
      case 'dday': return <DdayEditor conf={w} />;
      case 'ddaycard': return <DdayCardEditor conf={w} />;
      case 'todo': return <TodoEditor conf={w} />;
      case 'deco': return <DecoEditor conf={w} />;
      case 'banner': return <BannerEditor conf={w} />;
      case 'latest': return <LatestEditor conf={w} />;
      default: return null;
    }
  };

  return (
    <div className="set-sec">
      <div className="d">메인 위젯의 내용·설정값 관리 — 메인 페이지의 관리 모달과 같은 데이터
        <br />⠿ 드래그로 이 목록의 순서만 바꿀 수 있습니다 — 메인의 실제 배치·모바일 순서는 바뀌지 않습니다</div>

      {/* 위젯 카드 색 (v2.6 디자인 탭에서 이동) — 위젯 목록 위 */}
      <WidgetStyleRow />

      <DragList items={editable} keyOf={w => w.id} onReorder={list => setSettingsOrder(list.map(w => w.id))}
        render={w => (
        <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span className="drag-h" data-tip="드래그로 목록 순서 변경">⠿</span>
            {/* 중복 추가 가능한 위젯(이미지·자유 텍스트)은 번호로 구분 (v1.9) */}
            <b style={{ fontSize: 13, letterSpacing: '.04em' }}>{widgetLabel(state.widgets, w)}</b>
            {MULTI_TYPES.includes(w.type) && <span className="pill">중복 추가 가능</span>}
            <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{WIDGET_META[w.type].desc}</small>
            {w.mOff && <span className="pill" style={{ marginLeft: 'auto' }}>모바일 제외</span>}
          </div>
          {editorOf(w)}
        </div>
      )} />
      <p className="hint">DIARY는 일기 실데이터를 그대로 보여주는 위젯이라 별도 설정값이 없습니다 · 모바일에서 위젯 켜기/끄기와 순서는 아래 「모바일 메인 페이지」에서</p>
    </div>
  );
}

/** 게시판 관리 탭 (5.2) — 게시판 생성·삭제·스킨·권한 + 뱃지 색 */
function BoardPane() {
  const {
    st, patchSystem, setPerPage, setBox,
  } = useBoardSettings();
  const { boards, setBoards: setBoardsRaw } = useBoards();
  const [ms, patchMenu] = useMenuSettings();
  /* 게시판 주소 (v2.4 사용자 요청) — `/board/b/별명`. 별명을 비우면 이름(영소문자)이 주소가 되므로
     **이름이나 별명을 고치면 주소가 바뀐다.** 메뉴 트리에는 주소가 문자열로 적혀 있어서,
     그 자리도 함께 고쳐야 배치·공개범위·페이지 타이틀이 풀리지 않는다 (섹션 별명과 같은 방식). */
  const setBoards = (next: Board[]) => {
    const before = new Map(boards.map(b => [b.id, boardHref(b.id, boards)]));
    setBoardsRaw(next);
    const swapMap = new Map<string, string>();
    next.forEach(b => {
      const was = before.get(b.id);
      const now = boardHref(b.id, next);
      if (was && was !== now) swapMap.set(was, now);
    });
    if (!swapMap.size) return;
    const swap = (h: string) => swapMap.get(h) ?? h;
    patchMenu({
      tree: (ms.tree ?? []).map(g => ({
        ...g,
        ...(g.href ? { href: swap(g.href) } : {}),
        items: g.items.map(it => ({ ...it, href: swap(it.href) })),
      })),
      removedBoards: (ms.removedBoards ?? []).map(swap),
    });
  };
  const patchBoard = (id: string, p: Partial<Board>) =>
    setBoards(boards.map(b => (b.id === id ? { ...b, ...p } : b)));
  const bKeys = boardKeys(boards);
  const del = useConfirmDelete();

  const colorCells = (b: BoardBadge, patch: (p: Partial<BoardBadge>) => void) => (
    <>
      <Item label="배경"><ColorField value={b.bg} onChange={hex => patch({ bg: hex })} /></Item>
      <Item label="테두리"><ColorField value={b.border} onChange={hex => patch({ border: hex })} /></Item>
      <Item label="글씨"><ColorField value={b.fg} onChange={hex => patch({ fg: hex })} /></Item>
    </>
  );

  return (
    <div className="set-sec">
      {/* 전체 포스팅 관리 버튼은 제목·설명과 같은 줄 오른쪽 (v2.6 사용자 요청) */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="d" style={{ marginBottom: 0 }}>카테고리 생성·삭제와 카테고리별 스킨·댓글 사용 — 저장하면 메뉴·목록·포스팅 쓰기에 반영</div>
        </div>
        <a className="btn btn-ghost" href="/admin/posts">전체 포스팅 관리</a>
      </div>

      <h3 style={{ marginTop: 16 }}>카테고리 목록</h3>
      <div className="d">⠿ 드래그로 메뉴 순서 · 이름은 상단 메뉴와 페이지 타이틀에 그대로 표시 · 리스트 스킨(기본형/갤러리형 1·2) 카테고리마다 지정 · <b>글씨</b>는 목록의 글 제목·날짜 색(갤러리형 1은 그림 위 흰 글씨라 지정하지 않음) ·
        <b>댓글</b>을 끄면 글 아래 댓글창과 목록의 댓글 수가 숨겨지고, 이미 달린 댓글은 지워지지 않습니다 — 글쓰기·댓글 권한은 메뉴 관리에서
        <br />
        <b>주소</b>는 <code>/board/b/주소</code> — 영소문자·숫자·하이픈만 쓸 수 있고, 비우면 카테고리 이름을 영소문자로 바꿔 씁니다
        (이름에 영문·숫자가 없으면 내부 id). 이름이나 주소를 바꾸면 메뉴의 주소도 함께 바뀌고, 글은 그대로 있습니다
      </div>
      <DragList items={boards} keyOf={b => b.id} onReorder={setBoards}
        render={b => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <KInput value={b.name} onChange={e => patchBoard(b.id, { name: e.target.value })}
                style={{ width: 110 }} />
              {b.id === MAIN_BOARD_ID
                ? <span className="pill">기본</span>
                : (
                  /* 주소 별명 (v2.4) — 비우면 이름을 영소문자로 (Palimpsest → palimpsest) */
                  <>
                    <span className="cp-lb">주소</span>
                    <KInput value={b.slug ?? ''} placeholder={bKeys.get(b.id) ?? b.id}
                      onChange={e => {
                        // 입력 중에는 하이픈을 지우지 않는다(`my-` 다음 글자를 칠 수 있게) — 주소로 쓸 때 다듬는다
                        const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32);
                        const slug = cleanSlug(raw);
                        const taken = boards.some(x => x.id !== b.id && (x.id === slug || bKeys.get(x.id) === slug));
                        if (slug && taken) return;      // 다른 게시판 주소와 겹치면 그대로 둔다
                        patchBoard(b.id, { slug: raw || undefined });
                      }} style={{ width: 110 }} />
                    <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{boardHref(b.id, boards)}</small>
                  </>
                )}
            </div>
            {/* 스킨·댓글·삭제 / 글씨색 두 줄 — 라벨 열을 맞춘다 (v3.2 사용자 요청) */}
            <Ctl>
              <Line>
                {/* 리스트 스킨 — 눌러서 고르는 선택창 (버튼 세 개 나열 대신) */}
                <Item label="스킨">
                  <KSelect minWidth={110} value={b.skin}
                    onChange={v => patchBoard(b.id, { skin: v as typeof b.skin })}
                    options={BOARD_SKINS.map(k => ({ value: k.id, label: k.label }))} />
                </Item>
                {/* 댓글 사용 (v2.5 사용자 요청) — 끄면 글 아래 댓글 목록·입력창, 목록의 댓글 수를 숨긴다 */}
                <Item label="댓글">
                  <KToggle checked={!b.noComment} onChange={v => patchBoard(b.id, { noComment: v ? undefined : true })} />
                </Item>
                {b.id !== MAIN_BOARD_ID && (
                  <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                    onClick={() => del.ask(`카테고리 「${b.name}」를 삭제하시겠습니까?`, () => {
                      setBoards(boards.filter(x => x.id !== b.id));
                    }, '메뉴에서 사라지지만 이 카테고리에 쓴 포스팅은 보존됩니다 (3장 원칙).')}>DELETE</button>
                )}
              </Line>
              {/* 목록 글씨색 (v1.9) — 미지정이면 테마 기본색.
                  갤러리형 1은 그림 위 흰 글씨로 고정이라 이 색을 쓰지 않는다 — 칸을 숨긴다 (v2.5 사용자 요청) */}
              {b.skin !== 'gallery' && (
                <Line>
                  <Item label="글씨"><ColorField value={b.fg ?? '#2c3037'} onChange={hex => patchBoard(b.id, { fg: hex })} /></Item>
                  {b.fg && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                      onClick={() => patchBoard(b.id, { fg: undefined })}>기본색</button>
                  )}
                </Line>
              )}
            </Ctl>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setBoards([...boards, {
            id: newId(), name: '새 카테고리', desc: '카테고리 설명을 입력하세요',
            skin: 'list', permWrite: 'member', permComment: 'member',
          }])}>＋ ADD CATEGORY</button>
      </div>

      {/* 페이지당 글 수 (v2.3 사용자 요청) — 게시판마다가 아니라 모든 게시판 공통 */}
      <div className="set-row" style={{ marginTop: 14 }}>
        <div className="l"><b>페이지당 포스팅 수</b><small>모든 카테고리 목록에 공통 적용 — 갤러리형은 한 줄에 3개라 3의 배수가 깔끔합니다</small></div>
        <KStep value={perPageOf(st)} min={BOARD_PER_PAGE.min} max={BOARD_PER_PAGE.max} suffix="개" onChange={setPerPage} />
      </div>

      {/* 본문 박스 (v2.6 사용자 요청) — 목록·글 화면의 흰 박스 불투명도와 그 안의 글씨색. 모든 게시판 공통 */}
      <div className="set-row">
        <div className="l"><b>본문 박스 불투명도</b><small>카테고리 목록·포스팅 화면의 흰 박스 — 100% 완전한 흰 박스 · {BOARD_BOX_DEF}% 기본 · 0% 박스 없이 배경 위에 바로 글씨 (모바일 글 화면의 흰 바탕도 함께)</small></div>
        <KStep value={boxAlphaOf(st)} min={0} max={100} step={5} suffix="%" onChange={v => setBox({ boxAlpha: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>본문 박스 글씨색</b><small>테마 따라감 — 다크 모드면 밝은 글씨, 라이트 모드면 어두운 글씨 (박스를 옅게 했을 때)</small></div>
        <div className="mini-seg">
          <button className={st.boxText !== 'theme' ? 'on' : ''} onClick={() => setBox({ boxText: undefined })}>지금처럼 (어두운 글씨)</button>
          <button className={st.boxText === 'theme' ? 'on' : ''} onClick={() => setBox({ boxText: 'theme' })}>테마 따라감</button>
        </div>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>시스템 뱃지</h3>
      <div className="d">공지 · 비밀 · 접힘 — 색만 수정 (삭제 불가)</div>
      {st.system.map(b => (
        <div key={b.id} className="set-row">
          <div className="l"><span style={boardBadgeStyle(b)}>{b.label}</span></div>
          <div className="cp-group">
            {colorCells(b, p => patchSystem(b.id, p))}
          </div>
        </div>
      ))}

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
      {/* 갤러리·다이어리 등도 여러 개로 (v2.0 사용자 요청) — 목록이 몇 개인지는 여기 한곳에서 */}
      <SectionsBlock />

      {del.element}
    </div>
  );
}

/** 회원/보안 탭 (5.2, v1.9 mock 범위) — 가입코드 변경 + 회원 목록(가입 계정 삭제).
 *  그룹별 권한 매트릭스·가입 승인제·비밀번호 정책은 Supabase 연동 시 확장 */
function MemberPane() {
  const toast = useToast();
  const del = useConfirmDelete();
  const router = useRouter();   // 회원 이름 클릭 → 회원 정보 페이지 (v1.9)
  const [code, setCode] = useState('');
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [regVer, setRegVer] = useState(0);   // 가입 계정 삭제 후 목록 갱신용
  const [removedIds, setRemovedIds] = useState<string[]>([]);   // 서버 모드에서 방금 지운 회원
  useEffect(() => {
    setCode(inviteCode());
    // 서버 모드: 가입코드는 관리자 전용 저장소라 앱 시작 때 받은 설정에 없을 수 있다 — 직접 읽는다
    if (!isServerMode()) { setCodeLoaded(true); return; }
    let alive = true;
    void (backend()?.fetchSetting<string>('ohome.invite.v1') ?? Promise.resolve(null))
      .then(v => { if (alive && typeof v === 'string' && v) setCode(v); })
      .catch(() => { /* 무시 */ })
      .finally(() => { if (alive) setCodeLoaded(true); });
    return () => { alive = false; };
  }, []);
  void regVer;

  const members = useMembers();
  const memberNos = memberNumbers(members);   // 회원 주소 /members/{번호} (v2.4)
  const serverOn2 = isServerMode();
  // 계정 삭제는 서비스 콘솔에서만 가능 — 바로 열 수 있게 이 홈의 프로젝트 주소를 만들어 둔다
  const authConsoleUrl = (() => {
    const c = serverConfig();
    if (c?.kind === 'firebase') return `https://console.firebase.google.com/project/${c.projectId}/authentication/users`;
    if (c?.kind === 'supabase') {
      const m = c.url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
      return m ? `https://supabase.com/dashboard/project/${m[1]}/auth/users` : '';
    }
    return '';
  })();
  const [delMember, setDelMember] = useState<{ id: string; nickname: string } | null>(null);
  const registry = (() => {
    try { return JSON.parse(localStorage.getItem('ohome.mockreg.v1') ?? '{}') as Record<string, unknown>; } catch { return {}; }
  })();

  // 회원 목록 — 검색 · 10명 페이지네이션 · 태그 그룹화 (v1.9)
  const PER_MEMBERS = 10;
  const [mq, setMq] = useState('');
  const [mPage, setMPage] = useState(1);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [mTags, setMTags] = useState<Record<string, string[]>>({});
  const [tagFor, setTagFor] = useState<string | null>(null);   // 태그 입력 중인 회원
  const [tagInput, setTagInput] = useState('');
  // 회원 태그는 관리자가 정하고 모두가 보는 값 — 서버 모드에서는 DB에 저장 (v2.0)
  useEffect(() => { setMTags(getSetting<Record<string, string[]>>('ohome.membertags.v1', {})); }, []);
  const saveTags = (userId: string, tags: string[]) => {
    setMTags(prev => {
      const n = { ...prev };
      if (tags.length) n[userId] = tags; else delete n[userId];
      setSetting('ohome.membertags.v1', n);
      return n;
    });
  };
  const allTags = [...new Set(Object.values(mTags).flat())];
  const isAdminOf = (m: { id: string; role?: string }) => m.role === 'admin' || m.id === 'admin';
  const filteredMembers = members.filter(m => {
    if (removedIds.includes(m.id)) return false;   // 방금 지운 회원 (목록은 한 번만 받아 온다)
    const k = mq.trim().toLowerCase();
    const tags = mTags[m.id] ?? [];
    if (filterTag && !tags.includes(filterTag)) return false;
    return !k || m.nickname.toLowerCase().includes(k) || m.id.toLowerCase().includes(k)
      || tags.some(t => t.toLowerCase().includes(k));
  })
    // 관리자를 맨 위로 (사용자 요청) — 그 다음은 이름순
    .sort((a, b) => (isAdminOf(a) ? 0 : 1) - (isAdminOf(b) ? 0 : 1) || a.nickname.localeCompare(b.nickname));
  const pageMembers = filteredMembers.slice((mPage - 1) * PER_MEMBERS, mPage * PER_MEMBERS);

  return (
    <div className="set-sec">
      <div className="d">가입코드와 회원 목록 관리 · 회원 삭제·태그는 누르는 즉시 반영됩니다</div>

      {/* 다른 탭 행들과 같은 .set-row — 라벨은 왼쪽, 입력·버튼은 같은 줄 오른쪽 (v2.0 사용자 지적:
          예전엔 라벨·설명·컨트롤이 각자 줄을 차지해 다른 탭과 통일감이 없고 줄바꿈도 보기 안 좋았다) */}
      <div className="set-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <div className="l"><b>가입코드</b><small>회원가입 시 입력해야 하는 초대코드 — 아는 사람에게만 공유</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 맨 위 [저장]으로 함께 저장 (v3.1) — 빈 칸은 저장하지 않는다(가입이 막히지 않게) */}
          <KInput value={code} disabled={!codeLoaded} style={{ width: 220 }}
            onChange={e => { setCode(e.target.value); if (e.target.value.trim()) setInviteCode(e.target.value); }} />
          {codeLoaded && !code.trim() && <span style={{ fontSize: 11, color: 'var(--accent)' }}>비워 둘 수 없습니다</span>}
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>회원 목록</h3>
      <div className="d">기본 계정(관리자·지인회원)은 삭제할 수 없습니다 — 태그로 그룹화</div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l">
          {allTags.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allTags.map(t => (
                <span key={t} className={`pill${filterTag === t ? ' dark' : ''}`} style={{ cursor: 'pointer' }}
                  onClick={() => { setFilterTag(f => (f === t ? null : t)); setMPage(1); }}>{t}</span>
              ))}
            </div>
          ) : <b>태그 필터</b>}
        </div>
        <KInput placeholder="닉네임·아이디·태그 검색" value={mq}
          onChange={e => { setMq(e.target.value); setMPage(1); }}
          style={{ width: 200, fontSize: 12 }} />
      </div>
      {pageMembers.map(m => {
        const isBase = m.id === 'admin' || m.id === 'guest';
        const myTags = mTags[m.id] ?? [];
        return (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            {/* 이름 클릭 → 회원 정보 페이지 (v1.9) */}
            <b style={{ fontSize: 12.5, cursor: 'pointer' }} data-tip="회원 정보 보기"
              onClick={() => router.push(memberPath(m, memberNos))}>{m.nickname}</b>
            {/* Firebase 계정 id(uid)는 28자라 줄에서 자리를 다 먹는다 — 앞 7자만, 전체는 툴팁으로 */}
            <small style={{ color: 'var(--faint)', fontSize: 10.5 }} data-tip={m.id.length > 7 ? m.id : undefined}>
              {m.id.length > 7 ? `${m.id.slice(0, 7)}…` : m.id}
            </small>
            {/* 태그 — ✕로 제거, ＋로 추가 (그룹화) */}
            {myTags.map(t => (
              <span key={t} className="pill" style={{ cursor: 'pointer' }} data-tip="태그 제거"
                onClick={() => del.ask(`태그 「${t}」를 제거하시겠습니까?`,
                  () => saveTags(m.id, myTags.filter(x => x !== t)),
                  `${m.nickname} 회원에게서만 제거됩니다.`)}>
                {t} <span style={{ fontSize: 8 }}>✕</span>
              </span>
            ))}
            {tagFor === m.id ? (
              <KInput autoFocus placeholder="태그" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onBlur={() => setTagFor(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    saveTags(m.id, [...new Set([...myTags, tagInput.trim()])]);
                    setTagInput(''); setTagFor(null);
                  }
                  if (e.key === 'Escape') setTagFor(null);
                }}
                style={{ width: 90, fontSize: 11, padding: '3px 8px' }} />
            ) : (
              <span className="fx" style={{ fontSize: 10 }} data-tip="태그 추가"
                onClick={() => { setTagFor(m.id); setTagInput(''); }}>＋</span>
            )}
            <span className="pill" style={{ marginLeft: 'auto' }}>{isAdminOf(m) ? '관리자' : '회원'}</span>
            {!isBase && !isAdminOf(m) && (
              // 회원 뱃지(.pill)와 같은 규격 — padding·글씨·radius 동일 (v1.9)
              <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5, borderRadius: 20, lineHeight: 'normal', letterSpacing: '.04em' }}
                onClick={() => {
                  // 서버 모드는 계정 삭제가 콘솔 소관이라 안내를 거치는 모달로 (사용자 확정)
                  if (serverOn2) { setDelMember({ id: m.id, nickname: m.nickname }); return; }
                  del.ask(`회원 「${m.nickname}」 계정을 삭제하시겠습니까?`, () => {
                    const reg = { ...registry };
                    delete reg[m.id];
                    try { localStorage.setItem('ohome.mockreg.v1', JSON.stringify(reg)); } catch { /* 무시 */ }
                    setRegVer(v => v + 1);
                    toast('계정이 삭제되었습니다');
                  }, '이 계정으로 다시 로그인할 수 없게 됩니다. 작성한 글은 그대로 남습니다.');
                }}>DELETE</button>
            )}
          </div>
        );
      })}
      {filteredMembers.length === 0 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>조건에 맞는 회원이 없습니다</p>
      )}
      {filteredMembers.length > PER_MEMBERS && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <Pager page={mPage} total={Math.ceil(filteredMembers.length / PER_MEMBERS)} onChange={setMPage} />
        </div>
      )}
      {/* 회원 내보내기 — 계정 삭제는 콘솔에서만 되므로 두 단계를 한 흐름으로 안내 (v2.0 사용자 확정) */}
      <ConfirmModal open={delMember !== null} title={`회원 「${delMember?.nickname ?? ''}」 내보내기`}
        wide
        body={
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}>
              <b>① 먼저 로그인 계정을 지웁니다.</b><br />
              계정 삭제는 관리자 권한이 필요한 작업이라 홈에서는 할 수 없습니다
              (그럴 수 있게 만들면 홈에 넣은 관리자 키가 공개돼 누구나 남의 계정을 지울 수 있게 됩니다).
              아래 버튼으로 콘솔을 열어 <b>{delMember?.nickname}</b> 계정을 지워 주세요.
            </p>
            <p style={{ margin: 0 }}>
              <b>② 그다음 목록에서 지웁니다.</b><br />
              계정을 지우지 않고 목록에서만 지우면 <b>그 사람은 계속 로그인할 수 있습니다.</b>
              작성한 글은 어느 쪽이든 그대로 남습니다.
            </p>
          </div>
        }
        onClose={() => setDelMember(null)}
        buttons={[
          ...(authConsoleUrl ? [{
            label: '① 콘솔에서 계정 지우기 ↗', kind: 'dark' as const,
            onClick: () => window.open(authConsoleUrl, '_blank', 'noopener'),
          }] : []),
          {
            label: '② 목록에서 지우기', kind: 'accent' as const,
            onClick: () => {
              const t = delMember;
              setDelMember(null);
              if (!t) return;
              void backend()?.deleteMember(t.id)
                .then(() => { setRemovedIds(v => [...v, t.id]); toast('회원 목록에서 지웠습니다'); })
                .catch(() => toast('지우지 못했습니다 — 관리자 계정으로 로그인했는지 확인해 주세요'));
            },
          },
          { label: 'CANCEL', kind: 'ghost' as const, onClick: () => setDelMember(null) },
        ]} />
      {del.element}
      {/* 포크는 GitHub이 자동으로 동기화해 주지 않는다 — 원본 저장소에 업데이트가 올라와도
          내 포크·배포에는 반영 안 된 채로 남는다(오늘 만든 기능이 안 보이는 흔한 원인, v2.0 사용자 요청).
          자격 증명은 전혀 다루지 않고, 저장해 둔 내 포크 주소로 이동만 시켜 준다 — 거기서
          [Sync fork] 버튼 한 번이면 끝 */}
      {serverOn2 && <ConfigScopeWarnRow />}
      {serverOn2 && <ForkUpdateRow />}
      {/* 설치를 이미 마친 뒤에도 보안 규칙이 바뀔 때(버전 업데이트 등) 다시 붙여넣을 수 있게 —
          예전엔 최초 설치 화면에만 있어서 재설치 없이는 갱신된 규칙을 볼 방법이 없었다 (v2.0) */}
      {serverOn2 && <SecurityRulesRow />}
    </div>
  );
}

/** 연결이 이 브라우저에만 저장된 상태 경고 (v2.0 포크 제보 — 「내 브라우저에선 홈이 뜨는데
 *  배포 링크로 들어온 사람에게는 설치 화면이 뜬다」). 설치 마지막 단계(방문자에게도 보이게 하기)를
 *  건너뛰면 다시 알려 주는 곳이 없어 일주일씩 헤매게 된다 — 관리자가 설정에 들어오면 바로 보이게 */
function ConfigScopeWarnRow() {
  const src = serverConfigSource();
  const cfg = serverConfig();
  if (src !== 'local' || !cfg) return null;
  const download = () => {
    const blob = new Blob([configFileText(cfg)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };
  return (
    <div className="set-sec" style={{ marginTop: 26, border: '1.5px solid var(--accent)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ color: 'var(--accent)' }}>방문자에게는 아직 설치 화면이 보입니다</h3>
      <div className="d" style={{ lineHeight: 1.7 }}>
        데이터베이스 연결이 <b>지금 이 브라우저에만</b> 저장돼 있습니다 — 다른 사람이 배포 주소로 들어오면
        홈이 아니라 「처음 여는 중」 설치 화면이 뜹니다. 아래 파일을 내려받아 <b>저장소의 public 폴더</b>에
        올리고 커밋하면(1~2분 뒤 자동 재배포) 방문자도 같은 홈을 봅니다. 공개용 값이라 노출돼도 안전합니다.
        <br />
        적용됐는지는 <b>내 배포 주소/ohome.config.json</b>을 열어 값이 보이면 성공입니다.
      </div>
      <div className="setup-row" style={{ marginTop: 10 }}>
        <button className="btn btn-dark" onClick={download}>ohome.config.json 내려받기</button>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        파일 대신 Vercel → Settings → Environment Variables에 환경변수로 넣는 방법도 있습니다 — 설치 화면 마지막 단계와 같습니다.
      </p>
    </div>
  );
}

/** 포크 업데이트 바로가기 (v2.0 사용자 요청) — 토큰이나 GitHub 로그인 연동 없이, 저장해 둔 내 포크
 *  주소로 한 번에 이동시켜 준다. 자격 증명을 전혀 다루지 않아 가장 안전하고 구현도 간단하다 —
 *  실제 업데이트(Sync fork)는 그 페이지에서 사용자가 직접 누른다 */
function ForkUpdateRow() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setUrl(getSetting<string>('ohome.repo.v1', '')); setLoaded(true); }, []);
  const trimmed = url.trim();
  const valid = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i.test(trimmed);
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      <h3>포크 업데이트</h3>
      <div className="d">
        내 포크 주소를 저장해 두면, 원본에 업데이트가 올라왔을 때 GitHub의 [Sync fork] 화면으로 바로 이동할 수 있습니다
      </div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>내 포크 주소</b><small>GitHub에서 포크한 저장소의 주소</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 맨 위 [저장]으로 함께 저장 (v3.1) */}
          <KInput placeholder="https://github.com/내아이디/O.home" value={url} disabled={!loaded} style={{ width: 250 }}
            onChange={e => { setUrl(e.target.value); setSetting('ohome.repo.v1', e.target.value.trim()); }} />
          <button className="btn btn-dark" disabled={!valid}
            onClick={() => window.open(trimmed, '_blank', 'noopener')}>내 포크로 이동 ↗</button>
        </div>
      </div>
    </div>
  );
}

/** 보안 규칙 다시 보기 (v2.0) — 최초 설치 이후에도, 앱 업데이트로 규칙이 바뀌면 다시 붙여넣어야 한다.
 *  설치 화면과 같은 내용을 여기서도 복사할 수 있게 */
function SecurityRulesRow() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const cfg = serverConfig();
  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setOpen(true);
    }
  };
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      <h3>보안 규칙</h3>
      <div className="d">
        앱이 업데이트되며 규칙이 바뀔 때가 있습니다 — 새 기능이 갑자기 안 보이거나 목록이 비어 보이거나
        저장이 거부되면 아래를 다시 적용해 보세요.{' '}
        {cfg?.kind === 'firebase'
          ? 'Firestore 콘솔의 규칙 화면에 그대로 덮어써도 안전합니다(기존 컬렉션 권한은 그대로 유지). Storage 규칙은 콘솔 왼쪽 메뉴 Storage → 규칙(Rules) 탭에 붙여넣으세요.'
          : 'Supabase 콘솔 → SQL Editor에 통째로 붙여넣고 Run — 여러 번 실행해도 안전합니다(이미 있으면 건너뜀, 쌓아 둔 글·회원은 그대로).'}
      </div>
      {cfg?.kind === 'firebase' ? (
        <div className="setup-row">
          <button className="btn btn-dark" onClick={() => copy(FIRESTORE_RULES, 'fs')}>
            {copied === 'fs' ? '복사됨 ✓' : 'Firestore 규칙 복사'}
          </button>
          <button className="btn btn-dark" onClick={() => copy(STORAGE_RULES, 'st')}>
            {copied === 'st' ? '복사됨 ✓' : 'Storage 규칙 복사'}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>{open ? '내용 접기' : '내용 보기'}</button>
          {/* Firebase 콘솔로 (사용자 요청) — 새 탭. 특정 프로젝트 주소를 박지 않고 콘솔 첫 화면으로 —
              로그인한 계정의 프로젝트 목록에서 고르면 된다 */}
          <a className="btn btn-ghost" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}
            href="https://console.firebase.google.com/">
            Firebase 콘솔 열기 ↗
          </a>
        </div>
      ) : (
        /* Supabase도 여기서 바로 복사 (v2.0 포크 제보) — 예전에는 「schema.sql을 실행하라」는
           안내 한 줄뿐이라, 규칙을 다시 적용하러 온 사람이 빈 화면을 만났다 */
        <div className="setup-row">
          <button className="btn btn-dark" onClick={() => copy(SCHEMA_SQL, 'sql')}>
            {copied === 'sql' ? '복사됨 ✓' : '설치 SQL 복사'}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>{open ? '내용 접기' : '내용 보기'}</button>
        </div>
      )}
      {open && (cfg?.kind === 'firebase' ? (
        <>
          <pre className="setup-sql">{FIRESTORE_RULES}</pre>
          <pre className="setup-sql">{STORAGE_RULES}</pre>
        </>
      ) : (
        <pre className="setup-sql">{SCHEMA_SQL}</pre>
      ))}
    </div>
  );
}

/** 로고 컨트롤 (5.2) — 디자인 탭 로고 행에 삽입 */
/** 브라우저 탭 제목 (v1.9 사용자 요청) — 다른 로고 설정과 같은 드래프트/SAVE 흐름 */
function DocTitleControl() {
  const { site, set } = useSiteDraft();
  return (
    // 값이 드래프트 저장소를 거쳐 되돌아오므로 한글 조합이 깨지지 않는 인풋을 쓴다
    <LiveInput value={site.docTitle ?? ''} onValue={v => set({ docTitle: v })}
      placeholder={`${site.title} — 개인홈`}
      style={{ width: 260, height: 35, boxSizing: 'border-box' }} />
  );
}

/** 크롤링 설명 문구 (v2.0 사용자 요청) — 카톡·디스코드 등 링크 공유 시 제목 아래 뜨는 설명줄.
 *  탭 제목과 같은 자리(디자인 탭)에 바로 이어서 둔다 */
function CrawlDescControl() {
  const { site, set } = useSiteDraft();
  return (
    <LiveInput value={site.crawlDesc ?? ''} onValue={v => set({ crawlDesc: v })}
      placeholder="자캐놀이용 개인 아카이브"
      style={{ width: 260, height: 35, boxSizing: 'border-box' }} />
  );
}

/** 사이트 이미지 한 칸 — 업로드·주소 붙여넣기·제거 (드래프트/SAVE 흐름).
 *  브라우저 탭 아이콘(v2.0)과 로고 이미지 PC/모바일(v2.2 사용자 요청)이 같은 모양을 쓴다 */
function SiteImageControl({ field, accept, emptyText, failText, wide }: {
  field: 'favicon' | 'logoImage' | 'logoImageM';
  accept: string; emptyText: string; failText: string; wide?: boolean;
}) {
  const { site, set } = useSiteDraft();
  const toast = useToast();
  const ref = site[field];
  const url = useBlobUrl(ref);
  const imageSource = useImageSource(url => set({ [field]: url }));
  const inputId = `siteImg-${field}`;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} tabIndex={0}
      onDragOver={e => e.preventDefault()} {...imageSource.handlers}>
      <span style={{
        width: wide ? 110 : 35, height: 35, borderRadius: 'var(--radius-s)', border: '1px solid var(--line)',
        background: wide ? 'var(--top-bg)' : 'var(--panel)', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 10, color: 'var(--faint)' }}>{emptyText}</span>}
      </span>
      <input id={inputId} type="file" accept={accept}
        style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          // 올리기가 막히면 아무 말 없이 끝나지 않게 (v2.0 — 프로필 사진에서 겪은 것과 같은 이유)
          try { set({ [field]: await putBlob(f) }); } catch (err) {
            toast(`${failText}을(를) 저장소에 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`);
          }
        }} />
      <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
        onClick={() => document.getElementById(inputId)?.click()}>
        {ref ? 'CHANGE' : 'UPLOAD'}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => imageSource.open()}>🔗 URL</button>
      {ref && (
        <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
          onClick={() => set({ [field]: undefined })}>REMOVE</button>
      )}
      {imageSource.element}
    </div>
  );
}

/** 브라우저 탭 아이콘 (v2.0 사용자 요청) — 지정 전에는 기본 아이콘(배포 기본값)이 뜬다. */
function FaviconControl() {
  return <SiteImageControl field="favicon" emptyText="기본" failText="아이콘"
    accept="image/png,image/x-icon,image/svg+xml,image/webp,.ico" />;
}

/** PC 2단형 메뉴 카드 모양 (v3.0 사용자 요청) — 5종 중 하나. 디자인 탭 SAVE로 저장 (사이트 드래프트) */
function MenuCardRow() {
  const { site, set } = useSiteDraft();
  const cur = site.mCard ?? 'basic';
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>메뉴 카드 모양</b><small>PC 2단형에서 쓰는 메뉴 카드의 꾸밈 — 색은 상단메뉴·하위메뉴 드롭다운·포인트 컬러를 따름 · 1단형과 모바일에는 영향 없음</small></div>
      <div className="mnav-opts mcard-opts" role="radiogroup" aria-label="메뉴 카드 모양">
        {MENU_CARD_STYLES.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={cur === o.value}
            className={`mnav-opt ${cur === o.value ? 'on' : ''}`} title={o.desc}
            onClick={() => set({ mCard: o.value })}>
            <span className={`mnav-th mcard-th mcard-th-${o.value}`} aria-hidden><i /><i /><i /><i /><i /></span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 모바일 메뉴 모양 (v2.9 사용자 요청) — 휴대폰 ≡ 패널 4종 중 하나. 디자인 탭 SAVE로 저장 (사이트 드래프트) */
function MobileNavRow() {
  const { site, set } = useSiteDraft();
  const cur = site.mNav ?? 'accordion';
  return (
    <>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>모바일 메뉴</b><small>휴대폰에서 ≡를 눌렀을 때 열리는 메뉴 모양 — 색은 하위메뉴 드롭다운, 강조는 포인트 컬러를 따름 · 게시판 메뉴에는 글 수 표시</small></div>
        <div className="mnav-opts" role="radiogroup" aria-label="모바일 메뉴 모양">
          {MOBILE_NAV_STYLES.map(o => (
            <button key={o.value} type="button" role="radio" aria-checked={cur === o.value}
              className={`mnav-opt ${cur === o.value ? 'on' : ''}`} title={o.desc}
              onClick={() => set({ mNav: o.value })}>
              <span className={`mnav-th mnav-th-${o.value}`} aria-hidden><i /><i /><i /><i /><i /></span>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {cur === 'cover' && <MobileNavCovers />}
    </>
  );
}

/** Cover 모양의 상위 메뉴별 커버 이미지 — 메뉴 트리 그룹(하위가 있는 상위 메뉴)마다 하나. 비우면 이름만 표시 */
function MobileNavCovers() {
  const { site, set } = useSiteDraft();
  const [ms] = useMenuSettings();
  const groups = (ms.tree ?? defaultTree()).filter(g => !g.href);
  const setCover = (id: string, ref: string | undefined) => {
    const next = { ...(site.mNavCovers ?? {}) };
    if (ref) next[id] = ref; else delete next[id];
    set({ mNavCovers: next });
  };
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>모바일 메뉴 커버</b><small>Cover 모양에서 상위 메뉴를 고르면 오른쪽 위에 깔리는 이미지 — 가로로 긴 사진 권장 · 비워 두면 메뉴 이름만 크게 표시 · 다른 모양으로 바꿔도 지우지 않고 보관</small></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'flex-end', flex: 1 }}>
        {groups.length === 0 && <small style={{ color: 'var(--faint)' }}>하위 메뉴가 있는 상위 메뉴가 없습니다</small>}
        {groups.map(g => (
          <CoverPick key={g.id} label={g.label} value={site.mNavCovers?.[g.id]} onChange={ref => setCover(g.id, ref)} />
        ))}
      </div>
    </div>
  );
}

function CoverPick({ label, value, onChange }: { label: string; value?: string; onChange: (ref: string | undefined) => void }) {
  const toast = useToast();
  const url = useBlobUrl(value);
  const imageSource = useImageSource(u => onChange(u));
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'grid', gap: 5, justifyItems: 'center' }} onDragOver={e => e.preventDefault()} {...imageSource.handlers}>
      <button type="button" onClick={() => inputRef.current?.click()} title={`${label} 커버 ${value ? '바꾸기' : '올리기'}`}
        style={{
          width: 96, height: 56, borderRadius: 'var(--radius-s)', border: `1px ${url ? 'solid' : 'dashed'} var(--line)`,
          background: url ? `center/cover no-repeat url("${url}")` : 'var(--panel)', display: 'grid', placeItems: 'center',
          color: 'var(--faint)', fontSize: 16, cursor: 'pointer',
        }}>{url ? '' : '＋'}</button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { onChange(await putBlob(f)); } catch (err) {
            toast(`커버 이미지를 저장소에 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`);
          }
        }} />
      <small style={{ fontSize: 11, maxWidth: 96, textAlign: 'center', wordBreak: 'break-word' }}>{label}</small>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn btn-ghost" style={{ height: 24, padding: '0 8px', fontSize: 10 }} onClick={() => imageSource.open()}>🔗 URL</button>
        {value && (
          <button type="button" className="btn btn-ghost" style={{ height: 24, padding: '0 8px', fontSize: 10 }} onClick={() => onChange(undefined)}>REMOVE</button>
        )}
      </div>
      {imageSource.element}
    </div>
  );
}

/** 로고 이미지 (v2.2 사용자 요청) — 텍스트 로고가 좁은 화면에서 잘릴 때 대신 쓰는 이미지. PC/모바일 따로 */
function LogoImageControls() {
  const accept = 'image/png,image/svg+xml,image/webp,image/jpeg,image/gif';
  // PC / 모바일 두 줄 — 라벨 열을 맞춘다 (v3.2 사용자 요청)
  return (
    <Ctl>
      <Item label="PC">
        <SiteImageControl field="logoImage" wide emptyText="텍스트 로고" failText="로고 이미지" accept={accept} />
      </Item>
      <Item label="모바일">
        <SiteImageControl field="logoImageM" wide emptyText="PC와 같음" failText="로고 이미지" accept={accept} />
      </Item>
    </Ctl>
  );
}

function LogoControls() {
  // 드래프트로만 반영 (v1.9) — 미리보기 즉시, 저장은 디자인 탭 SAVE에서
  const { site, set } = useSiteDraft();
  // 로고 / 서브타이틀 / 정렬 — 라벨 열을 맞춘 세 줄 (v3.2 사용자 요청)
  return (
    <>
      {/* 로고 문구도 드래프트를 거쳐 되돌아오므로 한글 조합에 안전한 인풋으로 */}
      <Item label="로고">
        <LiveInput value={site.title} onValue={v => set({ title: v })}
          className="ctl-text" style={{ height: 35, boxSizing: 'border-box' }} />
      </Item>
      <Item label="서브">
        <LiveInput value={site.subtitle} onValue={v => set({ subtitle: v })}
          className="ctl-text" style={{ height: 35, boxSizing: 'border-box' }} />
      </Item>
      <Item label="정렬">
        <KSelect minWidth={88} value={site.align}
          onChange={v => set({ align: v as typeof site.align })}
          options={[{ value: 'left', label: '왼쪽' }, { value: 'center', label: '가운데' }, { value: 'right', label: '오른쪽' }]} />
      </Item>
    </>
  );
}

/** 데이터 백업 탭 (5.2) — 백업(데이터만/회원까지) · 복원 · 선택 초기화 (v1.9 사용자 확정) */
function DataPane() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [resetOpen, setResetOpen] = useState(false);   // 초기화 항목 선택 모달 (v1.9)
  const [resetAsk, setResetAsk] = useState(false);     // 최종 확인
  const [picked, setPicked] = useState<string[]>([]);  // 선택한 초기화 그룹
  const [pushing, setPushing] = useState(false);       // 설정 서버 업로드 중 (v2.0)
  const serverOn = isServerMode();
  // 서버에 아직 없는 로컬 설정 — 로컬로 먼저 꾸민 뒤 서버를 붙인 경우에만 생긴다.
  // 보통의 설치(연결 먼저)에서는 설정이 바뀔 때마다 서버로 나가므로 이 줄 자체가 뜨지 않는다.
  const [unsynced, setUnsynced] = useState<string[]>([]);
  useEffect(() => { setUnsynced(unsyncedSettingKeys()); }, []);

  // 사용하지 않는 이미지 정리 (v2.0) — 글을 지워도 저장소에는 파일이 남는다.
  // 같은 이미지를 다른 글이 쓰고 있을 수 있어 자동 삭제는 위험하므로, 훑어서 보여 주고 관리자가 지운다.
  const [orphans, setOrphans] = useState<{ ref: string; size: number }[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleanAsk, setCleanAsk] = useState(false);
  const orphanMB = (orphans ?? []).reduce((s, f) => s + f.size, 0) / 1048576;

  const scanOrphans = async () => {
    const be = backend();
    if (!be) { toast('서버에 연결돼 있지 않습니다'); return; }
    setScanning(true);
    try {
      const rows = await findOrphanFiles(be);
      setOrphans(rows);
      toast(rows.length ? `쓰지 않는 이미지 ${rows.length}개를 찾았습니다` : '정리할 이미지가 없습니다');
    } catch (e) {
      // 멈춘 이유를 그대로 보여 준다 (v2.0) — 「권한 문제」로 뭉뚱그리면 진짜 원인을 놓친다
      toast(e instanceof Error && e.message
        ? e.message
        : '이미지 목록을 읽지 못했습니다 — 저장소 권한(규칙)을 확인해 주세요');
    }
    setScanning(false);
  };

  const cleanOrphans = async () => {
    const be = backend();
    if (!be || !orphans) return;
    setScanning(true);
    let n = 0;
    for (const f of orphans) {
      try { await be.deleteFile(f.ref); n += 1; } catch { /* 개별 실패는 건너뜀 */ }
    }
    setOrphans(null);
    setScanning(false);
    toast(`이미지 ${n}개를 지웠습니다`);
  };

  // 이 브라우저에 저장돼 있던 사이트 설정을 서버로 올린다 (연결 직후 1회면 충분)
  const doPush = async () => {
    setPushing(true);
    try {
      // 콘텐츠 키(글 목록 등)가 설정 테이블로 들어가지 않게 설정 키 목록만 올린다
      const n = await withSettingDraftPaused(() => pushLocalSettings(SETTING_KEYS));
      toast(n > 0 ? `설정 ${n}건을 서버에 올렸습니다 — 방문자에게도 같은 모습으로 보입니다` : '올릴 설정이 없습니다');
      setUnsynced(unsyncedSettingKeys());
    } catch {
      toast('설정 업로드에 실패했습니다 — 관리자 계정으로 로그인했는지 확인해 주세요');
    }
    setPushing(false);
  };
  const toggle = (k: string, v: boolean) => setPicked(p => (v ? [...new Set([...p, k])] : p.filter(x => x !== k)));

  /* ---------- 데이터베이스 이전 (v2.0) — 다른 프로젝트/다른 서비스로 통째 옮기기 ---------- */
  const [migOpen, setMigOpen] = useState(false);
  const [migKind, setMigKind] = useState<BackendKind>('supabase');
  const [migSb, setMigSb] = useState({ url: '', anonKey: '' });
  const [migFb, setMigFb] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '' });
  const [migState, setMigState] = useState<'idle' | 'checking' | 'ready' | 'running' | 'done'>('idle');
  const [migMsg, setMigMsg] = useState('');

  const migCfg = (): BackendConfig => (migKind === 'firebase'
    ? {
        kind: 'firebase',
        apiKey: migFb.apiKey.trim(),
        authDomain: migFb.authDomain.trim() || `${migFb.projectId.trim()}.firebaseapp.com`,
        projectId: migFb.projectId.trim(),
        storageBucket: migFb.storageBucket.trim() || `${migFb.projectId.trim()}.appspot.com`,
        appId: migFb.appId.trim(),
      }
    : { kind: 'supabase', url: migSb.url.trim(), anonKey: migSb.anonKey.trim() });

  const migCheck = async () => {
    const bad = validateConfig(migCfg());
    if (bad) { setMigMsg(bad); setMigState('idle'); return; }
    setMigState('checking'); setMigMsg('');
    try {
      const be = await createBackend(migCfg());
      const r = await be.check();
      setMigMsg(r.message);
      setMigState(r.ok ? 'ready' : 'idle');
    } catch (e) {
      setMigMsg(`연결에 실패했습니다 — ${(e as { message?: string })?.message ?? ''}`);
      setMigState('idle');
    }
  };

  const migRun = async () => {
    setMigState('running');
    try {
      const target = await createBackend(migCfg());
      // 저장 안 한 설정이 섞여 가지 않게 드래프트를 잠시 걷고 실제 값으로 (v3.1)
      const r = await withSettingDraftPaused(() => migrateTo(target, (m, done, total) => {
        setMigMsg(total ? `${m} (${done}/${total})` : m);
      }));
      setMigMsg(`이전 완료 — 항목 ${r.items}건 · 이미지 ${r.files}개. 아래 설정 파일을 저장소에 올리면 방문자도 새 DB를 봅니다.`);
      setMigState('done');
    } catch (e) {
      setMigMsg(`이전에 실패했습니다 — ${(e as { message?: string })?.message ?? ''}`);
      setMigState('ready');
    }
  };

  const migDownloadConfig = () => {
    const blob = new Blob([configFileText(migCfg())], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  const migSwitch = () => {
    saveLocalConfig(migCfg());
    toast('새 데이터베이스로 전환합니다 — 새로고침');
    setTimeout(() => window.location.reload(), 700);
  };

  const doExport = async (includeMembers: boolean) => {
    setBusy(true);
    try {
      const { blob, dataCount, blobCount } = await withSettingDraftPaused(() => exportBackup(includeMembers));
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `ohome-backup${includeMembers ? '-with-members' : ''}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(u);
      toast(`백업 완료 — 데이터 ${dataCount}건 · 이미지 ${blobCount}개${includeMembers ? ' · 회원 포함' : ''}`);
    } catch {
      toast('백업 생성에 실패했습니다');
    }
    setBusy(false);
  };

  const doImport = async () => {
    if (!importFile) return;
    setBusy(true);
    try {
      await withSettingDraftPaused(() => importBackup(importFile));
      toast('복원 완료 — 새로고침합니다');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast('복원에 실패했습니다 — 파일을 확인해 주세요');
      setBusy(false);
    }
  };

  return (
    <div className="set-sec">
      <div className="d">여기 있는 작업은 [저장]과 상관없이 누르는 즉시 실행됩니다 · 글·자관·로그 등 모든 데이터(JSON)와 이미지 전부를 zip 하나로 — 다른 브라우저/PC 이전용</div>

      {/* 로컬로 먼저 꾸민 뒤 서버를 붙인 경우에만 — 서버에 없는 설정이 남아 있을 때만 나타난다 (v2.0) */}
      {serverOn && unsynced.length > 0 && (
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <div className="l"><b>서버에 올리지 않은 설정 {unsynced.length}건</b><small>서버를 붙이기 전에 이 브라우저에서 꾸민 설정입니다 — 올려야 방문자에게도 같은 모습으로 보입니다</small></div>
          <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: pushing ? 0.5 : 1 }}
            disabled={pushing} onClick={doPush}>{pushing ? '올리는 중…' : '↑ 설정 올리기'}</button>
        </div>
      )}
      {/* 쓰지 않는 이미지 정리 (v2.0) — 글을 지워도 저장소 파일은 남는다 */}
      {serverOn && (
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <div className="l"><b>쓰지 않는 이미지 정리</b>
            <small>글을 지워도 이미지는 저장소에 남습니다 — 어디에서도 쓰지 않는 파일만 골라 지웁니다</small></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {orphans && (
              <span className="hint">
                {orphans.length > 0 ? `${orphans.length}개 · ${orphanMB.toFixed(1)}MB` : '정리할 것 없음'}
              </span>
            )}
            <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: scanning ? 0.5 : 1 }}
              disabled={scanning} onClick={scanOrphans}>{scanning ? '확인 중…' : '찾아보기'}</button>
            {orphans && orphans.length > 0 && (
              <button className="btn btn-accent" style={{ padding: '9px 18px', opacity: scanning ? 0.5 : 1 }}
                disabled={scanning} onClick={() => setCleanAsk(true)}>{orphans.length}개 지우기</button>
            )}
          </div>
        </div>
      )}
      {/* 백업 두 갈래 (v1.9 사용자 확정) — 회원 계정 포함 여부 선택 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>백업 내보내기</b><small>글·자관·설정 + 이미지 → zip · 회원 계정(가입자·가입코드) 포함 여부 선택</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-accent" style={{ padding: '9px 18px', opacity: busy ? 0.5 : 1 }}
            disabled={busy} onClick={() => doExport(false)}>↓ 데이터만</button>
          <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: busy ? 0.5 : 1 }}
            disabled={busy} onClick={() => doExport(true)}>↓ 회원까지</button>
        </div>
      </div>
      {/* Firebase Storage는 다른 주소에서 파일을 읽는 것을 기본적으로 막는다 —
          홈에서 보는 데는 지장이 없지만 백업·이전은 파일을 직접 받아와야 해서 한 번 열어 줘야 한다 */}
      {serverOn && backend()?.kind === 'firebase' && (
        <p className="hint" style={{ margin: '10px 0 16px' }}>
          Firebase는 <b>저장소 CORS를 한 번 열어야</b> 백업 zip에 이미지가 담깁니다 — 안 하면 글·설정만 담깁니다.
          설치 가이드의 「백업」 항목에 브라우저에서 끝내는 방법이 있습니다.
        </p>
      )}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>백업 가져오기 (복원)</b><small>현재 데이터를 백업 내용으로 덮어씁니다 — 복원 후 자동 새로고침</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input id="bkImport" type="file" accept=".zip" style={{ display: 'none' }}
            onChange={e => { setImportFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
            onClick={() => document.getElementById('bkImport')?.click()}>
            {importFile ? importFile.name : '파일 선택'}
          </button>
          {importFile && (
            <button className="btn btn-dark" style={{ padding: '0 18px', fontSize: 11, opacity: busy ? 0.5 : 1 }}
              disabled={busy} onClick={doImport}>RESTORE</button>
          )}
        </div>
      </div>

      {/* 데이터베이스 이전 (v2.0) — 새 프로젝트·다른 서비스로 통째 옮기기 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>데이터베이스 이전</b><small>다른 프로젝트나 다른 서비스(Supabase ↔ Firebase)로 글·설정·이미지를 통째로 옮깁니다</small></div>
        <button className="btn btn-ghost" style={{ padding: '9px 20px' }}
          onClick={() => { setMigOpen(true); setMigState('idle'); setMigMsg(''); }}>이전하기</button>
      </div>

      <Modal open={migOpen} onClose={() => setMigOpen(false)} title="데이터베이스 이전"
        desc="옮길 곳의 연결 정보를 넣고 확인한 뒤 시작합니다 — 지금 데이터는 그대로 두고 복사합니다"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMigOpen(false)}>CLOSE</button>
          {migState === 'ready' && <button className="btn btn-accent" onClick={migRun}>이전 시작</button>}
          {migState === 'done' && <button className="btn btn-accent" onClick={migSwitch}>새 DB로 전환</button>}
        </>}>
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          <button className={migKind === 'supabase' ? 'on' : ''} onClick={() => setMigKind('supabase')}>Supabase</button>
          <button className={migKind === 'firebase' ? 'on' : ''} onClick={() => setMigKind('firebase')}>Firebase</button>
        </div>

        {migKind === 'supabase' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="k-label">Project URL</label>
            <KInput value={migSb.url} onChange={e => setMigSb(s => ({ ...s, url: e.target.value }))} placeholder="https://xxxx.supabase.co" />
            <label className="k-label">anon public key</label>
            <KInput value={migSb.anonKey} onChange={e => setMigSb(s => ({ ...s, anonKey: e.target.value }))} />
            <p className="hint" style={{ margin: 0 }}>새 프로젝트라면 먼저 스키마 SQL을 실행해 두세요 — 설치 화면과 같은 내용입니다.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="k-label">설정 붙여넣기 (firebaseConfig)</label>
            <KTextarea style={{ minHeight: 84, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }}
              onChange={e => {
                const v = parseFirebaseSnippet(e.target.value);
                if (v) setMigFb(f => ({
                  apiKey: v.apiKey ?? f.apiKey, authDomain: v.authDomain ?? f.authDomain,
                  projectId: v.projectId ?? f.projectId, storageBucket: v.storageBucket ?? f.storageBucket,
                  appId: v.appId ?? f.appId,
                }));
              }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label className="k-label">apiKey</label><KInput value={migFb.apiKey} onChange={e => setMigFb(f => ({ ...f, apiKey: e.target.value }))} /></div>
              <div><label className="k-label">projectId</label><KInput value={migFb.projectId} onChange={e => setMigFb(f => ({ ...f, projectId: e.target.value }))} /></div>
            </div>
            <div><label className="k-label">appId</label><KInput value={migFb.appId} onChange={e => setMigFb(f => ({ ...f, appId: e.target.value }))} /></div>
            <p className="hint" style={{ margin: 0 }}>새 프로젝트라면 Firestore·Storage 보안 규칙을 먼저 붙여넣어 두세요.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11 }}
            disabled={migState === 'checking' || migState === 'running'} onClick={migCheck}>
            {migState === 'checking' ? '확인 중…' : '연결 확인'}
          </button>
          {migState === 'done' && (
            <button className="btn btn-ghost" style={{ height: 33, padding: '0 14px', fontSize: 11 }}
              onClick={migDownloadConfig}>ohome.config.json 내려받기</button>
          )}
        </div>
        {migMsg && (
          <p className={migState === 'done' || migState === 'ready' ? 'setup-ok' : 'setup-err'} style={{ marginTop: 10 }}>
            {migMsg}
          </p>
        )}
      </Modal>

      {/* 선택 초기화 (v1.9 사용자 확정) — 메뉴별 체크 + 사이트 설정·이미지·회원 계정 별도 선택 */}
      <div className="set-row">
        <div className="l"><b>초기화</b><small>지울 항목을 골라서 — 메뉴별 데이터 / 사이트 설정 / 이미지 / 회원 계정 (복구 불가, 백업을 먼저 내보내 두세요)</small></div>
        <button className="btn btn-ghost" style={{ padding: '9px 20px', color: 'var(--accent)' }}
          onClick={() => { setPicked([]); setResetOpen(true); }}>RESET</button>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="초기화할 항목 선택"
        desc="체크한 항목만 삭제됩니다 — 회원 계정을 빼면 가입 회원·관리자 계정은 그대로 유지됩니다"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setResetOpen(false)}>CANCEL</button>
          <button className="btn btn-accent" disabled={picked.length === 0}
            style={{ opacity: picked.length === 0 ? 0.45 : 1 }}
            onClick={() => { setResetOpen(false); setResetAsk(true); }}>선택 항목 초기화</button>
        </>}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
            onClick={() => setPicked(RESET_CONTENT.map(g => g.key))}>메뉴 데이터 전체</button>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
            onClick={() => setPicked([...RESET_CONTENT, ...RESET_EXTRA].map(g => g.key))}>전부 선택</button>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, marginLeft: 'auto' }}
            onClick={() => setPicked([])}>전부 해제</button>
        </div>
        <label className="k-label">메뉴별 데이터</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '6px 0 4px' }}>
          {RESET_CONTENT.map(g => (
            <KCheck key={g.key} label={g.label} checked={picked.includes(g.key)}
              onChange={v => toggle(g.key, v)} />
          ))}
        </div>
        <div style={{ height: 1, background: 'var(--line)', margin: '14px 0 12px' }} />
        <div style={{ display: 'grid', gap: 9 }}>
          {RESET_EXTRA.map(g => (
            <KCheck key={g.key} checked={picked.includes(g.key)} onChange={v => toggle(g.key, v)}
              label={<span>
                <b style={{ fontSize: 12.5 }}>{g.label}</b>{' '}
                <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{g.desc}</small>
              </span>} />
          ))}
        </div>
      </Modal>

      <ConfirmModal open={cleanAsk} title={`쓰지 않는 이미지 ${orphans?.length ?? 0}개를 지울까요?`}
        body={`저장소에서 ${orphanMB.toFixed(1)}MB를 비웁니다. 지금 글·자관·설정 어디에서도 참조하지 않는 파일만 골랐지만, 지운 파일은 복구할 수 없습니다. 걱정되면 먼저 백업을 받아 두세요.`}
        onClose={() => setCleanAsk(false)}
        buttons={[
          { label: '지우기', kind: 'accent', onClick: () => { setCleanAsk(false); void cleanOrphans(); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setCleanAsk(false) },
        ]} />

      <ConfirmModal open={resetAsk} title="선택한 항목을 초기화할까요?"
        body={`지울 항목: ${[...RESET_CONTENT, ...RESET_EXTRA].filter(g => picked.includes(g.key)).map(g => g.label).join(' · ')}\n삭제한 내용은 복구할 수 없습니다.`}
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: '초기화', kind: 'accent', onClick: () => {
            // 서버 모드에서는 DB에서도 지우므로 끝난 뒤에 새로고침 (v2.0)
            setResetAsk(false);
            toast('초기화하는 중…');
            void withSettingDraftPaused(() => resetGroups(picked))
              .then(r => {
                // 실패를 숨기면 "지웠다"고 나오는데 서버에는 그대로 남는다 — 건수를 그대로 알린다
                if (r.failed.length) {
                  toast(`${r.failed.length}건을 서버에서 지우지 못했습니다 — 로그인·보안 규칙을 확인해 주세요`);
                } else if (serverOn) {
                  const part = [`글 ${r.rows}건`];
                  if (r.files) part.push(`이미지 ${r.files}개`);
                  if (r.members) part.push(`회원 ${r.members}명`);
                  toast(`서버에서 ${part.join(' · ')}를 지웠습니다${r.members ? ' (로그인 계정은 콘솔에서 지워 주세요)' : ''}`);
                } else {
                  toast('선택한 항목을 초기화했습니다 — 새로고침합니다');
                }
              })
              .catch(() => { toast('초기화에 실패했습니다 — 로그인 상태를 확인해 주세요'); })
              .finally(() => setTimeout(() => window.location.reload(), 1400));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
    </div>
  );
}

/** 멤버 선택 모달 (v2.0 사용자 요청) — 「비로그인 숨김」 메뉴를 특정 회원에게만.
 *  검색으로 걸러 체크하고, 비우면 지금까지처럼 로그인한 모든 회원. 관리자는 항상 볼 수 있어 목록에 없다 */
function MemberPickModal({ initial, onApply, onClose, desc }: {
  initial: string[]; onApply: (ids: string[]) => void; onClose: () => void;
  desc?: string;   // 무엇에 대한 선택인지 — 노출 제한/글쓰기 권한이 같은 모달을 쓴다 (v2.0)
}) {
  const pool = useMembers().filter(p => p.id !== 'admin' && p.role !== 'admin');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(initial);
  const t = q.trim().toLowerCase();
  const list = pool.filter(p => !t || p.nickname.toLowerCase().includes(t) || p.id.toLowerCase().includes(t));
  return (
    <Modal open small title="멤버 선택" onClose={onClose}
      desc={desc ?? '체크한 회원(그리고 관리자)에게만 이 메뉴가 보이고 열립니다 — 비우면 로그인한 모든 회원'}
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn btn-accent" onClick={() => { onApply(sel); onClose(); }}>적용</button>
      </>}>
      <div style={{ display: 'grid', gap: 9 }}>
        <KInput placeholder="닉네임·아이디 검색" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ maxHeight: 240, overflow: 'auto', display: 'grid', gap: 4, alignContent: 'start' }}>
          {list.map(p => (
            <KCheck key={p.id}
              label={<span style={{ fontSize: 12.5 }}>{p.nickname} <small style={{ color: 'var(--faint)' }}>{p.id}</small></span>}
              checked={sel.includes(p.id)}
              onChange={v => setSel(s => (v ? [...s, p.id] : s.filter(x => x !== p.id)))} />
          ))}
          {list.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              {pool.length === 0 ? '가입한 회원이 없습니다' : '검색과 일치하는 회원이 없습니다'}
            </p>
          )}
        </div>
        {/* 탈퇴 등으로 목록에 없는 선택이 남아 있으면 알려 준다 — 몰래 남아 계속 잠그는 일이 없게 */}
        {sel.some(id => !pool.some(p => p.id === id)) && (
          <p className="hint" style={{ margin: 0 }}>
            회원 목록에 없는 선택 {sel.filter(id => !pool.some(p => p.id === id)).length}건이 있습니다 — 적용하면 그대로 유지됩니다
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 메뉴 관리 탭 (5.2 — 메뉴 선택제) — 노출·순서·이름 + 메뉴별 부속 설정 */
function MenuPane() {
  const [ms, patch, msLoaded] = useMenuSettings();
  // 글에도 적용 (v2.0 사용자 요청) — 아래 applyVis 참조
  const { user } = useAuth();
  const [visBusy, setVisBusy] = useState(false);
  const [visAsk, setVisAsk] = useState(false);
  // 멤버 선택 모달 (v2.0 사용자 요청) — 「비로그인 숨김」·갤러리 글쓰기를 특정 회원으로 좁힌다
  const [memAsk, setMemAsk] = useState<{ ids: string[]; apply: (ids: string[]) => void; desc?: string } | null>(null);
  const { boards, loaded: bLoaded, patchBoard } = useBoards();  // 추가 게시판 이름·자동 편입 동기화 + 권한
  const toast = useToast();
  const del = useConfirmDelete();
  const saved = ms.tree ?? defaultTree();
  // 게시판 + 여러 개로 만든 섹션 — 메뉴가 아는 「추가 항목」 전체 (v2.0)
  const { map: secMap } = useSections();
  const { links, setLinks } = useCustomLinks();   // 커스텀 링크 (v2.0 사용자 요청)
  // 새 커스텀 링크 입력 폼 (v2.0 사용자 제보 — 「주소를 적으면 이름 짓기 전에 올라간다」).
  // 예전에는 ADD가 빈 행을 즉시 등록해, 주소를 치는 순간 미배치에 미완성 링크가 나타났다
  const [nlName, setNlName] = useState('');
  const [nlHref, setNlHref] = useState('');
  /* 미배치 기능·커스텀 링크는 평소 접어 둔다 (v3.3 사용자 요청) — 제목·설명만 보이고 목록·폼은 펼칠 때 */
  const [unOpen, setUnOpen] = useState(false);
  const [lnOpen, setLnOpen] = useState(false);
  const extraAll = [...boardEntries(boards), ...sectionMenuEntries(secMap), ...linkEntries(links)];
  const defLabel = (href: string) => menuLabelFor(href, extraAll) ?? href;

  // 드래프트 — 모든 편집(삭제 포함)은 SAVE를 눌러야 실제 메뉴에 반영 (v1.9 사용자 피드백)
  const [draft, setDraft] = useState<MenuGroupNode[] | null>(null);
  const [draftRemoved, setDraftRemoved] = useState<string[] | null>(null);
  const tree = draft ?? saved;
  const removed = draftRemoved ?? ms.removedBoards;
  const dirty = draft !== null && (
    JSON.stringify(draft) !== JSON.stringify(saved)
    || JSON.stringify(removed) !== JSON.stringify(ms.removedBoards));
  // 저장본이 바뀌면(정규화·다른 탭) 편집 전 상태에서만 드래프트 갱신
  const savedKey = JSON.stringify([saved, ms.removedBoards]);
  useEffect(() => {
    if (!msLoaded || !bLoaded) return;
    if (!dirty) { setDraft(saved); setDraftRemoved(ms.removedBoards); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, msLoaded, bLoaded]);

  const setTree = (t: MenuGroupNode[]) => setDraft(t);
  // 저장 = 맨 위 [저장] (아래 useSavePart). 메뉴 공개범위를 바꾸면 저장 뒤 이미 올라간 글에도 바로 적용한다
  // (보안 검토) — 예전엔 「글에도 적용」을 따로 눌러야 했고, 잊으면 비공개로 바꾼 메뉴의 글이 서버에선 계속 공개였다

  /* 이미 올라간 글의 공개범위를 서버에 적용 (v2.0 사용자 요청).
     화면에서 가리는 것만으로는 API를 직접 부르는 사람에게 그대로 보인다 — 서버(RLS)가
     내주지 않게 하려면 행의 공개범위 칸 자체가 좁아야 한다.
     컬렉션을 하나씩 훑어 **비공개 메뉴에 걸린 것만** 골라 그 칸만 갱신한다(내용·순서는 그대로).
     새 글은 저장할 때마다 같은 기준이 자동으로 걸리므로(visFloor) 이 버튼은 **이미 있는 글**용이다. */
  const applyVis = async (quiet = false) => {
    const be = backend();
    if (!be) { toast('서버에 연결돼 있지 않습니다 — 브라우저 저장 모드에는 서버 권한 자체가 없습니다'); return; }
    setVisBusy(true);
    try {
      // 댓글은 달린 글의 공개범위를 따른다 — 그 기준(targetVis)부터 새 메뉴 설정으로 다시 계산
      await resyncCommentMeta(be, user?.id ?? null);
      let n = 0;
      for (const coll of CONTENT_COLLECTIONS) {
        const rows = await be.fetchList(coll);
        const targets = rows.filter(r => visFloorOf(coll, r) !== 'public');
        if (targets.length) n += await be.refreshVis(coll, targets, user?.id ?? null);
      }
      if (!quiet) toast(n ? `글 ${n}건을 서버에서도 가렸습니다` : '비공개로 둔 메뉴에 글이 없습니다');
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : '적용하지 못했습니다');
    }
    setVisBusy(false);
  };
  const revert = () => { setDraft(saved); setDraftRemoved(ms.removedBoards); };

  /* 저장은 화면 맨 위 [저장] 하나로 (v3.1 사용자 요청) — 메뉴 편집본은 이 화면이 들고 있으므로
     [저장]·[되돌리기]·나가기 확인이 이 편집본까지 함께 다루도록 맡긴다.
     공개범위 변경은 저장이 끝난 뒤 이미 올라간 글에도 적용한다*/
  useSavePart('menu', {
    group: 'content', dirty,
    save: () => patch({ tree, removedBoards: removed }),
    after: () => { if (backend()) void applyVis(true); },
    discard: revert,
  });
  const [resetAsk, setResetAsk] = useState(false);   // 기본 구성 리셋 확인 모달
  const [mtab, setMtab] = useState<'basic' | 'perm'>('basic');   // 기본(구성) / 권한 탭 (v1.9)

  /* 트리 정규화(저장본 대상) — 사라진 기능(삭제된 게시판) 제거.
     **새로 만든 것을 자동으로 넣지는 않는다** (v2.0 사용자 확정) — 미배치에 머물게 둔다 */
  useEffect(() => {
    if (!msLoaded || !bLoaded) return;
    let next: MenuGroupNode[] = saved
      .map(g => (g.href
        ? (menuLabelFor(g.href, extraAll) === null ? null : g)
        : { ...g, items: g.items.filter(it => menuLabelFor(it.href, extraAll) !== null) }))
      .filter((g): g is MenuGroupNode => !!g);
    if (JSON.stringify(next) !== JSON.stringify(saved)) patch({ tree: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msLoaded, bLoaded, boards, ms.tree]);

  // 미배치 = 트리에 없는 기능 — 메뉴에 노출되지 않음 (데이터는 보존)
  const placedSet = new Set(tree.flatMap(g => (g.href ? [g.href] : g.items.map(i => i.href))));
  const unplaced = [
    ...FEATURES.filter(f => !placedSet.has(f.href)),
    // 게시판·갤러리·다이어리 등 여러 개로 만든 것도 여기 뜬다 (v2.0 사용자 요청).
    // 자동 배치를 없앴으므로 **만들면 여기 머문다** — 원하는 상위 메뉴에 직접 넣는다
    ...extraAll.map(b => ({ href: b.href, label: b.name })).filter(x => !placedSet.has(x.href)),
  ];

  const patchGroup = (id: string, p: Partial<MenuGroupNode>) =>
    setTree(tree.map(g => (g.id === id ? { ...g, ...p } : g)));
  // 배치 해제 시 게시판이면 자동 편입 제외 목록에 (다시 배치하면 해제) — 드래프트에만
  const markRemoved = (hrefs: string[]) => {
    // 추가 항목(게시판·섹션)은 빼 두면 자동 배치가 다시 넣지 않도록 기억한다 —
    // 기억하지 않으면 빼는 순간 자동 배치가 원래 자리로 되돌려 놓는다
    const known = new Set(extraAll.map(b => b.href));
    const bs = hrefs.filter(h => known.has(h));
    if (bs.length) setDraftRemoved([...new Set([...removed, ...bs])]);
  };
  const removeGroup = (g: MenuGroupNode) => {
    setTree(tree.filter(x => x.id !== g.id));
    markRemoved(g.href ? [g.href] : g.items.map(i => i.href));
  };
  // 삭제는 경고 모달을 거친 뒤 드래프트에 반영 — SAVE를 눌러야 실제 메뉴에서 사라짐
  const askRemoveGroup = (g: MenuGroupNode) => del.ask(
    g.href ? `단독 메뉴 「${g.label}」를 메뉴에서 빼시겠습니까?` : `상위 메뉴 「${g.label}」를 삭제하시겠습니까?`,
    () => removeGroup(g),
    `${g.href ? '이 기능은' : '하위 메뉴는'} 미배치 목록으로 이동하며 데이터는 보존됩니다. 맨 위 [저장]을 눌러야 실제 메뉴에 반영됩니다.`);
  const removeItem = (gid: string, href: string) => {
    setTree(tree.map(g => (g.id === gid ? { ...g, items: g.items.filter(i => i.href !== href) } : g)));
    markRemoved([href]);
  };
  const moveItem = (fromGid: string, it: MenuLeaf, to: string) => {
    const stripped = tree.map(g => (g.id === fromGid ? { ...g, items: g.items.filter(i => i.href !== it.href) } : g));
    if (to === 'solo') {
      setTree([...stripped, { id: newGroupId(), label: it.label ?? defLabel(it.href), href: it.href, items: [], pageTitle: it.pageTitle }]);
    } else {
      setTree(stripped.map(g => (g.id === to ? { ...g, items: [...g.items, it] } : g)));
    }
  };
  const placeUnplaced = (href: string, to: string) => {
    if (to === 'solo') setTree([...tree, { id: newGroupId(), label: defLabel(href), href, items: [] }]);
    else setTree(tree.map(g => (g.id === to ? { ...g, items: [...g.items, { href }] } : g)));
    if (href.startsWith('/board/b/')) setDraftRemoved(removed.filter(h => h !== href));
  };
  const groupOptions = (excludeId?: string) => [
    ...tree.filter(g => !g.href && g.id !== excludeId).map(g => ({ value: g.id, label: `→ ${g.label}` })),
    { value: 'solo', label: '→ 단독 메뉴' },
  ];

  const permSel = (label: string, value: MenuPerm, onChange: (v: MenuPerm) => void) => (
    <KSelect minWidth={110} value={value} onChange={v => onChange(v as MenuPerm)}
      options={[
        { value: 'guest', label: `${label}: 방문자` },
        { value: 'member', label: `${label}: 가입자` },
        { value: 'admin', label: `${label}: 관리자` },
      ]} />
  );
  // 메뉴별 부속 설정 — 기본 탭용 (표시 방식 등)
  const extraFor = (href: string) => {
    switch (href) {
      case '/gallery': return (
        <div className="mini-seg">
          <button className={ms.backupView === 'gal' ? 'on' : ''} onClick={() => patch({ backupView: 'gal' })}>기본: 갤러리</button>
          <button className={ms.backupView === 'list' ? 'on' : ''} onClick={() => patch({ backupView: 'list' })}>기본: 리스트</button>
        </div>
      );
      default: return null;
    }
  };

  // 메뉴별 권한 부속 — 권한 탭용 (v1.9)
  const extraPerm = (href: string) => {
    // 게시판 글쓰기·댓글 권한 (게시판별)
    if (href === '/board' || href.startsWith('/board/b/')) {
      // 메뉴 주소에는 별명(또는 이름에서 만든 값)이 적혀 있다 — id·별명 어느 쪽으로도 찾는다 (v2.4)
      const bd = href === '/board'
        ? boards.find(b => b.id === MAIN_BOARD_ID)
        : findBoardByKey(href.slice('/board/b/'.length), boards);
      if (!bd) return null;
      return (
        <>
          <KSelect minWidth={110} value={bd.permWrite}
            onChange={v => patchBoard(bd.id, { permWrite: v as BoardPerm })}
            options={[
              { value: 'member', label: '글쓰기: 가입자' },
              { value: 'admin', label: '글쓰기: 관리자' },
            ]} />
          {/* 댓글을 끈 게시판은 권한을 고를 일이 없다 (v2.5) — 켜는 곳은 게시판 관리 */}
          {bd.noComment
            ? <span className="pill" data-tip="콘텐츠 › 카테고리에서 댓글을 켜면 권한을 고를 수 있습니다">댓글 꺼짐</span>
            : (
              <KSelect minWidth={110} value={bd.permComment}
                onChange={v => patchBoard(bd.id, { permComment: v as BoardPerm })}
                options={[
                  { value: 'guest', label: '댓글: 방문자' },
                  { value: 'member', label: '댓글: 가입자' },
                  { value: 'admin', label: '댓글: 관리자' },
                ]} />
            )}
        </>
      );
    }
    if (href === '/loadb') {
      return (
        <>
          {permSel('업로드', ms.roadUpload, v => patch({ roadUpload: v }))}
          {permSel('댓글', ms.roadComment, v => patch({ roadComment: v }))}
        </>
      );
    }
    // 갤러리 글쓰기 권한 (v2.0 사용자 요청) — 갤러리(섹션)마다 · 「글쓰기 멤버」로 특정 회원까지
    if (href === '/gallery' || href.startsWith('/gallery/g/')) {
      const key = href === '/gallery' ? MAIN_SEC : href.slice('/gallery/g/'.length);
      // 메뉴 주소에는 별명(slug)이 적혀 있을 수 있다 — id로 통일해 저장
      const gsec = sectionsOf(secMap, 'gallery').find(s2 => s2.id === key || s2.slug === key);
      if (!gsec) return null;
      const gw = ms.galWrite?.[gsec.id] ?? 'member';
      const gwIds = ms.galWriteMembers?.[gsec.id];
      return (
        <>
          {gw === 'member' && (
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
              onClick={() => setMemAsk({
                ids: gwIds ?? [],
                desc: '체크한 회원(그리고 관리자)만 이 갤러리에 글을 쓸 수 있습니다 — 비우면 로그인한 모든 회원',
                apply: n => {
                  const next = { ...ms.galWriteMembers };
                  if (n.length) next[gsec.id] = n; else delete next[gsec.id];
                  patch({ galWriteMembers: next });
                },
              })}>
              {gwIds?.length ? `글쓰기 멤버 ${gwIds.length}명` : '글쓰기 멤버'}
            </button>
          )}
          <KSelect minWidth={110} value={gw}
            onChange={v => {
              // 관리자 전용으로 바꾸면 멤버 선택은 함께 지운다 — 몰래 남아 있지 않게 (노출 제한과 같은 규칙)
              const next = { ...ms.galWriteMembers };
              if (v !== 'member') delete next[gsec.id];
              patch({ galWrite: { ...ms.galWrite, [gsec.id]: v as MenuPerm }, galWriteMembers: next });
            }}
            options={[
              { value: 'member', label: '글쓰기: 가입자' },
              { value: 'admin', label: '글쓰기: 관리자' },
            ]} />
        </>
      );
    }
    return null;
  };

  // 공개범위 셀렉트 (v1.9) — 메뉴 자체 노출: 전부 / 비로그인 숨김 / 관리자만 (드래프트 — SAVE로 적용)
  const visSel = (v: MenuVis | undefined, onChange: (nv: MenuVis) => void) => (
    <KSelect minWidth={128} value={v ?? 'all'} onChange={nv => onChange(nv as MenuVis)}
      options={[
        { value: 'all', label: '전부 보임' },
        { value: 'member', label: '비로그인 숨김' },
        { value: 'admin', label: '관리자만' },
      ]} />
  );

  /* 멤버 선택 (v2.0 사용자 요청) — 「비로그인 숨김」일 때만 뜨는 버튼.
     검색 모달에서 고른 회원(+관리자)에게만 보이고 들어갈 수 있다 — 비우면 로그인한 모든 회원 */
  const memberBtn = (v: MenuVis | undefined, ids: string[] | undefined, apply: (ids: string[] | undefined) => void) => (
    v !== 'member' ? null : (
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
        onClick={() => setMemAsk({ ids: ids ?? [], apply: n => apply(n.length ? n : undefined) })}>
        {ids?.length ? `멤버 ${ids.length}명` : '멤버 선택'}
      </button>
    )
  );
  return (
    <div className="set-sec">
      {/* 제목은 다른 탭과 같은 시작 위치(상단 정렬) — 버튼 줄 높이에 밀려 내려가지 않게 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
        {dirty && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 3 }}>저장 안 된 변경</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 11 }}
            onClick={() => setResetAsk(true)}>기본 구성</button>
        </div>
      </div>
      {/* 기본(구성) / 권한 탭 (v1.9) — 권한 설정이 길어져 분리 */}
      <div className="mini-seg" style={{ marginBottom: 14 }}>
        <button className={mtab === 'basic' ? 'on' : ''} onClick={() => setMtab('basic')}>기본</button>
        <button className={mtab === 'perm' ? 'on' : ''} onClick={() => setMtab('perm')}>권한</button>
      </div>

      {mtab === 'perm' ? (
        /* ---------- 권한 탭 — 메뉴 공개범위 + 메뉴별 권한 부속 ---------- */
        <div>
          <div className="d">
            공개범위는 메뉴 노출을 정합니다(전부 보임 / 비로그인 숨김 / 관리자만) — 맨 위 [저장]을 눌러야 반영 · 글쓰기·댓글 권한도 함께 저장
            <br />
            「비로그인 숨김」 옆 <b>멤버 선택</b>으로 특정 회원에게만 보이게 좁힐 수 있습니다 — 비우면 로그인한 모든 회원
          </div>
          {tree.map(g => (
            <div key={g.id} style={{ borderBottom: '1px dashed var(--line)', padding: '9px 0' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13 }}>{g.label}</b>
                {g.href && <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{g.href}</small>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {g.href && extraPerm(g.href)}
                  {memberBtn(g.vis, g.visMembers, ids => patchGroup(g.id, { visMembers: ids }))}
                  {visSel(g.vis, nv => patchGroup(g.id, {
                    vis: nv === 'all' ? undefined : nv,
                    open: undefined,   // 옛 「주소로는 열람 허용」 값 정리 (v3.3 — 기능 삭제)
                    ...(nv !== 'member' ? { visMembers: undefined } : {}),
                  }))}
                </div>
              </div>
              {!g.href && g.items.map(it => (
                <div key={it.href} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0 0 22px' }}>
                  <span style={{ fontSize: 12.5 }}>{it.label ?? defLabel(it.href)}</span>
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{it.href}</small>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {extraPerm(it.href)}
                    {memberBtn(it.vis, it.visMembers, ids => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href ? { ...x, visMembers: ids } : x)),
                    }))}
                    {visSel(it.vis, nv => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href
                        ? {
                          ...x, vis: nv === 'all' ? undefined : nv,
                          open: undefined,   // 옛 「주소로는 열람 허용」 값 정리 (v3.3 — 기능 삭제)
                          ...(nv !== 'member' ? { visMembers: undefined } : {}),
                        } : x)),
                    }))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* 글에도 적용 (v2.0 사용자 요청) — 공개범위를 서버까지 적용한다 */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <b style={{ fontSize: 13 }}>열람 비공개 처리</b>
            <div className="d" style={{ marginTop: 4, lineHeight: 1.7 }}>
              위 공개범위는 <b>화면에서 가리는 것</b>이라, 주소나 API를 직접 부르면 글이 그대로 나옵니다.
              이 버튼을 누르면 <b>이미 올라간 글의 공개범위를 서버에 적용</b>해 서버가 아예 내주지 않게 합니다
              — 「비로그인 숨김」은 회원공개로, 「관리자만」은 비공개로.
              <br />
              <b>지금부터 쓰는 글은 누르지 않아도 그렇게 저장됩니다.</b>{' '}
              <span style={{ color: 'var(--accent)' }}>좁히기만 하고 넓히지는 않습니다</span> —
              나중에 다시 공개로 바꾸려면 각 글의 공개범위를 직접 되돌려야 합니다.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-dark" disabled={visBusy || dirty}
                onClick={() => setVisAsk(true)}>
                {visBusy ? '적용 중…' : dirty ? '저장 먼저' : '글에도 적용'}
              </button>
            </div>
          </div>
          {/* 멤버 선택 (v2.0 사용자 요청) — 검색으로 골라 그 회원(+관리자)에게만 */}
          {memAsk && (
            <MemberPickModal initial={memAsk.ids} onApply={memAsk.apply} desc={memAsk.desc}
              onClose={() => setMemAsk(null)} />
          )}

          <ConfirmModal open={visAsk} title="글 공개범위를 서버에 적용할까요?"
            body={'비공개로 둔 메뉴의 글이 서버에서도 가려집니다. 각 글의 공개범위가 바뀌므로, 되돌리려면 글마다 직접 고쳐야 합니다.'}
            onClose={() => setVisAsk(false)}
            buttons={[
              { label: 'CANCEL', kind: 'ghost', onClick: () => setVisAsk(false) },
              { label: '적용', kind: 'dark', onClick: () => { setVisAsk(false); void applyVis(); } },
            ]} />

          {/* 이미지 저장 방지 (v1.9) — 영역별 우클릭·드래그 차단, 관리자 제외 · 즉시 반영 */}
          <div style={{ marginTop: 18 }}>
            <b style={{ fontSize: 13 }}>이미지 저장 방지</b>
            <div className="d" style={{ marginTop: 4 }}>체크한 영역에서 이미지 우클릭 저장·드래그 반출을 막습니다 — 관리자 계정은 제외 · 즉시 반영</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              {IMG_PROTECT_AREAS.map(a => (
                <KCheck key={a.key} label={a.label}
                  checked={(ms.imgProtect ?? []).includes(a.key)}
                  onChange={v => patch({
                    imgProtect: v
                      ? [...(ms.imgProtect ?? []), a.key]
                      : (ms.imgProtect ?? []).filter(k => k !== a.key),
                  })} />
              ))}
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* 메뉴 트리는 표처럼 — 이름 / 페이지 타이틀 / 주소 / 버튼 열이 위아래로 맞는다 (v3.2 사용자 요청) */}
      <div className="mt-row mt-head"><span /><span>메뉴 이름</span><span>페이지 타이틀</span><span>주소</span><span /></div>
      <DragList items={tree} keyOf={g => g.id} onReorder={setTree}
        render={g => (
          <div style={{ width: '100%', borderBottom: '1px dashed var(--line)', padding: '10px 0' }}>
            <div className="mt-row">
              <span className="drag-h">⠿</span>
              <KInput value={g.label} onChange={e => patchGroup(g.id, { label: e.target.value })}
                style={{ fontWeight: 700 }} />
              {g.href
                ? <KInput value={g.pageTitle ?? ''} placeholder="기본"
                    onChange={e => patchGroup(g.id, { pageTitle: e.target.value || undefined })}
                    style={{ fontSize: 12 }} />
                : <span className="pill">상위</span>}
              <small className="mt-path">{g.href ? `단독 · ${g.href}` : ''}</small>
              <div className="mt-act">
                {g.href && extraFor(g.href)}
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => askRemoveGroup(g)}>{g.href ? '빼기' : 'DELETE'}</button>
              </div>
            </div>
            {/* 하위 메뉴 — 그룹 안 순서(⠿)·이름·이동·빼기 + 부속 설정 */}
            {!g.href && (
              <div className="mt-sub">
                <DragList items={g.items} keyOf={it => it.href}
                  onReorder={items => patchGroup(g.id, { items })}
                  render={it => (
                    <div className="mt-row" style={{ padding: '3px 0' }}>
                      <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
                      <KInput value={it.label ?? ''} placeholder={defLabel(it.href)}
                        onChange={e => patchGroup(g.id, {
                          items: g.items.map(x => (x.href === it.href
                            ? { ...x, label: e.target.value || undefined } : x)),
                        })}
                        style={{ fontSize: 12 }} />
                      <KInput value={it.pageTitle ?? ''} placeholder="기본"
                        onChange={e => patchGroup(g.id, {
                          items: g.items.map(x => (x.href === it.href
                            ? { ...x, pageTitle: e.target.value || undefined } : x)),
                        })}
                        style={{ fontSize: 12 }} />
                      <small className="mt-path">{it.href}</small>
                      <div className="mt-act">
                        {extraFor(it.href)}
                        <KSelect minWidth={104} value="" placeholder="이동"
                          onChange={v => moveItem(g.id, it, v)} options={groupOptions(g.id)} />
                        <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
                          onClick={() => removeItem(g.id, it.href)}>빼기</button>
                      </div>
                    </div>
                  )} />
                {g.items.length === 0 && (
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>하위 메뉴가 없으면 상단 메뉴에 표시되지 않습니다 — 아래 「미배치 기능」에서 추가</small>
                )}
              </div>
            )}
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setTree([...tree, { id: newGroupId(), label: '새 메뉴', items: [] }])}>＋ ADD MENU</button>
      </div>

      <h3 className="set-fold-head" style={{ marginTop: 26 }}>
        <button type="button" aria-expanded={unOpen} onClick={() => setUnOpen(!unOpen)}>
          <span className={`caret${unOpen ? ' open' : ''}`} aria-hidden="true">▸</span>
          미배치 기능
        </button>
      </h3>
      <div className="d">트리에 넣지 않은 기능 — 메뉴에 노출되지 않지만 데이터는 보존됩니다. 넣을 위치를 고르면 바로 배치</div>
      {unOpen && unplaced.map(f => {
        // 커스텀 링크는 미배치에서도 지울 수 있다 (v2.0 사용자 요청 — 「목록 자체에서 지우고 싶다」).
        // 다른 기능(게시판·섹션 등)은 데이터가 있어 여기서 못 지운다 — 각자의 관리 화면에서
        const link = links.find(l => l.href === f.href);
        return (
          <div key={f.href} className="set-row">
            <div className="l" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <b style={{ fontSize: 12.5 }}>{f.label}</b>
              <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{f.href}</small>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={130} value="" placeholder="배치할 위치"
                onChange={v => placeUnplaced(f.href, v)} options={groupOptions()} />
              {link && (
                <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
                  onClick={() => del.ask(`커스텀 링크 「${link.name}」를 지우시겠습니까?`,
                    () => setLinks(links.filter(x => x.id !== link.id)),
                    '링크만 사라집니다 — 가리키던 페이지 자체는 그대로입니다.')}>삭제</button>
              )}
            </div>
          </div>
        );
      })}
      {unOpen && unplaced.length === 0 && (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--faint)' }}>모든 기능이 메뉴에 배치되어 있습니다</div>
      )}

      {/* 커스텀 링크 (v2.0 사용자 요청) — 사이트 안의 아무 페이지나 메뉴로.
          만들면 위 미배치 목록에 나타나고, 거기서 원하는 상위 메뉴에 넣는다 */}
      <h3 className="set-fold-head">
        <button type="button" aria-expanded={lnOpen} onClick={() => setLnOpen(!lnOpen)}>
          <span className={`caret${lnOpen ? ' open' : ''}`} aria-hidden="true">▸</span>
          커스텀 링크
        </button>
      </h3>
      <div className="d">
        자관처럼 목록에서 골라야 갈 수 있던 페이지를 메뉴에서 바로 — 주소를 적어 두면 됩니다.
        <br />
        <b>내 홈 주소</b>는 붙여 넣으면 사이트 안 이동으로 바뀌고(예: <code>…/rels/latte</code> → <code>/rels/latte</code>),
        <b>다른 사이트 주소</b>는 그대로 남아 새 창으로 열립니다.
        만든 링크는 위 <b>미배치</b>에 나타나며, 거기서 원하는 상위 메뉴에 넣어 주세요.
      </div>
      {lnOpen && (<>
      {links.map(l => (
        <div key={l.id} className="set-row">
          <div className="l" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <KInput value={l.name} placeholder="메뉴에 보일 이름"
              onChange={e => setLinks(links.map(x => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
              style={{ width: 140 }} />
            <KInput value={l.href} placeholder="/rels/latte 또는 풀주소"
              onChange={e => setLinks(links.map(x => (x.id === l.id ? { ...x, href: e.target.value } : x)))}
              onBlur={e => setLinks(links.map(x => (x.id === l.id ? { ...x, href: toInternalPath(e.target.value) } : x)))}
              style={{ width: 260 }} />
          </div>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`커스텀 링크 「${l.name}」를 지우시겠습니까?`,
              () => {
                setLinks(links.filter(x => x.id !== l.id));
                // 메뉴에 배치돼 있었으면 그 자리도 함께 비운다 — 없는 주소가 남으면 눌러도 아무 일도 안 난다
                setTree(tree.map(g => ({ ...g, items: g.items.filter(i => i.href !== l.href) })).filter(g => g.href !== l.href));
              },
              '메뉴에 배치해 두었다면 그 자리도 함께 비워집니다. 가리키던 페이지 자체는 그대로입니다.')}>DELETE</button>
        </div>
      ))}
      {links.length === 0 && (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--faint)' }}>아직 없습니다 — 아래에 이름과 주소를 적고 ADD를 눌러 주세요</div>
      )}
      {/* 새 링크는 폼을 채워 ADD를 눌러야 등록된다 (v2.0 사용자 제보) —
          예전에는 빈 행이 즉시 등록돼, 주소를 치는 순간 이름도 없는 링크가 미배치에 나타났다 */}
      <div className="set-row" style={{ borderTop: '1px dashed var(--line)' }}>
        <div className="l" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <KInput value={nlName} placeholder="메뉴에 보일 이름" onChange={e => setNlName(e.target.value)} style={{ width: 140 }} />
          <KInput value={nlHref} placeholder="/rels/latte 또는 풀주소" onChange={e => setNlHref(e.target.value)} style={{ width: 260 }} />
        </div>
        <button className="btn btn-dark" style={{ padding: '4px 12px', fontSize: 10.5 }}
          onClick={() => {
            if (!nlName.trim()) { toast('메뉴에 보일 이름을 입력해 주세요'); return; }
            const href = toInternalPath(nlHref);
            if (!href || href === '/') { toast('이동할 주소를 입력해 주세요'); return; }
            setLinks([...links, { id: newId(), name: nlName.trim(), href }]);
            setNlName(''); setNlHref('');
            setUnOpen(true);   // 접혀 있으면 펼쳐 둔다 — 방금 만든 링크가 바로 보이게
            toast('링크가 만들어졌습니다 — 위 미배치에서 메뉴에 넣어 주세요');
          }}>＋ ADD</button>
      </div>
      </>)}
      </>
      )}

      {del.element}
      {/* 기본 구성 리셋 확인 (v1.9) — 드래프트만 교체, SAVE로 확정 */}
      <ConfirmModal open={resetAsk} title="메뉴를 기본 구성으로 되돌리시겠습니까?"
        body="기본 제공 메뉴 구성(자놀·게시판·TRPG·기록)으로 편집 화면이 바뀝니다. 맨 위 [저장]을 눌러야 실제 메뉴에 반영됩니다."
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: 'RESET', kind: 'dark', onClick: () => { setDraft(defaultTree()); setDraftRemoved([]); setResetAsk(false); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
    </div>
  );
}

/** TRPG 탭 (4.15, v1.9) — 비밀번호 걸린 로그의 안내 문구 */
function TrpgPane() {
  // 비밀번호 걸린 로그의 안내 문구 (pagetext 'trpg-lock-desc')
  const [lockDesc, setLockDesc] = useState('');
  useEffect(() => { setLockDesc(getPageText('trpg-lock-desc', '비밀번호를 입력하면 열람할 수 있습니다')); }, []);
  return (
    <div className="set-sec">
      {/* 비밀번호 걸린 로그의 안내 문구 — 관리자는 그 화면을 볼 수 없어 여기서 편집 (사용자 요청) */}
      <h3>로그 열람 안내 문구</h3>
      <div className="d">비밀번호를 건 로그에 들어갔을 때 보이는 문구입니다 — 관리자에게는 그 화면이 뜨지 않아 여기서 고칩니다</div>
      <div className="set-row" style={{ alignItems: 'center' }}>
        <div className="l"><b>비밀번호 안내</b><small>비우면 기본 문구로 표시됩니다</small></div>
        <KInput value={lockDesc}
          onChange={e => { setLockDesc(e.target.value); setPageText('trpg-lock-desc', e.target.value); }}
          placeholder="비밀번호를 입력하면 열람할 수 있습니다" style={{ width: 300 }} />
      </div>
    </div>
  );
}

/** 감상타래 탭 (4.17) — 분류 리스트 관리 + 기본 보기 */
function ThreadPane() {
  const [settings, patch] = useThreadSettings();
  const [works] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  const del = useConfirmDelete();
  /* 분류는 감상타래마다 따로 (v2.0 사용자 요청) — 여러 개로 만들었으면 어느 것의 분류를
     고칠지 먼저 고른다. 하나뿐이면 고를 것이 없으니 선택 줄을 아예 두지 않는다. */
  const { list } = useSections();
  const secs = list('threads');
  const [secId, setSecId] = useState(MAIN_SEC);
  const cur = secs.find(s => s.id === secId) ? secId : MAIN_SEC;
  const cats = threadCats(settings, cur);
  const setCats = (next: ThreadCat[]) => patch(threadCatsPatch(settings, cur, next));
  const patchCat = (id: string, p: Partial<ThreadCat>) =>
    setCats(cats.map(c => (c.id === id ? { ...c, ...p } : c)));
  return (
    <div className="set-sec">
      <h3>기본 보기</h3>
      <div className="d">감상타래 메뉴에 들어왔을 때 먼저 보일 보기</div>
      <div className="set-row">
        <div className="l"><b>첫 화면</b><small>타래 보기 / 리스트 보기(포스터 카드 그리드)</small></div>
        <div className="mini-seg">
          <button className={settings.defaultView === 'thread' ? 'on' : ''}
            onClick={() => patch({ defaultView: 'thread' })}>타래 보기</button>
          <button className={settings.defaultView === 'list' ? 'on' : ''}
            onClick={() => patch({ defaultView: 'list' })}>리스트 보기</button>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>분류 리스트</h3>
      <div className="d">
        작품 분류 뱃지 — 이름 · 배경/테두리/글씨색 · ⠿ 드래그로 순서 · 추가/삭제
        {secs.length > 1 && <><br />감상타래마다 따로 정합니다 — <b>손대기 전까지는 기본 감상타래의 분류를 그대로 씁니다</b></>}
      </div>
      {secs.length > 1 && (
        secs.length > TAB_MAX ? (
          <div style={{ marginBottom: 10 }}>
            <KSelect minWidth={160} value={cur} onChange={setSecId}
              options={secs.map(s => ({ value: s.id, label: s.name }))} />
          </div>
        ) : (
          <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {secs.map(s => (
              <button key={s.id} className={cur === s.id ? 'on' : ''} onClick={() => setSecId(s.id)}>{s.name}</button>
            ))}
          </div>
        )
      )}
      <DragList items={cats} keyOf={c => c.id} onReorder={next => setCats(next)}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span className="pill" style={threadBadgeStyle(c)}>{c.label || '분류'}</span>
            </div>
            {/* 이름·삭제 / 색 세 칸(2열 격자) — 라벨 열을 맞춘다 (v3.2 사용자 요청) */}
            <Ctl>
              <Line>
              <Item label="이름">
                <KInput value={c.label} onChange={e => patchCat(c.id, { label: e.target.value })}
                  style={{ width: 120 }} />
              </Item>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => {
                  const used = works.filter(w => w.catId === c.id && inSection(w.secId, cur)).length;
                  del.ask(`분류 「${c.label}」를 삭제하시겠습니까?`,
                    () => setCats(cats.filter(x => x.id !== c.id)),
                    used > 0 ? `이 분류의 타래 ${used}개는 유지되지만 분류가 「기타」로 표시됩니다.` : undefined);
                }}>DELETE</button>
              </Line>
              <div className="cp-group">
                <Item label="배경"><ColorField value={c.bg ?? '#1d2025'} onChange={hex => patchCat(c.id, { bg: hex })} /></Item>
                <Item label="테두리"><ColorField value={c.border ?? c.bg ?? '#1d2025'} onChange={hex => patchCat(c.id, { border: hex })} /></Item>
                <Item label="글씨"><ColorField value={c.fg ?? '#ffffff'} onChange={hex => patchCat(c.id, { fg: hex })} /></Item>
              </div>
            </Ctl>
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setCats([...cats, { id: newId(), label: '새 분류' }])}>
          ＋ ADD
        </button>
      </div>
      {del.element}
    </div>
  );
}

/** BGM 커버 이미지 선택 — 업로드 / 주소 붙여넣기 / 지우기. 비워 두면 유튜브 썸네일 (v2.1) */
function BgmCoverPick({ value, videoId, onChange }: { value?: string; videoId: string | null; onChange: (v: string | undefined) => void }) {
  const custom = useBlobUrl(value);
  const source = useImageSource(url => onChange(url));
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = custom ?? (videoId ? ytThumb(videoId, 'mqdefault') : undefined);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flex: 'none', background: 'var(--line)', display: 'block' }}>
        {shown && <img src={shown} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </span>
      <small style={{ color: 'var(--faint)', fontSize: 11 }}>{value ? '커버: 직접 지정' : '커버: 유튜브 썸네일'}</small>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          if (f) onChange(await putBlob(f));
          e.target.value = '';
        }} />
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
        onClick={() => fileRef.current?.click()}>{value ? 'CHANGE' : 'UPLOAD'}</button>
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
        onClick={() => source.open()}>🔗 URL</button>
      {value && <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
        onClick={() => onChange(undefined)}>REMOVE</button>}
      {source.element}
    </div>
  );
}

/** BGM 트랙 한 줄 — 인라인 수정(제목/설명/URL/커버) + 삭제 확인 */
function BgmTrackRow({ t, onPatch, onDelete }: {
  t: BgmTrack; onPatch: (p: Partial<BgmTrack>) => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.desc);
  const [url, setUrl] = useState(t.videoId);
  const [cover, setCover] = useState<string | undefined>(t.cover);
  const thumb = useBlobUrl(t.cover) ?? ytThumb(t.videoId, 'mqdefault');

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 7, padding: '10px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <KInput placeholder="곡 제목" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 150 }} />
          <KInput placeholder="설명 (선택)" value={desc} onChange={e => setDesc(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <KInput placeholder="유튜브 URL 또는 영상 ID" value={url} onChange={e => setUrl(e.target.value)} />
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              const vid = parseVideoId(url);
              if (!title.trim() || !vid) { toast('제목과 올바른 유튜브 URL(또는 영상 ID)을 입력해 주세요'); return; }
              onPatch({ title: title.trim(), desc: desc.trim(), videoId: vid, cover });
              setEditing(false);
            }}>적용</button>
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditing(false); setTitle(t.title); setDesc(t.desc); setUrl(t.videoId); setCover(t.cover); }}>CANCEL</button>
        </div>
        <BgmCoverPick value={cover} videoId={parseVideoId(url)} onChange={setCover} />
      </div>
    );
  }

  return (
    <div className="set-row" style={{ width: '100%' }}>
      <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <span className="drag-h">⠿</span>
        <img src={thumb} alt="" referrerPolicy="no-referrer"
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flex: 'none', background: 'var(--line)' }} />
        <div><b>{t.title}</b><small>{t.desc || t.videoId}</small></div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => setEditing(true)}>EDIT</button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={onDelete}>DELETE</button>
      </div>
    </div>
  );
}

/** BGM 탭 (5.2 v1.9) — 곡 목록 등록(미니 플레이어 리스트에 노출) + 재생 설정 */
function BgmPane() {
  const { state, setTracks, addTrack, removeTrack, setSettings } = useBgm();
  const toast = useToast();
  const del = useConfirmDelete();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [url, setUrl] = useState('');
  const [cover, setCover] = useState<string | undefined>();

  const add = () => {
    if (addTrack(title, desc, url, cover)) {
      setTitle(''); setDesc(''); setUrl(''); setCover(undefined);
      toast('곡이 추가되었습니다');
    } else {
      toast('제목과 올바른 유튜브 URL(또는 영상 ID)을 입력해 주세요');
    }
  };

  return (
    <div className="set-sec">
      <div className="d">유튜브 곡 목록 관리 — 플레이어 팝업 리스트에 노출 · 화면은 숨기고 소리만 재생 · 커버 이미지(레코드판·팝업)는 직접 지정하거나, 비워 두면 유튜브 썸네일</div>

      {/* 플레이어 색 (v2.6 디자인 탭에서 이동) — 곡 목록 위 */}
      <BgmStyleRow />

      <DragList
        items={state.tracks}
        keyOf={t => t.id}
        onReorder={setTracks}
        render={t => (
          <BgmTrackRow t={t}
            onPatch={p => setTracks(state.tracks.map(x => (x.id === t.id ? { ...x, ...p } : x)))}
            onDelete={() => del.ask(`곡 「${t.title}」을 삭제하시겠습니까?`, () => removeTrack(t.id))} />
        )}
      />
      {del.element}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <KInput placeholder="곡 제목" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 150 }} />
        <KInput placeholder="설명 (선택)" value={desc} onChange={e => setDesc(e.target.value)} style={{ maxWidth: 130 }} />
        <KInput placeholder="유튜브 URL 또는 영상 ID" value={url} onChange={e => setUrl(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn btn-dark" onClick={add}>＋ ADD</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <BgmCoverPick value={cover} videoId={parseVideoId(url)} onChange={setCover} />
      </div>

      <div className="set-row" style={{ marginTop: 16 }}>
        <div className="l"><b>기본 볼륨</b></div>
        <KStep value={state.settings.volume} min={0} max={100} suffix="%" onChange={v => setSettings({ volume: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>플레이어 위치</b><small>기본: 오른쪽 아래</small></div>
        <div className="mini-seg">
          <button className={state.settings.position === 'br' ? 'on' : ''} onClick={() => setSettings({ position: 'br' })}>오른쪽 아래</button>
          <button className={state.settings.position === 'bl' ? 'on' : ''} onClick={() => setSettings({ position: 'bl' })}>왼쪽 아래</button>
        </div>
      </div>
      <div className="set-row">
        <div className="l"><b>셔플</b><small>방문자 기본값 — 플레이어 팝업에서 각자 켜고 끌 수 있음 (사이트 설정은 그대로)</small></div>
        <KToggle checked={state.settings.shuffle} onChange={v => setSettings({ shuffle: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>반복 재생</b><small>목록 끝에서 처음으로</small></div>
        <KToggle checked={state.settings.repeat} onChange={v => setSettings({ repeat: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>플레이어 표시</b><small>끄면 사이트에서 BGM 플레이어가 사라짐</small></div>
        <KToggle checked={state.settings.enabled} onChange={v => setSettings({ enabled: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>자동 재생</b><small>켜면 접속 후 처음 클릭하거나 키를 누르는 순간 재생 (브라우저 정책상 아무 동작 없이 자동 재생은 불가) · 끄면 재생 버튼을 눌러야 재생 · 모바일에서는 항상 수동 · 플레이어 표시가 꺼져 있으면 동작하지 않음</small></div>
        <KToggle checked={state.settings.autoplay} onChange={v => setSettings({ autoplay: v })} />
      </div>
    </div>
  );
}

/** CSS URL / @font-face 코드 입력칸 — 눈누 코드는 여러 줄이라 textarea (내용 따라 늘어남) */
const FONT_SRC_PH = 'CSS 파일 URL 또는 눈누 「웹폰트로 사용」 코드(@font-face { … })를 통째로 붙여넣기';
const FONT_SRC_STYLE: React.CSSProperties = { flex: 1, minHeight: 0, lineHeight: 1.45, fontSize: 12 };

/** 목록 표시용 — 코드 원문 대신 「@font-face 코드 — 이름」 */
const fontSrcLabel = (v: string) =>
  (isFontFaceCode(v) ? `@font-face 코드 — ${fontFaceName(v) ?? 'font-family 없음'}` : v);

/** 폰트 목록 한 줄 — CSS URL 표시 · 수정(이름/family/URL, 업로드 폰트는 이름/한글 페어) · 삭제 */
function FontRow({ f, first, last }: { f: FontDef; first: boolean; last: boolean }) {
  const { fonts, familyOf, updateFont, removeFont, moveFont, resetFont, setFontPair } = useFonts();
  const del = useConfirmDelete();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [family, setFamily] = useState(f.family);
  const [cssUrl, setCssUrl] = useState(fontCssUrl(f) ?? '');

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 7, padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <KInput placeholder="표시 이름" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 160 }} />
          {f.fileId ? (
            /* 업로드 폰트 — family는 자동, 한글 페어만 지정 (v1.9) */
            <>
              <span className="cp-lb">한글 페어</span>
              <KSelect minWidth={150} value={f.pairId ?? ''}
                onChange={v => setFontPair(f.id, v || undefined)}
                options={[{ value: '', label: '페어 없음' },
                  ...fonts.filter(x => x.id !== f.id).map(x => ({ value: x.id, label: x.name }))]} />
            </>
          ) : (
            <>
              <KInput placeholder="font-family 값" value={family} onChange={e => setFamily(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              {/* 웹폰트도 한글 페어 지정 가능 (v1.9) */}
              <span className="cp-lb">한글 페어</span>
              <KSelect minWidth={140} value={f.pairId ?? ''}
                onChange={v => setFontPair(f.id, v || undefined)}
                options={[{ value: '', label: '페어 없음' },
                  ...fonts.filter(x => x.id !== f.id).map(x => ({ value: x.id, label: x.name }))]} />
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          {!f.fileId && <KTextarea rows={1} placeholder={FONT_SRC_PH} value={cssUrl}
            onChange={e => setCssUrl(e.target.value)} style={FONT_SRC_STYLE} />}
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: f.fileId ? 'auto' : undefined }}
            onClick={() => {
              if (updateFont(f.id, { name, family: f.fileId ? f.family : family, cssUrl: f.fileId ? '' : cssUrl })) setEditing(false);
              else toast('이름과 font-family 값(또는 font-family가 든 @font-face 코드)을 입력해 주세요');
            }}>적용</button>
          {/* 내장 폰트를 처음 상태로 (v2.0 사용자 발견) — 이름·family·한글 페어를 한꺼번에 되돌린다.
              잘못 들어간 값(엉뚱한 family, 지워진 폰트를 가리키는 페어)을 풀 방법이 없었다 */}
          {f.builtin && (
            <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                resetFont(f.id);
                setEditing(false);
                toast(`「${f.name}」를 처음 상태로 되돌렸습니다`);
              }}>기본값으로</button>
          )}
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditing(false); setName(f.name); setFamily(f.family); setCssUrl(fontCssUrl(f) ?? ''); }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-row">
      <div className="l" style={{ minWidth: 0 }}>
        {/* 미리보기는 페어 반영 스택 — 영문 폰트+한글 페어면 한글이 페어 폰트로 보임 (v1.9) */}
        {/* familyOf가 페어까지 합쳐 주고 var(--serif) 같은 별칭도 원본 스택으로 풀어 준다 (v2.0) */}
        <b style={{ fontFamily: familyOf(f.id), fontSize: 15 }}>{f.name} — 가나다 ABC 123</b>
        <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.fileId
            ? `업로드 파일 — ${f.fileName ?? '폰트 파일'}${f.pairId ? ` · 한글 페어: ${fonts.find(x => x.id === f.pairId)?.name ?? ''}` : ''}`
            : `${(fontCssUrl(f) && fontSrcLabel(fontCssUrl(f)!)) || (f.locked ? '사이트 기본 폰트 스택 — 별도 URL 없음' : '사이트 CSS에서 로드')}${f.pairId ? ` · 한글 페어: ${fonts.find(x => x.id === f.pairId)?.name ?? ''}` : ''}`}
        </small>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {/* 순서 바꾸기 (사용자 요청) — 폰트 고르는 모든 목록이 이 순서를 따른다 */}
        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10.5 }} disabled={first}
          title="위로" aria-label={`「${f.name}」 위로`} onClick={() => moveFont(f.id, -1)}>↑</button>
        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10.5 }} disabled={last}
          title="아래로" aria-label={`「${f.name}」 아래로`} onClick={() => moveFont(f.id, 1)}>↓</button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => setEditing(true)}>EDIT</button>
        {!f.locked && (
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`폰트 「${f.name}」를 삭제하시겠습니까?`, () => removeFont(f.id),
                f.builtin
                  ? '기본 폰트는 목록에서만 빠집니다 — 아래 [복원] 버튼으로 되살릴 수 있고, 이 폰트를 쓰던 항목 표시는 그대로입니다.'
                  // 직접 등록한 폰트는 정의째 사라지므로 가리키던 자리도 함께 정리된다 (v2.0)
                  : '직접 등록한 폰트는 복구할 수 없습니다. 이 폰트를 쓰도록 지정해 둔 자리(역할 폰트·한글 페어)는 기본값으로 되돌아갑니다.')}>DELETE</button>
        )}
      </div>
      {del.element}
    </div>
  );
}

/** 폰트 탭 (5.1) — 내장 폰트도 수정·삭제 가능 · 웹폰트 URL 등록. 파일 업로드·페어링은 후속 */
function FontPane() {
  const { fonts, hiddenCount, addFont, addFontFile, restoreBuiltins } = useFonts();
  const toast = useToast();
  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [cssUrl, setCssUrl] = useState('');
  // 웹폰트 추가의 한글 페어 (v1.9) — 체크하면 지정 가능
  const [webPairOn, setWebPairOn] = useState(false);
  const [webPair, setWebPair] = useState('');
  // 폰트 파일 업로드 (v1.9) — 표시 이름은 파일명 그대로 (EDIT에서 수정 가능, 사용자 확정)
  const [upPair, setUpPair] = useState('');
  const uploadFontFile = async (f: File | undefined) => {
    if (!f) return;
    const name = f.name.replace(/\.(woff2?|ttf|otf)$/i, '');
    if (await addFontFile(name, f, upPair || undefined)) { setUpPair(''); toast(`「${name}」 폰트가 등록되었습니다`); }
  };

  return (
    <div className="set-sec">
      <div className="d">자관 이름·시나리오 타이틀 등에서 이 목록 중 선택해 사용 — 원하는 폰트만 남기고 삭제 가능 · ↑↓로 목록 순서 변경</div>

      {fonts.map((f, i) => <FontRow key={f.id} f={f} first={i === 0} last={i === fonts.length - 1} />)}
      {hiddenCount > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={restoreBuiltins}>
            삭제한 기본 폰트 {hiddenCount}개 복원
          </button>
        </div>
      )}
      <p className="hint">삭제해도 이미 그 폰트를 쓰고 있는 자관 표시는 깨지지 않습니다 — 선택 목록에서만 빠집니다</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <label className="k-label" style={{ margin: 0 }}>웹폰트 추가 — 구글폰트 등의 CSS 링크(URL) 또는 눈누의 @font-face 코드</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KInput placeholder="표시 이름" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 130 }} />
          <KInput placeholder="font-family 값 (눈누 코드를 붙여넣으면 비워도 자동)" value={family}
            onChange={e => setFamily(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <KTextarea rows={1} placeholder={FONT_SRC_PH} value={cssUrl}
            onChange={e => setCssUrl(e.target.value)} style={FONT_SRC_STYLE} />
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              if (addFont(name, family, cssUrl, webPairOn ? webPair || undefined : undefined)) {
                setName(''); setFamily(''); setCssUrl(''); setWebPairOn(false); setWebPair('');
                toast('폰트가 추가되었습니다');
              } else toast('이름과 font-family 값(또는 font-family가 든 @font-face 코드)을 입력해 주세요');
            }}>＋ ADD</button>
        </div>
        {/* 영문·일어 등 한글 미지원 웹폰트 — 체크하면 한글 페어 지정 (v1.9 사용자 요청) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <KCheck label="한글 페어 지정" checked={webPairOn} onChange={setWebPairOn} />
          {webPairOn && (
            <KSelect minWidth={160} value={webPair} onChange={setWebPair}
              options={[{ value: '', label: '페어 없음' }, ...fonts.map(f => ({ value: f.id, label: f.name }))]} />
          )}
        </div>
      </div>

      {/* 폰트 파일 업로드 (v1.9) — woff2·woff·ttf·otf + 영문 폰트의 한글 페어링 */}
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <label className="k-label" style={{ margin: 0 }}>폰트 파일 업로드 — woff2·woff·ttf·otf</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="cp-lb">한글 페어</span>
          <KSelect minWidth={160} value={upPair} onChange={setUpPair}
            options={[{ value: '', label: '페어 없음' }, ...fonts.map(f => ({ value: f.id, label: f.name }))]} />
          <label className="btn btn-dark" style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
            {...fileDrop(fl => uploadFontFile(fl[0]))}>
            ↑ 파일 선택
            <input type="file" accept=".woff2,.woff,.ttf,.otf" style={{ display: 'none' }}
              onChange={e => { uploadFontFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <p className="hint">표시 이름은 파일명 그대로 등록 — 목록의 [EDIT]에서 수정. 한글 미지원 폰트라면 한글 페어를 지정 — 한글 글자는 페어 폰트로 표시됩니다.</p>
      </div>
    </div>
  );
}

function SettingsInner() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const route = useParams<{ tab?: string }>();
  const toast = useToast();

  /* 그룹 (v3.1) — 첫 값만 주소에서 읽고, 그 뒤로는 화면 안에서 바꾼다(주소는 replaceState로 맞춤).
     주소로 페이지를 옮기면 설정 화면이 새로 그려져, 화면 안에 들고 있던 편집본(메뉴 등)이 사라진다.
     뒤로가기 기록도 쌓지 않는다 — 뒤로가기·✕는 설정 화면을 나가는 것 */
  const [first] = useState(() => routeOf(route.tab ? decodeURIComponent(route.tab) : params.get('tab')));
  const [group, setGroup] = useState<GroupId>(first?.group ?? 'site');   // 처음 열면 사이트 그룹 (v3.1 사용자 요청)
  const [visited, setVisited] = useState<GroupId[]>(() => [first?.group ?? 'site']);
  const cur = GROUPS.find(g => g.id === group)!;

  /* 숨김 칸 (v3.1 사용자 요청 — 예전 설정 메뉴 보관함을 되살림).
     목차·섹션 제목을 우클릭(휴대폰은 길게 누르기)해 숨기면 왼쪽 그룹 줄 「관리」 아래 선 밑으로 모인다.
     접혀 있다가 누르면 펼쳐지고, 카테고리 순서 그대로 보인다. 숨겨도 설정값은 그대로 적용되고,
     숨긴 항목을 누르면 그 항목만 열어 볼 수 있다. 메뉴 정리라서 [저장]과 상관없이 바로 저장한다 */
  const [site, patchSite] = useSiteSettings();
  const hiddenIds = (site.setHidden
    ?? (site.setArchived ?? []).map(n => routeOf(n)?.section).filter((x): x is string => !!x))
    .filter(id => id !== LOCKED_SEC && !!groupOfSec(id));
  const hiddenSet = new Set(hiddenIds);
  const [peek, setPeek] = useState<string | null>(null);
  const [hidOpen, setHidOpen] = useState(false);
  /* 휴대폰 2단 탭 (v3.2 사용자 요청) — 1차(그룹) 탭 아래에 2차(항목) 칩 줄.
     지금 그룹 탭을 다시 누르면 접히고, 칩은 스크롤 위치를 따라간다. 「숨김」을 누르면 2차 줄에 숨긴 항목 */
  const [subOpen, setSubOpen] = useState(true);
  const [subHidden, setSubHidden] = useState(false);
  const subRef = useRef<HTMLElement>(null);
  const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const curSecs = cur.sections.filter(s => !hiddenSet.has(s.id));
  const viewGroup: GroupId = peek ? groupOfSec(peek).id : group;
  const openPeek = (id: string) => {
    const g = groupOfSec(id).id;
    setVisited(v => (v.includes(g) ? v : [...v, g]));
    setPeek(id);
    setActiveSec(id);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const hideSec = (id: string) => {
    if (id === LOCKED_SEC) return;
    patchSite({ setHidden: [...hiddenIds.filter(x => x !== id), id] });
    toast(`「${secLabel(id)}」을(를) 숨김 칸으로 옮겼습니다`);
  };
  const unhideSec = (id: string) => {
    patchSite({ setHidden: hiddenIds.filter(x => x !== id) });
    if (peek === id) { setPeek(null); setSubHidden(false); goGroup(groupOfSec(id).id, id); }
  };

  /* 우클릭 메뉴 — 휴대폰은 길게 누르기. 누른 뒤 손을 뗄 때 생기는 클릭은 삼킨다 */
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ t: number | null; fired: boolean }>({ t: null, fired: false });
  useEffect(() => {
    if (!ctx) return;
    const off = (e: Event) => { if (!ctxRef.current?.contains(e.target as Node)) setCtx(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('scroll', off, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', off, true);
      window.removeEventListener('scroll', off, true);
      window.removeEventListener('keydown', esc);
    };
  }, [ctx]);
  const ctxProps = (items: () => CtxItem[]) => {
    const clear = () => { if (press.current.t) { clearTimeout(press.current.t); press.current.t = null; } };
    return {
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); setCtx({ x: e.clientX, y: e.clientY, items: items() }); },
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        press.current.fired = false;
        clear();
        press.current.t = window.setTimeout(() => {
          press.current.t = null; press.current.fired = true;
          setCtx({ x: t.clientX, y: t.clientY, items: items() });
        }, 550);
      },
      onTouchMove: clear, onTouchCancel: clear,
      onTouchEnd: clear,
      onClickCapture: (e: React.MouseEvent) => {
        if (press.current.fired) { press.current.fired = false; e.preventDefault(); e.stopPropagation(); }
      },
    };
  };
  const hideItems = (id: string) => (): CtxItem[] =>
    id === LOCKED_SEC ? [] : [{ label: '숨기기', fn: () => hideSec(id) }];

  const [activeSec, setActiveSec] = useState<string>(first?.section ?? cur.sections[0].id);
  const pendingSec = useRef<string | null>(first?.section ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const want = `/settings/${group}`;
    if (window.location.pathname !== want || window.location.search) window.history.replaceState(null, '', want);
  }, [group]);

  const goGroup = (g: GroupId, sec?: string) => {
    setPeek(null);
    if (g !== group) {
      setGroup(g);
      setVisited(v => (v.includes(g) ? v : [...v, g]));
    }
    pendingSec.current = sec ?? null;
    setActiveSec(sec ?? GROUPS.find(x => x.id === g)!.sections.find(x => !hiddenSet.has(x.id))?.id ?? '');
    if (!sec && scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const scrollToSec = (id: string, smooth = true) => {
    const el = document.getElementById(`set-${id}`);
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? 'smooth' : 'auto' });
    setActiveSec(id);
  };
  // 그룹을 그린 뒤 가야 할 항목이 있으면 그리로 (예전 탭 주소로 들어온 경우·목차에서 다른 그룹 항목)
  useEffect(() => {
    const id = pendingSec.current;
    if (!id) return;
    pendingSec.current = null;
    if (hiddenSet.has(id)) { openPeek(id); return; }   // 숨긴 항목 주소로 들어오면 그 항목만 연다
    requestAnimationFrame(() => scrollToSec(id, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);
  // 목차가 스크롤을 따라간다 — 화면 위쪽을 지난 마지막 항목
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (peek || !curSecs.length) return;
        let on = curSecs[0].id;
        for (const sc of curSecs) {
          const el = document.getElementById(`set-${sc.id}`);
          if (el && el.offsetTop - box.scrollTop <= 80) on = sc.id;
        }
        // 맨 아래까지 내리면 마지막 항목 (짧은 마지막 항목이 위쪽에 닿지 못하는 경우)
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) on = curSecs[curSecs.length - 1].id;
        setActiveSec(on);
      });
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); box.removeEventListener('scroll', onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, peek, hiddenIds.join('|')]);

  // 2차 줄 — 켜진 칩이 줄 밖에 있으면 가로로 당겨 보이게 (페이지 자체는 움직이지 않게 scrollLeft만)
  useEffect(() => {
    const box = subRef.current;
    const on = box?.querySelector<HTMLElement>('button.on');
    if (!box || !on) return;
    const l = on.offsetLeft - 12, r = on.offsetLeft + on.offsetWidth + 12;
    if (l < box.scrollLeft) box.scrollTo({ left: l, behavior: 'smooth' });
    else if (r > box.scrollLeft + box.clientWidth) box.scrollTo({ left: r - box.clientWidth, behavior: 'smooth' });
  }, [activeSec, peek, group, subHidden]);

  /* ---------- 저장 하나 (v3.1 사용자 요청) ----------
     설정 화면이 열려 있는 동안 DRAFT_KEYS의 저장은 settingStore가 붙잡아 두고, 테마·사이트·역할 폰트는
     각자의 드래프트에, 메뉴 편집본처럼 화면이 들고 있는 값은 저장 파트로 등록된다. 맨 위 [저장]이 전부 확정한다.
     그룹을 옮겨도 그대로 남고, 설정 화면을 떠날 때만 묻는다. */
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [paneGen, setPaneGen] = useState(0);
  useEffect(() => {
    if (draftEndTimer) { clearTimeout(draftEndTimer); draftEndTimer = null; }
    beginSettingDraft(DRAFT_KEYS, 'settings');
    force();
    // 페이지를 떠날 때 — 곧바로 다시 그려지는 설정 화면이 없을 때만 버린다
    return () => { draftEndTimer = setTimeout(() => { draftEndTimer = null; endSettingDraft(); }, 0); };
  }, []);
  useEffect(() => {
    window.addEventListener(DRAFT_EVT, force);
    return () => window.removeEventListener(DRAFT_EVT, force);
  }, []);
  const { dirty: themeDirty, discard: themeDiscard, save: themeSave } = useTheme();
  const { rolesDirty, saveRoles, discardRoles } = useFonts();
  const siteDraft = useSiteDraft();
  const parts = useSavePartHost();

  const dirtyGroups = new Set<GroupId>();
  if (themeDirty || rolesDirty) dirtyGroups.add('design');
  if (siteDraft.dirty) {
    const a = siteDraft.site as unknown as Record<string, unknown>;
    const b = siteDraft.saved as unknown as Record<string, unknown>;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) dirtyGroups.add(SITE_LAYOUT_FIELDS.includes(k) ? 'design' : 'site');
    }
  }
  settingDraftDirtyKeys().forEach(k => dirtyGroups.add(KEY_GROUP[k] ?? 'content'));
  parts.dirtyParts.forEach(p => dirtyGroups.add(p.group as GroupId));
  const dirty = dirtyGroups.size > 0 || settingDraftDirty();

  const saveAll = () => {
    const ps = parts.current().filter(p => p.dirty);
    ps.forEach(p => p.save());          // 화면의 편집본 → 저장 계층(드래프트)으로
    if (themeDirty) themeSave();
    siteDraft.save();
    saveRoles();                         // 폰트 키에 들어가므로 드래프트 확정보다 먼저
    commitSettingDraft();
    ps.forEach(p => p.after?.());
    toast('저장되었습니다');
  };
  const discardAll = () => {
    parts.current().forEach(p => { if (p.dirty) p.discard(); });
    themeDiscard(); siteDraft.discard(); discardRoles(); discardSettingDraft();
    setPaneGen(g => g + 1);              // 화면 안에서 한 번 읽어 들고 있던 값도 저장본으로
  };
  const ref = useRef({ dirty, discardAll });
  ref.current = { dirty, discardAll };
  // 페이지를 떠날 때 테마·사이트·역할 폰트 미리보기는 저장본으로 (settingStore 드래프트는 위에서 버린다)
  useEffect(() => () => {
    if (ref.current.dirty) { themeDiscard(); siteDraft.discard(); discardRoles(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 저장 안 한 채 새로고침·창 닫기 경고
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // 나가기 (뒤로가기·✕) — 저장 안 한 변경이 있으면 한 번만 묻는다
  const [leaveGo, setLeaveGo] = useState<(() => void) | null>(null);
  const exit = (go: () => void) => { if (ref.current.dirty) setLeaveGo(() => go); else go(); };
  const close = () => { if (window.history.length > 1) router.back(); else router.push('/'); };

  /* 미리보기 (v3.1 사용자 요청) — 디자인 그룹에서만. PC/모바일 전환.
     넓은 화면은 오른쪽 칸(켜고 끌 수 있음), 좁은 화면은 버튼을 누르면 위로 덮는 판 */
  const [pvOn, setPvOn] = useState(true);
  const [pvSheet, setPvSheet] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>('m');
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('ohome.setPreview.v1') ?? 'null') as { on?: boolean; device?: PreviewDevice } | null;
      if (v?.on === false) setPvOn(false);
      if (v?.device === 'pc' || v?.device === 'm') setDevice(v.device);
    } catch { /* 무시 */ }
  }, []);
  const keepPv = (on: boolean, d: PreviewDevice) => {
    try { localStorage.setItem('ohome.setPreview.v1', JSON.stringify({ on, device: d })); } catch { /* 무시 */ }
  };
  const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches;
  const togglePv = () => {
    if (narrow()) setPvSheet(v => !v);
    else { setPvOn(!pvOn); keepPv(!pvOn, device); }
  };
  const showPv = viewGroup === 'design' && (pvOn || pvSheet);

  const renderSec = (id: string) => {
    switch (id) {
      case 'basic': return <SiteBasicPane />;
      case 'main': return <MainPagePane />;
      case 'widgets': return <WidgetsPane />;
      case 'theme': return <ThemePane />;
      case 'layout': return <LayoutPane />;
      case 'detail': return <DetailPane />;
      case 'pagehead': return <PageHeadPane />;
      case 'fonts': return <FontsPane />;
      case 'fontlib': return <FontPane />;
      case 'menu': return <MenuPane />;
      case 'board': return <BoardPane />;
      case 'trpg': return <TrpgPane />;
      case 'threads': return <ThreadPane />;
      case 'bgm': return <BgmPane />;
      case 'members': return <MemberPane />;
      case 'backup': return <DataPane />;
      default: return null;
    }
  };

  if (!isAdmin) {
    return (
      <div className="setx">
        <header className="setx-bar">
          <BackArrow fallback="/" label="설정 닫기" />
          <div className="setx-title"><b>설정</b></div>
        </header>
        <div className="setx-empty">관리자로 로그인하면 환경설정을 사용할 수 있습니다.</div>
      </div>
    );
  }
  return (
    <parts.Provider>
    <div className={`setx${showPv ? ' with-pv' : ''}${pvSheet ? ' pv-sheet' : ''}${subHidden && hiddenIds.length ? ' sub-hid' : ''}`}>
      <header className="setx-bar">
        <BackArrow fallback="/" label="설정 닫기" onGo={exit} />
        <div className="setx-title"><b>설정</b><span>/ {peek ? `숨긴 항목 · ${secLabel(peek)}` : cur.label}</span></div>
        <span className="setx-gap" />
        <span className={`setx-state${dirty ? ' on' : ''}`} role="status">
          {dirty ? <><i className="setx-dot" />저장 안 된 변경</> : '모두 저장됨'}
        </span>
        {viewGroup === 'design' && (
          <button className={`btn btn-ghost setx-pv-btn${showPv ? ' on' : ''}`} aria-pressed={showPv} onClick={togglePv}>미리보기</button>
        )}
        <button className="btn btn-ghost" disabled={!dirty}
          onClick={() => { discardAll(); toast('저장된 상태로 되돌렸습니다'); }}>되돌리기</button>
        <button className="btn btn-dark setx-save" disabled={!dirty} onClick={saveAll}>저장</button>
        <button className="setx-icon setx-x" aria-label="설정 닫기" data-tip="닫기" onClick={() => exit(close)}>✕</button>
      </header>

      <div className="setx-cols">
        <nav className="setx-groups" aria-label="설정 그룹">
          {GROUPS.map(g => (
            // PC 미리보기로 목차를 접는 동안 그룹 버튼에 마우스를 올리면 그 그룹 항목이 옆으로 펼쳐진다 (사용자 요청 — CSS가 그때만 보인다)
            <div key={g.id} className="setx-gwrap">
            <button className={`setx-grp${!peek && g.id === group ? ' on' : ''}`} aria-current={!peek && g.id === group ? 'page' : undefined}
              onClick={() => {
                if (isPhone()) {
                  // 휴대폰: 보고 있는 그룹을 다시 누르면 2차 줄만 접고 펼친다
                  if (!peek && !subHidden && g.id === group) { setSubOpen(o => !o); return; }
                  setSubHidden(false); setSubOpen(true);
                }
                goGroup(g.id);
              }}>
              <i aria-hidden="true">{g.icon}</i>{g.label}
              {dirtyGroups.has(g.id) && <span className="setx-dot" aria-label="저장 안 된 변경" />}
            </button>
            <div className="setx-fly" role="menu" aria-label={`${g.label} 항목`}>
              <small>{g.label}</small>
              {g.sections.filter(sc => !hiddenSet.has(sc.id)).map(sc => (
                <button key={sc.id} role="menuitem" className={!peek && g.id === group && activeSec === sc.id ? 'on' : ''}
                  onClick={e => {
                    (e.currentTarget as HTMLElement).blur();
                    if (!peek && g.id === group) scrollToSec(sc.id); else goGroup(g.id, sc.id);
                  }}>{sc.label}</button>
              ))}
            </div>
            </div>
          ))}
          {/* 숨김 칸 — 관리 아래 1px 선 밑. 접혀 있다가 누르면 카테고리 순서대로 펼쳐진다 */}
          {hiddenIds.length > 0 && (
            <>
              <hr className="setx-hid-line" />
              <button className={`setx-hid-toggle${hidOpen || peek ? ' open' : ''}${subHidden || peek ? ' sub-on' : ''}`}
                aria-expanded={hidOpen || !!peek}
                onClick={() => {
                  if (isPhone()) {
                    // 휴대폰: 숨긴 항목은 2차 줄에 — 이미 펼쳐져 있으면 접는다
                    if ((subHidden || peek) && subOpen) setSubOpen(false);
                    else { setSubHidden(true); setSubOpen(true); }
                    return;
                  }
                  setHidOpen(!(hidOpen || !!peek));
                }}>
                숨김 <b>{hiddenIds.length}</b><span className="caret" aria-hidden="true">▸</span>
              </button>
              {(hidOpen || peek) && (
                <div className="setx-hid-list">
                  {GROUPS.map(g => {
                    const hs = g.sections.filter(sc => hiddenSet.has(sc.id));
                    if (!hs.length) return null;
                    return (
                      <div key={g.id} className="setx-hid-cat">
                        <small>{g.label}</small>
                        {hs.map(sc => (
                          <button key={sc.id} className={peek === sc.id ? 'on' : ''} onClick={() => openPeek(sc.id)}
                            {...ctxProps(() => [{ label: '메뉴로 꺼내기', fn: () => unhideSec(sc.id) }])}>{sc.label}</button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </nav>
        {/* 휴대폰 2차 줄 — 넓은 화면에서는 CSS로 숨기고 왼쪽 목차를 쓴다 */}
        {(() => {
          const hidMode = (subHidden || !!peek) && hiddenIds.length > 0;
          return (
            <nav ref={subRef} className={`setx-sub${subOpen ? '' : ' closed'}`} aria-hidden={!subOpen || undefined}
              aria-label={`${hidMode ? '숨긴 항목' : cur.label} 항목`}>
              {hidMode
                ? GROUPS.flatMap(g => g.sections.filter(sc => hiddenSet.has(sc.id))).map(sc => (
                  <button key={sc.id} className={peek === sc.id ? 'on' : ''} tabIndex={subOpen ? 0 : -1}
                    aria-current={peek === sc.id ? 'true' : undefined} onClick={() => openPeek(sc.id)}
                    {...ctxProps(() => [{ label: '메뉴로 꺼내기', fn: () => unhideSec(sc.id) }])}>{sc.label}</button>
                ))
                : curSecs.map(sc => (
                  <button key={sc.id} className={activeSec === sc.id ? 'on' : ''} tabIndex={subOpen ? 0 : -1}
                    aria-current={activeSec === sc.id ? 'true' : undefined}
                    onClick={() => scrollToSec(sc.id)}
                    {...ctxProps(hideItems(sc.id))}>{sc.label}</button>
                ))}
              {hidMode && <small>길게 누르면 메뉴로 꺼냅니다</small>}
            </nav>
          );
        })()}
        <nav className="setx-toc" aria-label={`${peek ? '숨긴 항목' : cur.label} 목차`}>
          {peek ? (
            <>
              <h2>숨긴 항목</h2>
              <button className="on" {...ctxProps(() => [{ label: '메뉴로 꺼내기', fn: () => unhideSec(peek) }])}>{secLabel(peek)}</button>
              <p className="setx-toc-note">설정값은 그대로 적용됩니다 · 우클릭하면 메뉴로 꺼낼 수 있습니다</p>
            </>
          ) : (
            <>
              <h2>{cur.label}</h2>
              {curSecs.map(sc => (
                <button key={sc.id} className={activeSec === sc.id ? 'on' : ''} onClick={() => scrollToSec(sc.id)}
                  {...ctxProps(hideItems(sc.id))}>{sc.label}</button>
              ))}
            </>
          )}
        </nav>
        <div className="setx-scroll" ref={scrollRef}>
          <div key={paneGen}>
            {GROUPS.filter(g => visited.includes(g.id)).map(g => (
              // 한 번 연 그룹·숨긴 항목도 감춰 두기만 한다 — 오가도 편집 중인 값이 남게
              <div key={g.id} hidden={peek ? g.id !== viewGroup : g.id !== group}>
                {g.sections.map(sc => (
                  <section key={sc.id} id={`set-${sc.id}`} className="setx-sec"
                    hidden={peek ? sc.id !== peek : hiddenSet.has(sc.id)}>
                    <h2 className="setx-sec-h" {...(peek ? {} : ctxProps(hideItems(sc.id)))}>
                      {sc.label}{peek === sc.id && <span className="setx-peek-tag">숨긴 항목</span>}
                    </h2>
                    <div className="panel setx-card">{renderSec(sc.id)}</div>
                  </section>
                ))}
              </div>
            ))}
            {!peek && !curSecs.length && (
              <div className="setx-empty">이 그룹의 항목을 모두 숨겼습니다 — 왼쪽 「숨김」에서 우클릭해 꺼낼 수 있습니다</div>
            )}
          </div>
        </div>
        {showPv && (
          <div className={`setx-pv-wrap ${device}`}>
            {pvSheet && (
              <button className="setx-icon setx-pv-close" aria-label="미리보기 닫기" onClick={() => setPvSheet(false)}>✕</button>
            )}
            <SettingsPreview device={device} onDevice={d => { setDevice(d); keepPv(pvOn, d); }} />
          </div>
        )}
      </div>

      {ctx && ctx.items.length > 0 && (
        <div ref={ctxRef} className="ctx-menu on setx-ctx" role="menu"
          style={{ left: Math.min(ctx.x, window.innerWidth - 160), top: Math.min(ctx.y, window.innerHeight - 60) }}>
          {ctx.items.map(it => (
            <button key={it.label} role="menuitem" onClick={() => { setCtx(null); it.fn(); }}>{it.label}</button>
          ))}
        </div>
      )}
      <ConfirmModal open={!!leaveGo} title="저장하지 않은 변경이 있습니다"
        body="저장하지 않고 나가면 바꾼 내용이 사라지고 저장된 상태로 돌아갑니다."
        onClose={() => setLeaveGo(null)}
        buttons={[
          { label: '저장하고 나가기', kind: 'dark', onClick: () => { const go = leaveGo; saveAll(); setLeaveGo(null); go?.(); } },
          { label: '저장하지 않고 나가기', kind: 'ghost', onClick: () => { const go = leaveGo; discardAll(); setLeaveGo(null); go?.(); } },
          { label: '계속 편집', kind: 'ghost', onClick: () => setLeaveGo(null) },
        ]} />
    </div>
    </parts.Provider>
  );
}

export default function SettingsPage() {
  // 미리보기 iframe 안에서 설정 화면을 또 열지 않게 (v3.1)
  const [inFrame, setInFrame] = useState(false);
  useEffect(() => { setInFrame(isPreviewFrame()); }, []);
  if (inFrame) return <div className="setx-empty">미리보기 안에서는 설정을 열 수 없습니다</div>;
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<div className="setx" />}><SettingsInner /></Suspense>;
}
