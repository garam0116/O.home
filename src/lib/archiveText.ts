/**
 * 아카이브 상세 — HTML 안의 글자 고치기 (사용자 요청).
 *
 * 붙여 넣은 HTML을 브라우저 파서(DOMParser — 스크립트는 실행되지 않는다)로 읽어 **글자 조각(텍스트 노드)**
 * 을 순서대로 뽑고, 고친 값을 그 조각에 다시 넣어 HTML로 되돌린다. 태그·스타일은 건드리지 않는다.
 * 날짜·시간처럼 보이는 글자(2026.11.05 · 2026-11-05 · 2026년 11월 5일 · 11/05 · 23:40)는
 * 달력·시계 입력으로 바꿀 수 있게 찾아 주고, 바꿀 때는 원래 쓰던 모양(구분자·0 채우기·요일)을 지킨다.
 *
 * 고친 결과는 복사용이다 — 원본 글은 바뀌지 않는다 (app/archive/[id]).
 */

const DATE_RE = /(\d{4})(\s*[.\-/년]\s*)(\d{1,2})(\s*[.\-/월]\s*)(\d{1,2})(일?)|(?<![\d:/.])(\d{1,2})(\/)(\d{1,2})(?![\d/])/;
const TIME_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d])/;
const pad = (n: string | number) => String(n).padStart(2, '0');
const WEEK = '일월화수목금토';

export interface FoundDT {
  /** YYYY-MM-DD — 연도가 없는 11/05 꼴은 올해로 본다 */
  date?: string;
  /** HH:MM */
  time?: string;
}

/** 글자 한 조각에서 첫 날짜·시간 */
export function findDT(text: string): FoundDT {
  const r: FoundDT = {};
  const d = DATE_RE.exec(text);
  if (d) {
    const ok = (m: number, day: number) => m >= 1 && m <= 12 && day >= 1 && day <= 31;
    if (d[1] && ok(+d[3], +d[5])) r.date = `${d[1]}-${pad(d[3])}-${pad(d[5])}`;
    else if (d[7] && ok(+d[7], +d[9])) r.date = `${new Date().getFullYear()}-${pad(d[7])}-${pad(d[9])}`;
  }
  const t = TIME_RE.exec(text);
  if (t) r.time = `${pad(t[1])}:${t[2]}`;
  return r;
}

/** 조각 안의 첫 날짜·시간을 바꿔 끼운다 — 빈 값이면 그쪽은 그대로 */
export function setDT(text: string, date?: string, time?: string): string {
  let out = text;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const d = DATE_RE.exec(out);
    if (d) {
      const [Y, M, D] = date.split('-');
      // 원래 두 자리로 썼으면 두 자리, 한 자리로 썼으면 한 자리
      const fit = (orig: string, v: string) => (orig.length === 2 ? v : String(+v));
      const rep = d[1]
        ? Y + d[2] + fit(d[3], M) + d[4] + fit(d[5], D) + d[6]
        : fit(d[7], M) + d[8] + fit(d[9], D);
      out = out.slice(0, d.index) + rep + out.slice(d.index + d[0].length);
      // 날짜 뒤에 붙은 요일 「(목)」도 맞춘다
      const after = d.index + rep.length;
      const wd = WEEK[new Date(`${date}T00:00`).getDay()];
      out = out.slice(0, after) + out.slice(after).replace(/^(\s*\()([일월화수목금토])(\))/, `$1${wd}$3`);
    }
  }
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const t = TIME_RE.exec(out);
    if (t) {
      const [H, Mi] = time.split(':');
      const h = t[1].length === 1 ? String(+H) : H;
      out = out.slice(0, t.index) + h + ':' + Mi + out.slice(t.index + t[0].length);
    }
  }
  return out;
}

/** 전체 문서(<html>·<body>)로 짠 HTML이면 그 모양 그대로 돌려준다 */
const isFullDoc = (html: string) => /<(html|body|head)[\s>]/i.test(html);

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function serialize(doc: Document, full: boolean): string {
  return full ? `<!doctype html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

/** 고칠 수 있는 글자 조각 — 빈칸뿐인 조각과 <style>·<script> 안은 뺀다 */
function textNodes(doc: Document): Text[] {
  const out: Text[] = [];
  if (!doc.body) return out;
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentNode?.nodeName;
    if (n.nodeValue?.trim() && p !== 'STYLE' && p !== 'SCRIPT' && p !== 'NOSCRIPT') out.push(n as Text);
  }
  return out;
}

export interface TextSlot {
  /** 앞뒤 빈칸을 뺀 글자 — 입력칸에 보이는 값 */
  text: string;
  dt: FoundDT;
}

/** HTML의 글자 조각 목록 */
export function textSlots(html: string): TextSlot[] {
  return textNodes(parse(html)).map(n => ({ text: n.nodeValue!.trim(), dt: findDT(n.nodeValue!) }));
}

/** 조각들을 고쳐 새 HTML을 만든다 — fn이 돌려준 값으로 바꾸고, undefined면 그대로 둔다.
 *  앞뒤 빈칸(줄바꿈·들여쓰기)은 원래 것을 지킨다 */
export function editSlots(html: string, fn: (text: string, i: number) => string | undefined): string {
  const doc = parse(html);
  let changed = false;
  textNodes(doc).forEach((n, i) => {
    const raw = n.nodeValue!;
    const lead = raw.match(/^\s*/)![0];
    const tail = raw.slice(lead.length).match(/\s*$/)![0];
    const next = fn(raw.trim(), i);
    if (next === undefined || next === raw.trim()) return;
    n.nodeValue = lead + next + tail;
    changed = true;
  });
  return changed ? serialize(doc, isFullDoc(html)) : html;
}
