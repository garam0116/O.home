'use client';
// 페이지 헤더 모양 (v3.2 사용자 요청) — 환경설정 > 디자인 「페이지 헤더」.
// 카테고리뿐 아니라 로드비·다이어리·자관·갤러리·감상타래·TRPG 등 모든 페이지의 .page-head에 공통으로 걸린다.
// <html>에 phs-mast(마스트헤드) / phs-emblem(각인) 클래스를 달고, 모양은 globals.css 「페이지 헤더 모양」이 맡는다.
// 값은 처음 카테고리 전용으로 만들 때 넣은 자리(ohome.boardset.v1의 headStyle)를 그대로 쓴다 — 이미 저장한 값이 이어지게
import { useEffect } from 'react';
import { useBoardSettings } from '@/lib/boardStore';

export function PageHeadStyle() {
  const { st } = useBoardSettings();
  const v = st.headStyle ?? 'basic';
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('phs-mast', v === 'mast');
    root.classList.toggle('phs-emblem', v === 'emblem');
  }, [v]);
  return null;
}
