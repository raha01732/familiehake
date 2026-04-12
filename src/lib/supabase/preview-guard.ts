// /workspace/familiehake/src/lib/supabase/preview-guard.ts
import { isPreviewEnvironment } from "../env";

const USER_MANAGEMENT_WRITE_TABLES = new Set<string>(["user_roles"]);

export const PREVIEW_WRITE_BLOCK_MESSAGE =
  "Speichern in die Datenbank ist nur in der Live-Version möglich (Preview ist schreibgeschützt).";

export class PreviewWriteBlockedError extends Error {
  constructor(public readonly table: string) {
    super(`${PREVIEW_WRITE_BLOCK_MESSAGE} (Tabelle: ${table})`);
    this.name = "PreviewWriteBlockedError";
  }
}

function isAllowedPreviewWrite(table: string) {
  return USER_MANAGEMENT_WRITE_TABLES.has(table);
}

export function wrapPreviewWriteGuard<TClient>(client: TClient): TClient {
  if (!isPreviewEnvironment()) {
    return client;
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "from") {
        return Reflect.get(target, prop, receiver);
      }

      return (table: string) => {
        const queryBuilder = (target as any).from(table);

        return new Proxy(queryBuilder, {
          get(qTarget, qProp, qReceiver) {
            if (qProp !== "insert" && qProp !== "update" && qProp !== "upsert" && qProp !== "delete") {
              return Reflect.get(qTarget, qProp, qReceiver);
            }

            if (isAllowedPreviewWrite(table)) {
              return Reflect.get(qTarget, qProp, qReceiver);
            }

            return () => {
              throw new PreviewWriteBlockedError(table);
            };
          },
        });
      };
    },
  }) as TClient;
}
