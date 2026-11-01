// 업로드 폰트 파일 같은 출처 중계 (v2.0 사용자 제보 — 「등록한 폰트가 적용이 안 돼요」).
//
// 서버 모드의 폰트 파일은 저장소(파이어베이스/수파베이스)의 공개 URL인데, **폰트는 브라우저가
// CORS를 강제하는 자원**이라(이미지와 다르다) 저장소가 허용 헤더를 안 주면 로드가 통째로
// 거부된다 — 등록은 되는데 화면은 조용히 폴백 글꼴로 남는 원인. 이 라우트가 서버에서 대신
// 받아 같은 출처로 내주면 CORS가 아예 걸리지 않는다.
//
// 아무 주소나 대신 받아 주는 통로가 되지 않게 저장소 호스트·경로만 허용한다.
// 저장소 호스트는 누구나 자기 프로젝트를 만들 수 있는 공용 도메인이라 호스트 제한만으로는 부족하다 —
// 남의 버킷에 올린 HTML/SVG가 이 사이트 출처로 열리면 스크립트가 실행된다(XSS).
// 그래서 **내용이 실제 폰트 파일인지 확인**하고, 응답 형식도 폰트로 고정한다.
const ALLOWED: { host: RegExp; path: RegExp }[] = [
  { host: /^firebasestorage\.googleapis\.com$/, path: /^\/v0\/b\// },
  { host: /^[a-z0-9-]+\.supabase\.(co|in)$/, path: /^\/storage\/v1\/object\/public\// },
];

const MAX_BYTES = 30 * 1024 * 1024;

/** 파일 앞 4바이트(시그니처)로 폰트 형식 판별 — 폰트가 아니면 null */
function fontType(b: Uint8Array): string | null {
  if (b.length < 4) return null;
  const sig = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (sig === 'wOF2') return 'font/woff2';
  if (sig === 'wOFF') return 'font/woff';
  if (sig === 'OTTO') return 'font/otf';
  if (sig === 'ttcf') return 'font/collection';
  if (sig === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return 'font/ttf';
  return null;
}

const SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'content-disposition': 'attachment',
};

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u') ?? '';
  let target: URL;
  try { target = new URL(u); } catch { return new Response('bad url', { status: 400, headers: SAFE_HEADERS }); }
  if (target.protocol !== 'https:' || target.username || target.password || target.port
    || !ALLOWED.some(a => a.host.test(target.hostname) && a.path.test(target.pathname))) {
    return new Response('host not allowed', { status: 400, headers: SAFE_HEADERS });
  }
  try {
    // 리다이렉트로 허용 목록 밖 주소를 받아 오지 않게 막는다
    const res = await fetch(target, { cache: 'no-store', redirect: 'error' });
    if (!res.ok) return new Response('fetch failed', { status: 502, headers: SAFE_HEADERS });
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return new Response('too large', { status: 413, headers: SAFE_HEADERS });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return new Response('too large', { status: 413, headers: SAFE_HEADERS });
    const type = fontType(buf);
    if (!type) return new Response('not a font', { status: 415, headers: SAFE_HEADERS });
    return new Response(buf, {
      headers: {
        ...SAFE_HEADERS,
        'content-type': type,
        // 파일 주소에 고유 id가 들어 있어 내용이 변할 일이 없다 — 오래 캐시
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502, headers: SAFE_HEADERS });
  }
}
