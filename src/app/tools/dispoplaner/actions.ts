// src/app/tools/dispoplaner/actions.ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type ShowWithMovie = {
  start_time: string;
  movie: { runtime: number; pre_show: number | null } | null;
};

export async function addMovieAction(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const runtime = Number(formData.get("runtime") || 0);
  const preShow = Number(formData.get("pre_show") ?? 25);
  if (!title || runtime <= 0) return;
  const sb = createAdminClient();
  await sb.from("movies").insert({ title, runtime, pre_show: preShow });
  revalidatePath("/tools/dispoplaner");
}

export async function updateMovieAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") || "").trim();
  const runtime = Number(formData.get("runtime") || 0);
  const preShow = Number(formData.get("pre_show") ?? 25);
  if (!id || !title || runtime <= 0) return;
  const sb = createAdminClient();
  await sb.from("movies").update({ title, runtime, pre_show: preShow }).eq("id", id);
  revalidatePath("/tools/dispoplaner");
}

export async function deleteMovieAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  const sb = createAdminClient();
  await sb.from("movies").delete().eq("id", id);
  revalidatePath("/tools/dispoplaner");
}

export async function addShowAction(formData: FormData) {
  const hall = Number(formData.get("hall"));
  const dateStr = String(formData.get("date"));
  const timeStr = String(formData.get("time"));
  const movieId = Number(formData.get("movie_id"));
  const version = String(formData.get("version") || "").trim();
  if (!hall || !dateStr || !timeStr || !movieId || !version) return;

  const startTime = new Date(`${dateStr}T${timeStr}`);
  const sb = createAdminClient();
  const { data: movieData } = await sb.from("movies").select("runtime, pre_show").eq("id", movieId).single();
  if (!movieData) return;

  const endTime = new Date(startTime.getTime() + (movieData.runtime + (movieData.pre_show ?? 25)) * 60000);

  // Conflict check: only same hall, check for time overlap
  const { data: existing } = await sb
    .from("shows")
    .select("start_time, movie:movies(runtime, pre_show)")
    .eq("hall", hall);

  for (const show of (existing as ShowWithMovie[] | null) ?? []) {
    const showStart = new Date(show.start_time);
    const showEnd = new Date(
      showStart.getTime() + ((show.movie?.runtime ?? 0) + (show.movie?.pre_show ?? 25)) * 60000
    );
    if (showStart < endTime && showEnd > startTime) return;
  }

  await sb.from("shows").insert({
    hall,
    start_time: startTime.toISOString(),
    movie_id: movieId,
    version,
  });
  revalidatePath("/tools/dispoplaner");
}

export async function deleteShowAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  const sb = createAdminClient();
  await sb.from("shows").delete().eq("id", id);
  revalidatePath("/tools/dispoplaner");
}
