'use client';
// BGM 플레이어 (4.1) — 유튜브 IFrame API, 화면은 숨기고 자체 컨트롤만 표시
// 평소엔 돌아가는 레코드판(커버 이미지 라벨)만 · 누르면 플레이어 팝업 (v2.1)
// 팝업: 커버 · now playing · 진행바 · 컨트롤 · 곡 목록 / 모바일은 하단 시트
// 페이지 이동에도 유지(레이아웃 상주) · 브라우저 정책상 소리 재생은 사용자의 첫 클릭부터 시작
import React, { useEffect, useRef, useState } from 'react';
import { useBgm, ytThumb, type BgmTrack } from '@/lib/bgmStore';
import { useBlobUrl } from '@/lib/blobStore';
import { TopButton } from './TopButton';

/** 흐르는 글씨 — 재생 중이고 글자가 넘칠 때만 무한 스크롤, 평소엔 말줄임.
 *  넘침 판정은 숨김 측정용 스팬으로 — 마운트 직후(레이아웃·폰트 확정 전) 1회 측정만 하면
 *  짧은 제목도 흐르는 글씨로 오판되는 버그가 있어 ResizeObserver로 계속 재측정 */
function Marquee({ text, active, className }: { text: string; active: boolean; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const box = boxRef.current, meas = measRef.current;
    if (!box || !meas) return;
    const m = () => setOver(meas.scrollWidth > box.clientWidth + 1);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(box);
    ro.observe(meas);
    return () => ro.disconnect();
  }, [text]);
  const run = active && over;
  return (
    <div ref={boxRef} className={`mq ${className ?? ''} ${run ? 'run' : ''}`} style={{ position: 'relative' }}>
      <span ref={measRef} aria-hidden
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {text}
      </span>
      {run ? <span className="mq-in"><span>{text}</span><span>{text}</span></span> : text}
    </div>
  );
}

/* 최소한의 YT IFrame API 타입 */
interface YTPlayer {
  loadVideoById: (id: string) => void;
  cueVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  seekTo: (sec: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** 00:00:00 — 시간 단위는 1시간 넘는 곡도 있어 항상 표시 (참고 스타일) */
const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

/* 아이콘 — 전부 currentColor(--bgm-ic / --bgm-fg) 연동, 색은 CSS에서만 정함 */
const I = {
  list: <svg viewBox="0 0 24 24" className="st"><path d="M4 6h16M4 12h16M4 18h11" /></svg>,
  prev: <svg viewBox="0 0 24 24" className="fl"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>,
  next: <svg viewBox="0 0 24 24" className="fl"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>,
  play: <svg viewBox="0 0 24 24" className="fl"><path d="M7 4.5v15l12.5-7.5z" /></svg>,
  pause: <svg viewBox="0 0 24 24" className="fl"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" /></svg>,
  shuffle: <svg viewBox="0 0 24 24" className="st"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>,
  vol: <svg viewBox="0 0 24 24" className="st"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>,
  mute: <svg viewBox="0 0 24 24" className="st"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" /><path d="m22 9-6 6M16 9l6 6" /></svg>,
  close: <svg viewBox="0 0 24 24" className="st"><path d="m6 9 6 6 6-6" /></svg>,
};

/** 커버 이미지 — 직접 지정한 이미지 우선, 없으면 유튜브 썸네일.
 *  큰 커버(팝업)는 maxres를 먼저 시도하고 없으면(120px 대체 이미지·오류) hq로 내려감 */
function Cover({ track, big, className }: { track?: BgmTrack; big?: boolean; className?: string }) {
  const custom = useBlobUrl(track?.cover);
  const vid = track?.videoId ?? '';
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(false), [vid]);
  const src = custom
    ?? (!vid ? undefined : big ? ytThumb(vid, fallback ? 'hqdefault' : 'maxresdefault') : ytThumb(vid, 'mqdefault'));
  if (!src) return <span className={`cv ${className ?? ''}`} />;
  return (
    <img className={`cv ${className ?? ''}`} src={src} alt="" draggable={false} referrerPolicy="no-referrer"
      onLoad={e => { if (!custom && big && !fallback && e.currentTarget.naturalWidth <= 120) setFallback(true); }}
      onError={() => { if (!custom && big && !fallback) setFallback(true); }} />
  );
}

/** 바 드래그 공통 — 0~1 비율을 돌려줌 (마우스·터치 모두 pointer 이벤트) */
function useBarDrag(onRatio: (r: number, done: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onRatio);
  cb.current = onRatio;
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ratio = (x: number) => {
      const r = ref.current!.getBoundingClientRect();
      return Math.min(1, Math.max(0, (x - r.left) / r.width));
    };
    cb.current(ratio(e.clientX), false);
    const mv = (ev: PointerEvent) => cb.current(ratio(ev.clientX), false);
    const up = (ev: PointerEvent) => {
      cb.current(ratio(ev.clientX), true);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return { ref, onPointerDown };
}

export function BgmPlayer() {
  const { state } = useBgm();
  const { tracks, settings } = state;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);          // 플레이어 팝업
  const [listOpen, setListOpen] = useState(true);   // 팝업 안 곡 목록
  const [volOpen, setVolOpen] = useState(false);    // 팝업 안 볼륨 줄
  const [volume, setVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(false);
  // 셔플은 방문자별(이 브라우저에서만) — 관리자 설정값이 기본, 바꿔도 사이트 설정은 그대로
  const [shuffle, setShuffle] = useState(settings.shuffle);
  useEffect(() => setShuffle(settings.shuffle), [settings.shuffle]);
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  // 진행 상황 (팝업이 열려 있을 때만 갱신)
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);       // onReady 이후에만 playVideo가 실제 동작 (그 전엔 무시됨)
  const startedRef = useRef(false);     // 한 번이라도 실제 재생 시작됨 — 첫 재생은 loadVideoById 경로 필수
  const rootRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const track = tracks[idx] ?? tracks[0];
  const effVol = muted ? 0 : volume;

  useEffect(() => { setVolume(settings.volume); if (!muted) playerRef.current?.setVolume(settings.volume); }, [settings.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  // 팝업 — 바깥을 누르거나 Esc로 닫힘
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  // 팝업을 열면 지금 곡이 목록에서 보이도록
  useEffect(() => {
    if (!open || !listOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>('.it.on');
    if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + el.offsetHeight / 2;
  }, [open, listOpen, idx]);

  // 진행바 갱신 — 팝업이 열려 있을 때만 폴링
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const p = playerRef.current;
      if (!p || !readyRef.current) return;
      try { setTime(p.getCurrentTime() || 0); setDur(p.getDuration() || 0); } catch { /* 준비 전 */ }
    };
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, [open, idx]);

  // YT API 로드 + 플레이어 생성
  useEffect(() => {
    if (!settings.enabled || tracks.length === 0) return;
    let cancelled = false;
    const create = () => {
      if (cancelled || !holderRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(holderRef.current, {
        width: 0, height: 0,
        videoId: tracks[0].videoId,
        playerVars: { controls: 0, disablekb: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            // 자동 재생이 무장된 상태(첫 상호작용이 플레이어 준비보다 먼저)면 바로 시작
            if (armedRef.current) {
              armedRef.current = false;
              playAtRef.current(idxRef.current);
            }
          },
          onStateChange: (e: { data: number }) => {
            // 1=재생, 2=일시정지, 0=종료 — 버퍼링(3)·큐(5) 같은 과도 상태는 무시
            if (e.data === 0) {
              nextRef.current(); // 곡 종료 → 반복/다음 곡 (셔플 지원)
            } else if (e.data === 1) {
              startedRef.current = true;
              setPlaying(true);
            } else if (e.data === 2) {
              setPlaying(false);
            } else if (e.data === -1) {
              // 미시작(재생이 정책에 막힌 경우 포함) — "재생 중인 척" 하지 않기
              // (정상 시작 시에도 -1→3→1로 지나가므로 잠깐 ▶로 보였다가 1에서 복구됨)
              setPlaying(false);
              startedRef.current = false;
            }
          },
        },
      });
    };
    if (window.YT?.Player) create();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); create(); };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'yt-iframe-api';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, tracks.length > 0]);

  const playAt = (i: number) => {
    const t = tracks[i];
    setTime(0); setDur(0);
    if (!t || !playerRef.current) { setIdx(i); return; }
    setIdx(i);
    startedRef.current = true;
    // loadVideoById는 로드 + 즉시 재생 — 큐만 된 첫 영상의 playVideo()가 무시되는
    // 유튜브 IFrame 이슈를 피하기 위해 첫 재생도 반드시 이 경로를 탄다
    playerRef.current.loadVideoById(t.videoId);
    playerRef.current.setVolume(effVolRef.current);
    playerRef.current.playVideo();
    setPlaying(true); // 버튼 즉시 반영 (이벤트는 보정용)
  };
  const playAtRef = useRef(playAt);
  playAtRef.current = playAt;
  const effVolRef = useRef(effVol);
  effVolRef.current = effVol;

  const next = () => {
    if (tracks.length === 0) return;
    const cur = idxRef.current;
    let n: number;
    if (shuffleRef.current && tracks.length > 1) {
      do { n = Math.floor(Math.random() * tracks.length); } while (n === cur);
    } else {
      n = cur + 1;
      if (n >= tracks.length) {
        if (!settings.repeat) { setPlaying(false); return; }
        n = 0;
      }
    }
    playAt(n);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  // 입장 자동 재생 (4.1) — 브라우저 정책상 완전 자동재생은 불가하므로
  // 방문자의 "첫 상호작용(클릭/키)"과 동시에 재생을 시작 (1회만)
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const armedRef = useRef(false);
  useEffect(() => {
    if (!settings.autoplay || !settings.enabled || tracks.length === 0) return;
    // 모바일(좁은 화면·터치 전용 기기)에서는 자동 재생하지 않음 — 버튼으로만 재생
    if (window.matchMedia('(max-width: 620px), (hover: none) and (pointer: coarse)').matches) return;
    const fire = (ev: Event) => {
      remove();
      // 플레이어 자체를 조작하는 클릭(재생/이전/다음 등)은 버튼 핸들러에 맡김 —
      // 여기서 먼저 재생을 시작하면 곧이어 오는 버튼 click이 "일시정지"로 뒤집힘
      if (rootRef.current?.contains(ev.target as Node)) return;
      if (playingRef.current) return;
      if (readyRef.current && playerRef.current) {
        // 첫 재생은 loadVideoById 경로 (큐 상태 playVideo 무시 이슈 회피)
        playAtRef.current(idxRef.current);
      } else {
        // 플레이어 준비 전(onReady 이전)에는 재생 명령이 무시됨 — 준비되는 즉시 재생하도록 무장
        armedRef.current = true;
      }
    };
    const remove = () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
    };
    window.addEventListener('pointerdown', fire, true);
    window.addEventListener('keydown', fire, true);
    return remove;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoplay, settings.enabled, tracks.length]);

  const prev = () => {
    // 3초 넘게 들었으면 처음으로, 아니면 이전 곡 (일반적인 플레이어 동작)
    if (startedRef.current && time > 3 && playerRef.current) { playerRef.current.seekTo(0, true); setTime(0); return; }
    playAt((idxRef.current - 1 + tracks.length) % tracks.length);
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pauseVideo();
      setPlaying(false); // 버튼 즉시 반영
    } else if (!readyRef.current) {
      armedRef.current = true; // 준비 전이면 무장 — onReady에서 즉시 재생
    } else if (!startedRef.current) {
      playAt(idxRef.current); // 첫 재생 — 큐 상태 playVideo 무시 이슈 회피
    } else {
      // 일시정지 후 재개 — 위치 유지를 위해 playVideo
      playerRef.current.setVolume(effVol);
      playerRef.current.playVideo();
      setPlaying(true);
    }
  };

  const volBar = useBarDrag(r => {
    const v = Math.round(r * 100);
    setVolume(v);
    setMuted(false);
    playerRef.current?.setVolume(v);
  });
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    playerRef.current?.setVolume(m ? 0 : volume);
  };

  const seekBar = useBarDrag((r, done) => {
    if (!dur) return;
    if (!done) { setSeekPreview(r * dur); return; }
    setSeekPreview(null);
    setTime(r * dur);
    playerRef.current?.seekTo(r * dur, true);
  });
  const shownTime = seekPreview ?? time;
  const pct = dur ? Math.min(100, (shownTime / dur) * 100) : 0;

  if (!settings.enabled || tracks.length === 0) return <TopButton anchor={null} left={settings.position === 'bl'} />;

  const left = settings.position === 'bl';
  const spin = { animationPlayState: playing ? 'running' : 'paused' } as const;

  return (
    <>
    <TopButton anchor={rootRef} left={left} hide={open} />
    <div
      ref={rootRef}
      className={`bgm ${open ? 'open' : ''} ${left ? 'bgm-left' : ''} ${playing ? 'playing' : ''}`}
      style={{ visibility: mounted ? undefined : 'hidden' }}
    >
      {/* 숨겨진 유튜브 플레이어 */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div ref={holderRef} />
      </div>

      {/* 레코드판 — 라벨 자리에 커버 이미지, 재생 중에만 회전 */}
      <button type="button" className="disc" aria-label={open ? 'BGM 플레이어 닫기' : 'BGM 플레이어 열기'} aria-expanded={open}
        data-tip={open ? undefined : (track?.title || 'BGM')}
        onClick={() => setOpen(o => !o)}>
        <span className="rec" style={spin}>
          <Cover track={track} className="lbl" />
        </span>
      </button>

      {/* 플레이어 팝업 */}
      {open && (
        <>
          <div className="bgm-dim" onClick={() => setOpen(false)} />
          <div className="bgm-pop" role="dialog" aria-label="BGM 플레이어">
            <div className="art">
              <Cover track={track} big />
              <button type="button" className="x" aria-label="닫기" data-tip="닫기" onClick={() => setOpen(false)}>{I.close}</button>
            </div>
            <div className="np">
              <div className="lb">now playing</div>
              <Marquee className="tt" text={track?.title ?? ''} active={playing} />
              {track?.desc && <div className="ds">{track.desc}</div>}
            </div>
            <div className="prog">
              <span className="tm">{fmt(shownTime)}</span>
              <div className={`bar ${dur ? '' : 'off'}`} ref={seekBar.ref} onPointerDown={seekBar.onPointerDown}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="tm">{fmt(dur)}</span>
            </div>
            <div className="ctl">
              <button type="button" className={`sm ${listOpen ? 'on' : ''}`} aria-pressed={listOpen} data-tip="곡 목록"
                onClick={() => setListOpen(o => !o)}>{I.list}</button>
              <div className="mid">
                <button type="button" data-tip="이전" aria-label="이전" onClick={prev}>{I.prev}</button>
                <button type="button" className="pp" data-tip={playing ? '일시정지' : '재생'} aria-label={playing ? '일시정지' : '재생'}
                  onClick={togglePlay}>{playing ? I.pause : I.play}</button>
                <button type="button" data-tip="다음" aria-label="다음" onClick={next}>{I.next}</button>
              </div>
              <button type="button" className={`sm ${shuffle ? 'on' : ''}`} aria-pressed={shuffle} data-tip={shuffle ? '셔플 끄기' : '셔플'}
                onClick={() => setShuffle(s => !s)}>{I.shuffle}</button>
              <button type="button" className={`sm ${volOpen ? 'on' : ''}`} data-tip={`볼륨 ${effVol}`} aria-label="볼륨"
                onClick={() => setVolOpen(o => !o)}>{effVol === 0 ? I.mute : I.vol}</button>
            </div>
            {volOpen && (
              <div className="vrow">
                <button type="button" className="sm" data-tip={muted ? '음소거 해제' : '음소거'} onClick={toggleMute}>
                  {effVol === 0 ? I.mute : I.vol}
                </button>
                <div className="vol" ref={volBar.ref} onPointerDown={volBar.onPointerDown}>
                  <i style={{ width: `${effVol}%` }} />
                </div>
                <span className="tm">{effVol}</span>
              </div>
            )}
            {listOpen && (
              <div className="bgm-list" ref={listRef}>
                {tracks.map((t, i) => (
                  <button type="button" key={t.id} className={`it ${i === idx ? 'on' : ''}`}
                    onClick={() => playAt(i)}>
                    <b>{t.title}</b>{t.desc && <small>{t.desc}</small>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </>
  );
}
