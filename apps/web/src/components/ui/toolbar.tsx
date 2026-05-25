import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-3", className)} {...props} />;
}
