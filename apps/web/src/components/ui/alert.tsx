import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "success" | "error" | "warning" | "info";

const variantClass: Record<Variant, string> = {
  success: "ui-alert-success",
  error:   "ui-alert-error",
  warning: "ui-alert-warning",
  info:    "ui-alert-info",
};

type Props = {
  children: ReactNode;
  variant?: Variant;
  className?: string;
};

export function Alert({ children, variant = "info", className }: Props) {
  return (
    <div
      role="alert"
      className={cn(variantClass[variant], "animate-fade-in", className)}
    >
      {children}
    </div>
  );
}
