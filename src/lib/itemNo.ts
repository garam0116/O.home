'use client';
/**
 * 항목 번호 (v2.4 사용자 요청) — 홈의 모든 글·항목은 **올린 순서대로 고정된 번호 주소**를 갖는다.
 *
 *   /board/1 · /gallery/3 · /comm/2 · /trpg/5 · /chars/4 (별명이 있으면 /chars/eden) …
 *
 * · 번호는 종류마다 따로 이어진다(게시판은 모든 게시판을 통틀어 하나, 갤러리는 모든 갤러리를 통틀어 하나).
 *   그래서 게시판·갤러리 목록을 옮겨도 주소가 바뀌지 않는다.
 * · 번호는 **서버 카운터에서 받는다**(backend.reserveNo). 회원은 비공개 글을 볼 수 없어
 *   「보이는 마지막 번호 + 1」로는 이미 나간 번호를 또 줄 수 있기 때문이다.
 *   번호가 비어 보여도(못 보는 글이 그 번호를 가졌다) 같은 번호는 절대 두 번 나가지 않는다.
 * · 번호가 없는 예전 항목은 만든 순서대로 번호를 붙여 보여 주고, 관리자가 접속하면
 *   그 번호를 항목에 저장한다(NumberSync). 그 뒤로는 무엇을 지워도 다른 번호가 밀리지 않는다.
 */
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { backend, isServerMode } from './backend';

/** 번호를 매기는 목록 — 저장 키 → 카운터 이름(= 서버 테이블 이름) */
export const NUMBERED: Record<string, string> = {
  'ohome.board.v1': 'posts',
  'ohome.backup.v1': 'gallery',
  'ohome.comm.v1': 'commissions',
  'ohome.commapply.v1': 'applicants',
  'ohome.diary.v1': 'diary',
  'ohome.dotori.v1': 'dotori',
  'ohome.playlog.v1': 'playlog',
  'ohome.threads.v1': 'threads',
  'ohome.trpg.v1': 'trpg_logs',
  'ohome.tchars.v1': 'trpg_chars',
  'ohome.chars.v1': 'characters',
  'ohome.rels.v1': 'relations',
};

/** 회원 번호 카운터 이름 — /members/{번호} */
export const MEMBER_COUNTER = 'members';

export interface NoRow { id: string; no?: number; date?: string; created?: string; createdAt?: number }

/** newId()로 만든 id는 앞 8자리가 만든 시각(base36)이다 */
function idTime(id: string): number | undefined {
  if (typeof id !== 'string' || id.length < 9) return undefined;
  const t = parseInt(id.slice(0, 8), 36);
  return t > 1577836800000 && t < 4102444800000 ? t : undefined;
}

/** 만든 시각 — id에 든 시각 → 만든 날짜 칸 → 날짜 칸 순 */
export function createdAtOf(r: NoRow): number {
  return idTime(r.id)
    ?? (typeof r.createdAt === 'number' ? r.createdAt : undefined)
    ?? (Date.parse(r.created ?? '') || Date.parse(r.date ?? '') || 0);
}

const validNo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/**
 * 항목 id → 번호.
 * 저장된 번호는 그대로 쓴다(같은 번호가 둘이면 먼저 만든 쪽만). 번호가 없는 항목은
 * 만든 순서대로, **이미 쓰인 번호를 건너뛰며** 1부터 채운다 — 관리자가 저장하기 전의 임시 번호다.
 */
export function numbersOf(rows: NoRow[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => createdAtOf(a) - createdAtOf(b) || a.id.localeCompare(b.id));
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const r of sorted) {
    if (validNo(r.no) && !used.has(r.no)) { out.set(r.id, r.no); used.add(r.no); }
  }
  /* 번호 없는 항목 — 번호를 받은 항목 중 가장 나중 것보다 **먼저** 만든 예전 항목은 빈 번호를 1부터 채우고,
     그보다 **뒤에** 만든 것(번호를 받는 중인 새 항목)은 가장 큰 번호 다음에 붙인다.
     새 항목이 지운 글의 빈 번호를 잠깐이라도 빌려 쓰지 않게 */
  let newestNumbered = -Infinity;
  let max = 0;
  for (const r of sorted) {
    if (!out.has(r.id)) continue;
    newestNumbered = Math.max(newestNumbered, createdAtOf(r));
    max = Math.max(max, out.get(r.id)!);
  }
  let n = 1;
  for (const r of sorted) {
    if (out.has(r.id)) continue;
    if (createdAtOf(r) > newestNumbered) { out.set(r.id, ++max); continue; }
    while (used.has(n)) n++;
    out.set(r.id, n);
    used.add(n);
    if (n > max) max = n;
  }
  return out;
}

/** 지금 보이는 가장 큰 번호 */
export function maxNo(rows: NoRow[]): number {
  let max = 0;
  numbersOf(rows).forEach(n => { if (n > max) max = n; });
  return max;
}

/** 항목 주소 — 저장된 번호, 아직 없으면 id(그 주소로 들어와도 번호 주소로 바뀐다) */
export const itemPath = (base: string, r: { id: string; no?: number }) => `${base}/${validNo(r.no) ? r.no : r.id}`;

/** 주소 값(번호 또는 예전 id) → 항목 */
export function findByNo<T extends NoRow>(rows: T[], key: string, nums: Map<string, number> = numbersOf(rows)): T | undefined {
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    const hit = rows.find(r => nums.get(r.id) === n);
    if (hit) return hit;
  }
  return rows.find(r => r.id === key);
}

/** 번호 주소의 값 — 번호를 모르면 id */
export const noKeyOf = (r: { id: string }, nums: Map<string, number>) => String(nums.get(r.id) ?? r.id);

/* ---------- 번호 받기 ---------- */

const LOCAL_KEY = 'ohome.counters.v1';
/** 번호 발급이 서버 규칙에 막혔을 때 — 관리자 화면이 받아 「규칙을 다시 붙여 넣어 주세요」를 띄운다 */
export const NO_ERR_EVT = 'ohome-no-error';

function localReserve(kind: string, count: number, floor: number): number {
  let map: Record<string, number> = {};
  try { map = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}'); } catch { /* 처음 */ }
  const base = Math.max(map[kind] ?? 0, floor);
  map[kind] = base + count;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(map)); } catch { /* 무시 */ }
  return base + 1;
}

/**
 * kind 카운터에서 count개를 받아 첫 번호를 돌려준다. floor = 지금 보이는 가장 큰 번호.
 * 서버가 거부하면(규칙·스키마를 아직 갱신하지 않음) floor + 1로 대신하고 알린다 —
 * 글쓰기가 막히는 것보다는 낫고, 관리자가 규칙을 갱신하면 그때부터 겹치지 않는다.
 */
export async function reserveNos(kind: string, count: number, floor: number): Promise<number> {
  const be = isServerMode() ? backend() : null;
  if (!be) return localReserve(kind, count, floor);
  try {
    return await be.reserveNo(kind, count, floor);
  } catch (err) {
    console.error('[ohome] 번호 발급 실패', kind, err);
    try {
      window.dispatchEvent(new CustomEvent(NO_ERR_EVT, {
        detail: { kind, message: err instanceof Error ? err.message : String(err) },
      }));
    } catch { /* 무시 */ }
    return floor + 1;
  }
}

/** 새 항목 하나의 번호 — 목록 저장 키와 지금 목록으로 */
export function allocNo(key: string, rows: NoRow[]): Promise<number> {
  const kind = NUMBERED[key];
  return reserveNos(kind ?? key, 1, maxNo(rows));
}

/**
 * 번호를 저장해 둘 항목만 바꾼 목록 — 바꿀 게 없으면 null.
 * 관리자가 접속할 때(NumberSync) 예전 항목에 번호를 붙이고, 겹친 번호를 풀어 준다.
 */
export function withNumbers<T extends NoRow>(rows: T[]): T[] | null {
  const nums = numbersOf(rows);
  let changed = false;
  const next = rows.map(r => {
    const n = nums.get(r.id);
    if (n === undefined || r.no === n) return r;
    changed = true;
    return { ...r, no: n };
  });
  return changed ? next : null;
}

/* ---------- 상세·수정 페이지 ---------- */

/**
 * 주소 값(번호·예전 id·별명) → 그 항목의 id (v2.4). 찾으면 주소창을 지금 주소로 바꿔 둔다 —
 * 예전 id 주소(`/gallery/mvwvev4lnr1m`)로 들어와도 `/gallery/3`이 남게.
 *
 * 페이지의 `const { id } = useParams()`를 `const { id: rawKey } = useParams()`로 바꾸고,
 * 목록을 불러온 다음 `const id = useNoKey(rows, rawKey, k => `/gallery/${k}`)`로 쓰면
 * 나머지 코드(`x.id === id`)는 그대로 둘 수 있다.
 * slug: 캐릭터·자관처럼 별명 주소가 있는 종류 — 별명이 있으면 별명이 대표 주소다.
 */
export function useNoKey<T extends NoRow & { slug?: string }>(
  rows: T[], rawKey: string, hrefOf: (key: string) => string, opts?: { slug?: boolean; ready?: boolean; force?: boolean },
): string {
  const router = useRouter();
  const key = decodeURIComponent(rawKey ?? '');
  const nums = useMemo(() => numbersOf(rows), [rows]);
  const bySlug = opts?.slug ? rows.find(r => (r.slug ?? '').trim() === key) : undefined;
  const item = bySlug ?? findByNo(rows, key, nums);
  const canonKey = item
    ? (opts?.slug && item.slug?.trim()) || String(nums.get(item.id) ?? item.id)
    : null;
  // force: 주소 값은 맞지만 옛 꼬리(`?au=`)가 붙어 있어 새 주소로 바꿔야 할 때
  const target = canonKey && (canonKey !== key || opts?.force) && opts?.ready !== false ? hrefOf(canonKey) : null;
  useEffect(() => {
    if (!target) return;
    // 주소 뒤에 붙은 것(#…)은 그대로 들고 간다
    router.replace(target + (typeof window === 'undefined' ? '' : window.location.hash));
  }, [target, router]);
  return item?.id ?? key;
}

/** 항목의 대표 주소 값 — 별명(있으면) → 번호 → id */
export const itemKeyOf = (r: { id: string; slug?: string }, nums: Map<string, number>) =>
  r.slug?.trim() || noKeyOf(r, nums);
