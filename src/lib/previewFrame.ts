'use client';
// 환경설정 미리보기 프레임 (v3.1 사용자 요청 — 디자인 그룹에서 PC/모바일 미리보기).
//
// 설정 화면은 같은 사이트를 iframe으로 한 번 더 띄워 미리보기로 쓴다. 그 안에서 돌아가는 앱은
// **아무것도 저장하면 안 된다** — 저장 전 값(드래프트)을 받아 그리기만 하고, 관리자 접속 때 도는
// 정리 작업(번호 매기기·보안 이전)도 건너뛴다. 이 판별은 주소의 표시로만 한다.

/** 미리보기 iframe 주소에 붙이는 표시 */
export const PREVIEW_PARAM = 'ohome-preview';
/** 부모(설정 화면) ↔ 미리보기 사이 메시지 종류 */
export const PREVIEW_MSG = 'ohome-preview';

let cached: boolean | null = null;

/** 지금 이 문서가 설정 화면 미리보기 iframe 안인가 */
export function isPreviewFrame(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  try {
    cached = window.parent !== window && new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
  } catch {
    cached = false;
  }
  return cached;
}

/** 부모가 미리보기에 보내는 상태 */
export interface PreviewState {
  type: typeof PREVIEW_MSG;
  /** 부모 <html>의 인라인 CSS 변수 (테마 색·배경·역할 폰트) */
  css: Record<string, string>;
  /** 웹폰트 <link>/<style> — id별 href 또는 css */
  fonts: { id: string; href?: string; css?: string }[];
  /** 저장 전 설정 값 (키 → 값) */
  settings: Record<string, unknown>;
}
