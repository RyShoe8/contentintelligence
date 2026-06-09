const composeJobsInFlight = new Map<string, Promise<void>>();

export function isWriterComposeJobInFlight(writerArticleId: string): boolean {
  return composeJobsInFlight.has(writerArticleId);
}

export function runWriterComposeJobExclusive(
  writerArticleId: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (composeJobsInFlight.has(writerArticleId)) {
    throw new Error("compose_already_running");
  }
  const job = fn().finally(() => {
    composeJobsInFlight.delete(writerArticleId);
  });
  composeJobsInFlight.set(writerArticleId, job);
  return job;
}

/** Test helper */
export function clearWriterComposeJobsInFlight(): void {
  composeJobsInFlight.clear();
}
