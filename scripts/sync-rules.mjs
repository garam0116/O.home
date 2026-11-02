// firebase/*.rules · supabase/schema.sql → 설치 화면용 사본 (src/lib/firebaseRules.ts · schemaSql.ts)
// 규칙 원본을 고친 뒤 `node scripts/sync-rules.mjs` 로 갱신한다.
import { readFileSync, writeFileSync } from 'node:fs';

const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const fs = readFileSync('firebase/firestore.rules', 'utf8');
const st = readFileSync('firebase/storage.rules', 'utf8');
writeFileSync('src/lib/firebaseRules.ts', `'use client';
// 설치 화면에서 복사해 쓰는 Firebase 보안 규칙 — 원본: firebase/firestore.rules · firebase/storage.rules
// 이 파일은 scripts/sync-rules.mjs가 만든다 — 원본을 고친 뒤 \`node scripts/sync-rules.mjs\`

export const FIRESTORE_RULES = \`${esc(fs)}\`;

export const STORAGE_RULES = \`${esc(st)}\`;
`);

// supabase/schema.sql → src/lib/schemaSql.ts (설치 화면의 [SQL 복사]용 사본)
const sql = readFileSync('supabase/schema.sql', 'utf8');
writeFileSync('src/lib/schemaSql.ts', `'use client';
// 설치 화면에서 복사해 쓰는 스키마 SQL — 원본: supabase/schema.sql
// 이 파일은 scripts/sync-rules.mjs가 만든다 — 원본을 고친 뒤 \`node scripts/sync-rules.mjs\`

export const SCHEMA_SQL = \`${esc(sql)}\`;
`);
