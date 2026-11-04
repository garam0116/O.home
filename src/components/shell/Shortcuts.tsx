'use client';
// 단축키 (사용자 요청) — 환경설정 > 단축키에서 정한 키를 사이트 전체에서 받는다.
//  · 기본: Q 환경설정 · W 글쓰기 창 · E 메인 편집모드 · / 검색 · ? 단축키 목록 (키·켜기는 lib/shortcutStore)
//  · 글 입력칸·에디터에 커서가 있을 때, 다른 창(모달)이 열려 있을 때, 환경설정 화면 안에서는 받지 않는다.
//  · W는 어디서 누르든 「어디에 쓸까요?」 창을 연다(사용자 확정 시안 2) — 메뉴 구성(묶음·순서·이름)을 그대로 따르고,
//    그 사람이 쓸 수 있는 곳만 보인다. 보고 있는 목록이 있으면 미리 골라 둔다(설정).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useMenuSettings, canGalleryWrite, type MenuSettings } from '@/lib/menuStore';
import { useBoards, findBoardByKey, boardHref, canBoardWrite, MAIN_BOARD_ID, BOARD_PATH, type Board } from '@/lib/boardStore';
import { SECTION_KINDS, SECTION_META, PATH_SEC, MAIN_SEC, findSecId, secSubHref, type SectionKind } from '@/lib/sectionStore';
import {
  useShortcuts, keyOf, eventKey, SHORTCUT_ACTIONS, recentWrites, pushRecentWrite, type ShortcutAction,
} from '@/lib/shortcutStore';
import { useSiteMenu, useSiteNav } from '@/components/shell/siteNav';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Viewer { loggedIn: boolean; isAdmin: boolean; id?: string }

/**
 * 메뉴 주소(목록) → 그 카테고리의 글쓰기 주소. 이 사람이 쓸 수 없거나 글쓰기 화면이 없는 곳이면 null.
 * 권한 판정은 각 목록의 WRITE 버튼과 같은 함수를 부른다(게시판 canBoardWrite · 갤러리 canGalleryWrite ·
 * 자관·감상타래·다이어리는 관리자). TRPG·로드비는 목록 안의 창으로 추가하므로 글쓰기 화면이 없다.
 */
export function writeHrefOf(href: string, ctx: { boards: Board[]; menuSet: MenuSettings; viewer: Viewer }): string | null {
  const path = href.split('?')[0];
  const { viewer } = ctx;
  if (!viewer.loggedIn) return null;
  // 게시판 — `/board` · `/board/b/별명`
  let board: Board | undefined;
  if (path === '/board') board = ctx.boards.find(b => b.id === MAIN_BOARD_ID);
  else if (path.startsWith(`${BOARD_PATH}/`)) board = findBoardByKey(decodeURIComponent(path.slice(BOARD_PATH.length + 1)), ctx.boards);
  if (board) {
    if (!canBoardWrite(board.permWrite, viewer)) return null;
    return board.id === MAIN_BOARD_ID ? '/board/write' : `${boardHref(board.id, ctx.boards)}/write`;
  }
  // 섹션 — `/gallery` · `/gallery/g/별명` 등
  for (const kind of SECTION_KINDS) {
    const base = SECTION_META[kind].href;
    const pre = `${base}/${PATH_SEC[kind]}/`;
    const secId = path === base ? MAIN_SEC : path.startsWith(pre) ? findSecId(kind, decodeURIComponent(path.slice(pre.length))) : undefined;
    if (!secId) continue;
    return sectionWrite(kind, secId, ctx.menuSet, viewer);
  }
  return null;
}

function sectionWrite(kind: SectionKind, secId: string, menuSet: MenuSettings, viewer: Viewer): string | null {
  switch (kind) {
    case 'gallery': return canGalleryWrite(menuSet, secId, viewer) ? secSubHref('gallery', secId, 'write') : null;
    case 'rels': case 'threads': return viewer.isAdmin ? secSubHref(kind, secId, 'new') : null;
    case 'diary': return viewer.isAdmin ? '/diary/write' : null;   // 다이어리 글쓰기는 하나
    default: return null;
  }
}

/** 글 입력 중인가 — 이때는 단축키를 받지 않는다 */
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .ProseMirror');
};

interface Dest { label: string; group: string; href: string; write: string }

export function Shortcuts() {
  const [s] = useShortcuts();
  const { user, isAdmin, known } = useAuth();
  const { editAvailable, toggleEdit } = useMainStore();
  const [menuSet] = useMenuSettings();
  const { boards } = useBoards();
  const { menu } = useSiteMenu();
  const nav = useSiteNav();
  const pathname = usePathname();
  const toast = useToast();
  const [picker, setPicker] = useState<{ sel: number } | null>(null);
  const [help, setHelp] = useState(false);

  const viewer: Viewer = useMemo(() => ({ loggedIn: !!user, isAdmin, id: user?.id }), [user, isAdmin]);
  const active = s.on && known && (s.guests || !!user);
  const enabled = (id: ShortcutAction) => !s.off.includes(id);

  /** 글쓰기 창 목록 — 메뉴 순서(또는 최근 쓴 곳 먼저), 쓸 수 있는 곳만 */
  const dests = useMemo<Dest[]>(() => {
    const out: Dest[] = [];
    const add = (label: string, group: string, href: string) => {
      if (/^https?:\/\//.test(href) || s.writeHide.includes(href) || out.some(d => d.href === href)) return;
      const write = writeHrefOf(href, { boards, menuSet, viewer });
      if (write) out.push({ label, group, href, write });
    };
    for (const m of menu) {
      if (m.children) m.children.forEach(c => add(c.label, m.label, c.href));
      else if (m.href) add(m.label, m.label, m.href);
    }
    if (s.writeOrder === 'recent') {
      const rec = recentWrites();
      const rank = (h: string) => { const i = rec.indexOf(h); return i < 0 ? Infinity : i; };
      return out.map((d, i) => ({ d, i })).sort((a, b) => rank(a.d.href) - rank(b.d.href) || a.i - b.i).map(x => x.d);
    }
    return out;
  }, [menu, boards, menuSet, viewer, s.writeHide, s.writeOrder]);

  /** 지금 보고 있는 목록 — 주소가 가장 길게 겹치는 곳 */
  const curIdx = () => {
    const here = pathname + window.location.search;
    let best = -1, len = -1;
    dests.forEach((d, i) => {
      if ((here === d.href || pathname === d.href || pathname.startsWith(`${d.href}/`)) && d.href.length > len) { best = i; len = d.href.length; }
    });
    return best;
  };

  const goWrite = (d: Dest) => { setPicker(null); pushRecentWrite(d.href); nav(d.write); };

  const run = (id: ShortcutAction): boolean => {
    switch (id) {
      case 'settings':
        if (!isAdmin) return false;
        nav('/settings'); return true;
      case 'write':
        if (!dests.length) { toast(user ? '글을 쓸 수 있는 카테고리가 없습니다' : '글쓰기는 로그인 후 이용할 수 있습니다'); return true; }
        setPicker({ sel: Math.max(0, s.writePreselect ? curIdx() : -1) }); return true;
      case 'edit':
        if (!isAdmin || !editAvailable) return false;
        toggleEdit(); return true;
      case 'search': nav('/search'); return true;
      case 'help': setHelp(true); return true;
    }
  };

  const onKey = (e: KeyboardEvent) => {
    // 글쓰기 창 안의 키 — 숫자 바로 가기 · ↑↓ · Enter · Esc
    if (picker) {
      const n = dests.length;
      if (e.key === 'Escape') { e.preventDefault(); setPicker(null); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPicker(p => p && { sel: (p.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); const d = dests[picker.sel]; if (d) goWrite(d); return; }
      if (/^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const d = dests[Number(e.code.slice(5)) - 1];
        if (d) { e.preventDefault(); goWrite(d); }
      }
      return;
    }
    if (help) { if (e.key === 'Escape') { e.preventDefault(); setHelp(false); } return; }
    if (!active || e.defaultPrevented || e.repeat || e.isComposing || typing(e.target)) return;
    // 다른 창이 떠 있거나 환경설정 화면 안이면 받지 않는다
    if (document.querySelector('.modal-ov') || document.querySelector('.setx')) return;
    const k = eventKey(e);
    if (!k) return;
    const act = SHORTCUT_ACTIONS.find(a => enabled(a.id) && keyOf(s, a.id) === k);
    if (act && run(act.id)) e.preventDefault();
  };
  // 리스너는 한 번만 달고, 늘 이번 렌더의 처리기(최신 값)를 부른다
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // 처음 방문 안내 — 이 브라우저에서 한 번만
  useEffect(() => {
    if (!active || !s.hint || !enabled('help')) return;
    try {
      if (localStorage.getItem('ohome.shortcuts.hinted')) return;
      localStorage.setItem('ohome.shortcuts.hinted', '1');
    } catch { return; }
    toast(`${keyOf(s, 'help')} 를 누르면 단축키를 볼 수 있어요`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, s.hint]);

  const helpList = SHORTCUT_ACTIONS.filter(a => enabled(a.id)
    && (a.id !== 'settings' || isAdmin) && (a.id !== 'edit' || isAdmin));

  return (
    <>
      <Modal open={!!picker} title="어디에 쓸까요?" desc="숫자키로 바로 가거나 ↑↓ · Enter로 고릅니다 · Esc 닫기"
        small className="sc-pick" onClose={() => setPicker(null)}>
        <div className="sc-pick-list" role="listbox" aria-label="글쓰기 카테고리">
          {dests.map((d, i) => (
            <React.Fragment key={d.href}>
              {(i === 0 || dests[i - 1].group !== d.group) && d.group !== d.label && <small className="sc-pick-grp">{d.group}</small>}
              <button role="option" aria-selected={picker?.sel === i} className={picker?.sel === i ? 'on' : ''}
                onMouseEnter={() => setPicker({ sel: i })} onClick={() => goWrite(d)}>
                {i < 9 ? <kbd>{i + 1}</kbd> : <span className="sc-kbd-gap" />}
                <span>{d.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </Modal>
      <Modal open={help} title="단축키" desc="글 입력칸에 커서가 있을 때는 동작하지 않습니다 · Esc 닫기" small className="sc-help" onClose={() => setHelp(false)}>
        <div className="sc-help-list">
          {helpList.map(a => (
            <div key={a.id}><kbd>{keyOf(s, a.id)}</kbd><span>{a.name}</span></div>
          ))}
        </div>
      </Modal>
    </>
  );
}
