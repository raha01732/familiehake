"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/40 backdrop-blur sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <button
          className="md:hidden p-2 rounded-xl bg-zinc-800/60 border border-zinc-700"
          onClick={() => setOpen(o => !o)}
        >
          <Menu className="w-5 h-5 text-zinc-300" />
        </button>
        <Link
          href="/"
          className="font-semibold text-zinc-100 text-lg tracking-tight"
        >
          private.tools
        </Link>
      </div>

      <nav
        className={`${
          open ? "flex" : "hidden md:flex"
        } flex-col md:flex-row absolute md:static top-16 left-0 right-0 md:top-auto md:left-auto md:right-auto bg-zinc-900/80 md:bg-transparent p-4 md:p-0 gap-4 border-b border-zinc-800 md:border-0`}
      >
        <Link
          href="/dashboard"
          className="text-zinc-300 hover:text-zinc-100 text-sm"
        >
          Dashboard
        </Link>
        <Link
          href="/settings"
          className="text-zinc-300 hover:text-zinc-100 text-sm"
        >
          Settings
        </Link>
        <Link
          href="/admin"
          className="text-zinc-300 hover:text-zinc-100 text-sm"
        >
          Admin
        </Link>
        <Link
          href="/monitoring"
          className="text-zinc-300 hover:text-zinc-100 text-sm"
        >
          Monitoring
        </Link>
      </nav>

      <div className="flex items-center gap-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8 rounded-xl border border-zinc-700"
            }
          }}
          afterSignOutUrl="/"
        />
      </div>
    </header>
  );
}
