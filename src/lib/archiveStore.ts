'use client';
/**
 * 아카이브 (사용자 요청) — 여러 카테고리를 한 페이지에 묶는 게시판.
 *
 * 글 모양은 하나다: 이름 · 설명 · HTML(상태창 등). 탭 하나가 카테고리 하나이고,
 * 글은 카테고리 하나에 속한다(`catId`). 탭을 누르면 그 카테고리에 넣은 글만 보인다.
 *
 * 카테고리 목록은 사이트 설정(`ohome.archiveset.v1`)에, 글은 콘텐츠 컬렉션 `archive`에 둔다
 * (갤러리 섹션과 같은 「목록은 설정에, 항목은 원래 테이블에」 방식). 카테고리를 지워도 글은 남고
 * 「분류 없음」 탭에 모인다 — 카테고리 id가 목록에 없는 글이 그쪽으로 간다.
 */
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting, onSettingReload } from './settingStore';

export interface ArchiveItem {
  id: string;
  /** 소속 카테고리 — 설정의 카테고리 id. 목록에 없으면 「분류 없음」 */
  catId: string;
  name: string;
  desc: string;
  /** 붙여 넣은 HTML 원문 — 화면에서는 스크립트가 막힌 iframe 안에서만 그린다 */
  html: string;
  author: string;
  authorId: string;
  date: string;              // ISO
}

export const ARCHIVE_KEY = 'ohome.archive.v1';
export const ARCHIVE_SEED: ArchiveItem[] = [];

export interface ArchiveCat { id: string; label: string }
export interface ArchiveSettings { cats: ArchiveCat[] }

export const DEFAULT_ARCHIVE_SETTINGS: ArchiveSettings = {
  cats: [{ id: 'status', label: 'Status' }],
};

/** 카테고리 목록에 없는 글이 모이는 탭 id — 지운 카테고리의 글이 여기로 온다 */
export const UNCAT = '__uncat';

export const SET_KEY = 'ohome.archiveset.v1';

export function useArchiveSettings(): [ArchiveSettings, (patch: Partial<ArchiveSettings>) => void, boolean] {
  const [st, setSt] = useState<ArchiveSettings>(DEFAULT_ARCHIVE_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // 서버에서 새 값이 오면 다시 읽는다 — 다른 설정 스토어와 같은 구독
    const load = () => { try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_ARCHIVE_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 기본값 */ } };
    load();
    setLoaded(true);
    return onSettingReload(SET_KEY, load);
  }, []);
  const patch = useCallback((p: Partial<ArchiveSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** 이 글이 보일 탭 — 카테고리가 지워졌으면 「분류 없음」 */
export const tabOf = (it: ArchiveItem, cats: ArchiveCat[]) =>
  (cats.some(c => c.id === it.catId) ? it.catId : UNCAT);
