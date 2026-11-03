'use client';
// 관리자 로그인 때 — 예전에 공개로 저장된 비밀 데이터를 새 기준으로 옮긴다 (보안 검토, lib/securityMigrate)
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { backend, isServerMode } from '@/lib/backend';
import { useToast } from '@/components/ui/Toast';
import { setSetting } from '@/lib/settingStore';
import { runSecurityMigration } from '@/lib/securityMigrate';

const ran = new Set<string>();   // 세션(탭) 안에서 계정마다 한 번

export function SecurityMigrate() {
  const { user, isAdmin, ready } = useAuth();
  const toast = useToast();
  useEffect(() => {
    const be = backend();
    // ready 전의 user는 지난 접속의 저장본(표시용)이다 — 서버가 확인한 관리자에게만 돌린다
    if (!ready || !isServerMode() || !be || !user || !isAdmin || ran.has(user.id)) return;
    ran.add(user.id);
    void runSecurityMigration(be, user.id).then(r => {
      if (r.newInviteCode) {
        // 화면의 가입코드 칸도 새 값으로 (설정 캐시)
        setSetting('ohome.invite.v1', r.newInviteCode);
        toast(`가입코드를 새로 만들었습니다: ${r.newInviteCode} — 환경설정 > 회원에서 확인·변경할 수 있습니다`);
      }
    });
  }, [ready, user, isAdmin, toast]);
  return null;
}
