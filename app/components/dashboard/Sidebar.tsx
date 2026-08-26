"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderGit2,
  ClipboardList,
  Users2,
  ListTodo,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navigationGroups = [
  {
    label: "General",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Projects", href: "/projects", icon: FolderGit2 },
    ],
  },
  {
    label: "Analytics",
    items: [
      { name: "Issue Review", href: "/review", icon: ClipboardList },
      { name: "Who Did What", href: "/review/team", icon: Users2 },
      { name: "Issue Tracker", href: "/review/tracker", icon: ListTodo },
    ],
  },
];

interface SidebarProps {
  children: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed, doesn't scroll */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">GL</span>
            </div>
            <span className="font-semibold text-lg">GitLab Proxy</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation - fixed height, no scroll */}
        <nav className="flex-1 px-3 py-4 space-y-4">
          {navigationGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="border-t mx-2 mb-3" />}
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer - fixed at bottom */}
        <div className="p-4 border-t shrink-0">
          <div className="text-xs text-muted-foreground text-center">
            v2.0.1
          </div>
        </div>
      </aside>

      {/* Main content - scrollable */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center h-16 px-4 border-b bg-card shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="ml-3 font-semibold">GitLab-Telegram Proxy</div>
        </header>

        {/* Page content - scrollable */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
