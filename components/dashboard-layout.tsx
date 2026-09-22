"use client";

import {
  ProviderShell,
  type ProviderShellCopy,
} from "@/components/provider-workspace/provider-shell";

/**
 * Shared authenticated chrome for appointment participants.
 * Provider navigation appears automatically when the account has a provider setup.
 */
export function DashboardLayout({
  children,
  copy,
}: {
  children: React.ReactNode;
  copy: ProviderShellCopy;
}) {
  return (
    <ProviderShell allowSignedOut requireProviderSetup={false} copy={copy}>
      {children}
    </ProviderShell>
  );
}

export type DashboardLayoutCopy = ProviderShellCopy;
