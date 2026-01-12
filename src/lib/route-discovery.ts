// src/lib/route-discovery.ts
import { readdir } from "fs/promises";
import path from "path";

const ROUTE_FILES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js"]);

function isRouteGroup(segment: string) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function isDynamicSegment(segment: string) {
  return segment.startsWith("[") && segment.endsWith("]");
}

function shouldSkipSegment(segment: string) {
  return segment === "api" || segment.startsWith("@");
}

export async function discoverAppRoutes(appDir = path.join(process.cwd(), "src", "app")) {
  const routes = new Set<string>();

  async function walk(currentDir: string, segments: string[]) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const hasPage = entries.some((entry) => entry.isFile() && ROUTE_FILES.has(entry.name));

    if (hasPage) {
      const route = segments.filter(Boolean).join("/");
      if (route) routes.add(route);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const segment = entry.name;
      if (shouldSkipSegment(segment)) continue;
      if (isDynamicSegment(segment)) continue;
      if (isRouteGroup(segment)) {
        await walk(path.join(currentDir, segment), segments);
        continue;
      }
      await walk(path.join(currentDir, segment), [...segments, segment]);
    }
  }

  await walk(appDir, []);
  return Array.from(routes);
}
