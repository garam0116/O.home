'use client';
// 환경설정 저장 일원화 (v3.1 사용자 요청) — 화면 맨 위 [저장] 하나로 모든 설정을 저장한다.
//
// 대부분의 설정은 settingStore 드래프트(키 단위로 저장을 붙잡는 층)에 그대로 들어가지만,
// 메뉴 트리처럼 화면 안에서만 들고 있는 임시 값은 그 화면이 「저장할 거리」로 여기에 등록한다.
// 맨 위 [저장]·[되돌리기]·나가기 확인이 등록된 것까지 함께 다룬다.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface SavePart {
  /** 어느 그룹의 설정인가 — 메뉴 옆 「저장 안 된 변경」 점 표시용 */
  group: string;
  dirty: boolean;
  /** 화면 안의 값을 저장 계층에 넘긴다 (드래프트 확정 직전에 불린다) */
  save: () => void;
  /** 저장이 끝난 뒤 할 일 (예: 메뉴 공개범위를 이미 올라간 글에도 적용) */
  after?: () => void;
  discard: () => void;
}

interface Registry {
  set: (id: string, part: SavePart | null) => void;
}

const Ctx = createContext<Registry | null>(null);

/** 설정 화면 쪽 — 등록된 파트 목록과 등록 창구 */
export function useSavePartHost() {
  const parts = useRef(new Map<string, SavePart>());
  const [ver, setVer] = useState(0);
  const set = useCallback((id: string, part: SavePart | null) => {
    const prev = parts.current.get(id);
    if (part) parts.current.set(id, part); else parts.current.delete(id);
    // 저장 표시가 바뀔 때만 다시 그린다 (함수만 새로 만들어진 경우는 조용히 교체)
    if (!!prev?.dirty !== !!part?.dirty || prev?.group !== part?.group) setVer(v => v + 1);
  }, []);
  const registry = useMemo(() => ({ set }), [set]);
  const list = useMemo(() => [...parts.current.values()], [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const Provider = useCallback(
    ({ children }: { children: React.ReactNode }) => <Ctx.Provider value={registry}>{children}</Ctx.Provider>,
    [registry],
  );
  return {
    Provider,
    dirtyParts: list.filter(p => p.dirty),
    /** 지금 시점의 파트 (최신 함수) */
    current: () => [...parts.current.values()],
  };
}

/** 화면(패널) 쪽 — 이 화면의 임시 값을 맨 위 [저장]에 맡긴다 */
export function useSavePart(id: string, part: SavePart) {
  const reg = useContext(Ctx);
  // 매 렌더 최신 값으로 교체 — save/discard가 지금 상태를 보게
  useEffect(() => { reg?.set(id, part); });
  useEffect(() => () => reg?.set(id, null), [reg, id]);
}
