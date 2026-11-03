'use client';
// 자관 등록·수정 화면의 뒤로가기 (사용자 요청) — PC 2단형이면 상단바를 숨기고 자관 상세와 같은 자리에 화살표를 둔다.
// 상세에서 EDIT을 누르면 상단바가 갑자기 생기던 걸 없앤다. 상단바 숨김·화살표 표시는 621px 이상에서만(globals.css
// body.rel-edit-bare) — 모바일·1단형은 상단바 그대로. 이 컴포넌트를 쓰는 section에는 page-rel-edit 클래스를 붙인다.
import React, { useEffect } from 'react';
import { useMainStore } from '@/lib/mainStore';
import { BackArrow } from '@/components/ui/BackArrow';

export function RelFormBack({ to, label }: { to: string; label: string }) {
  const { pcSide } = useMainStore();
  useEffect(() => {
    document.body.classList.toggle('rel-edit-bare', pcSide);
    return () => document.body.classList.remove('rel-edit-bare');
  }, [pcSide]);
  return <div className="rel-edit-back"><BackArrow to={to} label={label} /></div>;
}
