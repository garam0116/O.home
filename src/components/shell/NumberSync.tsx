'use client';
/**
 * 예전 항목에 번호를 저장해 두기 (v2.4 사용자 요청 — 모든 글은 고정된 번호 주소).
 *
 * 번호 주소가 생기기 전의 글·그림 등은 번호가 없다. 화면에서는 만든 순서대로 임시 번호를
 * 붙여 보여 주지만, 저장해 두지 않으면 앞의 글을 지울 때 뒤의 번호가 밀린다.
 * **관리자**만 모든 항목을 보고 고칠 수 있으므로, 관리자가 접속하면 한 번 훑어서
 * 번호가 없거나 겹친 항목에 번호를 저장하고 서버 카운터를 그 위로 맞춘다.
 * 같은 탭에서는 한 번만 돈다 — 이후 새 항목은 쓸 때 카운터에서 번호를 받는다.
 *
 * 번호 발급이 서버 규칙에 막히면(규칙·스키마를 다시 붙여 넣지 않음) 관리자에게 알린다.
 */
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { backend, isServerMode, type ListItem } from '@/lib/backend';
import { fetchList, syncList } from '@/lib/db';
import { currentUserId } from '@/lib/currentUser';
import { NUMBERED, MEMBER_COUNTER, NO_ERR_EVT, maxNo, numbersOf, reserveNos, withNumbers, type NoRow } from '@/lib/itemNo';

const DONE_KEY = 'ohome.numbersync.v1';

async function syncKind(key: string, kind: string) {
  const server = isServerMode();
  type Row = NoRow & ListItem;
  const rows: Row[] = server
    ? await fetchList<Row>(kind)
    : (JSON.parse(localStorage.getItem(key) ?? '[]') as Row[]);
  let next = withNumbers(rows);
  // 자관은 안의 AU에도 번호를 (주소 /rels/{…}/au/{번호}/edit)
  if (kind === 'relations') {
    const base = next ?? rows;
    let auChanged = false;
    const withAu = base.map(r => {
      const aus = (r as { aus?: (NoRow & { id: string })[] }).aus;
      if (!Array.isArray(aus)) return r;
      const extra = aus.filter(a => a.id !== 'base');
      const filled = withNumbers(extra);
      if (!filled) return r;
      auChanged = true;
      const byId = new Map(filled.map(a => [a.id, a]));
      return { ...r, aus: aus.map(a => byId.get(a.id) ?? a) };
    });
    if (auChanged) next = withAu;
  }
  if (next) {
    if (server) {
      await syncList(kind, rows, next, currentUserId());
    } else {
      localStorage.setItem(key, JSON.stringify(next));
      // 같은 탭의 목록 훅은 storage 이벤트를 다른 탭에서만 받으므로 직접 알린다
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(next) }));
    }
  }
  // 카운터를 지금 가장 큰 번호 이상으로 — 다음 새 항목이 이미 있는 번호를 받지 않게
  await reserveNos(kind, 0, maxNo(next ?? rows));
}

async function syncMembers() {
  const be = isServerMode() ? backend() : null;
  if (!be) return;
  const list = await be.listMembers();
  const nums = numbersOf(list.map(m => ({ id: m.id, no: m.no, createdAt: m.createdAt })));
  for (const m of list) {
    const n = nums.get(m.id);
    if (n !== undefined && m.no !== n) await be.setMemberNo(m.id, n);
  }
  let max = 0;
  nums.forEach(n => { if (n > max) max = n; });
  await reserveNos(MEMBER_COUNTER, 0, max);
}

export function NumberSync() {
  const { isAdmin, ready } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!ready || !isAdmin) return;
    try { if (sessionStorage.getItem(DONE_KEY)) return; } catch { /* 계속 */ }
    let alive = true;
    (async () => {
      for (const [key, kind] of Object.entries(NUMBERED)) {
        if (!alive) return;
        try { await syncKind(key, kind); } catch (err) { console.error('[ohome] 번호 정리 실패', kind, err); }
      }
      try { await syncMembers(); } catch (err) { console.error('[ohome] 회원 번호 정리 실패', err); }
      try { sessionStorage.setItem(DONE_KEY, '1'); } catch { /* 무시 */ }
    })();
    return () => { alive = false; };
  }, [ready, isAdmin]);

  // 번호 발급이 막혔을 때 — 관리자에게만, 한 번만
  useEffect(() => {
    if (!isAdmin) return;
    let shown = false;
    const h = () => {
      if (shown) return;
      shown = true;
      toast('글 번호를 서버에서 받지 못했습니다 — 환경설정 > 서버에서 보안 규칙(또는 SQL)을 다시 붙여 넣어 주세요. 그 전까지는 번호가 겹칠 수 있습니다');
    };
    window.addEventListener(NO_ERR_EVT, h);
    return () => window.removeEventListener(NO_ERR_EVT, h);
  }, [isAdmin, toast]);

  return null;
}
