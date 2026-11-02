'use client';
// 뒤로가기 화살표 (v2.8 사용자 요청 — 자관 상세 왼쪽 위). 모양·애니메이션은 globals.css `.back-arrow`.
// 누르면 브라우저 뒤로가기와 같다. 주소로 바로 들어와(새 탭 등) 이전 기록이 없으면 fallback으로 간다.
// 마우스는 올릴 때 이미 화살표로 바뀌어 있으니 바로 이동하고, 터치는 누르는 순간 화살표로 바뀐 걸 보여 준 뒤 이동한다.
import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** 터치에서 화살표가 다 그려지는 걸 보여 주고 이동하기까지 (CSS 전환 .42s + 지연 .08s 중 대부분) */
const TOUCH_DELAY = 380;

export function BackArrow({ fallback, label = '뒤로가기' }: { fallback: string; label?: string }) {
  const router = useRouter();
  const [play, setPlay] = useState(false);
  const pointer = useRef<string>('mouse');

  const go = () => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };

  return (
    <button type="button" className={`back-arrow ${play ? 'play' : ''}`} aria-label={label} title={label}
      onPointerDown={e => { pointer.current = e.pointerType; }}
      onClick={() => {
        if (pointer.current === 'mouse') { go(); return; }
        setPlay(true);
        window.setTimeout(go, TOUCH_DELAY);
      }}>
      {/* 24×24 — 마름모 네 변(l1·l2 왼쪽, r1·r2 오른쪽) + 축. 왼쪽 두 변을 1px 옮기면 그대로 화살촉 */}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <line className="l1" x1="6" y1="12" x2="12" y2="6" />
        <line className="l2" x1="6" y1="12" x2="12" y2="18" />
        <line className="r1" x1="12" y1="6" x2="18" y2="12" />
        <line className="r2" x1="18" y1="12" x2="12" y2="18" />
        <line className="shaft" x1="19" y1="12" x2="5" y2="12" />
      </svg>
    </button>
  );
}
