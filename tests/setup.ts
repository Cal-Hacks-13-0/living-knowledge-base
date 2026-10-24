// Shared test environment setup. Run against a dedicated prisma/test.db
// (see package.json "test" script), never the dev database.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-not-real";
process.env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
