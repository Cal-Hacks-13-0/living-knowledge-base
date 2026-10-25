/**
 * The identity shown in the product UI (sidebar profile, account menus).
 * Display-only: every visitor sees this same demo identity. It has no effect
 * on authentication, sessions, permissions, or data ownership — those come
 * from the sign-in session (lib/auth/session.ts) and the workspace scope
 * (lib/workspace.ts). Change the values here to change them everywhere.
 */
export const DEMO_IDENTITY = {
  name: "Axion User",
  email: "axionuser@calhacks.edu",
  initials: "AU",
} as const;
