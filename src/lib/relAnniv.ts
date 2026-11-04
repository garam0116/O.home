/**
 * 자관 상세 위젯의 기념일 (v3.3 사용자 확정 — 시안 「오늘 마디」).
 *
 * 따로 등록하지 않아도 자관 디데이 기준일 하나로 계산되는 기념일만 쓴다. 사용자가 고른 네 묶음:
 *  - 기본      100일 단위 · N주년 (N개월은 너무 자주 나와 뺐다 — v3.3 사용자 요청.
 *              365일도 1주년과 하루 차이로 겹쳐 넣지 않는다)
 *  - 숫자 놀이  111·222…999일, 1111·2222…일, 1234일
 *  - 계절      함께 맞는 N번째 봄·여름·가을·겨울 (3·6·9·12월 1일 시작)
 *  - 로그      첫 로그 N주년 — 로그 위젯이 읽은 첫 글 날짜에서
 *
 * 날수는 자관 디데이(relDday)와 같이 **시작일을 1일로** 센다 — 「N일」은 시작일 + (N-1)일.
 */

const DAY = 86400000;

/** 그 날 현지 자정 */
export const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** 달을 더하되 없는 날짜(1/31 + 1개월)는 그 달 마지막 날로 */
export function addMonths(d: Date, n: number): Date {
  const y = d.getFullYear(), m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}
export const daysBetween = (a: Date, b: Date) => Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / DAY);

/** YYYY-MM-DD → 현지 날짜 */
export function parseLocalDate(v?: string): Date | undefined {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v?.trim() ?? '');
  if (!m) return undefined;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * 위젯 날짜 표기 (v3.3 사용자 확정) — 올해 날짜는 연도 없이 「1.3」, 다른 해는 「2025.12.25」.
 * 해가 바뀌면 같은 글도 「1.3」 → 「2026.1.3」으로 바뀐다. 0은 채우지 않는다.
 */
export function fmtWidgetDate(t: number | Date, now = new Date()): string {
  const d = typeof t === 'number' ? new Date(t) : t;
  const md = `${d.getMonth() + 1}.${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}.${md}`;
}

export interface Anniv {
  label: string;
  date: Date;
  /** 오늘부터 며칠 뒤(+) / 며칠 전(-) */
  diff: number;
}

/**
 * 기념일 당일 오늘 칸에 붙는 한마디 — 기념일 이름(anniversaries가 만든 label)으로 종류를 가린다.
 * 「첫 로그 N주년」을 「N주년」보다 먼저 봐야 한다 (둘 다 주년으로 끝남).
 */
export function annivMessage(label: string): string {
  let m: RegExpExecArray | null;
  if ((m = /^첫 로그 (\d+)주년$/.exec(label))) return `첫 로그를 남긴 지 ${m[1]}년`;
  if ((m = /^(\d+)주년$/.exec(label))) return `함께한 지 ${m[1]}년이 되는 날`;
  if ((m = /^(\d+)일$/.exec(label))) return `함께한 지 ${m[1]}일째 되는 날`;
  if (/(봄|여름|가을|겨울)$/.test(label)) return `함께 맞는 ${label}의 첫날`;
  return '오늘은 기념일';
}

/** D-5 · D-DAY · D+34 (지난 기념일은 홈 D-DAY 위젯처럼 지난 날수) */
export const annivBadge = (diff: number) => (diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`);

const ORD = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const ordinal = (n: number) => (n <= ORD.length ? `${ORD[n - 1]} 번째` : `${n}번째`).replace('첫 번째', '첫');

/** 숫자 놀이 — 같은 숫자 반복과 1234 */
const PLAY_DAYS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => 111 * k),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => 1111 * k),
  1234,
];
const SEASONS: [number, string][] = [[2, '봄'], [5, '여름'], [8, '가을'], [11, '겨울']];

/**
 * 기준일(과 첫 로그 날짜)로 기념일 목록을 만든다 — 지난 것은 최근 순, 다가올 것은 가까운 순.
 * 같은 날 여러 개가 겹치면 기본 → 숫자 놀이 → 계절 → 로그 순서로 하나만 남긴다.
 */
export function anniversaries(startStr?: string, firstLog?: number, now = new Date()): {
  past: Anniv[]; future: Anniv[]; dayCount: number;
} | null {
  const start = parseLocalDate(startStr);
  if (!start) return null;
  const today = dayOf(now);
  const until = addDays(today, 800);   // 2년 남짓 앞까지만 본다
  const out = new Map<number, Anniv>();
  const put = (label: string, date: Date) => {
    if (date < start || date > until) return;
    const k = date.getTime();
    if (!out.has(k)) out.set(k, { label, date, diff: daysBetween(today, date) });
  };
  const nth = (n: number) => addDays(start, n - 1);

  // 기본 — 100일 단위 · N주년
  const span = daysBetween(start, until) + 1;
  for (let n = 100; n <= span; n += 100) put(`${n}일`, nth(n));
  for (let y = 1; ; y++) { const d = addMonths(start, 12 * y); if (d > until) break; put(`${y}주년`, d); }
  // 숫자 놀이
  for (const n of PLAY_DAYS) put(`${n}일`, nth(n));
  // 계절 — 시작일이 속한 계절이 첫 번째
  // 시작일이 이 계절 안이면 그 계절이 「첫」 계절 — 다음 시작일부터 두 번째
  const seasonOf = (d: Date) => { const m = d.getMonth(); return m < 2 ? 11 : m - (m - 2) % 3; };
  for (const [mon, name] of SEASONS) {
    let count = seasonOf(start) === mon ? 1 : 0;
    for (let y = start.getFullYear(); y <= until.getFullYear(); y++) {
      const d = new Date(y, mon, 1);
      if (d <= start) continue;
      count++;
      put(`${ordinal(count)} ${name}`, d);
    }
  }
  // 로그 — 첫 로그 N주년
  if (firstLog != null) {
    const f = dayOf(new Date(firstLog));
    for (let y = 1; ; y++) { const d = addMonths(f, 12 * y); if (d > until) break; put(`첫 로그 ${y}주년`, d); }
  }

  const all = [...out.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    past: all.filter(a => a.diff < 0).reverse(),
    future: all.filter(a => a.diff >= 0),
    dayCount: daysBetween(start, today) + 1,
  };
}
