'use client';
// 모바일 메뉴 패널 (v2.9 사용자 요청) — 상단바 ≡로 연다. 모양 4종은 환경설정 > 디자인 「모바일 메뉴」에서 고른다.
//  · accordion: 화면 전체 · 큰 이탤릭 상위 메뉴 · 지금 메뉴만 펼침
//  · stage:     화면 전체 · 가운데 정렬 · 맨 위/아래 ✦, 사이 · (포인트 컬러)
//  · cover:     화면 전체 · 왼쪽 상위 / 오른쪽 커버 이미지 + 하위
//  · ledger:    상단바 아래로 내려오는 반투명 패널 · 한 줄에 상위 라벨 + 하위
// 게시판 메뉴에는 글 수를 붙인다(메뉴 카드와 같은 기준). 이동 버튼에는 m-nav-go를 붙여
// 환경설정의 「저장 안 한 변경」 경고가 잡을 수 있게 한다.
import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useBlobUrl } from '@/lib/blobStore';
import { useSiteSettings, type MobileNavStyle } from '@/lib/siteStore';
import { useBoardCounts, type SiteMenuItem } from './siteNav';

type Props = {
  menu: SiteMenuItem[];
  pathname: string;
  /** 상단바 아래쪽 위치 px — ledger가 그 아래로 내려온다 */
  topOffset: number;
  onNav: (href: string) => void;
  onClose: () => void;
};

const firstHref = (m: SiteMenuItem) => m.href ?? m.children?.[0]?.href;

export function MobileNav(props: Props) {
  const [site] = useSiteSettings();
  const style: MobileNavStyle = site.mNav ?? 'accordion';
  const { pathname, menu } = props;
  const cur = pathname + (typeof window !== 'undefined' ? window.location.search : '');
  const isCur = (href?: string) => !!href && (href === cur || href === pathname);
  const curGroup = menu.find(m => m.children?.some(c => isCur(c.href)) || isCur(m.href));
  const counts = useBoardCounts();
  const cnt = (href: string) => counts.get(href);
  const ctx: Ctx = { ...props, isCur, curGroup, cnt };

  return (
    <div className={`m-nav m-nav-${style}`} role="dialog" aria-modal="true" aria-label="메뉴"
      style={style === 'ledger' ? { '--m-nav-top': `${props.topOffset}px` } as React.CSSProperties : undefined}>
      <div className="m-nav-dim" onClick={props.onClose} />
      {style === 'stage' ? <Stage {...ctx} />
        : style === 'cover' ? <Cover {...ctx} />
        : style === 'ledger' ? <Ledger {...ctx} />
        : <Accordion {...ctx} />}
    </div>
  );
}

type Ctx = Props & {
  isCur: (href?: string) => boolean;
  curGroup?: SiteMenuItem;
  cnt: (href: string) => number | undefined;
};

/** 패널 머리 — 작은 로고(이미지 있으면 이미지) + 닫기 */
function Head({ onClose }: { onClose: () => void }) {
  const [site, , loaded] = useSiteSettings();
  const img = useBlobUrl(site.logoImageM || site.logoImage);
  return (
    <div className="m-nav-head">
      <span className="m-nav-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {loaded && (img ? <img src={img} alt={site.title} draggable={false} /> : site.title)}
      </span>
      <CloseBtn onClose={onClose} />
    </div>
  );
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button className="m-nav-x" aria-label="메뉴 닫기" onClick={onClose}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    </button>
  );
}

const Count = ({ n }: { n?: number }) => (n == null ? null : <span className="m-nav-cnt">{n}</span>);

/* ---------- Accordion ---------- */
function Accordion({ menu, onNav, onClose, isCur, curGroup, cnt }: Ctx) {
  const [open, setOpen] = useState<string | null>(curGroup?.children ? curGroup.label : null);
  return (
    <nav className="m-nav-panel">
      <Head onClose={onClose} />
      <div className="m-nav-list">
        {menu.map(m => m.children ? (
          <div key={m.label} className={`m-nav-grp ${open === m.label ? 'open' : ''}`}>
            <button className="m-nav-top" aria-expanded={open === m.label}
              onClick={() => setOpen(o => (o === m.label ? null : m.label))}>{m.label}</button>
            {open === m.label && (
              <div className="m-nav-sub">
                {m.children.map(c => (
                  <button key={c.href} className={`m-nav-go ${isCur(c.href) ? 'on' : ''}`} onClick={() => onNav(c.href)}>
                    <span>{c.label}</span><Count n={cnt(c.href)} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button key={m.label} className={`m-nav-top m-nav-go ${isCur(m.href) ? 'on' : ''}`} onClick={() => onNav(m.href!)}>{m.label}</button>
        ))}
      </div>
    </nav>
  );
}

/* ---------- Stage ---------- */
function Stage({ menu, onNav, onClose, isCur, curGroup, cnt }: Ctx) {
  const { user } = useAuth();
  const avatar = useBlobUrl(user?.avatarUrl);
  return (
    <nav className="m-nav-panel">
      <Head onClose={onClose} />
      <div className="m-nav-list">
        {user && (
          <div className="m-nav-who">
            <span className="m-nav-av" style={!avatar && user.avatarColor ? { background: user.avatarColor } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar && <img src={avatar} alt="" />}
            </span>
            {user.nickname}
          </div>
        )}
        <span className="m-nav-orn star" aria-hidden>✦</span>
        {menu.map((m, i) => {
          const href = firstHref(m);
          return (
            <React.Fragment key={m.label}>
              {i > 0 && <span className="m-nav-orn dot" aria-hidden>·</span>}
              <div className={`m-nav-grp ${curGroup === m ? 'on' : ''}`}>
                {/* 상위 이름 = 첫 하위 페이지 (PC 규칙과 같음) */}
                <button className="m-nav-top m-nav-go" onClick={() => href && onNav(href)}>{m.label}</button>
                {m.children && (
                  <div className="m-nav-sub">
                    {m.children.map(c => (
                      <button key={c.href} className={`m-nav-go ${isCur(c.href) ? 'on' : ''}`} onClick={() => onNav(c.href)}>
                        {c.label}{cnt(c.href) != null && <sup>{cnt(c.href)}</sup>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        <span className="m-nav-orn star" aria-hidden>✦</span>
      </div>
    </nav>
  );
}

/* ---------- Cover ---------- */
function Cover({ menu, onNav, onClose, isCur, curGroup, cnt }: Ctx) {
  const [site] = useSiteSettings();
  const { user, isAdmin } = useAuth();
  const avatar = useBlobUrl(user?.avatarUrl);
  const groups = menu.filter(m => m.children);
  const [selLabel, setSelLabel] = useState<string | undefined>((curGroup?.children ? curGroup : groups[0])?.label);
  const sel = groups.find(g => g.label === selLabel) ?? groups[0];
  const coverUrl = useBlobUrl(sel?.id ? site.mNavCovers?.[sel.id] : undefined);
  return (
    <nav className="m-nav-panel">
      <Head onClose={onClose} />
      <div className="m-nav-split">
        <div className="m-nav-l">
          {menu.map(m => m.children ? (
            <button key={m.label} className={`m-nav-top ${sel === m ? 'on' : ''}`} aria-pressed={sel === m}
              onClick={() => setSelLabel(m.label)}>{m.label}</button>
          ) : (
            <button key={m.label} className={`m-nav-top m-nav-go ${isCur(m.href) ? 'on' : ''}`} onClick={() => onNav(m.href!)}>{m.label}</button>
          ))}
        </div>
        <div className="m-nav-r">
          {sel && (
            <>
              <div className={`m-nav-hero ${coverUrl ? 'has-img' : ''}`}
                style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined}>
                <b>{sel.label}</b>
              </div>
              <div className="m-nav-sub">
                {sel.children!.map(c => (
                  <button key={c.href} className={`m-nav-go ${isCur(c.href) ? 'on' : ''}`} onClick={() => onNav(c.href)}>
                    <span>{c.label}</span><Count n={cnt(c.href)} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {user && (
        <div className="m-nav-foot">
          <span className="m-nav-av" style={!avatar && user.avatarColor ? { background: user.avatarColor } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatar && <img src={avatar} alt="" />}
          </span>
          {user.nickname}
          {isAdmin && <button className="m-nav-go m-nav-set" onClick={() => onNav('/settings')}>SETTINGS</button>}
        </div>
      )}
    </nav>
  );
}

/* ---------- Ledger ---------- */
function Ledger({ menu, onNav, onClose, isCur, curGroup, cnt }: Ctx) {
  return (
    <nav className="m-nav-panel">
      {menu.map(m => (
        <div key={m.label} className={`m-nav-row ${curGroup === m ? 'on' : ''}`}>
          {m.children ? <span className="m-nav-top">{m.label}</span>
            : <button className={`m-nav-top m-nav-go ${isCur(m.href) ? 'on' : ''}`} onClick={() => onNav(m.href!)}>{m.label}</button>}
          {m.children && (
            <div className="m-nav-sub">
              {m.children.map(c => (
                <button key={c.href} className={`m-nav-go ${isCur(c.href) ? 'on' : ''}`} onClick={() => onNav(c.href)}>
                  {c.label}{cnt(c.href) != null && <sup>{cnt(c.href)}</sup>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button className="m-nav-grab" aria-label="메뉴 닫기" onClick={onClose}><span /></button>
    </nav>
  );
}
