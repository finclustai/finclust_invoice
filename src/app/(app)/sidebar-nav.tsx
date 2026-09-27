"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import type { SessionUser } from "@/features/auth/current-user";

const LINKS = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", Icon: FileText },
  { href: "/customers", label: "Customers", Icon: Users },
  { href: "/catalog", label: "Catalog", Icon: BookOpen },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function SidebarNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main"
      className="flex items-center gap-2 overflow-x-auto border-b border-line bg-paper px-3 py-2 lg:h-dvh lg:flex-col lg:items-stretch lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-4"
    >
      <Link href="/" className="shrink-0 px-2 py-1 lg:mb-4">
        <span className="font-mono text-[10px] tracking-[0.2em] text-mid">FINCLUST</span>
        <span className="block text-base font-extrabold tracking-tight">Invoices</span>
      </Link>

      <ul className="flex shrink-0 items-center gap-1 lg:flex-1 lg:flex-col lg:items-stretch lg:gap-0.5">
        {LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href} className="nav-link" aria-current={isCurrent(href) ? "page" : undefined}>
              <Icon size={16} strokeWidth={2} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0 lg:mt-4 lg:flex-col lg:items-stretch lg:border-t lg:border-line lg:pt-3">
        <div className="min-w-0 px-2">
          <p className="truncate text-xs font-semibold text-body">{user.name}</p>
          <p className="font-mono text-[10px] text-mid">{user.role}</p>
        </div>
        <form action="/logout" method="post" className="lg:w-full">
          <button className="nav-link w-full" type="submit">
            <LogOut size={16} strokeWidth={2} aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
