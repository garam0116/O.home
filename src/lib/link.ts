'use client';
// 내부 링크 정규화 (v1.9 사용자 요청) — 사용자가 풀주소(https://내사이트/rels/allow)를 붙여넣어도
// 현재 사이트 오리진을 떼고 /rels/allow 상대경로로 바꿔 저장·이동한다 (외부 주소는 그대로).
export function normalizeInternalLink(v: string): string {
  const s = v.trim();
  if (!s) return s;
  try {
    if (/^https?:\/\//i.test(s) && typeof window !== 'undefined') {
      const u = new URL(s);
      if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
    }
  } catch { /* 파싱 실패 — 입력 그대로 */ }
  return s;
}

/** 페이지 주소(slug) 유효성 — 영문 소문자·숫자·하이픈만, 1~40자 (v1.9) */
/** 별명 주소로 쓸 수 있는가 — 영소문자·숫자·하이픈. **숫자만은 안 된다** (v2.4) — /chars/3 은 번호 주소다 */
export const isValidSlug = (s: string) => /^[a-z0-9-]{1,40}$/.test(s) && !/^\d+$/.test(s);
/** 링크 버튼으로 쓸 수 있는 주소만 — http(s)·사이트 안 경로·#·? (자관 LOG/LOREBOOK 등) */
export const safeLink = (value?: string) => {
  const url = value?.trim();
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || url.startsWith('#') || url.startsWith('?')) return url;
  return undefined;
};
export const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-');
