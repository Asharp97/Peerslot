"use client";

import {
  CalendarDays,
  Users,
  Coffee,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Inbox,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { fetchAccessToken } from "@/lib/auth-browser";
import type { ProviderSetupData } from "@/lib/provider-workspace-types";

export type ProviderShellCopy = {
  loading: string;
  overview: string;
  appointments: string;
  requests: string;
  settings: string;
  students: string;
  personalActivities: string;
  myAppointments: string;
  workspace: string;
  signOut: string;
  loadError: string;
};

type ProviderWorkspaceState = {
  accessToken: string;
  data: ProviderSetupData;
  refresh: () => Promise<void>;
  refreshPendingRequestCount: () => Promise<void>;
};

type ProviderSetupResponse = {
  status: "active" | "setup_required";
  profile: ProviderSetupData["profile"] | null;
  bookingPage: ProviderSetupData["bookingPage"] | null;
};

const ProviderWorkspaceContext = createContext<ProviderWorkspaceState | null>(
  null,
);

export function ProviderShell({
  children,
  copy,
}: {
  children: React.ReactNode;
  copy: ProviderShellCopy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [accessToken, setAccessToken] = useState("");
  const [data, setData] = useState<ProviderSetupData | null>(null);
  const [error, setError] = useState("");
  const { pendingRequestCount, refreshPendingRequestCount } =
    usePendingRequestCount(accessToken, Boolean(data));

  const loadProviderSetup = useCallback(
    async (token: string) => {
      const response = await fetch("/api/provider", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/auth/provider");
        return;
      }

      if (!response.ok) throw new Error("Unable to load provider setup");

      const setup = (await response.json()) as ProviderSetupResponse;
      if (setup.status !== "active" || !setup.profile || !setup.bookingPage) {
        router.replace("/auth/provider");
        return;
      }

      setData({ profile: setup.profile, bookingPage: setup.bookingPage });
      setError("");
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const token = await fetchAccessToken();
      if (cancelled) return;

      if (!token) {
        router.replace("/");
        return;
      }

      setAccessToken(token);
      try {
        await loadProviderSetup(token);
      } catch {
        if (!cancelled) setError(copy.loadError);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [copy.loadError, loadProviderSetup, router]);

  const workspaceState = useMemo(
    () =>
      accessToken && data
        ? {
            accessToken,
            data,
            refresh: () => loadProviderSetup(accessToken),
            refreshPendingRequestCount,
          }
        : null,
    [accessToken, data, loadProviderSetup, refreshPendingRequestCount],
  );

  async function signOut() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    router.replace("/");
  }

  if (!workspaceState) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f3eb] px-6 text-vast-ink">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-lavender-whisper">
            <LoaderCircle className="animate-spin" size={20} />
          </span>
          <p className="mt-5 text-sm font-semibold">{error || copy.loading}</p>
        </div>
      </main>
    );
  }

  const workspaceData = workspaceState.data;
  const isAppointmentsPage = pathname.startsWith("/provider/appointments");

  const navigation = [
    { href: "/provider", label: copy.overview, icon: LayoutDashboard },
    {
      href: "/provider/appointments",
      label: copy.appointments,
      icon: CalendarDays,
    },
    { href: "/provider/requests", label: copy.requests, icon: Inbox },
    { href: "/provider/students", label: copy.students, icon: Users },
    {
      href: "/provider/personal-activities",
      label: copy.personalActivities,
      icon: Coffee,
    },
    { href: "/account", label: copy.myAppointments, icon: CalendarDays },
    { href: "/provider/settings", label: copy.settings, icon: Settings },
  ] as const;

  return (
    <ProviderWorkspaceContext.Provider value={workspaceState}>
      <div className="min-h-screen bg-[#f4f3eb] text-vast-ink">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-black/10 bg-[#fbfaf4] p-5 lg:flex">
          <Link className="flex items-center gap-3 px-2 py-2" href="/">
            <span className="grid size-9 place-items-center rounded-full bg-vast-ink text-sm font-bold text-lavender-whisper">
              P
            </span>
            <span className="text-lg font-bold tracking-[-0.02em]">
              PeerSlot
            </span>
          </Link>

          <div className="mt-10 px-3">
            <p className="text-[10px] font-bold tracking-[0.16em] text-black/45 uppercase">
              {copy.workspace}
            </p>
            <p className="mt-2 truncate text-sm font-semibold">
              {workspaceData.profile.displayName}
            </p>
          </div>

          <nav className="mt-7 space-y-1.5">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/provider"
                  ? pathname === "/provider"
                  : pathname.startsWith(href);
              return (
                <Link
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                    active
                      ? "bg-vast-ink text-white"
                      : "text-black/65 hover:bg-black/5 hover:text-vast-ink"
                  }`}
                  href={href}
                  key={href}>
                  <span className="relative">
                    {href === "/provider/requests" &&
                    pendingRequestCount > 0 ? (
                      <RequestCountBadge count={pendingRequestCount} />
                    ) : null}
                    <Icon
                      className={
                        active ? "text-lavender-whisper" : "text-black/45"
                      }
                      size={18}
                    />
                  </span>
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl bg-lavender-whisper p-4">
            <Sparkles size={18} />
            <p className="mt-3 text-xs leading-5 font-semibold">
              {workspaceData.bookingPage.isPublished
                ? workspaceData.bookingPage.title
                : copy.settings}
            </p>
          </div>
          <button
            className="mt-3 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-black/55 hover:bg-black/5 hover:text-vast-ink"
            onClick={signOut}
            type="button">
            <LogOut size={17} /> {copy.signOut}
          </button>
        </aside>

        <header className="sticky top-0 z-20 border-b border-black/10 bg-[#f4f3eb]/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link
              className="flex items-center gap-2 font-bold"
              href="/provider">
              <span className="grid size-8 place-items-center rounded-full bg-vast-ink text-xs text-lavender-whisper">
                P
              </span>
              PeerSlot
            </Link>
            <button
              aria-label={copy.signOut}
              className="grid size-9 place-items-center rounded-full border border-black/10 bg-white"
              onClick={signOut}
              type="button">
              <LogOut size={16} />
            </button>
          </div>
          <nav className="mt-1 flex gap-1 overflow-x-auto pt-2 pb-1">
            {navigation.map(({ href, label }) => {
              const active =
                href === "/provider"
                  ? pathname === "/provider"
                  : pathname.startsWith(href);
              return (
                <Link
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${active ? "bg-vast-ink text-white" : "bg-white text-black/55"}`}
                  href={href}
                  key={href}>
                  <span className="relative">
                    {label}
                    {href === "/provider/requests" &&
                    pendingRequestCount > 0 ? (
                      <RequestCountBadge count={pendingRequestCount} />
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>
        </header>

        <main
          className={`px-4 py-4 sm:px-6 lg:ml-64 ${isAppointmentsPage ? "lg:px-6 lg:py-6" : "lg:px-10 lg:py-10"}`}>
          <div className={isAppointmentsPage ? "w-full" : "mx-auto max-w-6xl"}>
            {children}
          </div>
        </main>
      </div>
    </ProviderWorkspaceContext.Provider>
  );
}

function usePendingRequestCount(accessToken: string, enabled: boolean) {
  const pathname = usePathname();
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const requestCountVersion = useRef(0);

  const refreshPendingRequestCount = useCallback(async () => {
    if (!accessToken) return;
    const version = ++requestCountVersion.current;
    try {
      const response = await fetch("/api/provider/appointment-requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        appointments: { id: string }[];
      };
      if (version === requestCountVersion.current) {
        setPendingRequestCount(body.appointments.length);
      }
    } catch {
      // Keep the last known count if a background refresh fails.
    }
  }, [accessToken]);

  useEffect(() => {
    if (!enabled || !accessToken) return;

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshPendingRequestCount();
      }
    }

    async function initialize() {
      await refreshPendingRequestCount();
    }
    void initialize();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    return () => {
      requestCountVersion.current += 1;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [accessToken, enabled, pathname, refreshPendingRequestCount]);

  return { pendingRequestCount, refreshPendingRequestCount };
}

function RequestCountBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-3 left-2 inline-flex h-4 min-w-3 items-center justify-center rounded-full bg-ember-glow p-1 text-[10px] leading-none font-bold text-vast-ink tabular-nums">
      {count}
    </span>
  );
}

export function useProviderWorkspace() {
  const context = useContext(ProviderWorkspaceContext);
  if (!context) {
    throw new Error("useProviderWorkspace must be used inside ProviderShell");
  }
  return context;
}
