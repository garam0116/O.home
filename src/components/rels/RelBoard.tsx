'use client';
/**
 * 자관 선택 위젯 칸 (v4.6 사용자 확정) — 자관 상세 아래 「자유 공간」.
 *  - PC는 24칸 격자(편집 중엔 정사각형 칸으로 보임)에 위젯마다 너비(4~24칸)·높이(자동 또는 80~600px)로 놓고, 휴대폰은 늘 가로 전체로 쌓는다.
 *  - 세로 묶음 (v4.7 시안 A): 위젯은 앞 위젯 아래에 붙을 수 있다(under). 붙은 위젯들은 앞 위젯 너비 안에서 쌓이고,
 *    편집 중에는 묶음 아래 빈자리가 정사각형 칸으로 나뉘어 보인다 — 칸을 끌어 고른 크기·자리로 새 위젯을 넣는다.
 *  - 모양 프리셋 카드·유리·투명·알약 (시안 P-1). 투명은 배경 없이 위아래 가로줄만이고, 「⋯」의 막대가 줄 진하기다
 *    (0%면 줄도 없음 · 시안 L-1). 카드·유리·알약에서 막대를 손대면 「직접」으로 바뀐다.
 *  - 관리자: 자관 상세 왼쪽 위 EDIT › 「화면 수정」을 켜면(edit) 격자가 보이고, 위젯을 눌러 도구 막대(프리셋 · ⋯ · 내용 · 순서 · 삭제)를 쓰고,
 *    오른쪽 아래 모서리를 끌어 크기를 바꾼다(두 번 누르면 높이 자동). 맨 아래 「＋ 위젯」이나 묶음 아래 칸으로 종류를 골라 넣는다 (시안 W-1).
 *  - 위젯 글꼴은 LOG·LOREBOOK 위젯 규칙을 따른다 — 제목은 타이틀 폰트, 본문은 사이트 본문 폰트.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useBgm, parseVideoId } from '@/lib/bgmStore';
import { newId } from '@/lib/postStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { pickDaily } from '@/lib/relRecap';
import { fmtWidgetDate } from '@/lib/relAnniv';
import type { RelMember } from '@/lib/relStore';
import {
  WIDGET_KINDS, WIDGET_PRESETS, WIDGET_H_MIN, WIDGET_H_MAX, GRID_COLS, SPAN_MIN,
  kindLabel, lastRowFree, placeIn, stacksOf, widgetLook,
  type RelStack, type RelWidget, type RelWidgetKind, type RelWidgetPreset,
} from '@/lib/relWidgets';
import type { FeedItem } from './RelWidgets';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { AppLink } from '@/components/ui/AppLink';
import { KCheck, KInput, KRadio, KTextarea } from '@/components/ui/Kit';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { CodeEditor } from '@/components/ui/CodeEditor';

export interface BoardCtx {
  relName: string;
  members: RelMember[];
  logItems?: FeedItem[];
  loreItems?: FeedItem[];
  startDate?: string;
}

const GAP = 14;   // .rb-grid gap과 같아야 한다 (칸 크기 계산)

/* ---------- 위젯 본문 ---------- */

function ThemeBody({ w, ctx }: { w: RelWidget; ctx: BoardCtx }) {
  const { state, queue, playQueue } = useBgm();
  const tracks = w.tracks ?? [];
  if (!tracks.length) return <p className="rb-empty">아직 곡이 없습니다</p>;
  const label = w.title?.trim() || ctx.relName;
  // 지금 이 위젯의 목록을 틀고 있으면 그 곡을 표시 — 같은 목록인지는 첫 곡 id로 본다
  const mine = queue && queue.tracks[0]?.id === tracks[0].id ? queue.start : -1;
  const play = (i: number) => {
    playQueue(label, tracks.map(t => ({ id: t.id, title: t.title, desc: t.artist ?? '', videoId: t.videoId })), i);
  };
  return (
    <ol className="rb-pl">
      {tracks.map((t, i) => (
        <li key={t.id} className={i === mine ? 'on' : ''}>
          <span className="no">{String(i + 1).padStart(2, '0')}</span>
          {/* 사이트 BGM 플레이어를 꺼 두었으면 유튜브로 바로 연다 */}
          {state.settings.enabled
            ? <button type="button" className="t" onClick={() => play(i)}>{t.title}</button>
            : <a className="t" href={`https://www.youtube.com/watch?v=${t.videoId}`} target="_blank" rel="noopener noreferrer">{t.title}</a>}
          {t.artist && <small>{t.artist}</small>}
        </li>
      ))}
    </ol>
  );
}

function MemoBody({ w }: { w: RelWidget }) {
  const { user } = useAuth();
  const items = w.memos ?? [];
  if (!items.length) return <p className="rb-empty">아직 메모가 없습니다</p>;
  return (
    <div className="rb-memo">
      {items.map(m => (m.membersOnly && !user
        ? <div key={m.id} className="rb-sealed"><span className="t">{m.title}</span><small>로그인하면 열 수 있습니다</small></div>
        : (
          <details key={m.id}>
            <summary><span className="t">{m.title}</span></summary>
            <div className="b">{m.body}</div>
          </details>
        )))}
    </div>
  );
}

function LineBody({ w, ctx }: { w: RelWidget; ctx: BoardCtx }) {
  const [now] = useState(() => new Date());
  const pool = useMemo(() => {
    const items = [...(ctx.logItems ?? []), ...(w.lineSrc === 'all' ? ctx.loreItems ?? [] : [])];
    // 본문 전체에서 고른 한글 문장만 (상태창·날짜 줄은 FeedItem.lines를 만들 때 빠진다)
    return items.flatMap(it => (it.lines ?? []).map(s => ({ s, it })));
  }, [ctx.logItems, ctx.loreItems, w.lineSrc]);
  const pick = pickDaily(pool, ctx.startDate, now);
  if (!pick) return <p className="rb-empty">{ctx.logItems ? '고를 문장이 아직 없습니다' : 'LOG 주소를 넣으면 나타납니다'}</p>;
  return (
    <figure className="rb-line">
      <blockquote>{pick.s}</blockquote>
      <figcaption>
        {pick.it.href ? <AppLink href={pick.it.href}>{pick.it.title}</AppLink> : pick.it.title}
        <span>{fmtWidgetDate(pick.it.time, now)}</span>
      </figcaption>
    </figure>
  );
}

function SceneBody({ w, ctx }: { w: RelWidget; ctx: BoardCtx }) {
  const lines = w.scene ?? [];
  if (!lines.length) return <p className="rb-empty">아직 대사가 없습니다</p>;
  // 처음 말한 사람은 왼쪽, 나머지는 오른쪽
  const first = lines.find(l => l.who)?.who;
  return (
    <div className="rb-scene">
      {lines.map(l => {
        if (!l.who) return <p key={l.id} className="nar">{l.text}</p>;
        const m = ctx.members.find(x => x.charId === l.who);
        return (
          <div key={l.id} className={`say${l.who === first ? '' : ' r'}`}>
            <span className="face">{m?.photoId ? <CroppedBlobImg fileRef={m.photoId} crop={m.faceCrop} ph="" /> : null}</span>
            <div><b>{m?.name ?? ''}</b><span className="bub">{l.text}</span></div>
          </div>
        );
      })}
      {w.sceneFrom && <p className="from">{w.sceneFrom}</p>}
    </div>
  );
}

function LexBody({ w }: { w: RelWidget }) {
  const list = w.lex ?? [];
  const [i, setI] = useState(0);
  if (!list.length) return <p className="rb-empty">아직 표제어가 없습니다</p>;
  const e = list[Math.min(i, list.length - 1)];
  return (
    <div className="rb-lex">
      <h4>{e.word}</h4>
      {(e.pron || e.pos) && <div className="pron">{[e.pron && `[ ${e.pron} ]`, e.pos].filter(Boolean).join(' · ')}</div>}
      <ol>{e.defs.map((d, k) => <li key={k}>{d}</li>)}</ol>
      {e.src && <p className="src">— {e.src}</p>}
      {list.length > 1 && (
        <div className="nav">
          <button type="button" onClick={() => setI((i - 1 + list.length) % list.length)}>‹ 이전</button>
          <span>{Math.min(i, list.length - 1) + 1} / {list.length}</span>
          <button type="button" onClick={() => setI((i + 1) % list.length)}>다음 ›</button>
        </div>
      )}
    </div>
  );
}

function WidgetBody({ w, ctx }: { w: RelWidget; ctx: BoardCtx }) {
  switch (w.kind) {
    case 'html': return <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(w.html ?? '') }} />;
    case 'theme': return <ThemeBody w={w} ctx={ctx} />;
    case 'memo': return <MemoBody w={w} />;
    case 'line': return <LineBody w={w} ctx={ctx} />;
    case 'scene': return <SceneBody w={w} ctx={ctx} />;
    case 'lexicon': return <LexBody w={w} />;
  }
}

/* ---------- 내용 편집 ---------- */

type Rows<T> = { list: T[]; set: (l: T[]) => void };
function RowTools<T>({ i, rows }: { i: number; rows: Rows<T> }) {
  const { list, set } = rows;
  const swap = (a: number, b: number) => { const n = [...list]; [n[a], n[b]] = [n[b], n[a]]; set(n); };
  return (
    <span className="rb-rowtools">
      <button type="button" className="btn btn-ghost" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label="위로">↑</button>
      <button type="button" className="btn btn-ghost" disabled={i === list.length - 1} onClick={() => swap(i, i + 1)} aria-label="아래로">↓</button>
      <button type="button" className="btn btn-ghost" onClick={() => set(list.filter((_, k) => k !== i))} aria-label="지우기">✕</button>
    </span>
  );
}

function WidgetEditor({ w, ctx, onClose, onSave }: {
  w: RelWidget; ctx: BoardCtx; onClose: () => void; onSave: (w: RelWidget) => void;
}) {
  const [d, setD] = useState<RelWidget>(w);
  const [htmlView, setHtmlView] = useState<'code' | 'pv' | 'both'>('code');
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries((w.tracks ?? []).map(t => [t.id, `https://youtu.be/${t.videoId}`])));
  const patch = (p: Partial<RelWidget>) => setD(x => ({ ...x, ...p }));
  const badUrl = (d.tracks ?? []).some(t => !parseVideoId(urls[t.id] ?? ''));
  const save = () => {
    const out: RelWidget = { ...d, title: d.title?.trim() || undefined };
    if (out.kind === 'theme') {
      out.tracks = (d.tracks ?? []).filter(t => t.title.trim())
        .map(t => ({ ...t, title: t.title.trim(), artist: t.artist?.trim() || undefined, videoId: parseVideoId(urls[t.id] ?? '') ?? t.videoId }))
        .filter(t => t.videoId);
    }
    if (out.kind === 'memo') out.memos = (d.memos ?? []).filter(m => m.title.trim() || m.body.trim());
    if (out.kind === 'scene') out.scene = (d.scene ?? []).filter(l => l.text.trim());
    if (out.kind === 'lexicon') out.lex = (d.lex ?? []).filter(e => e.word.trim()).map(e => ({ ...e, defs: e.defs.filter(x => x.trim()) }));
    onSave(out);
  };

  const tracks: Rows<NonNullable<RelWidget['tracks']>[number]> = { list: d.tracks ?? [], set: l => patch({ tracks: l }) };
  const memos: Rows<NonNullable<RelWidget['memos']>[number]> = { list: d.memos ?? [], set: l => patch({ memos: l }) };
  const scene: Rows<NonNullable<RelWidget['scene']>[number]> = { list: d.scene ?? [], set: l => patch({ scene: l }) };
  const lex: Rows<NonNullable<RelWidget['lex']>[number]> = { list: d.lex ?? [], set: l => patch({ lex: l }) };
  const upd = <T extends { id: string }>(rows: Rows<T>, id: string, p: Partial<T>) => rows.set(rows.list.map(x => (x.id === id ? { ...x, ...p } : x)));

  return (
    <Modal open title={`${kindLabel(d.kind)} 위젯`} onClose={onClose} dirty className="rb-editor"
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn btn-dark" disabled={d.kind === 'theme' && badUrl} onClick={save}>SAVE</button>
      </>}>
      <div className="rb-form">
        <KInput placeholder={d.kind === 'theme' ? `위젯 제목 (선택 — 비우면 플레이어에 「${ctx.relName}」)` : '위젯 제목 (선택)'}
          value={d.title ?? ''} onChange={e => patch({ title: e.target.value })} />

        {/* HTML — 게시판 글쓰기와 같은 코드 편집기 + 미리보기 (시안 C). 편집기는 내용만큼 늘다가 일정 높이부터 안에서 스크롤 */}
        {d.kind === 'html' && (
          <>
            <div className="rb-htmlbar">
              <p className="hint">입력한 HTML은 출력할 때 안전하게 정리됩니다(스크립트 제외).</p>
              <div className="mini-seg" role="group" aria-label="보기">
                {([['code', '코드'], ['pv', '미리보기'], ['both', '나란히']] as const).map(([k, l]) => (
                  <button key={k} type="button" className={htmlView === k ? 'on' : ''} aria-pressed={htmlView === k} onClick={() => setHtmlView(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className={`rb-htmled${htmlView === 'both' ? ' both' : ''}`}>
              {htmlView !== 'pv' && (
                <CodeEditor fit fileName="widget.html" placeholder="<div>HTML 코드를 작성/붙여넣기...</div>"
                  value={d.html ?? ''} onChange={v => patch({ html: v })} />
              )}
              {htmlView !== 'code' && (
                <div className="rb-htmlpv">
                  <div className="lb">PREVIEW</div>
                  {d.html?.trim()
                    ? <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.html) }} />
                    : <p className="rb-empty">아직 내용이 없습니다</p>}
                </div>
              )}
            </div>
          </>
        )}

        {d.kind === 'theme' && (
          <>
            <p className="hint">곡을 누르면 사이트 BGM 플레이어가 이 목록으로 바뀌어 재생됩니다. 듣는 사람의 플레이어에서만 바뀌고, 플레이어의 「원래 목록」으로 돌아갑니다.</p>
            {tracks.list.map((t, i) => (
              <div key={t.id} className="rb-row">
                <div className="rb-row2">
                  <KInput placeholder="곡 이름" value={t.title} onChange={e => upd(tracks, t.id, { title: e.target.value })} />
                  <KInput placeholder="아티스트 (선택)" value={t.artist ?? ''} onChange={e => upd(tracks, t.id, { artist: e.target.value })} />
                  <RowTools i={i} rows={tracks} />
                </div>
                <KInput placeholder="유튜브 주소" value={urls[t.id] ?? ''} onChange={e => setUrls(u => ({ ...u, [t.id]: e.target.value }))}
                  style={urls[t.id] && !parseVideoId(urls[t.id]) ? { borderColor: 'var(--accent)' } : undefined} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => tracks.set([...tracks.list, { id: newId(), title: '', videoId: '' }])}>＋ 곡 추가</button>
          </>
        )}

        {d.kind === 'memo' && (
          <>
            {memos.list.map((m, i) => (
              <div key={m.id} className="rb-row">
                <div className="rb-row2">
                  <KInput placeholder="제목 (접혀 있을 때 보임)" value={m.title} onChange={e => upd(memos, m.id, { title: e.target.value })} />
                  <RowTools i={i} rows={memos} />
                </div>
                <KTextarea placeholder="펼치면 보일 내용" value={m.body} onChange={e => upd(memos, m.id, { body: e.target.value })} />
                <KCheck label="로그인한 사람만 열기" checked={!!m.membersOnly} onChange={v => upd(memos, m.id, { membersOnly: v || undefined })} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => memos.set([...memos.list, { id: newId(), title: '', body: '' }])}>＋ 메모 추가</button>
          </>
        )}

        {d.kind === 'line' && (
          <>
            <p className="hint">이 자관의 LOG 본문에서 날마다 한글 문장 하나를 고릅니다. 상태창·날짜 줄과 영어 문장은 빼고, 같은 날엔 누구에게나 같은 문장이 보입니다.</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <KRadio name="rb-line" value="log" current={d.lineSrc ?? 'log'} onChange={() => patch({ lineSrc: 'log' })} label="LOG에서만" />
              <KRadio name="rb-line" value="all" current={d.lineSrc ?? 'log'} onChange={() => patch({ lineSrc: 'all' })} label="LOG + LOREBOOK" />
            </div>
          </>
        )}

        {d.kind === 'scene' && (
          <>
            <p className="hint">처음 말한 멤버가 왼쪽, 다른 멤버가 오른쪽에 섭니다. 「지문」은 가운데 작은 글씨입니다.</p>
            {scene.list.map((l, i) => (
              <div key={l.id} className="rb-row2">
                <select className="k-input rb-who" value={l.who} onChange={e => upd(scene, l.id, { who: e.target.value })} aria-label="말하는 사람">
                  <option value="">지문</option>
                  {ctx.members.map(m => <option key={m.charId} value={m.charId}>{m.name || '이름 없음'}</option>)}
                </select>
                <KInput placeholder="대사" value={l.text} onChange={e => upd(scene, l.id, { text: e.target.value })} />
                <RowTools i={i} rows={scene} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost"
              onClick={() => scene.set([...scene.list, { id: newId(), who: scene.list.at(-1)?.who === ctx.members[0]?.charId ? ctx.members[1]?.charId ?? '' : ctx.members[0]?.charId ?? '', text: '' }])}>＋ 대사 추가</button>
            <KInput placeholder="출처 (선택 — 예: LOG #12 생일)" value={d.sceneFrom ?? ''} onChange={e => patch({ sceneFrom: e.target.value || undefined })} />
          </>
        )}

        {d.kind === 'lexicon' && (
          <>
            {lex.list.map((x, i) => (
              <div key={x.id} className="rb-row">
                <div className="rb-row2">
                  <KInput placeholder="표제어" value={x.word} onChange={e => upd(lex, x.id, { word: e.target.value })} />
                  <RowTools i={i} rows={lex} />
                </div>
                <div className="rb-row2">
                  <KInput placeholder="발음 (선택)" value={x.pron ?? ''} onChange={e => upd(lex, x.id, { pron: e.target.value || undefined })} />
                  <KInput placeholder="품사 (선택)" value={x.pos ?? ''} onChange={e => upd(lex, x.id, { pos: e.target.value || undefined })} />
                </div>
                <KTextarea placeholder="뜻풀이 — 한 줄에 하나씩" value={x.defs.join('\n')} onChange={e => upd(lex, x.id, { defs: e.target.value.split('\n') })} />
                <KInput placeholder="출처 (선택)" value={x.src ?? ''} onChange={e => upd(lex, x.id, { src: e.target.value || undefined })} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => lex.set([...lex.list, { id: newId(), word: '', defs: [] }])}>＋ 표제어 추가</button>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------- 칸 ---------- */

function presetOf(w: RelWidget): RelWidgetPreset { return w.preset ?? 'card'; }

function KindMenu({ onPick }: { onPick: (k: RelWidgetKind) => void }) {
  return (
    <div className="rb-kinds" role="menu">
      {WIDGET_KINDS.map(k => (
        <button key={k.kind} type="button" role="menuitem" onClick={() => onPick(k.kind)}>
          {k.label}<small>{k.hint}</small>
        </button>
      ))}
    </div>
  );
}

type Pick = { col: number; span: number; h?: number };

/**
 * 묶음 아래 빈자리 (v4.7 시안 A + 24칸 정사각형) — 남은 높이를 정사각형 칸으로 나눠 보여 준다.
 * 칸을 누르거나 끌어서 고르면 그 너비(최소 SPAN_MIN칸)·높이·시작 칸으로 onPick. 칸 층(.rb-fill-in)은 절대 위치라
 * 칸 수가 묶음 높이를 다시 바꾸지 않는다. 키보드는 숨은 버튼으로 묶음 전체 너비를 넣는다.
 */
function StackFill({ span, cell, open, onPick, children }: {
  span: number; cell: number; open: boolean; onPick: (p: Pick) => void; children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);
  const [sel, setSel] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  useEffect(() => {
    const el = box.current;
    if (!el || !cell) return;
    const fit = () => setRows(Math.max(1, Math.floor((el.clientHeight + GAP) / (cell + GAP))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cell]);
  useEffect(() => { if (!open) setSel(null); }, [open]);

  const rectOf = (x: NonNullable<typeof sel>) => {
    let c0 = Math.min(x.a[0], x.b[0]), c1 = Math.max(x.a[0], x.b[0]);
    // 너무 좁으면 오른쪽으로(모자라면 왼쪽으로) 넓힌다
    if (c1 - c0 + 1 < SPAN_MIN) { c1 = Math.min(span - 1, c0 + SPAN_MIN - 1); c0 = Math.max(0, c1 - SPAN_MIN + 1); }
    return { c0, c1, r0: Math.min(x.a[1], x.b[1]), r1: Math.max(x.a[1], x.b[1]) };
  };

  const start = (e: React.PointerEvent, c: number, r: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSel({ a: [c, r], b: [c, r] });
    const mv = (ev: PointerEvent) => {
      const t = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-c]') as HTMLElement | null;
      if (!t || !box.current?.contains(t) || !selRef.current) return;
      setSel({ a: selRef.current.a, b: [+t.dataset.c!, +t.dataset.r!] });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      const x = selRef.current;
      if (!x) return;
      const r = rectOf(x);
      const h = (r.r1 - r.r0 + 1) * (cell + GAP) - GAP;
      onPick({ col: r.c0, span: r.c1 - r.c0 + 1, h: Math.max(WIDGET_H_MIN, Math.min(WIDGET_H_MAX, Math.round(h))) });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const r = sel && rectOf(sel);
  return (
    <div className="rb-fill" ref={box} style={{ minHeight: cell || undefined }}>
      <div className="rb-fill-in" aria-hidden style={{ gridTemplateColumns: `repeat(${span}, ${cell}px)`, gridAutoRows: `${cell}px` }}>
        {Array.from({ length: rows * span }, (_, i) => {
          const c = i % span, row = Math.floor(i / span);
          const on = !!r && c >= r.c0 && c <= r.c1 && row >= r.r0 && row <= r.r1;
          return <span key={i} data-c={c} data-r={row} className={on ? 'on' : undefined} onPointerDown={e => start(e, c, row)} />;
        })}
      </div>
      {r && <span className="rb-fill-size">{r.c1 - r.c0 + 1}/{GRID_COLS} · {(r.r1 - r.r0 + 1) * (cell + GAP) - GAP | 0}px</span>}
      <button type="button" className="rb-fill-kb" onClick={() => onPick({ col: 0, span })}>＋ 이 아래에 붙이기</button>
      {children}
    </div>
  );
}

type Adding =
  | { at: 'end'; slot: number; span: number }
  | { at: 'under'; stack: string; after: string; span: number; col: number; h?: number };

export function RelBoard({ widgets, isAdmin, ctx, onChange, edit, onEditEnd }: {
  widgets: RelWidget[]; isAdmin: boolean; ctx: BoardCtx; onChange: (next: RelWidget[]) => void;
  /** 편집 중인지 — 켜고 끄는 버튼은 자관 상세의 EDIT 메뉴에 있다 (예전 위젯 칸 위 토글은 모바일·2단에서 안 켜졌다) */
  edit: boolean;
  /** 편집 안내 줄의 「화면 수정 끝내기」 — 스크롤해 내려온 자리에서 바로 끌 수 있게 */
  onEditEnd: () => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState<RelWidget | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  // 새 위젯을 넣을 자리 — 이 위젯 바로 뒤 (없으면 맨 끝)
  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  // 끄는 동안의 크기 — 손을 떼면 저장
  const [drag, setDrag] = useState<{ id: string; span: number; h: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // 정사각형 칸 한 변 = 24칸 중 한 칸 너비
  const [cell, setCell] = useState(0);
  const del = useConfirmDelete();

  useEffect(() => { if (!edit) { setSel(null); setMore(false); setAdding(null); } }, [edit]);
  useEffect(() => {
    if (!adding) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('.rb-kinds,.rb-slot,.rb-fill')) setAdding(null); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [adding]);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const fit = () => setCell(Math.max(0, (el.clientWidth - GAP * (GRID_COLS - 1)) / GRID_COLS));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widgets.length > 0 || isAdmin]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!widgets.length && !isAdmin) return null;

  const put = (id: string, p: Partial<RelWidget>) => onChange(widgets.map(w => (w.id === id ? { ...w, ...p } : w)));
  const move = (id: string, dir: -1 | 1) => {
    const i = widgets.findIndex(w => w.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= widgets.length) return;
    const n = [...widgets]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  const add = (kind: RelWidgetKind) => {
    if (!adding) return;
    const nw: RelWidget = adding.at === 'end'
      ? { id: newId(), kind, span: adding.span, preset: 'card' }
      : { id: newId(), kind, span: adding.span, col: adding.col || undefined, h: adding.h, under: true, preset: 'card' };
    setInsertAfter(adding.at === 'under' ? adding.after : null);
    setAdding(null);
    setEditing(nw);   // 내용부터 채우고, SAVE하면 칸에 들어간다
  };

  const startResize = (e: React.PointerEvent, w: RelWidget, st: RelStack) => {
    e.preventDefault(); e.stopPropagation();
    const box = (e.currentTarget as HTMLElement).closest('.rb-w') as HTMLElement | null;
    if (!box || !cell) return;
    const br = box.getBoundingClientRect();
    const isHead = st.items[0].id === w.id;
    const max = isHead ? GRID_COLS : st.span - (placeIn(st, w).col ?? 0);
    let cur = { id: w.id, span: placeIn(st, w).span, h: w.h ?? Math.round(br.height) };
    const mv = (ev: PointerEvent) => {
      const raw = Math.round((ev.clientX - br.left + GAP) / (cell + GAP));
      const ns = Math.max(SPAN_MIN, Math.min(max, raw));
      const nh = Math.max(WIDGET_H_MIN, Math.min(WIDGET_H_MAX, Math.round((ev.clientY - br.top) / 10) * 10));
      cur = { id: w.id, span: ns, h: nh };
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      put(w.id, { span: cur.span, w: undefined, h: cur.h });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const shown = drag ? widgets.map(x => (x.id === drag.id ? { ...x, span: drag.span, w: undefined, h: drag.h } : x)) : widgets;
  const stacks = stacksOf(shown);
  const free = lastRowFree(widgets);
  const slots = free >= SPAN_MIN ? [free, GRID_COLS] : [GRID_COLS];

  const renderWidget = (w: RelWidget, st: RelStack) => {
    const w0 = widgets.find(x => x.id === w.id) ?? w;
    const idx = widgets.findIndex(x => x.id === w.id);
    const look = widgetLook(w);
    const on = edit && sel === w.id;
    const preset = presetOf(w);
    const place = placeIn(st, w);
    const style = {
      '--rb-w': place.span,
      '--rb-a': `${look.a}%`,
      '--rb-r': `${look.r}px`,
      ...(place.col != null ? { gridColumn: `${place.col + 1} / span ${place.span}` } : null),
    } as React.CSSProperties;
    return (
      <div key={w.id} className={`rb-w rb-${w.kind} rb-p-${preset}${look.line ? ' rb-line-box' : ''}${look.line && look.a === 0 ? ' rb-noline' : ''}${on ? ' sel' : ''}`}
        style={style}
        onClick={edit ? () => { if (sel !== w.id) { setSel(w.id); setMore(false); } } : undefined}>
        {on && (
          <div className="rb-tb" onClick={e => e.stopPropagation()}>
            {(Object.keys(WIDGET_PRESETS) as (keyof typeof WIDGET_PRESETS)[]).map(k => (
              <button key={k} type="button" className="rb-chip" aria-pressed={preset === k}
                onClick={() => put(w.id, { preset: k, a: k === 'line' ? WIDGET_PRESETS.line.a : undefined, r: undefined })}>
                {WIDGET_PRESETS[k].label}
              </button>
            ))}
            {preset === 'custom' && <span className="rb-custom">직접</span>}
            <button type="button" className="rb-ic" aria-label="세부 조절" aria-expanded={more} onClick={() => setMore(m => !m)}>⋯</button>
            <i className="sep" />
            <button type="button" className="rb-ic" onClick={() => setEditing(w0)}>내용</button>
            {/* 앞 위젯 아래에 붙이기 ↔ 새 자리로 (시안 A) — 맨 앞 위젯은 붙을 곳이 없다 */}
            {idx > 0 && (
              <button type="button" className="rb-ic" aria-pressed={!!w.under}
                onClick={() => put(w.id, w.under ? { under: undefined, col: undefined } : { under: true })}>
                {w.under ? '따로 놓기' : '위에 붙이기'}
              </button>
            )}
            <button type="button" className="rb-ic" aria-label="앞으로" disabled={idx === 0} onClick={() => move(w.id, -1)}>‹</button>
            <button type="button" className="rb-ic" aria-label="뒤로" disabled={idx === widgets.length - 1} onClick={() => move(w.id, 1)}>›</button>
            <button type="button" className="rb-ic danger" aria-label="위젯 지우기"
              onClick={() => del.ask(`${kindLabel(w.kind)} 위젯 지우기`, () => {
                // 묶음 머리를 지우면 그 아래 위젯들은 앞 묶음에 붙지 않고 새 묶음이 된다
                const i = widgets.findIndex(x => x.id === w.id);
                const next = widgets.filter(x => x.id !== w.id);
                if (!w.under && next[i]?.under) next[i] = { ...next[i], under: undefined, col: undefined };
                onChange(next); setSel(null);
              })}>✕</button>
            {more && (
              <div className="rb-pop">
                <label>
                  <span>{look.line ? '가로줄' : '투명도'}</span>
                  <input type="range" min={0} max={100} value={look.a} aria-label={look.line ? '가로줄 진하기' : '배경 불투명도'}
                    onChange={e => put(w.id, look.line ? { a: +e.target.value } : { preset: 'custom', a: +e.target.value, r: look.r })} />
                  <output>{look.a}%</output>
                </label>
                <label className={look.line ? 'off' : ''}>
                  <span>모서리</span>
                  <input type="range" min={0} max={32} value={look.r} disabled={look.line} aria-label="모서리"
                    onChange={e => put(w.id, { preset: 'custom', a: look.a, r: +e.target.value })} />
                  <output>{look.line ? '—' : `${look.r}px`}</output>
                </label>
                <label>
                  <span>높이</span>
                  <span className="rb-hv">{w.h ? `${w.h}px` : '내용대로'}</span>
                  {w.h ? <button type="button" onClick={() => put(w.id, { h: undefined })}>자동으로</button> : <span />}
                </label>
              </div>
            )}
          </div>
        )}
        {/* 겉(.rb-w)은 격자 자리와 편집 도구, 속(.rb-in)은 배경·모서리·높이 — 고정 높이에서 속만 스크롤되고 도구는 잘리지 않게 */}
        <div className="rb-in" style={w.h ? { height: w.h, overflowY: 'auto' } : undefined}>
          {w.title && <h3>{w.title}</h3>}
          <div className="rb-body"><WidgetBody w={w} ctx={ctx} /></div>
        </div>
        {on && <span className="rb-dims">{place.span}/{GRID_COLS} · {w.h ? `${w.h}px` : '자동'}</span>}
        {on && (
          <span className="rb-handle" role="presentation"
            onPointerDown={e => startResize(e, w0, st)}
            onDoubleClick={e => { e.stopPropagation(); put(w.id, { h: undefined }); }} />
        )}
      </div>
    );
  };

  return (
    <section className={`rb${edit ? ' rb-edit' : ''}${drag ? ' rb-resizing' : ''}`}>
      {edit && (
        <div className="rb-bar">
          <button type="button" className="rb-toggle on" onClick={onEditEnd}>화면 수정 끝내기</button>
          <span>위젯을 눌러 모양·내용을 바꾸고, 오른쪽 아래 모서리를 끌어 크기를 맞춥니다(두 번 누르면 높이가 내용대로). 위젯 아래 빈칸을 끌어서 고르면 그 크기로 위젯을 붙입니다.</span>
        </div>
      )}
      <div className="rb-grid" ref={gridRef} style={{ '--rb-cell': `${cell}px` } as React.CSSProperties}>
        {stacks.map(st => {
          const head = st.items[0].id;
          const last = st.items[st.items.length - 1].id;
          const open = adding?.at === 'under' && adding.stack === head;
          return (
            <div key={head} className="rb-stack" style={{ '--rb-w': st.span } as React.CSSProperties}>
              <div className="rb-stack-items">{st.items.map(w => renderWidget(w, st))}</div>
              {edit && cell > 0 && (
                <StackFill span={st.span} cell={cell} open={open}
                  onPick={p => setAdding({ at: 'under', stack: head, after: last, span: p.span, col: p.col, h: p.h })}>
                  {open && <KindMenu onPick={add} />}
                </StackFill>
              )}
            </div>
          );
        })}
        {edit && slots.map((sw, i) => (
          <div key={i} className="rb-slot" style={{ '--rb-w': sw } as React.CSSProperties}>
            <button type="button" onClick={() => setAdding(a => (a?.at === 'end' && a.slot === i ? null : { at: 'end', slot: i, span: sw }))}
              aria-expanded={adding?.at === 'end' && adding.slot === i}>＋ 위젯</button>
            {adding?.at === 'end' && adding.slot === i && <KindMenu onPick={add} />}
          </div>
        ))}
      </div>
      {editing && (
        <WidgetEditor w={editing} ctx={ctx} onClose={() => setEditing(null)}
          onSave={nw => {
            const exists = widgets.some(x => x.id === nw.id);
            let next: RelWidget[];
            if (exists) next = widgets.map(x => (x.id === nw.id ? nw : x));
            else {
              const i = insertAfter ? widgets.findIndex(x => x.id === insertAfter) : -1;
              next = i < 0 ? [...widgets, nw] : [...widgets.slice(0, i + 1), nw, ...widgets.slice(i + 1)];
            }
            onChange(next);
            setEditing(null);
            setSel(nw.id);
          }} />
      )}
      {del.element}
    </section>
  );
}
