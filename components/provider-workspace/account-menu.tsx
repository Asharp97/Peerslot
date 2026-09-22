"use client";

import { UserRound } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { AccountMenuCopy } from "@/components/account-settings-copy";

export type { AccountMenuCopy } from "@/components/account-settings-copy";

export function AccountMenu({ copy }: { copy: AccountMenuCopy }) {
  return (
    <Link
      aria-label={copy.title}
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-black/55 transition hover:bg-black/5 hover:text-vast-ink"
      href="/account-settings"
      title={copy.title}>
      <UserRound aria-hidden size={18} />
      <span>{copy.label}</span>
    </Link>
  );
}
