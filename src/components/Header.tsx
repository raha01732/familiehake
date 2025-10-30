"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ? "text-white font-semibold" : "text-zinc-400 hover:text-white";

  return (
    <header className="w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-zinc-100 font-semibold text-lg">
          Private Tools
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className={isActive("/dashboard")}>
            Dashboard
          </Link>
          <Link href="/admin" className={pathname.startsWith("/admin") || pathname === "/monitoring" ? "text-white font-semibold" : "text-zinc-400 hover:text-white"}>
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
