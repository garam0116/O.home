import type { NextConfig } from "next";

/* 보안 헤더 (보안 검토)
 *  · X-Frame-Options / frame-ancestors — 다른 사이트가 이 홈을 투명한 iframe으로 덮어
 *    관리자가 모르게 버튼을 누르게 하는 클릭재킹을 막는다
 *  · nosniff — 브라우저가 응답 형식을 멋대로 추측해 스크립트로 실행하지 않게
 *  · Referrer-Policy — 다른 사이트로 나갈 때 글 주소 전체가 넘어가지 않게
 * 전체 CSP(script-src 등)는 걸지 않는다 — 폰트·이미지·BGM을 여러 외부 주소에서 받아 오는 구조라
 * 한 번 잘못 걸면 화면이 통째로 깨진다. */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // 폰트 중계 라우트는 자기 CSP(sandbox)를 따로 붙인다 — 덮어쓰지 않게 제외
      { source: "/((?!api/font).*)", headers: SECURITY_HEADERS },
    ];
  },
};

export default nextConfig;
