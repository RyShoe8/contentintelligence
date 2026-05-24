/** Recency for retention: prefer email send time, fall back to ingest time. */
export function signalItemRecencyDate(item: {
  email_sent_at?: Date;
  created_at: Date;
}): Date {
  return item.email_sent_at ?? item.created_at;
}

export function lookbackCutoffDate(lookbackHours: number, now = new Date()): Date {
  const hours = Number.isFinite(lookbackHours) && lookbackHours > 0 ? lookbackHours : 168;
  return new Date(now.getTime() - hours * 3600_000);
}

export function isWithinLookback(
  item: { email_sent_at?: Date; created_at: Date },
  lookbackHours: number,
  now = new Date(),
): boolean {
  return (
    signalItemRecencyDate(item).getTime() >= lookbackCutoffDate(lookbackHours, now).getTime()
  );
}

export function contentSignalScopeFilter(contentSignalId: string): Record<string, unknown> {
  return {
    $or: [{ content_signal_id: contentSignalId }, { vertical_id: contentSignalId }],
  };
}

/** Mongo filter: keep rows whose recency is on or after cutoff. */
export function maxAgeExprFilter(cutoff: Date): Record<string, unknown> {
  return {
    $expr: {
      $gte: [{ $ifNull: ["$email_sent_at", "$created_at"] }, cutoff],
    },
  };
}

/** Rows older than lookback for a content signal. */
export function buildExpiredSignalItemsFilter(
  contentSignalId: string,
  lookbackHours: number,
  now = new Date(),
): Record<string, unknown> {
  const cutoff = lookbackCutoffDate(lookbackHours, now);
  return {
    $and: [
      contentSignalScopeFilter(contentSignalId),
      {
        $expr: {
          $lt: [{ $ifNull: ["$email_sent_at", "$created_at"] }, cutoff],
        },
      },
    ],
  };
}
