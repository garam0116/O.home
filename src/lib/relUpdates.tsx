'use client';
/**
 * 자관 목록의 「LATEST UPDATE」 (v2.1 사용자 요청).
 *
 * 자관 카드의 LOG·LOREBOOK 링크가 가리키는 **이 홈 안의 게시판**에서 가장 최근 글의 날짜를 찾아,
 * 두 링크 중 더 늦은 날짜 하나를 카드에 적는다 (로그 10/1 · 로어북 10/2 → Oct 2, 2026).
 *
 * 링크는 주소 그대로 해석한다 — `/board?b=lore`, `/trpg?s=log`, `/gallery/abc`처럼
 * 목록 주소면 그 목록(섹션)의 글 전체에서, 글 하나의 주소면 그 글의 날짜를 쓴다.
 * 바깥 사이트(포스타입 등) 주소는 그쪽 글 목록을 읽을 수 없으므로 날짜를 계산하지 않는다.
 *
 * 목록 데이터는 **링크가 실제로 가리키는 종류만** 불러온다 — 자관 목록을 열 때마다
 * 게시판·갤러리·로그 백업을 전부 받아오지 않게.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalList } from './postStore';
import { MAIN_BOARD_ID } from './boardStore';
import { useSections, inSection, MAIN_SEC, type SectionKind } from './sectionStore';
import { lastDate, type ThreadWork } from './threadStore';

/** 날짜를 읽을 수 있는 목록 종류 — 주소 첫 칸 → 저장 키 · 섹션 종류 */
const SOURCES = {
  board:   { key: 'ohome.board.v1',    sec: null },
  gallery: { key: 'ohome.backup.v1',   sec: 'gallery' },
  trpg:    { key: 'ohome.trpg.v1',     sec: 'trpg' },
  threads: { key: 'ohome.threads.v1',  sec: 'threads' },
  diary:   { key: 'ohome.diary.v1',    sec: 'diary' },
  loadb:   { key: 'ohome.road.v1',     sec: 'roadview' },
  dotori:  { key: 'ohome.dotori.v1',   sec: 'dotori' },
  playlog: { key: 'ohome.playlog.v1',  sec: 'playlog' },
  comm:    { key: 'ohome.comm.v1',     sec: 'comm' },
} as const satisfies Record<string, { key: string; sec: SectionKind | null }>;

type SrcKind = keyof typeof SOURCES;
type Row = {
  id?: string; date?: string; secId?: string; boardId?: string; visibility?: string;
  posts?: unknown[]; created?: string;
};

interface Target { kind: SrcKind; itemId?: string; board?: string; sec?: string }

/** 링크 → 이 홈 안의 어느 목록(또는 글)인지. 바깥 주소·모르는 주소면 null */
export function parseTarget(url?: string): Target | null {
  const raw = url?.trim();
  if (!raw || typeof window === 'undefined') return null;
  let u: URL;
  try { u = new URL(raw, window.location.origin); } catch { return null; }
  if (u.origin !== window.location.origin) return null;
  const [first, second] = u.pathname.split('/').filter(Boolean);
  if (!first || !(first in SOURCES)) return null;
  const kind = first as SrcKind;
  const itemId = second && !['write', 'new'].includes(second) ? decodeURIComponent(second) : undefined;
  return {
    kind, itemId,
    board: u.searchParams.get('b') ?? undefined,
    sec: u.searchParams.get('s') ?? undefined,
  };
}

/** 문자열 날짜 → ms. YYYY-MM-DD는 그 날의 현지 자정으로 (UTC로 읽으면 하루 밀린다) */
function toTime(v?: string): number | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

/** newId()로 만든 id는 앞부분이 만든 시각(base36)이다 — 날짜 칸이 빈 글(로그 백업 등)의 대신 */
function idTime(id?: string): number | undefined {
  if (!id || id.length < 9) return undefined;
  const t = parseInt(id.slice(0, 8), 36);
  // 2020 ~ 2100 사이만 믿는다 — 다른 방식의 id를 엉뚱한 날짜로 읽지 않게
  return t > 1577836800000 && t < 4102444800000 ? t : undefined;
}

function rowTime(kind: SrcKind, r: Row): number | undefined {
  if (kind === 'threads') return toTime(lastDate(r as unknown as ThreadWork));
  return toTime(r.date) ?? idTime(r.id);
}

/** 화면 표기 — Oct 2, 2026 */
export const fmtUpdate = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** 목록 하나를 불러와 위로 넘겨 주는 보이지 않는 부품 — 필요한 종류만 그린다 */
function Source({ kind, onRows }: { kind: SrcKind; onRows: (kind: SrcKind, rows: Row[]) => void }) {
  const [rows] = useLocalList<Row>(SOURCES[kind].key, []);
  useEffect(() => { onRows(kind, rows); }, [kind, rows, onRows]);
  return null;
}

/**
 * 링크 묶음(카드마다 [LOG, LOREBOOK]) → 가장 최근 날짜(ms).
 * 돌려주는 `sources`를 페이지 어딘가에 그려 둬야 목록이 불러와진다.
 */
export function useLatestUpdates(linkSets: (string | undefined)[][], isAdmin: boolean) {
  const { list } = useSections();
  const [rowsBy, setRowsBy] = useState<Partial<Record<SrcKind, Row[]>>>({});
  const onRows = useCallback((kind: SrcKind, rows: Row[]) => {
    setRowsBy(prev => (prev[kind] === rows ? prev : { ...prev, [kind]: rows }));
  }, []);

  const parsed = useMemo(() => linkSets.map(set => set.map(parseTarget).filter((t): t is Target => !!t)),
    // 링크 문자열이 같으면 다시 해석하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(linkSets)]);
  const kinds = useMemo(() => [...new Set(parsed.flat().map(t => t.kind))], [parsed]);

  const latestOf = (t: Target): number | undefined => {
    const rows = rowsBy[t.kind];
    if (!rows) return undefined;
    let hit: Row[];
    if (t.itemId) {
      hit = rows.filter(r => r.id === t.itemId);
    } else if (t.kind === 'board') {
      const b = t.board ?? MAIN_BOARD_ID;
      hit = rows.filter(r => (r.boardId ?? MAIN_BOARD_ID) === b);
    } else {
      // ?s= 는 섹션 id 또는 별명 — 못 찾으면 목록 페이지처럼 기본 섹션으로 본다
      const secKind = SOURCES[t.kind].sec as SectionKind;
      const items = list(secKind);
      const secId = (t.sec && items.find(s => s.id === t.sec || (s.slug ?? '') === t.sec)?.id) || MAIN_SEC;
      hit = rows.filter(r => inSection(r.secId, secId));
    }
    // 나만보기 글의 날짜는 관리자에게만 반영한다
    if (!isAdmin) hit = hit.filter(r => r.visibility !== 'private');
    let best: number | undefined;
    for (const r of hit) {
      const tm = rowTime(t.kind, r);
      if (tm != null && (best == null || tm > best)) best = tm;
    }
    return best;
  };

  const latest = parsed.map(ts => {
    let best: number | undefined;
    for (const t of ts) {
      const tm = latestOf(t);
      if (tm != null && (best == null || tm > best)) best = tm;
    }
    return best;
  });

  const sources = kinds.map(k => <Source key={k} kind={k} onRows={onRows} />);
  return { latest, sources };
}
