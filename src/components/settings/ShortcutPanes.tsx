'use client';
/**
 * 환경설정 > 단축키 (사용자 요청) — 1차 메뉴 「단축키」 그룹의 세 항목.
 *  · 사용 설정: 전체 켜기 · 방문자에게도 · 처음 방문 안내
 *  · 단축키 목록: 키를 눌러 다른 키로 바꾸기(사용자 확정 시안 2) · 동작별 켜기/끄기 · 기본값으로
 *  · 글쓰기 선택 창: 보고 있는 카테고리 미리 고르기 · 목록 순서 · 창에서 뺄 카테고리
 * 값은 사이트 설정(lib/shortcutStore)이라 맨 위 [저장]으로 확정한다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { KToggle, KCheck } from '@/components/ui/Kit';
import { useShortcuts, keyOf, eventKey, SHORTCUT_ACTIONS, type ShortcutAction } from '@/lib/shortcutStore';
import { useMenuSettings } from '@/lib/menuStore';
import { useBoards } from '@/lib/boardStore';
import { useSiteMenu } from '@/components/shell/siteNav';
import { writeHrefOf } from '@/components/shell/Shortcuts';

function Row({ title, desc, children }: { title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="l"><b>{title}</b>{desc && <small>{desc}</small>}</div>
      {children}
    </div>
  );
}

export function ShortcutUsePane() {
  const [s, patch] = useShortcuts();
  return (
    <div className="set-sec sc-set">
      <Row title="단축키 사용" desc="끄면 사이트 전체에서 단축키가 동작하지 않습니다">
        <KToggle checked={s.on} onChange={v => patch({ on: v })} />
      </Row>
      <Row title="가입하지 않은 방문자에게도 켜기" desc="끄면 로그인한 사람만 단축키를 씁니다(/ 검색 · ? 목록 포함)">
        <KToggle checked={s.guests} onChange={v => patch({ guests: v })} />
      </Row>
      <Row title="처음 방문할 때 안내 띄우기" desc="「? 를 누르면 단축키를 볼 수 있어요」를 브라우저마다 한 번만 보여 줍니다">
        <KToggle checked={s.hint} onChange={v => patch({ hint: v })} />
      </Row>
      <p className="d" style={{ margin: '10px 0 0' }}>
        글 입력칸·댓글창·에디터에 커서가 있을 때, Ctrl·⌘·Alt와 함께 누를 때는 언제나 무시합니다. 한글 입력 상태에서도 같은 자리의 키로 동작합니다.
      </p>
    </div>
  );
}

export function ShortcutKeysPane() {
  const [s, patch] = useShortcuts();
  const [wait, setWait] = useState<ShortcutAction | null>(null);
  const [clash, setClash] = useState<{ id: ShortcutAction; key: string; with: string } | null>(null);

  const setKey = (id: ShortcutAction, key: string) => {
    const def = SHORTCUT_ACTIONS.find(a => a.id === id)!.def;
    const keys = { ...s.keys };
    if (key === def) delete keys[id]; else keys[id] = key;
    patch({ keys });
  };

  // 「새 키를 누르세요」 동안의 키 — 먼저 붙잡아 다른 처리(설정 화면의 Esc 닫기 등)로 넘기지 않는다
  useEffect(() => {
    if (!wait) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setWait(null); return; }
      const k = eventKey(e);
      if (!k) return;   // Shift·Ctrl 단독 등은 기다린다
      const other = SHORTCUT_ACTIONS.find(a => a.id !== wait && keyOf(s, a.id) === k);
      if (other) setClash({ id: wait, key: k, with: other.name });
      else { setClash(null); setKey(wait, k); }
      setWait(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait, s]);

  return (
    <div className="set-sec sc-set">
      {SHORTCUT_ACTIONS.map(a => {
        const on = !s.off.includes(a.id);
        const key = keyOf(s, a.id);
        return (
          <div key={a.id} className={`set-row${on ? '' : ' sc-off'}`}>
            <div className={`sc-key${wait === a.id ? ' wait' : ''}`}>
              <kbd role="button" tabIndex={0} aria-label={`${a.name} — 키 바꾸기 (지금 ${key})`}
                onClick={() => { setClash(null); setWait(w => (w === a.id ? null : a.id)); }}
                onKeyDown={e => { if (!wait && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setClash(null); setWait(a.id); } }}>
                {wait === a.id ? '새 키를 누르세요' : key}
              </kbd>
              <div className="l" style={{ display: 'grid', gap: 2 }}>
                <b>{a.name}</b>
                {clash?.id === a.id && <small className="sc-clash">「{clash.key}」는 {clash.with}에 쓰고 있습니다</small>}
                {key !== a.def && <button className="sc-reset" onClick={() => setKey(a.id, a.def)}>기본값({a.def})으로</button>}
              </div>
            </div>
            <div className="sc-key">
              <span className="sc-who">{a.who}</span>
              <KToggle checked={on} onChange={v => patch({ off: v ? s.off.filter(x => x !== a.id) : [...s.off, a.id] })} />
            </div>
          </div>
        );
      })}
      <p className="d" style={{ margin: '10px 0 0' }}>
        키를 누르면 「새 키를 누르세요」로 바뀌고, 다음에 누른 키가 들어갑니다(Esc 취소). 영문·숫자·기호 한 개만 받고,
        다른 동작과 겹치면 바꾸지 않습니다. ?는 Shift+/ 자리입니다.
      </p>
    </div>
  );
}

export function ShortcutWritePane() {
  const [s, patch] = useShortcuts();
  const { menu } = useSiteMenu();
  const [menuSet] = useMenuSettings();
  const { boards } = useBoards();
  // 글쓰기 화면이 있는 카테고리 전부 (관리자 기준 — 회원에게는 그중 쓸 수 있는 곳만 보인다)
  const cands = useMemo(() => {
    const out: { label: string; href: string }[] = [];
    const add = (label: string, href: string) => {
      if (out.some(x => x.href === href)) return;
      if (writeHrefOf(href, { boards, menuSet, viewer: { loggedIn: true, isAdmin: true } })) out.push({ label, href });
    };
    for (const m of menu) {
      if (m.children) m.children.forEach(c => add(c.label, c.href));
      else if (m.href) add(m.label, m.href);
    }
    return out;
  }, [menu, boards, menuSet]);

  return (
    <div className="set-sec sc-set">
      <Row title={`${keyOf(s, 'write')}를 누르면`} desc="어디서 누르든 「어디에 쓸까요?」 창을 엽니다. 숫자키로 바로 가거나 ↑↓ · Enter로 고릅니다">
        <span className="sc-who">고정</span>
      </Row>
      <Row title="지금 있는 카테고리를 미리 골라 두기" desc={`게시판을 보다가 ${keyOf(s, 'write')} → Enter 한 번이면 그 게시판 글쓰기로`}>
        <KToggle checked={s.writePreselect} onChange={v => patch({ writePreselect: v })} />
      </Row>
      <Row title="목록 순서" desc="최근 쓴 곳은 브라우저마다 따로 기억합니다">
        <div className="seg in-panel">
          <button className={s.writeOrder === 'menu' ? 'on' : ''} onClick={() => patch({ writeOrder: 'menu' })}>메뉴 순서</button>
          <button className={s.writeOrder === 'recent' ? 'on' : ''} onClick={() => patch({ writeOrder: 'recent' })}>최근 쓴 곳 먼저</button>
        </div>
      </Row>
      <Row title="목록에서 뺄 카테고리" desc="쓸 권한이 없는 곳은 원래 보이지 않습니다. 권한은 있지만 창에서 숨기고 싶은 곳만 고르세요 · TRPG·로드비는 목록 안에서 추가하므로 창에 나오지 않습니다">
        <div className="sc-hide">
          {cands.length ? cands.map(c => (
            <KCheck key={c.href} label={c.label} checked={s.writeHide.includes(c.href)}
              onChange={v => patch({ writeHide: v ? [...s.writeHide, c.href] : s.writeHide.filter(h => h !== c.href) })} />
          )) : <small className="d">메뉴에 글쓰기 화면이 있는 카테고리가 없습니다</small>}
        </div>
      </Row>
    </div>
  );
}
