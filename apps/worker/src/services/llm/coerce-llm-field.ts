/** Normalize LLM JSON values that should be strings (models often return arrays). */
export function coerceLlmString(value: unknown, maxLen = 500): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim().slice(0, maxLen);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().slice(0, maxLen);
  }
  if (Array.isArray(value)) {
    return value
      .map((x) => (typeof x === "string" ? x.trim() : String(x).trim()))
      .filter(Boolean)
      .join("; ")
      .slice(0, maxLen);
  }
  return "";
}
