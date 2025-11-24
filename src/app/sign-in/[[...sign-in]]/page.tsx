// src/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-500/20 backdrop-blur-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-400/90 to-sky-500/90 grid place-items-center text-slate-950 font-black">
            FH
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Willkommen zurück</p>
            <h2 className="text-xl font-semibold text-white">Melde dich sicher an</h2>
          </div>
        </div>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary:
                "bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-slate-950 hover:from-cyan-300 hover:to-indigo-400 rounded-xl text-sm font-semibold",
              card: "bg-transparent shadow-none border-0 p-0",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
            },
          }}
          redirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
