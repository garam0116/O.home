'use client';
/**
 * 자관 상세 위젯 (v3.3 사용자 확정 시안)
 *  - 기념일: PC는 양옆 카드 아래 세로 타임라인(「오늘 마디」 + 꼬리말 L), 모바일은 이름 아래 가로 띠(N3)
 *    기념일 당일에는 그날 기념일을 오늘 칸에 합친다 (v3.7 · 시안 P1).
 *    「지나온 날 돌아보기」 장부는 세 장(그때 그 로그 · 기록 습관 · 함께 맞은 것들)이고 제목 아래 장 이름으로 넘긴다 (v3.8 · 시안 V2).
 *    v4.1부터 평소에도 연다 (사용자 확정 · 시안 C-3): 오늘 칸 날수 아래 「오늘의 한 줄」(장부 속 한 줄 미리보기)을 누르면
 *    그 줄이 있는 장으로 열린다. 기념일 당일의 한 줄은 늘 「N 전 이맘때」 글이다.
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
import { anniversaries, annivBadge, annivMessage, fmtWidgetDate, parseLocalDate, type Anniv } from '@/lib/relAnniv';
import { relDday, relDdayDate } from '@/lib/relStore';
import { logRecap, lookback, paceAt, paceTo, pickAgain, pickDaily, skyRecap, WEEKDAYS, type RecapLog } from '@/lib/relRecap';
import { AppLink } from '@/components/ui/AppLink';

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
  /** LOG 목록에서 이 방문자에게 보이는 글 — 기념일 당일 「돌아보기」 1·2장 (목록을 못 읽으면 없음) */
  logs?: RecapLog[];
  /** LOREBOOK 목록에서 이 방문자에게 보이는 글 수 — 2장 「쌓인 로어북」 (못 읽으면 없음) */
  loreCount?: number;
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

/** 오늘이 기념일이면 그 기념일 (anniversaries의 future 맨 앞이 diff 0) */
const todayOf = (a: { future: Anniv[] } | null) => (a?.future[0]?.diff === 0 ? a.future[0] : undefined);

/** 연도까지 — 2025.2.8 */
const fullDate = (d: Date) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;

/** 선 아이콘 — 글자색을 따라간다. 문자 기호(▾ ↩ 등)는 기기마다 이모지로 바뀔 수 있어 쓰지 않는다 */
const RwIcon = ({ d }: { d: string }) => (
  <svg className="rw-ic" viewBox="0 0 12 12" aria-hidden="true"><path d={d} /></svg>
);
const IC_RIGHT = 'M4.5 3 7.5 6 4.5 9';
const IC_UP = 'M3 7.5 6 4.5 9 7.5';
const IC_CLOSE = 'M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5';

/**
 * 오늘의 한 줄 — 오늘 칸 날수 아래, 누르면 장부를 그 줄이 있는 장으로 연다 (v4.1 사용자 확정 · 시안 C-3).
 * 「이름 값 ›」 한 줄이고 값이 길면 말줄임. 보여 줄 줄이 없으면(로그·날짜 숫자가 하나도 없음) 「지나온 날 돌아보기」.
 * 모바일은 장부가 띠 아래에 펼쳐지고 띠는 그대로 보이므로, 열려 있는 동안은 「접기」로 바뀐다.
 */
function RecapPeek({ peek, open, onToggle, btnRef }: {
  peek?: Peek; open: boolean; onToggle: () => void;
  btnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  if (open || !peek) {
    return (
      <button type="button" className="rw-recap-btn" ref={btnRef} aria-expanded={open} onClick={onToggle}>
        {open ? '접기' : '지나온 날 돌아보기'}<RwIcon d={open ? IC_UP : IC_RIGHT} />
      </button>
    );
  }
  return (
    <button type="button" className="rw-peek" ref={btnRef} aria-expanded={false} onClick={onToggle}
      aria-label={`지나온 날 돌아보기 — ${peek.k} ${peek.v}`}>
      <span className="k">{peek.k}</span><span className="v">{peek.v}</span><RwIcon d={IC_RIGHT} />
    </button>
  );
}

/**
 * 기념일 당일의 오늘 칸 (v3.7 사용자 확정 — 시안 P1 「장부 한 장」).
 * 그날 기념일은 따로 한 줄로 두지 않고 오늘 칸에 합친다: 「TODAY · 이름」 + 날수 + 한마디 + 오늘의 한 줄(RecapPeek).
 * 모바일 띠는 꼬리말이 없어 오늘 칸에 SINCE를 둔다 — 날수 오른쪽에 「SINCE / 날짜」 두 줄로,
 * 오른쪽 끝을 오늘 칸에서 가장 긴 줄 끝에 맞춘다 (v3.9 사용자 확정 · 시안 S2-R). PC는 꼬리말에 SINCE가 늘 있으니 넣지 않는다.
 */
function TodayAnniv({ x, days, strip, since, peek, open, onToggle, btnRef }: {
  x: Anniv; days: number; strip?: boolean; since?: string; peek?: Peek; open: boolean; onToggle: () => void;
  btnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const head = <span className="rw-eyebrow">TODAY · {x.label}</span>;
  const msg = <span className="rw-msg">{annivMessage(x.label)}</span>;
  return (
    <>
      {strip ? (
        <span className="rw-td-m">
          {head}
          <span className="rw-td-num">
            <span className="rw-big">{days}</span>
            {since && <span className="rw-since"><b>SINCE</b><span>{since}</span></span>}
          </span>
          {msg}
        </span>
      ) : <>{head}<span className="rw-big">{days}<small>DAYS</small></span>{msg}</>}
      <RecapPeek peek={peek} open={open} onToggle={onToggle} btnRef={btnRef} />
    </>
  );
}

/** alts가 있으면 누를 때마다 alts를 돌아가며 보인다 (v는 그 첫 값) */
type RecapRow = { k: string; v: React.ReactNode; hot?: boolean; alts?: React.ReactNode[] };
type RecapPage = { name: string; rows: RecapRow[]; foot?: RecapRow };
/** 오늘의 한 줄 — 장부 속 한 줄을 글자로만 (버튼 안에 링크를 둘 수 없어서). pg는 그 줄이 있는 장 */
type Peek = { k: string; v: string; pg: number };
const num = (v: React.ReactNode, unit?: string) => <><span className="num">{v}</span>{unit && <small>{unit}</small>}</>;

/**
 * 장부 세 장의 줄 (v3.8 사용자 확정). 줄 순서가 곧 중요도 — 칸이 모자라면 아래 줄부터 뺀다.
 * 값이 없는 줄(로그 목록을 못 읽음·0)은 만들지 않고, 줄이 하나도 없는 장은 장 이름째 뺀다.
 * 장마다 맨 아래 줄(foot)이 따로 있다 (v4.0 사용자 확정): 1장 다시 꺼내 볼 로그 · 2장 이 속도라면 · 3장 다음 기념일.
 * 2장 「이 속도라면」은 셈이 세 가지(다음 목표 편수 · 다음 큰 기념일 · 다음 주년)라 누를 때마다 바뀐다 (v4.2 사용자 확정 — 따로 표시는 붙이지 않는다).
 * 맨 아래 줄은 칸이 모자라도 빼지 않는다.
 * x는 오늘이 기념일일 때만 있다 — 평소 날(v4.1)에는 「1년 전 이맘때」로 찾고, 3장 맨 아래는 가장 가까운 기념일이다.
 * 장부 속 로그는 글 번호 없이 제목만 (v4.1 사용자 확정 — 「No.23」을 뺀다).
 *
 * 오늘의 한 줄(peek)도 여기서 고른다 (v4.1 사용자 확정 · 시안 C-3): 기념일 당일엔 「N 전 이맘때」 글,
 * 평소엔 아래 후보 중 하루 한 줄(pickDaily) — N 전 이맘때 · 가장 많이 쓴 달 · 즐겨 쓴 요일 · 이 속도라면 · 함께 본 보름달 · 은하 거리.
 */
function recapData(p: {
  a: { future: Anniv[]; dayCount: number }; x?: Anniv; now: Date; startDate?: string;
  logs?: RecapLog[]; loreCount?: number;
}): { pages: RecapPage[]; peek?: Peek } {
  const { x, now } = p;
  const lg = logRecap(p.logs, p.startDate, now);
  const back = lookback(p.logs, x, p.startDate, now);
  const sky = skyRecap(p.startDate, now);
  const r1: RecapRow[] = [];
  if (lg) {
    r1.push({ k: '남긴 로그', v: num(lg.total, '편') });
    if (back) {
      const t = back.log.title;
      r1.push({ k: back.label, v: back.log.href ? <AppLink href={back.log.href}>{t}</AppLink> : t });
    }
    if (lg.peak) r1.push({ k: '가장 많이 쓴 달', v: <>{num(`${lg.peak.y}.${lg.peak.m}`)} <small>{lg.peak.n}편</small></> });
    if (lg.lastAgo != null) r1.push({ k: '마지막 로그', v: lg.lastAgo === 0 ? '오늘' : num(lg.lastAgo, '일 전') });
    if (lg.first) r1.push({ k: '첫 로그', v: num(fullDate(new Date(lg.first.time))) });
  }
  const again = pickAgain(p.logs, [back?.log, lg?.first], p.startDate, now);
  const t1 = again?.title;
  const foot1: RecapRow | undefined = again && { k: '다시 꺼내 볼 로그', hot: true, v: again.href ? <AppLink href={again.href}>{t1}</AppLink> : t1 };
  const r2: RecapRow[] = [];
  if (lg?.avg) r2.push({ k: '한 달 평균', v: num(lg.avg, '편') });
  if (lg?.weekday) r2.push({ k: '즐겨 쓴 요일', v: <>{WEEKDAYS[lg.weekday.day]} <small>{lg.weekday.n}편</small></> });
  if (lg?.gap) r2.push({ k: '가장 길었던 공백', v: num(lg.gap, '일') });
  if (lg?.thisYear) r2.push({ k: '올해 쓴 로그', v: num(lg.thisYear, '편') });
  if (p.loreCount) r2.push({ k: '쌓인 로어북', v: num(p.loreCount, '편') });
  const pace = lg ? paceTo(lg.total, lg.avg, now) : undefined;
  const at = lg ? paceAt(lg.total, lg.avg, p.a.future) : {};
  // 「이 속도라면」 셈 — 화면용(v)과 오늘의 한 줄용 글자(t)를 같은 순서로
  const paces: { v: React.ReactNode; t: string }[] = [];
  if (pace) paces.push({ v: <>{pace.target}편째 {num(`${pace.y}.${pace.m}`)} <small>무렵</small></>, t: `${pace.target}편째 ${pace.y}.${pace.m} 무렵` });
  if (at.big) paces.push({ v: <>{at.big.label}엔 {num(at.big.n, '편')}</>, t: `${at.big.label}엔 ${at.big.n}편` });
  if (at.year) paces.push({ v: <>{at.year.label}엔 {num(at.year.n, '편')} <small>· {at.year.gain}편 더</small></>, t: `${at.year.label}엔 ${at.year.n}편 · ${at.year.gain}편 더` });
  const foot2: RecapRow | undefined = paces.length ? {
    k: '이 속도라면', hot: true, v: paces[0].v, alts: paces.length > 1 ? paces.map(x => x.v) : undefined,
  } : undefined;
  const r3: RecapRow[] = [];
  if (sky?.galaxyEok) r3.push({ k: '은하를 따라 흘러간 거리', v: num(sky.galaxyEok.toLocaleString(), '억 km') });
  if (sky?.moons) r3.push({ k: '함께 본 보름달', v: num(sky.moons, '번') });
  if (sky?.weekends) r3.push({ k: '함께 보낸 주말', v: num(sky.weekends, '번') });
  if (sky?.newYears) r3.push({ k: '함께 넘긴 새해', v: num(sky.newYears, '번') });
  if (sky?.seasons) r3.push({ k: '지나온 계절', v: num(sky.seasons, '번') });
  // 당일엔 future[0]이 오늘 기념일이라 그 다음 것
  const next = p.a.future[x ? 1 : 0];
  const foot3: RecapRow | undefined = next && { k: '다음 기념일', hot: true, v: <>{next.label} <span className="num">{annivBadge(next.diff)}</span></> };
  const pages = [
    { name: '그때 그 로그', rows: r1, foot: foot1 },
    { name: '기록 습관', rows: r2, foot: foot2 },
    { name: '함께 맞은 것들', rows: r3, foot: foot3 },
  ].filter(pg => pg.rows.length);

  const pageAt = (name: string) => pages.findIndex(pg => pg.name === name);
  const cand: (Omit<Peek, 'pg'> & { page: string })[] = [];
  const backPeek = back && { page: '그때 그 로그', k: back.label, v: back.log.title };
  if (backPeek) cand.push(backPeek);
  if (lg?.peak) cand.push({ page: '그때 그 로그', k: '가장 많이 쓴 달', v: `${lg.peak.y}.${lg.peak.m} · ${lg.peak.n}편` });
  if (lg?.weekday) cand.push({ page: '기록 습관', k: '즐겨 쓴 요일', v: `${WEEKDAYS[lg.weekday.day]} · ${lg.weekday.n}편` });
  if (paces.length) cand.push({ page: '기록 습관', k: '이 속도라면', v: paces[0].t });
  if (sky?.moons) cand.push({ page: '함께 맞은 것들', k: '함께 본 보름달', v: `${sky.moons}번` });
  if (sky?.galaxyEok) cand.push({ page: '함께 맞은 것들', k: '은하를 따라 흘러간 거리', v: `${sky.galaxyEok.toLocaleString()}억 km` });
  const usable = cand.filter(c => pageAt(c.page) >= 0);
  const pick = x && backPeek && pageAt(backPeek.page) >= 0 ? backPeek : pickDaily(usable, p.startDate, now);
  const peek = pick && { k: pick.k, v: pick.v, pg: pageAt(pick.page) };
  return { pages, peek };
}

/**
 * 「지나온 N일」 장부 — 기념일 당일 돌아보기를 누르면 PC는 타임라인 자리에, 모바일은 띠 아래에 펼친다.
 * 세 장으로 나눠 제목 아래 장 이름으로 넘긴다 (v3.8 · 시안 V2). 장마다 다섯 줄 + 그 장의 맨 아래 줄(recapData의 foot).
 * 모바일은 장부를 옆으로 밀어도 넘어간다. 열 때마다 오늘의 한 줄이 있는 장부터 (start, v4.1).
 * 머리말은 기념일 당일 「TODAY · 이름」, 평소 「TODAY · 11.4」.
 * PC는 칸 높이가 가운데 일러로 정해져 있어, 넘치면 장의 아래 줄부터 뺀다 (맨 아래 줄은 남긴다).
 */
function AnnivRecap({ dayCount, x, now, pages, start, strip, onClose, closeRef }: {
  dayCount: number; x?: Anniv; now: Date; pages: RecapPage[]; start: number; strip?: boolean; onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pg, setPg] = useState(start);
  const cur = pages[Math.min(pg, pages.length - 1)];
  const box = useRef<HTMLDivElement>(null);
  const rowsN = cur?.rows.length ?? 0;
  const { drop } = useFitDrop(box, rowsN, !strip, `${pg}|${rowsN}`);
  const rows = (cur?.rows ?? []).slice(0, Math.max(0, rowsN - drop));
  const foot = cur?.foot;
  // 맨 아래 줄에 셈이 여러 개면(alts) 줄을 누를 때마다 다음 셈 — 장을 넘기면 첫 셈으로
  const [alt, setAlt] = useState(0);
  const turn = () => setAlt(i => i + 1);
  const go = (d: number) => { setPg(i => Math.min(pages.length - 1, Math.max(0, i + d))); setAlt(0); };
  const swipe = useRef<number | null>(null);
  return (
    <div className={`rw-recap${strip ? ' rw-recap-m' : ''}`} ref={box}
      onTouchStart={strip ? e => { swipe.current = e.touches[0].clientX; } : undefined}
      onTouchEnd={strip ? e => {
        if (swipe.current == null) return;
        const dx = e.changedTouches[0].clientX - swipe.current;
        swipe.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      } : undefined}>
      <div className="rw-recap-h">
        <span className="t">
          <span className="rw-eyebrow">TODAY · {x ? x.label : `${now.getMonth() + 1}.${now.getDate()}`}</span>
          <span className="rw-recap-ttl">지나온 {dayCount}<small>일</small></span>
          {pages.length > 1 && (
            <span className="rw-recap-tabs" role="tablist" aria-label="돌아보기 장">
              {pages.map((q, i) => (
                <button key={q.name} type="button" role="tab" aria-selected={q === cur} onClick={() => { setPg(i); setAlt(0); }}>{q.name}</button>
              ))}
            </span>
          )}
        </span>
        <button type="button" className="rw-recap-x" ref={closeRef} onClick={onClose}>닫기<RwIcon d={IC_CLOSE} /></button>
      </div>
      <dl key={cur?.name} role={pages.length > 1 ? 'tabpanel' : undefined}>
        {rows.map(r => (
          <div key={r.k} className={r.hot ? 'hot' : undefined}><dt>{r.k}</dt><i aria-hidden="true" /><dd>{r.v}</dd></div>
        ))}
        {foot && (foot.alts ? (
          <div key={foot.k} className={`${foot.hot ? 'hot ' : ''}rw-recap-cyc`} onClick={turn}>
            <dt>{foot.k}</dt><i aria-hidden="true" />
            <dd><button type="button" aria-live="polite" onClick={e => { e.stopPropagation(); turn(); }}>{foot.alts[alt % foot.alts.length]}</button></dd>
          </div>
        ) : (
          <div key={foot.k} className={foot.hot ? 'hot' : undefined}><dt>{foot.k}</dt><i aria-hidden="true" /><dd>{foot.v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/** 장부 줄과 오늘의 한 줄 — 렌더마다 다시 세지 않게 */
function useRecapData(a: ReturnType<typeof anniversaries>, x: Anniv | undefined, now: Date,
  startDate?: string, logs?: RecapLog[], loreCount?: number) {
  return useMemo(() => (a && a.dayCount > 0 ? recapData({ a, x, now, startDate, logs, loreCount }) : undefined),
    [a, x, now, startDate, logs, loreCount]);
}

/** 돌아보기 여닫기 — 누른 뒤에는 반대쪽 버튼(닫기 ↔ 돌아보기)으로 초점을 옮긴다 */
function useRecap() {
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (open ? closeRef : openRef).current?.focus();
  }, [open]);
  const toggle = useCallback(() => { moved.current = true; setOpen(o => !o); }, []);
  return { open, toggle, openRef, closeRef };
}

/** PC — 카드 아래 세로 타임라인. 넘치면 지난 것(오래된 것부터) → 다가올 것(먼 것부터) 순서로 뺀다 */
export function RelAnnivColumn({ startDate, firstLog, logs, loreCount, color, tab }: AnnivProps) {
  const { now, a } = useAnniv(startDate, firstLog);
  const box = useRef<HTMLDivElement>(null);
  const { open, toggle, openRef, closeRef } = useRecap();
  const todayA = todayOf(a);
  const rec = useRecapData(a, todayA, now, startDate, logs, loreCount);
  const past = a ? a.past.slice(0, 2).reverse() : [];
  // 오늘 기념일은 오늘 칸에 합치므로 다가올 목록에서 뺀다
  const future = a ? a.future.slice(todayA ? 1 : 0, todayA ? 5 : 4) : [];
  // 장부는 기념일 당일만이 아니라 평소에도 연다 (v4.1) — 시작일 전(날수 없음)만 빼고
  const recapOn = !!rec && open;
  const { drop, gone } = useFitDrop(box, past.length + future.length, !recapOn, `${startDate}|${firstLog}|${recapOn}`);
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
      {recapOn ? (
        <AnnivRecap dayCount={a.dayCount} x={todayA} now={now} pages={rec.pages} start={rec.peek?.pg ?? 0} onClose={toggle} closeRef={closeRef} />
      ) : (
        <ul className="rw-tl">
          {shownPast.map(x => (
            <li key={x.date.getTime()} className="past">
              <span>{x.label}<span className="when">{fmtWidgetDate(x.date, now)}</span></span>
              <b>{annivBadge(x.diff)}</b>
            </li>
          ))}
          <li className={`today${todayA ? ' is-anniv' : ''}`}>
            {todayA
              ? <span className="rw-td"><TodayAnniv x={todayA} days={a.dayCount} peek={rec?.peek} open={false} onToggle={toggle} btnRef={openRef} /></span>
              : rec
                ? <span className="rw-td">
                    <span className="rw-big">{a.dayCount}<small>DAYS</small></span>
                    <RecapPeek peek={rec.peek} open={false} onToggle={toggle} btnRef={openRef} />
                  </span>
                : <span className="rw-big">{dd}</span>}
          </li>
          {shownFuture.map((x, i) => (
            <li key={x.date.getTime()}>
              <span>{todayA && i === 0 && <span className="rw-nx">NEXT</span>}{x.label}<span className="when">{fmtWidgetDate(x.date, now)}</span></span>
              <b className={near(x) ? 'near' : ''}>{annivBadge(x.diff)}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="rw-foot"><span>SINCE {since}</span><span>{dd}</span></div>
    </div>
  );
}

/** 띠의 SINCE는 늘 연도까지 — 2025.2.8 */
const sinceFull = (v?: string) => {
  const d = parseLocalDate(v);
  return d ? fullDate(d) : '';
};

/** 모바일 — 이름 아래 가로 띠 (옆으로 밀어 보기). 돌아보기 장부는 띠 아래에 펼친다 (평소에도, v4.1) */
export function RelAnnivStrip({ startDate, firstLog, logs, loreCount, color, tab }: AnnivProps) {
  const { now, a } = useAnniv(startDate, firstLog);
  const { open, toggle, openRef, closeRef } = useRecap();
  const todayA = todayOf(a);
  const rec = useRecapData(a, todayA, now, startDate, logs, loreCount);
  if (!a) return null;
  const past = a.past.slice(0, 1);
  const future = a.future.slice(todayA ? 1 : 0, todayA ? 7 : 6);
  return (
    <>
      <div className="rw rw-strip" style={rwVars(color, tab)}
        role="region" aria-label="기념일 — 옆으로 밀어 보기">
        <ol>
          {past.map(x => (
            <li key={x.date.getTime()} className="past">
              <b>{annivBadge(x.diff)}</b><span className="lb">{x.label}</span><span className="when">{fmtWidgetDate(x.date, now)}</span>
            </li>
          ))}
          {todayA ? (
            <li className="today is-anniv">
              <TodayAnniv x={todayA} days={a.dayCount} strip since={sinceFull(startDate)} peek={rec?.peek} open={open} onToggle={toggle} btnRef={openRef} />
            </li>
          ) : (
            <li className="today">
              <span className="rw-big">{a.dayCount > 0 ? a.dayCount : relDday(startDate, now)}</span>
              <span className="when">SINCE {sinceFull(startDate)}</span>
              {rec && <RecapPeek peek={rec.peek} open={open} onToggle={toggle} btnRef={openRef} />}
            </li>
          )}
          {future.map((x, i) => (
            <li key={x.date.getTime()}>
              {todayA && i === 0 && <span className="rw-nx">NEXT</span>}
              <b className={near(x) ? 'near' : ''}>{annivBadge(x.diff)}</b><span className="lb">{x.label}</span><span className="when">{fmtWidgetDate(x.date, now)}</span>
            </li>
          ))}
        </ol>
      </div>
      {rec && open && (
        <div className="rw" style={rwVars(color, tab)}>
          <AnnivRecap dayCount={a.dayCount} x={todayA} now={now} pages={rec.pages} start={rec.peek?.pg ?? 0} strip onClose={toggle} closeRef={closeRef} />
        </div>
      )}
    </>
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
      <AppLink className="rw-feat" href={top.href ?? feed.href}>
        <span className="meta">
          {kind === 'log' && <span>No.{top.no}</span>}
          {top.cat && <span>{top.cat}</span>}
          <span>{fmtWidgetDate(top.time, now)}</span>
        </span>
        <span className="t">{top.title}</span>
        {top.excerpt && !box && <span className="x">{top.excerpt}</span>}
      </AppLink>
      {shown.map(it => (
        <AppLink key={it.id} className="rw-row" href={it.href ?? feed.href}>
          <span className="cat">{it.cat ?? ''}</span>
          <span className="ttl">{it.title}</span>
          <span className="dt">{fmtWidgetDate(it.time, now)}</span>
        </AppLink>
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
          <AppLink className="rw-all" href={cur[1].href}
            {...(cur[1].state === 'external' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>ALL →</AppLink>
        )}
      </div>
      <FeedPane kind={cur[0]} feed={cur[1]} rows={rows} now={now} box={hideExcerpt} />
    </div>
  );
}
