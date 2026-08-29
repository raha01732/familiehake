// src/lib/maintenance.ts
// Website-weiter Wartungsmodus: zwei unabhängige Signale, "an" wenn eines
// von beiden aktiv ist.
//  - MAINTENANCE_MODE=true (Env-Var) - Backup/harter Override, braucht ein
//    neues Deployment um zu greifen.
//  - Redis-Flag (Upstash) - sofort wirksam, über /admin/settings schaltbar,
//    kein Deployment nötig. Fail-open bei Redis-Fehlern/Ausfall.
import { getRedisClient } from "@/lib/redis";

const MAINTENANCE_REDIS_KEY = "maintenance:site-enabled";

export function maintenanceEnvFlag(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}

export async function getMaintenanceRedisFlag(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    const value = await client.get<boolean | string>(MAINTENANCE_REDIS_KEY);
    return value === true || value === "true";
  } catch {
    return false;
  }
}

export async function setMaintenanceRedisFlag(enabled: boolean): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    throw new Error("Upstash Redis ist nicht konfiguriert - Schalter kann nicht gesetzt werden.");
  }
  if (enabled) {
    await client.set(MAINTENANCE_REDIS_KEY, true);
  } else {
    await client.del(MAINTENANCE_REDIS_KEY);
  }
}

export type MaintenanceStatus = {
  envFlag: boolean;
  redisFlag: boolean;
  active: boolean;
};

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  const envFlag = maintenanceEnvFlag();
  const redisFlag = await getMaintenanceRedisFlag();
  return { envFlag, redisFlag, active: envFlag || redisFlag };
}
