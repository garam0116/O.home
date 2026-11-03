/**
 * LOG / LOREBOOK 위젯 전용 미리보기 글 (v3.3 사용자 확정 시안 B).
 *
 * 상세 페이지에서 **눈에 보이는 글자만** 미리보기에 쓴다. 티스토리 에디터를 거친 글은 주석이
 * `<p style="font-size: 0">**-- Main Container --**</p>` 같은 숨긴 문단으로 바뀌어 있어,
 * 태그만 걷어 내면 이 메모가 미리보기 맨 앞에 나왔다.
 *
 * ⚠ 이 위젯에만 쓴다. 검색(postStore의 postBodyText)은 숨긴 글자까지 모두 찾아야 하므로
 *   이 함수를 검색이나 다른 곳에 가져다 쓰지 말 것 (사용자 요청).
 *
 * 빼는 것: 주석·style·script, 인라인 style로 숨긴 요소 —
 *   display:none · visibility:hidden · hidden 속성 · 실제 글자 크기 0 (안쪽에서 크기를 되돌리면 살림)
 *   · opacity:0 · color:transparent · 높이 0 + overflow:hidden · 화면 밖으로 밀어 둔 글자.
 * `<style>` 블록의 클래스로 숨긴 글자는 화면을 그려 봐야 알 수 있어 거르지 않는다.
 */

const BLOCK_TAG = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DETAILS|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|TD|TH|TR|UL)$/;
const SKIP_TAG = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEAD|TITLE|META|LINK|SVG|IMG)$/;
const BLOCK_DISPLAY = /block|flex|grid|table|list-item/;

/** 0, 0px, 0.0em, 0% … */
const isZero = (v: string) => /^\s*-?0*\.?0+(px|pt|em|rem|%|vw|vh)?\s*$/i.test(v);
/** -9999px처럼 화면 밖으로 크게 밀어 낸 값 */
const isFarOff = (v: string) => /^\s*-\d{3,}/.test(v);

function isHidden(el: HTMLElement): boolean {
  const s = el.style;
  if (el.hasAttribute('hidden')) return true;
  if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return true;
  if (s.opacity !== '' && parseFloat(s.opacity) === 0) return true;
  if (s.color === 'transparent') return true;
  if ((isZero(s.height) || isZero(s.maxHeight)) && /hidden|clip/.test(s.overflow + s.overflowY)) return true;
  if ((s.position === 'absolute' || s.position === 'fixed') && (isFarOff(s.left) || isFarOff(s.top))) return true;
  if (isFarOff(s.textIndent)) return true;
  return false;
}

/** 브라우저 밖(서버 렌더)에서는 null — 부르는 쪽이 예전 방식으로 대신한다 */
export function visibleText(body: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(`<body>${body}</body>`, 'text/html');
  const parts: string[] = [];
  let cur = '';
  const flush = () => {
    const t = cur.replace(/\s+/g, ' ').trim();
    if (t) parts.push(t);
    cur = '';
  };
  // zero = 물려받은 글자 크기가 0인지
  const walk = (node: Node, zero: boolean) => {
    node.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) {
        if (!zero) cur += n.nodeValue ?? '';
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;   // 주석 등
      const el = n as HTMLElement;
      if (SKIP_TAG.test(el.tagName) || isHidden(el)) return;
      let z = zero;
      const fs = el.style.fontSize;
      if (fs) {
        if (isZero(fs)) z = true;
        else if (!/(em|%)\s*$/i.test(fs) || !zero) z = false;   // 0의 1.2em은 여전히 0
      }
      const block = BLOCK_TAG.test(el.tagName) || BLOCK_DISPLAY.test(el.style.display);
      if (block) flush();
      walk(el, z);
      if (block) flush();
    });
  };
  walk(doc.body, false);
  flush();
  return parts.join(' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')   // 마크다운 이미지·링크는 글자만
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}
