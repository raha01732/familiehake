// TEMP: Auth in der Edge deaktiviert, um Prod-500 zu debuggen.

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)" // alle Pages außer static assets
  ]
};

export default function middleware() {
  // absichtlich leer
  // wir greifen Clerk hier NICHT mehr an
}
