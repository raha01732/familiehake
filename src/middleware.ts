import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/settings(.*)",
  "/monitoring(.*)"
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect(); // zwingt Login
  }
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*|favicon.ico).*)" // alles außer Assets
  ]
};

