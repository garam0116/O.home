/**
 * 자관 기념일 당일 「지나온 날 돌아보기」 장부의 숫자 (v3.8 사용자 확정 — 장 세 개, 장마다 6줄).
 *  - 1장 그때 그 로그   남긴 로그 · N 전 이맘때(멀면 무렵) · 가장 많이 쓴 달 · 마지막 로그 · 첫 로그
 *  - 2장 기록 습관      한 달 평균 · 즐겨 쓴 요일 · 가장 길었던 공백 · 올해 쓴 로그 · 쌓인 로어북
 *  - 3장 함께 맞은 것들 은하를 따라 흘러간 거리 · 함께 본 보름달 · 함께 보낸 주말 · 함께 넘긴 새해 · 지나온 계절
 * 어느 장이든 맨 아래 줄은 「다음 기념일」 (RelWidgets가 붙인다).
 *
 * 로그 숫자는 LOG 위젯이 읽은 목록(이 방문자에게 보이는 글)으로 센다 — 위젯 LOG 탭과 같은 글이다.
 * 날짜 숫자는 자관 디데이 기준일 하나로 센다. 값이 0이거나 셀 수 없는 줄은 만들지 않는다.
 */
import { addDays, addMonths, dayOf, daysBetween, parseLocalDate, type Anniv } from './relAnniv';

const DAY = 86400000;

export interface RecapLog {
  time: number;
  title: string;
  no: number;
  href?: string;
}

export const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** 로그 장(1·2장)에 쓰는 숫자. logs가 없으면(목록을 못 읽음) null */
export function logRecap(logs: RecapLog[] | undefined, startStr: string | undefined, now = new Date()) {
  if (!logs) return null;
  const sorted = [...logs].sort((a, b) => a.time - b.time);
  const total = sorted.length;
  const first = sorted[0];
  const last = sorted[total - 1];
  const today = dayOf(now);

  // 가장 많이 쓴 달 — 같으면 더 최근 달
  const byMonth = new Map<string, { y: number; m: number; n: number }>();
  for (const l of sorted) {
    const d = new Date(l.time);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const cur = byMonth.get(k) ?? { y: d.getFullYear(), m: d.getMonth() + 1, n: 0 };
    cur.n++;
    byMonth.set(k, cur);
  }
  let peak: { y: number; m: number; n: number } | undefined;
  for (const v of byMonth.values()) if (!peak || v.n >= peak.n) peak = v;

  // 즐겨 쓴 요일 — 세 편 넘게 쓴 뒤부터, 같으면 일요일 쪽부터
  const wd = [0, 0, 0, 0, 0, 0, 0];
  for (const l of sorted) wd[new Date(l.time).getDay()]++;
  const best = wd.indexOf(Math.max(...wd));
  const weekday = total >= 3 ? { day: best, n: wd[best] } : undefined;

  // 가장 길었던 공백 — 이어진 두 글 사이 날수
  let gap = 0;
  for (let i = 1; i < total; i++) gap = Math.max(gap, daysBetween(new Date(sorted[i - 1].time), new Date(sorted[i].time)));

  // 한 달 평균 — 자관을 시작한 뒤 지난 달 수로 (한 달이 안 됐으면 한 달로)
  const start = parseLocalDate(startStr);
  const months = start ? Math.max(1, daysBetween(start, today) / 30.44) : undefined;
  const avg = months && total ? Math.round((total / months) * 10) / 10 : undefined;

  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const thisYear = sorted.filter(l => l.time >= yearStart).length;

  return {
    total,
    first,
    lastAgo: last ? Math.max(0, daysBetween(new Date(last.time), today)) : undefined,
    peak,
    weekday,
    gap: gap > 0 ? gap : undefined,
    avg,
    thisYear,
  };
}

/** 「이맘때」라고 부를 수 있는 거리 — 이보다 멀면 「무렵」으로 부르고 날짜를 붙인다 (v3.9 사용자 확정 · 시안 L3) */
const NEAR_DAYS = 45;

/**
 * 「N 전 이맘때」 — 오늘 기념일에서 한 바퀴 전 그 날과 가장 가까운 로그 한 편 (v3.9 사용자 확정 · 시안 L3).
 * 줄이 빠지지 않게 범위를 두지 않는다: 앞뒤 45일 안이면 「이맘때」, 그보다 멀면 「무렵」 + 날짜(far).
 * 같은 거리면 더 최근 글. 한 바퀴는 100일 단위 기념일이면 100일, 그 밖(주년·계절·숫자 놀이)은 1년.
 * 1년 전이 시작일보다 앞이면(1년이 안 된 자관) 100일 전으로, 그것도 앞이면 처음 남긴 로그로.
 */
export function lookback(logs: RecapLog[] | undefined, x: Anniv, startStr: string | undefined, now = new Date()) {
  if (!logs?.length) return undefined;
  const today = dayOf(now);
  const start = parseLocalDate(startStr);
  const m = /^(\d+)일$/.exec(x.label);
  const spans: [string, Date][] = [['1년 전', addMonths(today, -12)], ['100일 전', addDays(today, -100)]];
  if (m && +m[1] % 100 === 0 && +m[1] > 100) spans.reverse();
  const span = spans.find(([, t]) => !start || t >= start);
  if (!span) {
    const first = logs.reduce((a, b) => (b.time < a.time ? b : a));
    return { label: '처음 남긴 로그', log: first, far: false };
  }
  const [name, target] = span;
  let pick = logs[0];
  let best = Infinity;
  for (const l of logs) {
    const g = Math.abs(daysBetween(target, new Date(l.time)));
    if (g < best || (g === best && l.time > pick.time)) { pick = l; best = g; }
  }
  const far = best > NEAR_DAYS;
  return { label: `${name} ${far ? '무렵' : '이맘때'}`, log: pick, far };
}

/* ---------- 3장 — 날짜만으로 ---------- */

/** 평균 삭망월과 기준 보름달(2000-01-21 04:40 UTC) — 보름달 날짜를 하루 안팎으로 맞춘다 */
const SYNODIC = 29.530588853;
const FULL_MOON_REF = Date.UTC(2000, 0, 21, 4, 40);
const fullMoonIndex = (t: number) => Math.floor((t - FULL_MOON_REF) / (SYNODIC * DAY));
/** 태양계가 은하 중심을 도는 속도 — 초속 약 230km */
const GALAXY_KM_PER_DAY = 230 * 86400;

export function skyRecap(startStr: string | undefined, now = new Date()) {
  const start = parseLocalDate(startStr);
  if (!start) return null;
  const today = dayOf(now);
  const days = daysBetween(start, today);
  if (days <= 0) return { days: 0, galaxyEok: 0, moons: 0, weekends: 0, newYears: 0, seasons: 0 };
  // 시작일 다음 날부터 오늘까지 지나온 날로 센다 (시작일 그날은 「넘긴」 날이 아니다)
  let weekends = 0, newYears = 0, seasons = 0;
  for (let d = addDays(start, 1); d <= today; d = addDays(d, 1)) {
    if (d.getDay() === 6) weekends++;
    if (d.getDate() === 1) {
      if (d.getMonth() === 0) newYears++;
      if (d.getMonth() % 3 === 2) seasons++;   // 3·6·9·12월 1일 — 기념일의 계절 시작과 같다
    }
  }
  return {
    days,
    /** 억 km, 소수 첫째 자리 */
    galaxyEok: Math.round((days * GALAXY_KM_PER_DAY) / 1e7) / 10,
    moons: Math.max(0, fullMoonIndex(today.getTime() + DAY) - fullMoonIndex(start.getTime() + DAY)),
    weekends,
    newYears,
    seasons,
  };
}
