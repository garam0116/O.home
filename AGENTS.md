<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## O.HOME 작업 규칙 (사람·AI 공통)

여러 AI(GPT·Claude·Gemini)가 번갈아 작업한 코드라 방식이 섞여 있다. 새로 만들거나 고칠 때는 아래를 따른다.

- **여러 화면이 함께 보는 값**은 새 방식을 만들지 않는다.
  - 사이트 설정(관리자가 정하고 모두가 보는 값): `lib/settingStore`의 `getSetting`/`setSetting`을 쓰고, 다시 읽기는 `onSettingChange`·`onSettingReload`로 구독한다. 설정 이벤트 이름은 `ohome-settings` 하나뿐이다 — 문자열을 직접 적지 말고 이 함수들을 쓴다.
  - 글·댓글 같은 목록: `lib/postStore`의 `useLocalList`를 쓴다.
- **같은 판정을 두 곳에 복사하지 않는다.** 이름이 다른 함수가 같은 답을 내야 하면 한쪽이 다른 쪽을 부르게 한다 (예: `canAccessHref` → `canViewHref`).
- **백엔드 두 개(Firebase·Supabase)는 같은 결과를 내야 한다.** 한쪽을 고치면 다른 쪽(`lib/backend/*Backend.ts`)과 규칙(`firebase/*.rules`, `supabase/schema.sql`)도 같이 확인한다. 규칙을 고친 뒤에는 `node scripts/sync-rules.mjs`로 설치 화면용 사본을 갱신한다.
- **동작을 바꾸면 그 동작을 설명하는 주석도 같이 고친다.** 다음 작업자는 주석을 믿고 판단한다.
- **커밋·PR에 AI 표시를 넣지 않는다.** 커밋 메시지에 `Co-Authored-By`·`Claude-Session` 같은 줄을, PR 본문에 "Generated with …" 같은 줄을 붙이지 않는다. 비공개 저장소로 옮기면 Vercel 무료(Hobby) 요금제가 저장소 주인이 아닌 공동 작성자가 있는 커밋의 배포를 막을 수 있기 때문이다. Claude Code는 `.claude/settings.json`의 `attribution` 설정으로도 끈다.
