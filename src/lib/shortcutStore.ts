'use client';
// 단축키 (사용자 요청) — 환경설정 > 단축키.
// 관리자가 정하고 사이트를 쓰는 모두에게 같게 적용되는 사이트 설정이다(settingStore — 맨 위 [저장]으로 확정).
// 실제로 키를 받아 동작시키는 쪽은 components/shell/Shortcuts.
import { useEffect, useState } from 'react';
import { getSetting, setSetting, onSettingChange, onSettingReload } from './settingStore';

export type ShortcutAction = 'settings' | 'write' | 'edit' | 'search' | 'help';

/** 동작 목록 — 순서가 곧 화면(환경설정·? 목록)의 순서 */
export const SHORTCUT_ACTIONS: { id: ShortcutAction; name: string; who: string; def: string }[] = [
  { id: 'settings', name: '환경설정 열기', who: '관리자', def: 'Q' },
  { id: 'write', name: '글쓰기 (어디에 쓸까요? 창)', who: '쓸 수 있는 사람', def: 'W' },
  { id: 'edit', name: '메인 편집모드 켜기/끄기', who: '관리자 · 메인에서', def: 'E' },
  { id: 'search', name: '검색으로 이동', who: '모두', def: '/' },
  { id: 'help', name: '단축키 목록 보기', who: '모두', def: '?' },
];

export interface ShortcutSettings {
  /** 단축키 전체 사용 */
  on: boolean;
  /** 로그인하지 않은 방문자에게도 켜기 */
  guests: boolean;
  /** 처음 방문할 때 「? 를 누르면…」 안내를 한 번 띄우기 */
  hint: boolean;
  /** 동작별로 바꾼 키 — 없으면 기본 키(def) */
  keys: Partial<Record<ShortcutAction, string>>;
  /** 끈 동작 */
  off: ShortcutAction[];
  /** 글쓰기 창: 지금 보고 있는 카테고리를 미리 골라 두기 */
  writePreselect: boolean;
  /** 글쓰기 창 목록 순서 — 메뉴 순서 / 이 브라우저에서 최근 쓴 곳 먼저 */
  writeOrder: 'menu' | 'recent';
  /** 글쓰기 창에서 뺄 카테고리(메뉴 주소) */
  writeHide: string[];
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  on: true, guests: true, hint: false, keys: {}, off: [],
  writePreselect: true, writeOrder: 'menu', writeHide: [],
};

export const SHORTCUT_KEY = 'ohome.shortcuts.v1';

export function currentShortcuts(): ShortcutSettings {
  const p = getSetting<Partial<ShortcutSettings>>(SHORTCUT_KEY, {});
  return { ...DEFAULT_SHORTCUTS, ...(p && typeof p === 'object' ? p : {}) };
}

export function useShortcuts(): [ShortcutSettings, (patch: Partial<ShortcutSettings>) => void] {
  const [st, setSt] = useState<ShortcutSettings>(DEFAULT_SHORTCUTS);
  useEffect(() => {
    setSt(currentShortcuts());
    const offChange = onSettingChange(k => { if (k === SHORTCUT_KEY) setSt(currentShortcuts()); });
    const offReload = onSettingReload(SHORTCUT_KEY, () => setSt(currentShortcuts()));
    return () => { offChange(); offReload(); };
  }, []);
  const patch = (p: Partial<ShortcutSettings>) => {
    const n = { ...currentShortcuts(), ...p };
    setSt(n);
    setSetting(SHORTCUT_KEY, n);
  };
  return [st, patch];
}

/** 이 동작에 지금 걸린 키 */
export const keyOf = (s: ShortcutSettings, id: ShortcutAction) =>
  s.keys[id] ?? SHORTCUT_ACTIONS.find(a => a.id === id)!.def;

/** 이 키를 쓰는 동작 (켜져 있는지와 무관) */
export const actionOfKey = (s: ShortcutSettings, key: string) =>
  SHORTCUT_ACTIONS.find(a => keyOf(s, a.id) === key)?.id ?? null;

/* 기호 키 — 자판 자리(code) → 이름. Shift를 누른 / 만 ?로 따로 본다 */
const SYM: Record<string, string> = {
  Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\',
};

/**
 * 키 입력 → 단축키 이름('Q' · '1' · '/' · '?'). 단축키가 될 수 없으면 null.
 * 글자(e.key) 대신 자판 자리(e.code)로 본다 — 한글 입력 상태에서 Q를 누르면 글자로는 「ㅂ」가 오기 때문.
 * Ctrl·⌘·Alt 조합은 브라우저 단축키라 받지 않는다. Shift는 Shift+/(= ?)만 받는다.
 */
export function eventKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const c = e.code;
  if (c === 'Slash') return e.shiftKey ? '?' : '/';
  if (e.shiftKey) return null;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  return SYM[c] ?? null;
}

/** 글쓰기 창 「최근 쓴 곳 먼저」 — 이 브라우저에서 고른 순서(메뉴 주소). 사람마다 다르므로 사이트 설정이 아니다 */
const RECENT_KEY = 'ohome.shortcuts.recent';
export function recentWrites(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function pushRecentWrite(href: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([href, ...recentWrites().filter(h => h !== href)].slice(0, 20))); } catch { /* 무시 */ }
}
