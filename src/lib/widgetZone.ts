// 좌우 위젯 레일 (v2.4 사용자 요청) — 메인의 왼쪽·오른쪽 열 위젯을 다른 페이지에서도 같은 자리에 고정한다.
// 열은 저장된 col이 아니라 「지금 위치」로 판정한다 — col은 추가할 때 한 번 정해질 뿐 드래그해도 바뀌지 않는다.
import type { WidgetConf } from './mainStore';

/** 메인 캔버스 콘텐츠 폭 (1180 - 좌우 여백 30×2) */
export const CANVAS_W = 1120;
/** 위젯 중심이 이보다 왼쪽이면 왼쪽 열 — 기본 배치의 중앙 열 시작(240) */
export const LEFT_EDGE = 240;
/** 위젯 중심이 이보다 오른쪽이면 오른쪽 열 — 기본 배치의 중앙 열 끝(850) */
export const RIGHT_EDGE = 850;
/** 좌우 위젯과 본문 사이 간격 */
export const RAIL_GAP = 20;
/** 좌우 열 위젯의 최소 가로 — 본문 폭을 넓히려고 위젯을 좁힐 수 있게 중앙(160)보다 낮다 */
export const SIDE_MIN_W = 120;
export const CENTER_MIN_W = 160;

const widthOf = (w: WidgetConf) => w.w ?? 230;

/** 1 = 왼쪽 열 · 2 = 중앙 · 3 = 오른쪽 열 */
export function sideOf(w: WidgetConf): 1 | 2 | 3 {
  if (w.ax == null) return w.col;
  const c = w.ax + widthOf(w) / 2;
  return c < LEFT_EDGE ? 1 : c > RIGHT_EDGE ? 3 : 2;
}

/** 다른 페이지에도 고정 표시되는 위젯 — 절대 좌표가 있는 좌우 열 위젯.
 *  withMenu: PC 2단형이면 메뉴 카드도 같은 자리에 함께 띄운다 (v2.7) — 1단형에서는 상단바가 메뉴라 뺀다 */
export function railWidgets(widgets: WidgetConf[], withMenu = false): WidgetConf[] {
  return widgets.filter(w => w.enabled && (withMenu || w.type !== 'menu') && w.ax != null && w.ay != null && sideOf(w) !== 2);
}

/** 메뉴 카드가 가운데 열로 못 들어가게 (v2.7 사용자 확정) — 중심이 가운데 구간에 오면 가까운 쪽 열 끝에 붙인다 */
export function clampMenuX(x: number, w: number, snap: boolean): number {
  const c = x + w / 2;
  if (c < LEFT_EDGE || c > RIGHT_EDGE) return x;
  const leftLim = LEFT_EDGE - w / 2 - 1, rightLim = RIGHT_EDGE - w / 2 + 1;
  const toLeft = c < (LEFT_EDGE + RIGHT_EDGE) / 2;
  if (toLeft) return snap ? Math.floor(leftLim / 10) * 10 : Math.floor(leftLim);
  return snap ? Math.ceil(rightLim / 10) * 10 : Math.ceil(rightLim);
}

/** 본문이 들어갈 구간 (캔버스 좌표) — 왼쪽 위젯들의 오른쪽 끝 ~ 오른쪽 위젯들의 왼쪽 끝.
 *  양쪽 모두 위젯에서 RAIL_GAP만큼 띄우므로 본문과 좌우 위젯 사이 간격은 늘 같다.
 *  (v2.8 사용자 요청 — 예전 「가운데 정렬」은 화면 한가운데를 기준으로 잡아 좌우 위젯 폭이 다르면
 *  한쪽 간격만 넓어졌다. 이제 정렬 여부와 상관없이 좌우 간격을 똑같이 맞춘다) */
export function railBounds(side: WidgetConf[]): { left: number; right: number } {
  const ls = side.filter(w => sideOf(w) === 1);
  const rs = side.filter(w => sideOf(w) === 3);
  const left = ls.length ? Math.max(...ls.map(w => w.ax! + widthOf(w))) + RAIL_GAP : 0;
  const right = rs.length ? Math.min(...rs.map(w => w.ax!)) - RAIL_GAP : CANVAS_W;
  return { left, right: Math.max(left, right) };
}

/** 가운데 열 위젯들을 한 덩어리로 가로 이동해 좌우 위젯 사이 한가운데에 맞춘다 (편집모드 「가운데 정렬」) —
 *  왼쪽 위젯과의 간격 = 오른쪽 위젯과의 간격 (v2.8 사용자 요청 · 예전엔 캔버스 한가운데 기준).
 *  withMenu: PC 2단형이면 메뉴 카드도 좌우 위젯으로 친다. 메뉴 카드는 옮기지 않는다 */
export function centerMiddleWidgets(widgets: WidgetConf[], withMenu = false): WidgetConf[] {
  const mids = widgets.filter(w => w.enabled && w.type !== 'menu' && w.ax != null && w.ay != null && sideOf(w) === 2);
  if (!mids.length) return widgets;
  const l = Math.min(...mids.map(w => w.ax!));
  const r = Math.max(...mids.map(w => w.ax! + widthOf(w)));
  const { left, right } = railBounds(railWidgets(widgets, withMenu));
  const dx = Math.round((left + right - (l + r)) / 2);
  if (!dx) return widgets;
  return widgets.map(w => (mids.includes(w) ? { ...w, ax: w.ax! + dx } : w));
}

/** 좌우 위젯을 고정 표시하는 페이지 — 제외: 메인(자체 캔버스) · 환경설정(자체 넓은 레이아웃) ·
 *  자관 상세(좌·가운데·우 3열 — 상단바도 없이 전체 화면, 왼쪽 위 뒤로가기만) · 글쓰기/수정 화면(본문 폭이 넓어야 함).
 *  자관 목록·다이어리·로드비도 다른 페이지와 같은 레이아웃으로 통일 (v2.8 사용자 확정 — v2.4의 「위젯 없이 본문만」을 바꿈) */
export function isRailPage(pathname: string): boolean {
  if (pathname === '/') return false;
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return false;
  // 자관은 목록(/rels · /rels/r · /rels/r/{섹션})만 — 그 밖의 /rels/…는 상세·새로 만들기
  if (pathname.startsWith('/rels/') && pathname !== '/rels/r' && !/^\/rels\/r\/[^/]+$/.test(pathname)) return false;
  // 글쓰기·수정 — /board/write · /board/b/x/write · /threads/new · /diary/1/edit · /rels/r/x/new 등
  if (/\/(write|new|edit)(\/|$)/.test(pathname)) return false;
  return true;
}

/** 이보다 본문(좌우 위젯 사이)이 좁으면 다이어리 달력을 숨기고 로드비 댓글 칸을 줄인다 (v2.8) */
export const NARROW_BODY = 700;

/** 자관 상세 — 상단바 없이 전체 화면 (v2.8 사용자 요청 · 모바일 포함). 뒤로가기는 페이지 왼쪽 위 */
export function isBareRelPage(pathname: string): boolean {
  return pathname.startsWith('/rels/') && !isRailPage(pathname) && !/\/(write|new|edit)(\/|$)/.test(pathname);
}
