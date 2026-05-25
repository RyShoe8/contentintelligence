import { Divider } from "@/components/ui/divider";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  showDivider?: boolean;
};

export function FeedItemSection({ title, children, showDivider = true }: Props) {
  return (
    <>
      {showDivider ? <Divider className="my-3" /> : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </>
  );
}
