import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { cn, initials } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";

export interface ShellTab {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  element: ReactNode;
  /** Shows a persistent pulsing alert dot (e.g. urgent assignments). */
  alert?: boolean;
}

/**
 * Persistent left-navigation shell shared by both portals. Tabs are kept
 * alive once visited (display-toggled, never unmounted), so switching is
 * instant and each tab preserves its own scroll position.
 */
export function AppShell({
  tabs,
  roleLabel,
  contextBar,
}: {
  tabs: ShellTab[];
  roleLabel: string;
  contextBar?: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeKey = useMemo(() => {
    const found = tabs.find((t) => location.pathname.startsWith(t.path));
    return (found ?? tabs[0]).key;
  }, [location.pathname, tabs]);

  const [visited, setVisited] = useState<string[]>(() => [activeKey]);
  useEffect(() => {
    setVisited((v) => (v.includes(activeKey) ? v : [...v, activeKey]));
  }, [activeKey]);

  const go = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const brand = (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 font-display text-[17px] font-semibold text-brass-400 shadow-sm">
        त
      </div>
      <div>
        <p className="font-display text-[16.5px] font-semibold leading-none tracking-[-0.01em] text-ink-900">
          Tattva Bodh
        </p>
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brass-600">
          {roleLabel}
        </p>
      </div>
    </div>
  );

  const navContent = (
    <>
      <div className="border-b border-line px-4 pb-4 pt-5">{brand}</div>
      {contextBar && <div className="border-b border-line px-4 py-3.5">{contextBar}</div>}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="label-caps px-3 pb-2">Workspace</p>
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => go(tab.path)} className={cn(
              "nav-tab w-full text-left",
              active
                ? "bg-ink-900 text-cream shadow-sm"
                : "text-ink-500 hover:bg-ink-100/50 hover:text-ink-800"
            )}>
              <Icon
                className={cn("h-[16px] w-[16px] shrink-0", active ? "text-brass-300" : "text-ink-300")}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="flex-1">{tab.label}</span>
              {tab.alert && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-alert-600 animate-pulse-ring"
                  title="Needs attention"
                />
              )}
              {active && !tab.alert && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brass-400" />
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-line px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-[12px] font-semibold text-ink-700">
            {profile ? initials(profile.full_name) : "·"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink-800">
              {profile?.full_name ?? "…"}
            </p>
            <p className="truncate text-[11.5px] text-ink-400">{profile?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-alert-50 hover:text-alert-600"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {/* Desktop sidebar */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-cream md:flex">
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-fade"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-line bg-cream shadow-pop animate-rise">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-ink-400 hover:bg-ink-100/60"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-line bg-cream px-4 py-3 md:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 font-display text-[13px] font-semibold text-brass-400">
              त
            </div>
            <span className="font-display text-[15px] font-semibold text-ink-900">Tattva Bodh</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md border border-line-strong p-2 text-ink-700"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        {/* Keep-alive tab panels */}
        <main className="relative min-h-0 flex-1">
          {tabs.map((tab) =>
            visited.includes(tab.key) ? (
              <section
                key={tab.key}
                aria-hidden={tab.key !== activeKey}
                className={cn(
                  "absolute inset-0 overflow-y-auto",
                  tab.key === activeKey
                    ? "visible opacity-100"
                    : "invisible pointer-events-none opacity-0"
                )}
              >
                {tab.element}
              </section>
            ) : null
          )}
        </main>
      </div>
    </div>
  );
}
