import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Variant = "success" | "error" | "info" | "warning";

const variantClass: Record<Variant, string> = {
  success: "ui-alert-success",
  error: "ui-alert-error",
  info: "ui-alert-info",
  warning: "ui-alert-warning",
};

export function Alert({
  variant = "info",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { variant?: Variant }) {
  return <p className={cn(variantClass[variant], className)} {...props} />;
}
