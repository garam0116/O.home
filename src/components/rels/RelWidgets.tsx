'use client';
/**
 * 자관 상세 위젯 (v3.3 사용자 확정 시안)
 *  - 기념일: PC는 양옆 카드 아래 세로 타임라인(「오늘 마디」 + 꼬리말 L), 모바일은 이름 아래 가로 띠(N3)
 *  - LOG / LOREBOOK: 오른쪽 카드 아래 탭 위젯(M1) — 자관 수정의 LOG·LOREBOOK 주소가 가리키는 이 홈 안의
 *    목록에서 글을 읽는다. 「ALL →」은 열린 탭의 주소로 간다 (예전 자관명 위 버튼 대신)
 *
 * PC에서는 양옆 아래 끝이 **가운데 일러 끝선과 같아야** 한다 (사용자 요청 — 넘치면 안 됨).
 * 칸 높이는 가운데 일러가 정하고, 넘치면 덜 중요한 줄부터 하나씩 뺀다.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useSections } from '@/lib/sectionStore';
import { useMenuSettings, canAccessHref } from '@/lib/menuStore';
import { postHref, postNumbers } from '@/lib/boardStore';
import { postBodyText, type Post } from '@/lib/postStore';
import { visibleText } from './widgetExcerpt';
import { itemPath } from '@/lib/itemNo';
import { safeLink } from '@/lib/link';
import { parseTarget, pickRows, rowTime, Source, type Row, type SrcKind } from '@/lib/relUpdates';
import { anniversaries, annivBadge, fmtWidgetDate, parseLocalDate, type Anniv } from '@/lib/relAnniv';
import { relDday, relDdayDate } from '@/lib/relStore';

/* ---------- 글 목록 (LOG · LOREBOOK) ---------- */

export interface FeedItem {
  id: string;
  title: string;
  time: number;
  /** 몇 번째 글인지 — 오래된 글부터 1 */
  no: number;
  cat?: string;
  excerpt?: string;
  href?: string;
}

export type Feed =
  | { state: 'none' }
  | { state: 'external'; href: string; host: string }
  | { state: 'loading'; href: string }
  | { state: 'ok'; href: string; items: FeedItem[]; total: number; first?: number };

type FeedRow = Row & {
  title?: string; body?: string; desc?: string; secret?: boolean; authorId?: string;
  tags?: string[]; no?: number;
};

const excerptOf = (kind: SrcKind, r: FeedRow): string | undefined => {
  const raw = kind === 'gallery' ? r.desc : (kind === 'board' || kind === 'diary' || kind === 'trpg') ? r.body : undefined;
  if (typeof raw !== 'string') return undefined;
  // 숨긴 글자는 뺀다 — 이 위젯 전용 (검색은 postBodyText로 모든 글자를 찾는다)
  const txt = (visibleText(raw) ?? postBodyText(raw)).trim();
  return txt ? txt.slice(0, 160) : undefined;
};

/**
 * LOG·LOREBOOK 주소 → 위젯에 보일 글 목록.
 * 돌려주는 `sources`를 페이지 어딘가에 그려 둬야 목록이 불러와진다 (자관 목록의 LATEST UPDATE와 같은 방식).
 */
export function useRelFeeds(urls: (string | undefined)[]) {
  const { user, isAdmin } = useAuth();
  const { list } = useSections();
  const [menuSet] = useMenuSettings();
  const [rowsBy, setRowsBy] = useState<Partial<Record<SrcKind, Row[]>>>({});
  const onRows = useCallback((kind: SrcKind, rows: Row[]) => {
    setRowsBy(prev => (prev[kind] === rows ? prev : { ...prev, [kind]: rows }));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targets = useMemo(() => urls.map(u => parseTarget(u)), [JSON.stringify(urls)]);
  const kinds = [...new Set(targets.filter(Boolean).map(t => t!.kind))];
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };

  const feeds: Feed[] = urls.map((url, i): Feed => {
    const href = safeLink(url);
    if (!href) return { state: 'none' };
    const t = targets[i];
    if (!t) {
      // 바깥 사이트(포스타입 등) — 목록을 읽을 수 없으니 바로가기만
      let host = '';
      try { host = new URL(href, window.location.origin).hostname.replace(/^www\./, ''); } catch { /* 주소 해석 실패 */ }
      return { state: 'external', href, host };
    }
    // 메뉴에서 이 방문자에게 막아 둔 곳이면 위젯에서도 보이지 않는다
    let path = href;
    try { path = new URL(href, window.location.origin).pathname; } catch { /* 그대로 */ }
    if (!canAccessHref(menuSet, path, viewer)) return { state: 'none' };
    const rows = rowsBy[t.kind];
    if (!rows) return { state: 'loading', href };
    const picked = (pickRows(t, rows, list) as FeedRow[]).filter(r =>
      r.visibility === 'private' ? isAdmin : r.visibility === 'member' ? !!user : true);
    const nums = t.kind === 'board' ? postNumbers(rows as unknown as Post[]) : undefined;
    const dated = picked
      .map(r => ({ r, time: rowTime(t.kind, r) }))
      .filter((x): x is { r: FeedRow; time: number } => x.time != null)
      .sort((a, b) => a.time - b.time);
    const items = dated.map(({ r, time }, idx): FeedItem => {
      // 비밀글은 읽을 수 있는 사람(관리자·글쓴이)에게만 제목·내용을 보인다 — 홈 LATEST와 같은 규칙
      const locked = t.kind === 'board' && !!r.secret && !isAdmin && !(r.authorId && r.authorId === user?.id);
      return {
        id: r.id ?? String(idx),
        title: locked ? '비밀글입니다' : (r.title?.trim() || '제목 없음'),
        time,
        no: idx + 1,
        cat: locked ? undefined : r.tags?.[0],
        excerpt: locked ? undefined : excerptOf(t.kind, r),
        href: t.kind === 'board' ? postHref({ id: r.id! }, nums!)
          : t.kind === 'loadb' ? href
          : r.id ? itemPath(`/${t.kind}`, { id: r.id, no: r.no }) : href,
      };
    }).reverse();
    return { state: 'ok', href, items, total: items.length, first: dated[0]?.time };
  });

  const sources = kinds.map(k => <Source key={k} kind={k} onRows={onRows} />);
  return { feeds, sources };
}

/* ---------- 넘치면 줄 빼기 ---------- */

/**
 * `ref` 상자의 내용이 넘치면 하나씩 빼 달라고 숫자를 올린다 (최대 max).
 * 상자 높이가 바뀌면(창 크기·일러 비율) 처음부터 다시 맞춘다. active가 아니면(모바일) 0.
 */
function useFitDrop(ref: React.RefObject<HTMLElement | null>, max: number, active: boolean, key: string) {
  const [state, setState] = useState({ drop: 0, gone: false, key });
  const cur = state.key === key ? state : { drop: 0, gone: false, key };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    if (state.key !== key) { setState({ drop: 0, gone: false, key }); return; }
    if (state.gone || el.scrollHeight <= el.clientHeight + 1) return;
    // 더 뺄 줄이 없는데도 넘치면(창이 좁아 카드 아래가 거의 없을 때) 위젯을 통째로 숨긴다
    setState(s => (s.drop < max ? { ...s, drop: s.drop + 1 } : { ...s, gone: true }));
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !active || typeof ResizeObserver === 'undefined') return;
    let h = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight === h) return;
      h = el.clientHeight;
      setState(s => ({ ...s, drop: 0, gone: false }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active]);
  return active ? { drop: cur.drop, gone: cur.gone } : { drop: 0, gone: false };
}

/* ---------- 기념일 ---------- */

interface AnnivProps {
  startDate?: string;
  firstLog?: number;
  /** 디데이 글씨색 (자관 수정 「디데이 글씨색」) — 가까운 기념일 강조에 쓴다 */
  color?: string;
  /** 위젯 탭 색 (자관 수정 「위젯 탭 색」) — 오늘 표시 점 */
  tab?: string;
}

/** 자관별 색 → 위젯 CSS 변수 (지정 안 한 것은 CSS 기본값 = 포인트색) */
const rwVars = (color?: string, tab?: string) => {
  const v: Record<string, string> = {};
  if (color) v['--rw-hot'] = color;
  if (tab) v['--rw-tab'] = tab;
  return Object.keys(v).length ? v as React.CSSProperties : undefined;
};

function useAnniv(startDate?: string, firstLog?: number) {
  // 날짜는 화면을 연 날 기준 — 렌더마다 새로 만들지 않게 한 번만
  const [now] = useState(() => new Date());
  return useMemo(() => ({ now, a: anniversaries(startDate, firstLog, now) }), [startDate, firstLog, now]);
}

const near = (x: Anniv) => x.diff >= 0 && x.diff <= 7;

/** PC — 카드 아래 세로 타임라인. 넘치면 지난 것(오래된 것부터) → 다가올 것(먼 것부터) 순서로 뺀다 */
export function RelAnnivColumn({ startDate, firstLog, color, tab }: AnnivProps) {
  const { now, a } = useAnniv(startDate, firstLog);
  const box = useRef<HTMLDivElement>(null);
  const past = a ? a.past.slice(0, 2).reverse() : [];
  const future = a ? a.future.slice(0, 4) : [];
  const { drop, gone } = useFitDrop(box, past.length + future.length, true, `${startDate}|${firstLog}`);
  if (!a) return null;
  const cutPast = Math.min(drop, past.length);
  const cutFuture = Math.max(0, drop - past.length);
  const shownPast = past.slice(cutPast);
  const shownFuture = future.slice(0, Math.max(0, future.length - cutFuture));
  const since = relDdayDate(startDate);
  const dd = relDday(startDate, now);
  return (
    <div className={`rw rw-anniv${gone ? ' rw-gone' : ''}`} ref={box} style={rwVars(color, tab)}>
      <div className="rw-lbl"><span>ANNIVERSARY</span></div>
      <ul className="rw-tl">
        {shownPast.map(x => (
          <li key={x.date.getTime()} className="past">
            <span>{x.label}<span className="when">{fmtWidgetDate(x.date, now)}</span></span>
            <b>{annivBadge(x.diff)}</b>
          </li>
        ))}
        <li className="today">
          {a.dayCount > 0
            ? <span className="rw-big">{a.dayCount}<small>DAYS</small></span>
            : <span className="rw-big">{dd}</span>}
        </li>
        {shownFuture.map(x => (
          <li key={x.date.getTime()}>
            <span>{x.label}<span className="when">{fmtWidgetDate(x.date, now)}</span></span>
            <b className={near(x) ? 'near' : ''}>{annivBadge(x.diff)}</b>
          </li>
        ))}
      </ul>
      <div className="rw-foot"><span>SINCE {since}</span><span>{dd}</span></div>
    </div>
  );
}

/** 띠의 SINCE는 늘 연도까지 — 2025.2.8 */
const sinceFull = (v?: string) => {
  const d = parseLocalDate(v);
  return d ? `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}` : '';
};

/** 모바일 — 이름 아래 가로 띠 (옆으로 밀어 보기) */
export function RelAnnivStrip({ startDate, firstLog, color, tab }: AnnivProps) {
  const { now, a } = useAnniv(startDate, firstLog);
  if (!a) return null;
  const past = a.past.slice(0, 1);
  const future = a.future.slice(0, 6);
  return (
    <div className="rw rw-strip" style={rwVars(color, tab)}
      role="region" aria-label="기념일 — 옆으로 밀어 보기">
      <ol>
        {past.map(x => (
          <li key={x.date.getTime()} className="past">
            <b>{annivBadge(x.diff)}</b><span className="lb">{x.label}</span><span className="when">{fmtWidgetDate(x.date, now)}</span>
          </li>
        ))}
        <li className="today">
          <span className="rw-big">{a.dayCount > 0 ? a.dayCount : relDday(startDate, now)}</span>
          <span className="when">SINCE {sinceFull(startDate)}</span>
        </li>
        {future.map(x => (
          <li key={x.date.getTime()}>
            <b className={near(x) ? 'near' : ''}>{annivBadge(x.diff)}</b><span className="lb">{x.label}</span><span className="when">{fmtWidgetDate(x.date, now)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- LOG / LOREBOOK 탭 ---------- */

type TabKey = 'log' | 'lore';

function FeedPane({ kind, feed, rows, now, box }: {
  kind: TabKey; feed: Feed; rows: number; now: Date; box?: boolean;
}) {
  if (feed.state === 'external') {
    return (
      <div className="rw-pane">
        <a className="rw-ext" href={feed.href} target="_blank" rel="noopener noreferrer">
          {feed.host ? `${feed.host}에서 보기 →` : '바로 가기 →'}
        </a>
      </div>
    );
  }
  if (feed.state !== 'ok') return <div className="rw-pane" />;
  const [top, ...rest] = feed.items;
  if (!top) return <div className="rw-pane"><p className="rw-empty">아직 올라온 글이 없습니다</p></div>;
  const shown = rest.slice(0, rows);
  const goal = Math.ceil((feed.total + 1) / 10) * 10;
  return (
    <div className="rw-pane">
      <a className="rw-feat" href={top.href}>
        <span className="meta">
          {kind === 'log' && <span>No.{top.no}</span>}
          {top.cat && <span>{top.cat}</span>}
          <span>{fmtWidgetDate(top.time, now)}</span>
        </span>
        <span className="t">{top.title}</span>
        {top.excerpt && !box && <span className="x">{top.excerpt}</span>}
      </a>
      {shown.map(it => (
        <a key={it.id} className="rw-row" href={it.href}>
          <span className="cat">{it.cat ?? ''}</span>
          <span className="ttl">{it.title}</span>
          <span className="dt">{fmtWidgetDate(it.time, now)}</span>
        </a>
      ))}
      <div className="rw-foot">
        {kind === 'log'
          ? <><span>LOG {feed.total}</span><span>{goal}번째까지 <b>{goal - feed.total}편</b></span></>
          : <><span>LOREBOOK {feed.total}</span><span>최근 등록 {fmtWidgetDate(top.time, now)}</span></>}
      </div>
    </div>
  );
}

/**
 * LOG / LOREBOOK 탭 위젯. fit이면(PC) 칸 높이에 맞춰 한 줄 목록 → 펼친 글 미리보기 순서로 줄인다.
 * 주소가 비었거나 볼 수 없는 탭은 숨기고, 둘 다 없으면 위젯 자체를 그리지 않는다.
 */
export function RelFeedWidget({ log, lore, fit, tab: tabColor }: { log: Feed; lore: Feed; fit?: boolean; tab?: string }) {
  const tabs = ([['log', log], ['lore', lore]] as [TabKey, Feed][]).filter(([, f]) => f.state !== 'none');
  const [tab, setTab] = useState<TabKey | null>(null);
  const cur = tabs.find(([k]) => k === tab) ?? tabs[0];
  const box = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());
  const maxRows = fit ? 4 : 2;
  const feed = cur?.[1];
  const total = feed?.state === 'ok' ? feed.total : 0;
  // 줄 수 → 0까지 줄인 뒤에도 넘치면 펼친 글의 미리보기를 접는다
  const { drop, gone } = useFitDrop(box, maxRows + 1, !!fit, `${cur?.[0]}|${total}`);
  if (!cur) return null;
  const rows = Math.max(0, maxRows - drop);
  const hideExcerpt = drop > maxRows;
  return (
    <div className={`rw rw-feed${fit ? '' : ' rw-flow'}${gone ? ' rw-gone' : ''}`} ref={box} style={rwVars(undefined, tabColor)}>
      <div className="rw-lbl">
        <span className="rw-tabs" role="tablist">
          {tabs.map(([k]) => (
            <button key={k} type="button" role="tab" aria-selected={k === cur[0]} onClick={() => setTab(k)}>
              {k === 'log' ? 'LOG' : 'LOREBOOK'}
            </button>
          ))}
        </span>
        {cur[1].state !== 'none' && (
          <a className="rw-all" href={cur[1].href}
            {...(cur[1].state === 'external' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>ALL →</a>
        )}
      </div>
      <FeedPane kind={cur[0]} feed={cur[1]} rows={rows} now={now} box={hideExcerpt} />
    </div>
  );
}
