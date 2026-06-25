"use client";

import { useEffect, useRef } from "react";
import { sanitizeEmailHtmlPreview } from "@/lib/sanitize-email-html";
import { cn } from "@/lib/cn";
import { writerPreviewClass } from "@/components/writer-html-preview";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

/** Formatted, in-place editable HTML for ReWriter source articles. */
export function WriterEditableHtml({ value, onChange, placeholder, className }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const safe = sanitizeEmailHtmlPreview(value);
    if (el.innerHTML !== safe) {
      el.innerHTML = safe;
    }
    lastEmittedRef.current = value;
  }, [value]);

  function handleInput() {
    const el = editorRef.current;
    if (!el) return;
    const safe = sanitizeEmailHtmlPreview(el.innerHTML);
    if (safe !== el.innerHTML) {
      el.innerHTML = safe;
    }
    lastEmittedRef.current = safe;
    onChange(safe);
  }

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      data-placeholder={placeholder}
      onInput={handleInput}
      className={cn(
        writerPreviewClass,
        className,
        "flex-1 overflow-y-auto p-4 outline-none focus:ring-1 focus:ring-[var(--primary)]",
        "empty:before:pointer-events-none empty:before:text-[var(--muted)] empty:before:content-[attr(data-placeholder)]",
      )}
    />
  );
}
