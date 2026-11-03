'use client';
/* 자관 헤더 끝색 (v3.5 사용자 확정 시안 B) — 테마컬러를 지정한 자관에서 헤더가 투명해지며 끝나는 자리의 색을 읽어,
   그 색 단색으로 페이지 바탕을 이어 칠한다 (「헤더 아랫부분이 쭉 그대로 이어지는 느낌」).
   읽는 자리는 화면에 실제로 보이는 그대로 — 헤더 판(.rel-backdrop, 100vw × 600px)에 크롭을 적용해 그린 뒤
   마스크가 옅어지기 시작하는 띠(높이 60~85%)의 평균. 판에 걸린 필터(brightness .8 · saturate .9)도 같이 적용한다. */
import { useEffect, useState } from 'react';
import { useBlobUrl } from './blobStore';
import { toRgba } from './color';
import type { CropValue } from '@/components/ui/CropEditor';

const BD_H = 600;      // .rel-backdrop 높이
const BLEED = 40;      // .rel-backdrop .img { inset:-40px }
const BAND = [0.6, 0.85] as const;

type RGB = [number, number, number];

/** .rel-backdrop .img 의 filter: brightness(.8) saturate(.9) 를 색 하나에 적용 */
function backdropFilter([r, g, b]: RGB): string {
  const br = (v: number) => v * 0.8;
  const [R, G, B] = [br(r), br(g), br(b)];
  // CSS saturate() 행렬 (Filter Effects 명세)
  const s = 0.9;
  const out = [
    (0.213 + 0.787 * s) * R + (0.715 - 0.715 * s) * G + (0.072 - 0.072 * s) * B,
    (0.213 - 0.213 * s) * R + (0.715 + 0.285 * s) * G + (0.072 - 0.072 * s) * B,
    (0.213 - 0.213 * s) * R + (0.715 - 0.715 * s) * G + (0.072 + 0.928 * s) * B,
  ];
  return '#' + out.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** 이미지 헤더 — 크롭 그대로 판에 그려 띠의 평균색. CORS로 못 읽으면 null */
function sampleImage(url: string, crop: CropValue | undefined): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    if (!/^(blob:|data:)/.test(url)) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        // 계산 비용을 줄이려 판을 1/4로 줄여 그린다 — 평균색만 필요
        const k = 0.25;
        const W = Math.max(40, Math.round((window.innerWidth + BLEED * 2) * k));
        const H = Math.round((BD_H + BLEED * 2) * k);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        // coverImgStyle 과 같은 배치
        const c = crop ?? { x: 0, y: 0, scale: 1 };
        const natR = img.naturalWidth / img.naturalHeight;
        const wide = natR >= W / H;
        const dh = wide ? c.scale * H : (c.scale * W) / natR;
        const dw = wide ? dh * natR : c.scale * W;
        ctx.drawImage(img, (0.5 + c.x) * W - dw / 2, (0.5 + c.y) * H - dh / 2, dw, dh);
        const y0 = Math.round((BLEED + BD_H * BAND[0]) * k);
        const y1 = Math.round((BLEED + BD_H * BAND[1]) * k);
        const x0 = Math.round(BLEED * k);
        const { data } = ctx.getImageData(x0, y0, W - x0 * 2, Math.max(1, y1 - y0));
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
        resolve(n ? backdropFilter([r / n, g / n, b / n]) : null);
      } catch { resolve(null); }   // 다른 출처 이미지라 캔버스가 막힌 경우
    };
    img.src = url;
  });
}

/** 그라데이션 헤더 — 띠 가운데(높이 72%) 지점의 색 */
function sampleGradient(g1: string, g2: string, angle: number): string {
  const W = window.innerWidth + BLEED * 2, H = BD_H + BLEED * 2;
  const a = (angle * Math.PI) / 180;
  const L = Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a));
  const fy = (BLEED + BD_H * ((BAND[0] + BAND[1]) / 2)) / H;
  const t = Math.min(1, Math.max(0, 0.5 + ((fy - 0.5) * H * -Math.cos(a)) / L));
  const A = toRgba(g1), B = toRgba(g2);
  return backdropFilter([A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t]);
}

/** 헤더 끝색 — enabled가 아니거나 헤더가 없거나 읽지 못하면 null */
export function useHeaderTone(opts: {
  enabled: boolean;
  imgRef?: string; crop?: CropValue;
  g1?: string; g2?: string; angle?: number;
}): string | null {
  const { enabled, imgRef, crop, g1, g2, angle } = opts;
  const url = useBlobUrl(enabled ? imgRef : undefined);
  const [tone, setTone] = useState<string | null>(null);
  const cropKey = crop ? `${crop.x},${crop.y},${crop.scale}` : '';
  useEffect(() => {
    if (!enabled) { setTone(null); return; }
    if (imgRef) {
      if (!url) { setTone(null); return; }
      let alive = true;
      sampleImage(url, crop).then(c => { if (alive) setTone(c); });
      return () => { alive = false; };
    }
    if (g1 || g2) { setTone(sampleGradient(g1 ?? '#3a4150', g2 ?? '#1a1d22', angle ?? 180)); return; }
    setTone(null);
    // crop은 cropKey로 비교 (매 렌더 새 객체)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, imgRef, url, cropKey, g1, g2, angle]);
  return tone;
}
