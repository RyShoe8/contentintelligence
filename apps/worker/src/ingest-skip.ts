import type { SignalItem } from "@content-resourcer/db";

/** Skip Gmail fetch + LLM when an existing full row is already processed. */
export function shouldSkipProcessedMessage(
  existingRow: SignalItem | null,
  forceReprocess: boolean,
): boolean {
  if (forceReprocess || !existingRow) return false;
  return Boolean(
    existingRow.ai_processed && existingRow.deal_metrics && !existingRow.skip_reason,
  );
}
