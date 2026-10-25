import path from "node:path";

// Shared test environment setup. Run against a dedicated prisma/test.db
// (see package.json "test" script), never the dev database.
// The tests delete every row; without the npm script's DATABASE_URL, Prisma
// would fall back to .env's dev database. Refuse instead of wiping it.
if (!/test\.db/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error('Run tests with "npm test" — DATABASE_URL must point at prisma/test.db, never the dev database.');
}
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-not-real";
process.env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Several code paths that tests exercise directly (runResearch, the
// knowledge-bases API routes) also trigger a Markdown vault sync as a side
// effect. Without this override they'd write into the real project
// `vault/` directory — point every test at a throwaway one instead.
// tests/unit/vault-sync.test.ts further narrows this to its own temp dir
// for precise assertions; this is just the safety-net default.
process.env.VAULT_DIR = path.resolve(__dirname, "../.vitest-vault");
