import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Variant = "auto" | "manual" | "neutral";

const variantClass: Record<Variant, string> = {
  auto: "badge-auto",
  manual: "badge-manual",
  neutral: "badge-neutral",
};

export function Badge({
  variant = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return <span className={cn(variantClass[variant], className)} {...props} />;
}
