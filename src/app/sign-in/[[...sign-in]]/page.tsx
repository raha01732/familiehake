// /workspace/familiehake/src/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[hsl(var(--card)/0.7)] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="brand-badge h-10 w-10 rounded-2xl grid place-items-center font-black">
            FH
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Willkommen zurück</p>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Melde dich sicher an</h2>
          </div>
        </div>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary:
                "brand-button rounded-xl text-sm font-semibold hover:opacity-95",
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
