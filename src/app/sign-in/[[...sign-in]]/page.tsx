import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center">
      <div className="card p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          Anmelden
        </h2>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary:
                "bg-zinc-100 text-zinc-900 hover:bg-white rounded-xl text-sm font-medium",
              card: "bg-transparent shadow-none border-0 p-0",
              headerTitle: "hidden",
              headerSubtitle: "hidden"
            }
          }}
          redirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
