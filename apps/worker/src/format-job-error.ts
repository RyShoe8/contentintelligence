import { ZodError } from "zod";

/** Short, user-facing message for job failures stored in Mongo. */
export function formatJobErrorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    if (first) {
      const path = first.path.join(".");
      return path
        ? `Invalid style example data: ${path} — ${first.message}`
        : `Invalid style example data — ${first.message}`;
    }
    return "Invalid style example data";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
