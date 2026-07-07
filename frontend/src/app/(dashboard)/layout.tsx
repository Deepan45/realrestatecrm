"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/types";
import {
  BellIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  KanbanIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";

interface Notification {
  id: string;
  title: string;
  body?: string | null;
  isRead: boolean;
  createdAt: string;
  meta?: { leadId?: string } | null;
}

const NAV_SECTIONS = [
  {
    title: "Core Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, roles: null },
      { href: "/leads", label: "CRM pipeline", icon: UsersIcon, roles: ["SALES_MANAGER", "SALES_EXECUTIVE", "PARTNER_USER"] },
      { href: "/properties", label: "Properties Inventory", icon: BuildingIcon, roles: null },
      { href: "/partners", label: "Vendor Network", icon: BriefcaseIcon, roles: ["SALES_MANAGER", "SALES_EXECUTIVE", "PARTNER_USER"] },
      { href: "/site-visits", label: "Site Visits & Appts", icon: CalendarIcon, roles: ["SALES_MANAGER", "SALES_EXECUTIVE"] },
    ],
  },
  {
    title: "AI & Channels",
    items: [
      { href: "/ai-agent", label: "AI Operating Agent", icon: SparklesIcon, roles: ["SALES_MANAGER", "SALES_EXECUTIVE", "PROPERTY_STAFF"] },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/pipeline", label: "Pipeline Board", icon: KanbanIcon, roles: ["SALES_MANAGER", "SALES_EXECUTIVE"] },
      { href: "/reports", label: "Reports", icon: TrendingUpIcon, roles: ["SALES_MANAGER"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/users", label: "Users", icon: UserIcon, roles: [] },
      { href: "/settings", label: "Settings", icon: SettingsIcon, roles: ["SALES_MANAGER"] },
    ],
  },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const load = () =>
      api
        .get<{ data: Notification[]; unread: number }>("/notifications")
        .then((res) => { setNotifications(res.data); setUnread(res.unread); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [user]);

  if (loading || !user) return <Spinner />;

  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles === null || hasRole(...(item.roles as unknown as Parameters<typeof hasRole>))),
    }))
    .filter((section) => section.items.length > 0);

  async function markAllRead() {
    await api.post("/notifications/read-all").catch(() => {});
    setUnread(0);
    setNotifications((n) => n.map((x) => ({ ...x, isRead: true })));
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 transform flex-col bg-gradient-to-b from-slate-900 to-slate-950 transition-transform lg:static lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white shadow-lg shadow-brand-900/50 ring-1 ring-white/20">
            R
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-white">RealRest</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold-400">Real Estate CRM</div>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gold-400" />}
                      <item.icon className={`h-4 w-4 shrink-0 transition ${active ? "text-gold-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-[11px] text-slate-500">
          © {new Date().getFullYear()} RealRest
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md lg:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)}>
            <MenuIcon className="h-5 w-5" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchValue.trim()) router.push(`/leads?q=${encodeURIComponent(searchValue.trim())}`);
            }}
            className="hidden max-w-sm flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 transition focus-within:border-brand-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/15 lg:flex"
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search leads by name, phone, or email…"
              className="w-full bg-transparent text-slate-700 outline-none placeholder:text-slate-400"
            />
          </form>
          <div className="hidden items-center gap-1.5 text-sm text-slate-500 xl:flex">
            <CalendarIcon className="h-4 w-4" />
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <button
                className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setNotifOpen(!notifOpen)}
              >
                <BellIcon className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="animate-pop-in absolute right-0 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200/80 bg-white shadow-pop">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                      <button className="text-xs text-brand-600 hover:underline" onClick={markAllRead}>Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet</p>}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${n.isRead ? "text-slate-500" : "font-medium text-slate-800"}`}
                      onClick={() => {
                        setNotifOpen(false);
                        if (n.meta?.leadId) router.push(`/leads/${n.meta.leadId}`);
                      }}
                    >
                      <span className="block">{n.title}</span>
                      <span className="text-xs text-slate-400">{fmtDate(n.createdAt, true)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5 border-l border-slate-200 pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white shadow-sm">
                {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium leading-tight">{user.name}</div>
                <div className="text-[11px] font-medium capitalize text-brand-600">{user.role.replaceAll("_", " ").toLowerCase()}</div>
              </div>
            </div>
            <button onClick={logout} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
              <LogOutIcon className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
