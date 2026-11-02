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

/** 다른 페이지에도 고정 표시되는 위젯 — 절대 좌표가 있는 좌우 열 위젯 */
export function railWidgets(widgets: WidgetConf[]): WidgetConf[] {
  return widgets.filter(w => w.enabled && w.type !== 'menu' && w.ax != null && w.ay != null && sideOf(w) !== 2);
}

/** 본문이 들어갈 구간 (캔버스 좌표) — 왼쪽 위젯들의 오른쪽 끝 ~ 오른쪽 위젯들의 왼쪽 끝 */
export function railBounds(side: WidgetConf[]): { left: number; right: number } {
  const ls = side.filter(w => sideOf(w) === 1);
  const rs = side.filter(w => sideOf(w) === 3);
  const left = ls.length ? Math.max(...ls.map(w => w.ax! + widthOf(w))) + RAIL_GAP : 0;
  const right = rs.length ? Math.min(...rs.map(w => w.ax!)) - RAIL_GAP : CANVAS_W;
  return { left, right: Math.max(left, right) };
}

/** 좌우 위젯을 고정 표시하는 페이지 — 제외: 메인(자체 캔버스) · 환경설정(자체 넓은 레이아웃) ·
 *  자관 전체(목록·상세·작성) · 글쓰기/수정 화면(본문 폭이 넓어야 함) (v2.4 사용자 확정) */
export function isRailPage(pathname: string): boolean {
  if (pathname === '/') return false;
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return false;
  if (pathname === '/rels' || pathname.startsWith('/rels/')) return false;
  // 글쓰기·수정 — /board/write · /board/b/x/write · /threads/new · /diary/1/edit · /rels/1/au/2/edit 등
  if (/\/(write|new|edit)(\/|$)/.test(pathname)) return false;
  return true;
}
