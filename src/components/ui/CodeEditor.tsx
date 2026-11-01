'use client';
// HTML 코드 편집기 — Visual Studio Code(Dark+) 느낌의 어두운 편집 화면 (사용자 요청)
// 외부 라이브러리 없이: 투명한 textarea 위에 입력하고, 같은 글자 크기의 <pre>가 뒤에서 색을 입힌다.
// 줄 번호 · 현재 줄 강조 · Tab 들여쓰기 · 하단 상태 표시줄(줄/열)
import React, { useMemo, useRef, useState } from 'react';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls: string, s: string) => (s ? `<span class="ce-${cls}">${esc(s)}</span>` : '');

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
  // 끝 줄바꿈 뒤에도 한 줄 높이를 확보해야 textarea와 스크롤 높이가 맞는다
  return out + esc(src.slice(last)) + '\n';
}

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

  const html = useMemo(() => highlightHtml(value), [value]);
  const lines = useMemo(() => value.split('\n').length, [value]);

  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (lineRef.current) lineRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
  };

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
    <div className={`ce-wrap ${focused ? 'focus' : ''}`}>
      <div className="ce-tabs">
        <span className="ce-tab"><span className="ce-ico">&lt;/&gt;</span>{fileName}</span>
      </div>
      <div className="ce-main">
        <div className="ce-gutter" ref={gutterRef} aria-hidden>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className={focused && i + 1 === cur.ln ? 'on' : ''}>{i + 1}</div>
          ))}
          <div>&nbsp;</div>
        </div>
        <div className="ce-code">
          {focused && (
            <div className="ce-curline" ref={lineRef} aria-hidden
              style={{ top: `calc(var(--ce-pad) + ${cur.ln - 1} * var(--ce-lh))`, transform: `translateY(${-(taRef.current?.scrollTop ?? 0)}px)` }} />
          )}
          <pre className="ce-pre" ref={preRef} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
          {!value && placeholder && <div className="ce-ph">{placeholder}</div>}
          <textarea
            ref={taRef}
            className="ce-ta"
            value={value}
            wrap="off"
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
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>HTML</span>
      </div>
    </div>
  );
}
