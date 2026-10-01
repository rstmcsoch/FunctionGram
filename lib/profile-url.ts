import { ADMIN_BASE_PATH } from "./admin/config";

export const APP_VIEWS = ["create", "home", "search", "explore", "reels", "messages", "notifications", "profile", "saved", "tag"] as const;
export type AppView = (typeof APP_VIEWS)[number];

// Top-level app routes, public prefixes, and the `/admin` alias from the
// profile-URL spec. Existing folders under app/ keep priority over /<username>.
export const RESERVED_PROFILE_PATHS = new Set<string>([
  "admin",
  "admin-panel",
  "admin-two-factor",
  "api",
  "media",
  "p",
  "reset-password",
  "two-factor",
  "verify-email",
  ADMIN_BASE_PATH.replace(/^\//, ""),
  "_next",
  "favicon.ico",
  "favicon.svg",
]);

export type PersonRef = { id: string; username: string };

export function profileUrl(username: string): string {
  // A legacy account whose name matches a static application route keeps the
  // hash profile route: that root path belongs to the application route (the
  // Admin Panel, `/api`, …) and must never be handed out as a profile link.
  // Such names cannot be claimed any more; see `validateProfileUsername`.
  if (isReservedProfilePath(username)) return "/#/profile/" + encodeURIComponent(username);
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

/**
 * A profile URL is the account's username as a single root path segment, so a
 * username may never equal a name the application itself serves: the Admin
 * Panel at `ADMIN_BASE_PATH`, `/api`, and the other reserved routes. Next.js
 * already gives those static routes precedence over `/[username]`; reserving
 * the names as well keeps a profile link and an application route from ever
 * being confused, and it is derived from the route table rather than from any
 * particular administrator's username.
 */
export function isReservedProfilePath(segment: string): boolean {
  const decoded = decodeRouteSegment(segment.toLowerCase());
  return decoded === null || RESERVED_PROFILE_PATHS.has(decoded);
}

export const USERNAME_PATTERN = /^[a-z0-9_][a-z0-9_.]{2,29}$/;

/** Single username rule set for the write path, so an account can never claim
 * a route the application serves. Statuses match the existing API contract. */
export function validateProfileUsername(username: string): { ok: true } | { ok: false; status: number; message: string } {
  if (!USERNAME_PATTERN.test(username)) return { ok: false, status: 400, message: 'Use 3–30 letters, numbers, dots, or underscores for your username.' };
  if (isReservedProfilePath(username)) return { ok: false, status: 409, message: 'That username is reserved for an application page. Try another.' };
  return { ok: true };
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
