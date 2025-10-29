import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";

export const metadata = { title: "Admin | Private Tools" };

export default async function AdminPage() {
  return (
    <RoleGate routeKey="admin">
      <section className="card p-6 flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Admin Bereich</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Nur Nutzer mit <code className="text-[11px] bg-zinc-800 px-1 py-0.5 rounded">role = "admin"</code>.
        </p>

        <div className="grid sm:grid-cols-3 gap-4">
          <Link href="/admin/users" className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/40 hover:bg-zinc-900/60">
            <div className="text-zinc-100 font-semibold">Benutzer &amp; Rollen</div>
            <div className="text-zinc-500 text-sm">Rollen vergeben (admin/member)</div>
          </Link>

          <Link href="/admin/invites" className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/40 hover:bg-zinc-900/60">
            <div className="text-zinc-100 font-semibold">Einladungen</div>
            <div className="text-zinc-500 text-sm">Invite senden, verwalten</div>
          </Link>

          <Link href="/monitoring" className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/40 hover:bg-zinc-900/60">
            <div className="text-zinc-100 font-semibold">Monitoring</div>
            <div className="text-zinc-500 text-sm">Systemstatus &amp; Logs</div>
          </Link>
        </div>
      </section>
    </RoleGate>
  );
}
