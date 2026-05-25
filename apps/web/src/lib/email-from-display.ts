import type { SignalItem } from "@content-resourcer/db";
import { extractCasinoName, parseEmailFrom } from "@content-resourcer/db";

export function displayCasinoName(item: Pick<SignalItem, "casino_name" | "sender_from" | "title" | "original_url">): string | null {
  if (item.casino_name?.trim()) return item.casino_name.trim();
  return extractCasinoName(item.sender_from, item.title, item.original_url ?? null);
}

export function displaySenderEmail(senderFrom: string): string | null {
  return parseEmailFrom(senderFrom).email;
}
