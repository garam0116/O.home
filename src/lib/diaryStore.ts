// 다이어리 (4.14) — 무드 기능은 사용하지 않아 삭제 (v2.1 사용자 요청)
import type { Visibility } from './charStore';

/* ---------- 일기 ---------- */
export interface DiaryPost {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  body: string;              // MD
  imgIds: string[];          // 첨부 이미지 (IndexedDB)
  visibility: Visibility;
}

export const DIARY_SEED: DiaryPost[] = [];
