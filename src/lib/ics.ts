// Minimaler ICS-Generator
export function toICS(events: Array<{
  uid: string; title: string; startsAt: string; endsAt: string; location?: string; description?: string;
}>) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FamilyHake//Calendar//DE",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${dt(new Date())}`);
    lines.push(`DTSTART:${dt(new Date(e.startsAt))}`);
    lines.push(`DTEND:${dt(new Date(e.endsAt))}`);
    if (e.title) lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function dt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
function escape(s: string) {
  return s.replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}
