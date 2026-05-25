type Props = { message: string };

export function EmptyState({ message }: Props) {
  return (
    <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
      {message}
    </p>
  );
}
