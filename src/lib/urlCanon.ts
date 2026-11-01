'use client';
/**
 * 주소를 **메뉴에 적히는 형태**로 맞춘다 (v2.4 사용자 요청 — 게시판·자관 주소 변경).
 *
 * 메뉴 트리·공개범위 판정·페이지 타이틀은 모두 주소 문자열을 그대로 비교한다.
 * 그런데 같은 곳을 가리키는 주소가 여러 모양일 수 있다:
 *
 *   게시판  `/board?b=mt9ipt` (옛 주소) · `/board/b/mt9ipt` (id) · `/board/b/palimpsest` (별명)
 *   자관    `/rels?s=2nd` (옛 주소) · `/rels/r/mt9ipt` (id) · `/rels/r/2nd` (별명)
 *
 * 이 중 하나만 메뉴에 적혀 있으므로 비교하기 전에 한 모양(지금 쓰는 주소)으로 통일한다.
 * 다른 섹션(갤러리 등)은 지금처럼 `?s=별명`으로 맞춘다.
 */
import { BOARD_PATH, MAIN_BOARD_ID, boardHref, findBoardByKey } from './boardStore';
import {
  PATH_SEC, SECTION_KINDS, SECTION_META, canonSecKey, findSecId, sectionHref,
} from './sectionStore';

/** 경로 + 쿼리 → 메뉴에 적히는 형태 */
export function canonPath(pathname: string, search: string | URLSearchParams = ''): string {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const s = sp.get('s');
  const b = sp.get('b');

  // 게시판 — `/board/b/{key}` 또는 옛 `/board?b={id}`
  if (pathname.startsWith(`${BOARD_PATH}/`)) {
    const key = decodeURIComponent(pathname.slice(BOARD_PATH.length + 1).split('/')[0]);
    const bd = findBoardByKey(key);
    return bd ? boardHref(bd.id) : `${BOARD_PATH}/${key}`;
  }
  if (pathname === '/board' && b) {
    const bd = findBoardByKey(b);
    return bd ? boardHref(bd.id) : b === MAIN_BOARD_ID ? '/board' : `${BOARD_PATH}/${b}`;
  }

  // 경로로 갈리는 섹션 — `/rels/r/{key}` 또는 옛 `/rels?s={key}`
  for (const kind of SECTION_KINDS) {
    const seg = PATH_SEC[kind];
    if (!seg) continue;
    const base = SECTION_META[kind].href;
    const pre = `${base}/${seg}/`;
    if (pathname.startsWith(pre)) {
      const key = decodeURIComponent(pathname.slice(pre.length).split('/')[0]);
      const id = findSecId(kind, key);
      return id ? sectionHref(kind, id) : `${pre}${key}`;
    }
    if (pathname === base && s) {
      const id = findSecId(kind, s);
      return id ? sectionHref(kind, id) : `${pre}${s}`;
    }
  }

  // 그 밖의 섹션은 지금처럼 `?s=별명`, 남은 `?b=`도 그대로
  return pathname + (s ? `?s=${canonSecKey(pathname, s)}` : b ? `?b=${b}` : '');
}

/** 메뉴에 저장된 주소 하나를 지금 형태로 — 게시판·경로형 섹션 주소만 손대고 나머지는 그대로 */
export function canonHref(href: string): string {
  if (!href.startsWith('/')) return href;            // 바깥 링크 등
  const touch = href === '/board' || href.startsWith('/board?') || href.startsWith(`${BOARD_PATH}/`)
    || SECTION_KINDS.some(k => {
      const seg = PATH_SEC[k];
      const base = SECTION_META[k].href;
      return !!seg && (href.startsWith(`${base}?`) || href.startsWith(`${base}/${seg}/`));
    });
  if (!touch) return href;
  const q = href.indexOf('?');
  return q < 0 ? canonPath(href) : canonPath(href.slice(0, q), href.slice(q + 1));
}

/** 메뉴처럼 「추가로 만든 곳」의 주소인가 — 페이지 타이틀이 메뉴 이름까지 끌어올지 정할 때 */
export const isExtraHref = (h: string) =>
  /[?&][sb]=/.test(h) || h.startsWith(`${BOARD_PATH}/`)
  || SECTION_KINDS.some(k => !!PATH_SEC[k] && h.startsWith(`${SECTION_META[k].href}/${PATH_SEC[k]}/`));
