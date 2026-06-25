/** Whether the jwt callback should load org fields from Mongo (vs reuse embedded token claims). */
export function shouldRefreshJwtFromDb(opts: {
  token: { organizationId?: unknown };
  user?: unknown;
  trigger?: string;
}): boolean {
  if (opts.user) return true;
  if (opts.trigger === "update") return true;
  if (!opts.token.organizationId) return true;
  return false;
}
