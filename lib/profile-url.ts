export const APP_VIEWS = ["create", "home", "search", "explore", "reels", "messages", "notifications", "profile", "saved", "tag"] as const;
export type AppView = (typeof APP_VIEWS)[number];

// Top-level app routes, public prefixes, and the `/admin` alias from the
// profile-URL spec. Existing folders under app/ keep priority over /<username>.
export const RESERVED_PROFILE_PATHS = new Set([
  "admin",
  "admin-two-factor",
  "api",
  "media",
  "p",
  "reset-password",
  "rstmcadmin",
  "two-factor",
  "verify-email",
  "_next",
  "favicon.ico",
  "favicon.svg",
]);

export type PersonRef = { id: string; username: string };

export function profileUrl(username: string): string {
  return "/" + encodeURIComponent(username);
}

export function profileShareLink(origin: string, username: string): string {
  return origin.replace(/\/$/, "") + profileUrl(username);
}

export function decodeRouteSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export type ParsedRoute = {
  view: AppView | "post";
  routeValue: string | null;
  malformed: boolean;
  legacyProfileHash: boolean;
  ignored: boolean;
};

function emptyRoute(overrides: Partial<ParsedRoute> = {}): ParsedRoute {
  return { view: "home", routeValue: null, malformed: false, legacyProfileHash: false, ignored: false, ...overrides };
}

export function parseLocation(pathname: string, hash: string): ParsedRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 1) {
    const decoded = decodeRouteSegment(segments[0]);
    if (decoded === null) return emptyRoute({ view: "profile", malformed: true });
    if (decoded && !RESERVED_PROFILE_PATHS.has(decoded.toLowerCase())) {
      return emptyRoute({ view: "profile", routeValue: decoded });
    }
  }

  const parts = hash.replace(/^#\/?/, "").split("/");
  const target = parts[0];
  const rawId = parts[1] || "";
  const decodedId = rawId ? decodeRouteSegment(rawId) : "";
  const malformed = rawId !== "" && decodedId === null;
  const id = decodedId || "";

  if (target === "post") return { view: "post", routeValue: id || null, malformed, legacyProfileHash: false, ignored: false };
  if (!target || (APP_VIEWS as readonly string[]).includes(target)) {
    const view = (target || "home") as AppView;
    return {
      view,
      routeValue: id || null,
      malformed: view === "profile" && malformed,
      legacyProfileHash: view === "profile",
      ignored: false,
    };
  }
  return emptyRoute({ ignored: true });
}

export function resolvePerson<T extends PersonRef>(people: T[], me: T | null, routeValue: string | null): T | null {
  if (!routeValue) return me;
  const needle = routeValue.toLowerCase();
  const byUsername = people.find(person => person.username.toLowerCase() === needle);
  if (byUsername) return byUsername;
  if (me && me.username.toLowerCase() === needle) return me;
  const byId = people.find(person => person.id === routeValue);
  if (byId) return byId;
  if (me && me.id === routeValue) return me;
  return null;
}

export function viewLocation(target: string, id: string | undefined, people: PersonRef[], me: PersonRef | null): string {
  if (target === "post") return "/#/post/" + encodeURIComponent(id || "");
  if (target === "profile") {
    const person = id ? resolvePerson(people, me, id) : me;
    if (person?.username) return profileUrl(person.username);
    return "/#/profile";
  }
  if (target === "home" || !target) return "/#/";
  return "/#/" + target + (id ? "/" + encodeURIComponent(id) : "");
}
