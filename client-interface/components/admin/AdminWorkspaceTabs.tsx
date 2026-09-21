"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { adminWorkspaces, matchesAdminTab } from "@/lib/config/adminWorkspaces";
export function AdminWorkspaceTabs() {
  const pathname = usePathname();
  const { can, loading } = usePermissions();
  const group = adminWorkspaces.find((group) =>
    group.tabs.some((tab) => matchesAdminTab(pathname, tab.href)),
  );
  if (!group || loading) return null;
  const tabs = group.tabs.filter(
    (tab) => !tab.permission || can(tab.permission),
  );
  return (
    <div className="mb-7">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {group.label}
      </p>
      <nav
        aria-label={`${group.label} pages`}
        className="flex overflow-x-auto gap-1 rounded-2xl border border-border bg-card p-1.5"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={
              matchesAdminTab(pathname, tab.href) ? "page" : undefined
            }
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${matchesAdminTab(pathname, tab.href) ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
