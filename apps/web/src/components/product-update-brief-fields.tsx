"use client";

import {
  PRODUCT_UPDATE_DETAIL_MAX,
  PRODUCT_UPDATE_SUMMARY_MIN,
} from "@content-resourcer/db/product-update";

/**
 * Form shape for a product update brief.
 *
 * Kept as flat strings so the component stays controlled and simple; converted to the schema
 * shape (with `details` split into a list) on submit.
 */
export type ProductBriefForm = {
  productName: string;
  whatShipped: string;
  why: string;
  previously: string;
  whoFor: string;
  details: string;
  availability: string;
  whatsNext: string;
};

export const emptyProductBrief: ProductBriefForm = {
  productName: "",
  whatShipped: "",
  why: "",
  previously: "",
  whoFor: "",
  details: "",
  availability: "",
  whatsNext: "",
};

export function toProductBriefPayload(form: ProductBriefForm) {
  return {
    productName: form.productName.trim() || undefined,
    whatShipped: form.whatShipped.trim(),
    why: form.why.trim() || undefined,
    previously: form.previously.trim() || undefined,
    whoFor: form.whoFor.trim() || undefined,
    details: form.details
      .split(/\r?\n/)
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, PRODUCT_UPDATE_DETAIL_MAX),
    availability: form.availability.trim() || undefined,
    whatsNext: form.whatsNext.trim() || undefined,
  };
}

export function isProductBriefReady(form: ProductBriefForm): boolean {
  return form.whatShipped.trim().length >= PRODUCT_UPDATE_SUMMARY_MIN;
}

const fieldClass =
  "resize-y rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm";

type Props = {
  value: ProductBriefForm;
  onChange: (next: ProductBriefForm) => void;
  disabled?: boolean;
};

export function ProductUpdateBriefFields({ value, onChange, disabled }: Props) {
  const set = (key: keyof ProductBriefForm) => (v: string) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div>
        <p className="text-sm font-medium text-[var(--fg)]">Update brief</p>
        <p className="text-xs text-[var(--muted)]">
          These are the only facts the writer gets. It will not search the web, and it will not
          invent numbers, dates, or roadmap promises that are not here.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Product or site</span>
        <input
          type="text"
          value={value.productName}
          onChange={(e) => set("productName")(e.target.value)}
          disabled={disabled}
          placeholder="Content Intelligence"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">
          What shipped <span className="text-[var(--accent)]">*</span>
        </span>
        <textarea
          value={value.whatShipped}
          onChange={(e) => set("whatShipped")(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Model selection moved into the admin settings page, with separate models for writing, research, and utility work."
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Why we built it</span>
        <textarea
          value={value.why}
          onChange={(e) => set("why")(e.target.value)}
          disabled={disabled}
          rows={2}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">How it worked before</span>
        <textarea
          value={value.previously}
          onChange={(e) => set("previously")(e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="Gives the writer a real before/after instead of a feature list."
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Who it is for</span>
        <input
          type="text"
          value={value.whoFor}
          onChange={(e) => set("whoFor")(e.target.value)}
          disabled={disabled}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Specifics (one per line)</span>
        <textarea
          value={value.details}
          onChange={(e) => set("details")(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder={"Supports 6 models\nSettings apply to new jobs within 60 seconds\nDefault rewrite passes reduced from 6 to 2"}
          className={fieldClass}
        />
        <span className="text-xs text-[var(--muted)]">
          Numbers, limits, formats, setting names. Copied faithfully, never rounded.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Availability</span>
        <input
          type="text"
          value={value.availability}
          onChange={(e) => set("availability")(e.target.value)}
          disabled={disabled}
          placeholder="Live now for all organizations"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">What&apos;s next</span>
        <textarea
          value={value.whatsNext}
          onChange={(e) => set("whatsNext")(e.target.value)}
          disabled={disabled}
          rows={2}
          className={fieldClass}
        />
      </label>
    </div>
  );
}
