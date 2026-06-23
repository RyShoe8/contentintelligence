import type { SignalItem } from "@content-resourcer/db/schemas";
import { parseEmailFrom, resolveContentProviderName } from "@content-resourcer/db/email-from";

export function displayCasinoName(item: Pick<SignalItem, "casino_name" | "sender_from" | "title" | "original_url">): string | null {
  return resolveContentProviderName(item);
}

export function displaySenderEmail(senderFrom: string): string | null {
  return parseEmailFrom(senderFrom).email;
}
