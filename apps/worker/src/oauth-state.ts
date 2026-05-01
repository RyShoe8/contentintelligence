import { randomBytes } from "node:crypto";

const stateToCreated = new Map<string, number>();
const TTL_MS = 10 * 60 * 1000;

export function createOAuthState(): string {
  prune();
  const state = randomBytes(24).toString("hex");
  stateToCreated.set(state, Date.now());
  return state;
}

export function consumeOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  prune();
  const t = stateToCreated.get(state);
  if (!t) return false;
  stateToCreated.delete(state);
  return Date.now() - t < TTL_MS;
}

function prune(): void {
  const now = Date.now();
  for (const [s, t] of stateToCreated) {
    if (now - t > TTL_MS) stateToCreated.delete(s);
  }
}
