export const metadata = {
  title: "Zugang anfragen"
};

export default function LockedSignUpPage() {
  return (
    <section className="max-w-sm w-full mx-auto">
      <div className="card p-6 flex flex-col gap-4 text-sm text-zinc-400 leading-relaxed">
        <h2 className="text-xl font-semibold text-zinc-100">
          Registrierung gesperrt
        </h2>
        <p>
          Neue Accounts können nur durch Administratoren erstellt werden.
        </p>
        <p>
          Wenn du Zugriff benötigst, wende dich bitte intern an die zuständige
          Stelle.
        </p>
      </div>
    </section>
  );
}
