const BASE = "https://api.clerk.com/v1";

function authHeaders() {
  const key = process.env.CLERK_SECRET_KEY!;
  if (!key) throw new Error("CLERK_SECRET_KEY fehlt");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// E-Mail-Adresse zum User hinzufügen
export async function clerkAddEmailAddress(userId: string, email: string) {
  const res = await fetch(`${BASE}/users/${userId}/email_addresses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email_address: email }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Add email failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; email_address: string };
}

// Verifizierung per E-Mail-Link starten
export async function clerkPrepareEmailVerification(emailAddressId: string) {
  const res = await fetch(`${BASE}/email_addresses/${emailAddressId}/verification`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ strategy: "email_link" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Prepare verification failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

// Als primäre E-Mail setzen
export async function clerkSetPrimaryEmail(userId: string, emailAddressId: string) {
  const res = await fetch(`${BASE}/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ primary_email_address_id: emailAddressId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Set primary failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

// E-Mail-Adresse löschen
export async function clerkDeleteEmailAddress(emailAddressId: string) {
  const res = await fetch(`${BASE}/email_addresses/${emailAddressId}`, {
    method: "DELETE",
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Delete email failed: ${res.status} ${await res.text()}`);
  return true;
}
