// src/app/tools/dispoplaner/page.tsx
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Dispoplaner" };

export async function addMovieAction(formData: FormData) {
  "use server";
  const title = String(formData.get("title") || "").trim();
  const runtime = Number(formData.get("runtime") || 0);
  const preShow = Number(formData.get("pre_show") || 25);
  if (!title || runtime <= 0) return;
  const sb = createAdminClient();
  await sb.from("movies").insert({ title, runtime, pre_show: preShow });
}

export async function updateMovieAction(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") || "").trim();
  const runtime = Number(formData.get("runtime") || 0);
  const preShow = Number(formData.get("pre_show") || 25);
  if (!id || !title || runtime <= 0) return;
  const sb = createAdminClient();
  await sb.from("movies").update({ title, runtime, pre_show: preShow }).eq("id", id);
}

export async function deleteMovieAction(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  if (!id) return;
  const sb = createAdminClient();
  await sb.from("movies").delete().eq("id", id);
}

export async function addShowAction(formData: FormData) {
  "use server";
  const hall = Number(formData.get("hall"));
  const dateStr = String(formData.get("date"));
  const timeStr = String(formData.get("time"));
  const movieId = Number(formData.get("movie_id"));
  const version = String(formData.get("version") || "").trim();
  if (!hall || !dateStr || !timeStr || !movieId || !version) return;

  const startTime = new Date(`${dateStr}T${timeStr}`);
  const sb = createAdminClient();
  const { data: movieData } = await sb
    .from("movies")
    .select("runtime, pre_show")
    .eq("id", movieId)
    .single();
  if (!movieData) return;

  const runtimeMin = movieData.runtime;
  const preShowMin = movieData.pre_show ?? 25;
  const endTime = new Date(startTime.getTime() + (runtimeMin + preShowMin) * 60000);

  const { data: existing } = await sb
    .from("shows")
    .select("start_time, movie_id, version, movie:movies(runtime, pre_show)")
    .eq("hall", hall);

  for (const show of existing ?? []) {
    const showStart = new Date(show.start_time);
    const showRuntime = show.movie.runtime;
    const showPreShow = show.movie.pre_show ?? 25;
    const showEnd = new Date(showStart.getTime() + (showRuntime + showPreShow) * 60000);
    if (showStart < endTime && showEnd > startTime) {
      return;
    }
  }

  await sb.from("shows").insert({
    hall,
    start_time: startTime.toISOString(),
    movie_id: movieId,
    version,
  });
}

export default async function DispoplanerPage() {
  const user = await currentUser();
  if (!user) {
    return <section className="p-6 text-zinc-400">Bitte melde dich an, um den Dispoplaner zu nutzen.</section>;
  }

  const role = (user.publicMetadata?.role as string | undefined)?.toLowerCase() || "member";
  const isAdmin = role === "admin" || role === "superadmin";

  const sb = createAdminClient();
  const { data: movies } = await sb.from("movies").select("*").order("title");

  const today = new Date();
  const startOfWeek = new Date(today);
  while (startOfWeek.getDay() !== 4) {
    startOfWeek.setDate(startOfWeek.getDate() - 1);
  }
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const { data: shows } = await sb
    .from("shows")
    .select("id, hall, start_time, movie_id, version")
    .gte("start_time", startOfWeek.toISOString())
    .lt("start_time", endOfWeek.toISOString());

  const moviesById = new Map((movies ?? []).map((movie) => [movie.id, movie]));
  const days: Date[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(startOfWeek);
    day.setDate(day.getDate() + i);
    days.push(day);
  }

  return (
    <section className="p-6 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dispoplaner</h1>
        <p className="text-sm text-zinc-400">Wochenübersicht der Kinovorstellungen (Donnerstag–Mittwoch)</p>
        <div className="overflow-x-auto mt-4">
          <table className="min-w-max text-sm text-zinc-300">
            <thead className="text-xs text-zinc-400 uppercase">
              <tr>
                <th className="py-2 px-3 text-left">Saal</th>
                {days.map((day) => (
                  <th key={day.toDateString()} className="py-2 px-3 text-left">
                    {day.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(8)].map((_, i) => {
                const hallNum = i + 1;
                return (
                  <tr key={hallNum} className="border-t border-zinc-800 align-top">
                    <td className="py-2 px-3 font-medium">Saal {hallNum}</td>
                    {days.map((day) => {
                      const dayShows = (shows ?? []).filter((show) => {
                        const showDate = new Date(show.start_time);
                        return showDate.getDate() === day.getDate() && showDate.getMonth() === day.getMonth();
                      });
                      return (
                        <td key={`${hallNum}-${day.toDateString()}`} className="py-2 px-3">
                          {dayShows.map((show) => {
                            const movie = moviesById.get(show.movie_id);
                            const start = new Date(show.start_time);
                            const end = movie
                              ? new Date(start.getTime() + (movie.runtime + (movie.pre_show ?? 25)) * 60000)
                              : start;
                            const timeStr = start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
                            const endStr = end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
                            return (
                              <div key={show.id} className="mb-1">
                                <span className="text-zinc-100 font-medium">
                                  {timeStr}–{endStr}
                                </span>{" "}
                                {movie ? movie.title : "Film"} <span className="text-zinc-500">({show.version})</span>
                              </div>
                            );
                          })}
                          <form action={addShowAction} className="mt-2 flex flex-col gap-1">
                            <input type="hidden" name="hall" value={hallNum} />
                            <input type="hidden" name="date" value={day.toISOString().slice(0, 10)} />
                            <div className="flex flex-wrap items-center gap-1">
                              <input
                                type="time"
                                name="time"
                                className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 p-1"
                                required
                              />
                              <select
                                name="movie_id"
                                className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 p-1"
                                required
                              >
                                <option value="">Film wählen</option>
                                {(movies ?? []).map((movie) => (
                                  <option key={movie.id} value={movie.id}>
                                    {movie.title}
                                  </option>
                                ))}
                              </select>
                              <select
                                name="version"
                                className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 p-1"
                                required
                              >
                                <option value="">Version</option>
                                {["2D", "3D", "2D Atmos", "3D Atmos", "3D HFR", "3D HFR Atmos"].map((variant) => (
                                  <option key={variant} value={variant}>
                                    {variant}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="text-emerald-500 text-sm font-medium px-2 hover:text-emerald-400"
                                aria-label="Vorstellung hinzufügen"
                              >
                                ＋
                              </button>
                            </div>
                          </form>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-xl font-semibold text-zinc-100 mb-3">Filmdatenbank</h2>
        <table className="w-full text-sm text-zinc-300 mb-3">
          <thead className="text-xs text-zinc-400 uppercase">
            <tr>
              <th className="text-left py-1">Titel</th>
              <th className="text-right py-1">Laufzeit (Min)</th>
              <th className="text-right py-1">Vorprogramm (Min)</th>
              {isAdmin && <th className="py-1">Aktion</th>}
            </tr>
          </thead>
          <tbody>
            {(movies ?? []).map((movie) => (
              <tr key={movie.id} className="border-t border-zinc-800">
                <td className="py-1 pr-3">
                  <form action={updateMovieAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={movie.id} />
                    <input
                      name="title"
                      defaultValue={movie.title}
                      className="bg-transparent text-zinc-100 w-full"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-1 pr-3 text-right">
                  <form action={updateMovieAction} className="flex items-center justify-end gap-2">
                    <input type="hidden" name="id" value={movie.id} />
                    <input
                      name="runtime"
                      type="number"
                      defaultValue={movie.runtime}
                      className="bg-transparent text-zinc-100 w-16 text-right"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-1 pr-3 text-right">
                  <form action={updateMovieAction} className="flex items-center justify-end gap-2">
                    <input type="hidden" name="id" value={movie.id} />
                    <input
                      name="pre_show"
                      type="number"
                      defaultValue={movie.pre_show ?? 25}
                      className="bg-transparent text-zinc-100 w-16 text-right"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                {isAdmin && (
                  <td className="py-1 text-center">
                    <form action={deleteMovieAction}>
                      <input type="hidden" name="id" value={movie.id} />
                      <button type="submit" className="text-amber-500 text-xs hover:text-amber-400">
                        Löschen
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addMovieAction} className="flex flex-wrap items-center gap-3">
          <input
            name="title"
            placeholder="Filmtitel"
            className="flex-1 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
            required
          />
          <input
            name="runtime"
            type="number"
            placeholder="Laufzeit"
            className="w-24 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
            required
          />
          <input
            name="pre_show"
            type="number"
            placeholder="Vorprg. (Min)"
            defaultValue={25}
            className="w-28 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1 px-3 rounded"
          >
            + Film
          </button>
        </form>
      </div>
    </section>
  );
}
