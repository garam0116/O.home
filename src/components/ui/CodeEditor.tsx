'use client';
// HTML 코드 편집기 — 차분한 최신 편집기 스타일, 밝은/어두운 테마 전환 (사용자 요청)
// 외부 라이브러리 없이: 투명한 textarea 위에 입력하고, 같은 글자 크기의 <pre>가 뒤에서 색을 입힌다.
// 긴 줄은 자동 줄바꿈(가로 스크롤 없음) — 줄 번호는 실제 줄(엔터) 기준, 줄바꿈된 부분은 번호 없이 이어짐
// 줄 번호 · 현재 줄 강조 · Tab 들여쓰기 · 하단 상태 표시줄(줄/열)
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 줄 단위로 나눠 그리므로 색 span이 줄을 넘지 않게 줄마다 닫고 다시 연다
const span = (cls: string, s: string) =>
  (s ? s.split('\n').map(p => (p ? `<span class="ce-${cls}">${esc(p)}</span>` : '')).join('\n') : '');

/** 태그 안쪽(속성들) 칠하기 — name="value" */
function paintAttrs(s: string): string {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(/([^\s=/"']+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'>]+)?/g)) {
    out += esc(s.slice(last, m.index));
    out += span('attr', m[1]);
    if (m[2]) out += span('punc', m[2]);
    if (m[3]) out += span(m[2] ? 'str' : 'attr', m[3]);
    last = m.index! + m[0].length;
  }
  return out + esc(s.slice(last));
}

/** HTML 문법 색칠 — 주석 / 태그(이름·속성·값) / 엔티티 / 일반 글자 */
export function highlightHtml(src: string): string {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(/<!--[\s\S]*?(?:-->|$)|<!?\/?[a-zA-Z][^<>]*>?|&#?\w+;/g)) {
    out += esc(src.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('<!--')) out += span('cmt', t);
    else if (t.startsWith('&')) out += span('ent', t);
    else {
      const p = /^(<!?\/?)([^\s>/]+)([\s\S]*?)(\/?>)?$/.exec(t);
      if (p) out += span('punc', p[1]) + span('tag', p[2]) + paintAttrs(p[3]) + span('punc', p[4] ?? '');
      else out += esc(t);
    }
    last = m.index! + t.length;
  }
  return out + esc(src.slice(last));
}

const THEME_KEY = 'ohome.codeEditorTheme';
// 코드용 글꼴 — 한글은 D2Coding/시스템 글꼴로 이어진다
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap';

const Sun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

export function CodeEditor({ value, onChange, placeholder, fileName = 'post.html' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fileName?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const escRef = useRef(false);              // Esc 직후 Tab은 포커스 이동 (키보드 갇힘 방지)
  const [cur, setCur] = useState({ ln: 1, col: 1 });
  const [focused, setFocused] = useState(false);
  const [dark, setDark] = useState(false);   // 기본은 밝은 테마
  const [curBox, setCurBox] = useState({ top: 0, h: 0 });

  useEffect(() => {
    if (!document.getElementById('ce-font')) {
      const l = document.createElement('link');
      l.id = 'ce-font'; l.rel = 'stylesheet'; l.href = FONT_HREF;
      document.head.appendChild(l);
    }
    try { setDark(localStorage.getItem(THEME_KEY) === 'dark'); } catch { /* 저장소 막힘 — 기본값 */ }
  }, []);
  const toggleTheme = () => setDark(d => {
    try { localStorage.setItem(THEME_KEY, d ? 'light' : 'dark'); } catch { /* 무시 */ }
    return !d;
  });

  const lineHtml = useMemo(() => highlightHtml(value).split('\n'), [value]);
  const gw = `${Math.max(2, String(lineHtml.length).length)}ch`;

  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) preRef.current.scrollTop = ta.scrollTop;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (lineRef.current) lineRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
  };

  // 줄 번호 높이·현재 줄 강조 위치를 실제로 줄바꿈된 높이에 맞춘다
  const [heights, setHeights] = useState<number[]>([]);
  const measure = () => {
    const pre = preRef.current;
    if (!pre) return;
    const hs = Array.from(pre.children, el => (el as HTMLElement).offsetHeight);
    setHeights(prev => (prev.length === hs.length && prev.every((h, i) => h === hs[i]) ? prev : hs));
  };
  useLayoutEffect(measure, [lineHtml]);
  useEffect(() => {
    const pre = preRef.current;
    if (!pre || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(pre);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = preRef.current?.children[cur.ln - 1] as HTMLElement | undefined;
    if (el) setCurBox(b => (b.top === el.offsetTop && b.h === el.offsetHeight ? b : { top: el.offsetTop, h: el.offsetHeight }));
  }, [cur.ln, heights]);

  const syncCursor = () => {
    const ta = taRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const ln = before.split('\n').length;
    const col = ta.selectionStart - before.lastIndexOf('\n');
    setCur(c => (c.ln === ln && c.col === col ? c : { ln, col }));
  };

  /** 실행 취소 기록이 남도록 브라우저 입력으로 넣는다 — 안 되면 직접 바꿈 */
  const insert = (text: string) => {
    const ta = taRef.current;
    if (!ta) return;
    if (!document.execCommand?.('insertText', false, text)) {
      const { selectionStart: s, selectionEnd: e } = ta;
      onChange(ta.value.slice(0, s) + text + ta.value.slice(e));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + text.length; syncCursor(); });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { escRef.current = true; return; }
    if (e.key === 'Tab' && !escRef.current && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      insert('  ');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing) {
      // 윗줄 들여쓰기 유지 (VS Code처럼)
      const ta = e.currentTarget;
      const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(ta.value.slice(lineStart, ta.selectionStart))?.[0] ?? '';
      if (indent) { e.preventDefault(); insert('\n' + indent); return; }
    }
    escRef.current = false;
  };

  return (
    <div className={`ce-wrap ${dark ? 'dark' : 'light'} ${focused ? 'focus' : ''}`}>
      <div className="ce-tabs">
        <span className="ce-dots" aria-hidden><i /><i /><i /></span>
        <span className="ce-tab"><span className="ce-ico">&lt;/&gt;</span>{fileName}</span>
        <button type="button" className="ce-theme" onClick={toggleTheme}
          title={dark ? '밝은 테마로' : '어두운 테마로'} aria-label={dark ? '밝은 테마로 전환' : '어두운 테마로 전환'}>
          {dark ? <Sun /> : <Moon />}
        </button>
      </div>
      <div className="ce-main">
        <div className="ce-gutter" ref={gutterRef} aria-hidden style={{ width: `calc(${gw} + 24px)` }}>
          {lineHtml.map((_, i) => (
            <div key={i} className={focused && i + 1 === cur.ln ? 'on' : ''} style={{ height: heights[i] || undefined }}>{i + 1}</div>
          ))}
        </div>
        <div className="ce-code">
          {focused && (
            <div className="ce-curline" ref={lineRef} aria-hidden
              style={{ top: curBox.top, height: curBox.h || undefined, transform: `translateY(${-(taRef.current?.scrollTop ?? 0)}px)` }} />
          )}
          {/* 실제 줄마다 div — 높이를 재서 줄 번호를 맞춘다 */}
          <pre className="ce-pre" ref={preRef} aria-hidden
            dangerouslySetInnerHTML={{ __html: lineHtml.map(l => `<div>${l}</div>`).join('') }} />
          {!value && placeholder && <div className="ce-ph">{placeholder}</div>}
          <textarea
            ref={taRef}
            className="ce-ta"
            value={value}
            wrap="soft"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label="HTML 코드"
            onChange={e => { onChange(e.target.value); syncCursor(); }}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            onKeyUp={syncCursor}
            onClick={syncCursor}
            onSelect={syncCursor}
            onFocus={() => { setFocused(true); syncCursor(); }}
            onBlur={() => setFocused(false)}
          />
        </div>
      </div>
      <div className="ce-status">
        <span>Ln {cur.ln}, Col {cur.col}</span>
        <span>{lineHtml.length} lines</span>
        <span>HTML</span>
      </div>
    </div>
  );
}
