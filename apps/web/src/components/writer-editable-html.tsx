"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { sanitizeEmailHtmlPreview } from "@/lib/sanitize-email-html";
import { cn } from "@/lib/cn";
import { writerPreviewClass } from "@/components/writer-html-preview";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

function nodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node.nodeName === "BR") return 1;
  let length = 0;
  for (const child of node.childNodes) {
    length += nodeTextLength(child);
  }
  return length;
}

function getCaretTextOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let offset = 0;
  let found = false;

  function walk(node: Node): boolean {
    if (found) return true;

    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.startOffset;
        found = true;
        return true;
      }
      if (node.nodeName === "BR") {
        offset += range.startOffset > 0 ? 1 : 0;
        found = true;
        return true;
      }
      for (let i = 0; i < range.startOffset && i < node.childNodes.length; i++) {
        walk(node.childNodes[i]!);
        if (found) return true;
      }
      found = true;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return false;
    }
    if (node.nodeName === "BR") {
      offset += 1;
      return false;
    }

    for (const child of node.childNodes) {
      if (walk(child)) return true;
    }
    return false;
  }

  for (const child of root.childNodes) {
    if (walk(child)) break;
  }

  return found ? offset : null;
}

function setCaretTextOffset(root: HTMLElement, target: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const selection = sel;

  let offset = 0;
  let placed = false;

  function walk(node: Node): boolean {
    if (placed) return true;

    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (offset + len >= target) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, target - offset));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        placed = true;
        return true;
      }
      offset += len;
      return false;
    }

    if (node.nodeName === "BR") {
      if (offset + 1 >= target) {
        const range = document.createRange();
        if (target <= offset) {
          range.setStartBefore(node);
        } else {
          range.setStartAfter(node);
        }
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        placed = true;
        return true;
      }
      offset += 1;
      return false;
    }

    for (const child of node.childNodes) {
      if (walk(child)) return true;
    }
    return false;
  }

  for (const child of root.childNodes) {
    if (walk(child)) break;
  }

  if (!placed) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function setEditorHtml(el: HTMLElement, html: string): string {
  const caretOffset = getCaretTextOffset(el);
  const safe = sanitizeEmailHtmlPreview(html);
  if (el.innerHTML !== safe) {
    el.innerHTML = safe;
    if (caretOffset != null) {
      setCaretTextOffset(el, caretOffset);
    }
  }
  return safe;
}

/** Formatted, in-place editable HTML for ReWriter source articles. */
export function WriterEditableHtml({ value, onChange, placeholder, className }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string | null>(null);

  const syncFromEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const safe = setEditorHtml(el, el.innerHTML);
    lastEmittedRef.current = safe;
    onChange(safe);
  }, [onChange]);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    setEditorHtml(el, value);
    lastEmittedRef.current = value;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (!document.execCommand("insertLineBreak")) {
      document.execCommand("insertHTML", false, "<br>");
    }
    syncFromEditor();
  }

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      data-placeholder={placeholder}
      onInput={syncFromEditor}
      onKeyDown={handleKeyDown}
      className={cn(
        writerPreviewClass,
        className,
        "flex-1 overflow-y-auto p-4 outline-none focus:ring-1 focus:ring-[var(--primary)]",
        "empty:before:pointer-events-none empty:before:text-[var(--muted)] empty:before:content-[attr(data-placeholder)]",
      )}
    />
  );
}
