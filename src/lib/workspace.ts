/**
 * Data-ownership scope for workspace-owned records (currently Inbox events and
 * digests). Axion has one shared workspace behind the shared-password sign-in
 * (lib/auth/session.ts) — every signed-in visitor is authorized for exactly
 * this workspace, and the displayed demo identity (lib/demo-identity.ts) plays
 * no part in it. Reads and writes go through this function so that per-user
 * workspaces only need a change here (and to the session) later.
 */
export const DEFAULT_WORKSPACE_ID = "default";

export function currentWorkspaceId(): string {
  return DEFAULT_WORKSPACE_ID;
}
