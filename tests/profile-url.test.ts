import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  RESERVED_PROFILE_PATHS,
  parseLocation,
  profileShareLink,
  profileUrl,
  resolvePerson,
  viewLocation,
} from '../lib/profile-url';

const origin = 'https://functiongram.vercel.app';
const rstmc = { id: 'user-rstmc', username: 'rstmc', name: 'RSTMC' };
const alice = { id: '550e8400-e29b-41d4-a716-446655440000', username: 'alice', name: 'Alice' };
const johnDoe = { id: 'user-john-dot', username: 'john.doe', name: 'John Doe' };
const johnUnderscore = { id: 'user-john-under', username: 'john_doe', name: 'John Underscore' };
const people = [rstmc, alice, johnDoe, johnUnderscore];

test('A. own profile navigation uses /<username>', () => {
  assert.equal(viewLocation('profile', undefined, people, rstmc), '/rstmc');
  assert.equal(viewLocation('profile', rstmc.id, people, rstmc), '/rstmc');
});

test('B. other profile navigation uses that username', () => {
  assert.equal(viewLocation('profile', alice.id, people, rstmc), '/alice');
});

test('C. Share Profile dialog URL is origin plus username', () => {
  const link = profileShareLink(origin, alice.username);
  assert.equal(link, origin + '/alice');
  const copied: string[] = [];
  copied.push(link);
  assert.equal(copied[0], origin + '/alice');
});

test('D. native share receives the same username URL', () => {
  const link = profileShareLink(origin, alice.username);
  const payload = { title: alice.name + ' on RSTMC', url: link };
  assert.equal(payload.url, origin + '/alice');
  assert.equal(payload.url, profileShareLink(origin, 'alice'));
});

test('E. direct username route loads that profile', () => {
  const parsed = parseLocation('/alice', '');
  assert.equal(parsed.view, 'profile');
  assert.equal(parsed.routeValue, 'alice');
  assert.equal(resolvePerson(people, rstmc, parsed.routeValue)?.id, alice.id);
});

test('F. legacy ID hash route still loads the profile and canonicalizes', () => {
  const parsed = parseLocation('/', '#/profile/' + encodeURIComponent(alice.id));
  assert.equal(parsed.view, 'profile');
  assert.equal(parsed.legacyProfileHash, true);
  const person = resolvePerson(people, rstmc, parsed.routeValue);
  assert.equal(person?.username, 'alice');
  assert.equal(viewLocation('profile', person!.id, people, rstmc), '/alice');
});

test('G. legacy username hash route still loads the profile and canonicalizes', () => {
  const parsed = parseLocation('/', '#/profile/alice');
  assert.equal(parsed.view, 'profile');
  assert.equal(parsed.legacyProfileHash, true);
  const person = resolvePerson(people, rstmc, parsed.routeValue);
  assert.equal(person?.id, alice.id);
  assert.equal(viewLocation('profile', parsed.routeValue || undefined, people, rstmc), '/alice');
});

test('H. usernames with dots and underscores encode and resolve', () => {
  assert.equal(viewLocation('profile', johnDoe.id, people, rstmc), '/john.doe');
  assert.equal(viewLocation('profile', johnUnderscore.id, people, rstmc), '/john_doe');
  assert.equal(profileUrl('john.doe'), '/' + encodeURIComponent('john.doe'));
  assert.equal(profileUrl('john_doe'), '/' + encodeURIComponent('john_doe'));
  assert.equal(parseLocation('/john.doe', '').routeValue, 'john.doe');
  assert.equal(parseLocation('/john_doe', '').routeValue, 'john_doe');
  assert.equal(resolvePerson(people, rstmc, 'john.doe')?.id, johnDoe.id);
  assert.equal(resolvePerson(people, rstmc, 'john_doe')?.id, johnUnderscore.id);
  assert.equal(profileShareLink(origin, 'john.doe'), origin + '/john.doe');
});

test('I. leaving a profile resets the path and keeps the hash view', () => {
  assert.equal(viewLocation('messages', undefined, people, rstmc), '/#/messages');
  assert.notEqual(viewLocation('messages', undefined, people, rstmc), '/alice#/messages');
  assert.equal(viewLocation('home', undefined, people, rstmc), '/#/');
  assert.equal(viewLocation('search', undefined, people, rstmc), '/#/search');
});

test('J. reserved paths are not treated as profiles', () => {
  assert.equal(parseLocation('/api/social', '').view, 'home');
  assert.equal(parseLocation('/api/social', '').routeValue, null);
  assert.notEqual(parseLocation('/api', '').view === 'profile' && parseLocation('/api', '').routeValue === 'api', true);
  assert.ok(RESERVED_PROFILE_PATHS.has('api'));
  assert.ok(RESERVED_PROFILE_PATHS.has('admin'));
  assert.equal(parseLocation('/api', '').view, 'home');
  assert.equal(parseLocation('/admin', '').view, 'home');
  assert.equal(parseLocation('/rstmcadmin', '').view, 'home');
});

test('username matching is case-insensitive and prefers username over id', () => {
  assert.equal(resolvePerson(people, rstmc, 'Alice')?.id, alice.id);
  assert.equal(resolvePerson(people, rstmc, alice.id)?.username, 'alice');
});

test('malformed percent-encoding is a missing profile, not a throw', () => {
  const parsed = parseLocation('/%E0%A4%A', '');
  assert.equal(parsed.view, 'profile');
  assert.equal(parsed.malformed, true);
  assert.equal(parsed.routeValue, null);
});

test('own-profile hash without an id still resolves to the signed-in user', () => {
  const parsed = parseLocation('/', '#/profile');
  assert.equal(parsed.view, 'profile');
  assert.equal(parsed.routeValue, null);
  assert.equal(resolvePerson(people, rstmc, parsed.routeValue)?.username, 'rstmc');
  assert.equal(viewLocation('profile', undefined, people, rstmc), '/rstmc');
});

test('newly generated links follow the current username without storing a stale URL', () => {
  const me = { id: 'user-1', username: 'oldname', name: 'Me' };
  assert.equal(viewLocation('profile', undefined, [], me), '/oldname');
  assert.equal(profileShareLink(origin, me.username), origin + '/oldname');
  me.username = 'newname';
  assert.equal(viewLocation('profile', me.id, [me], me), '/newname');
  assert.equal(profileShareLink(origin, me.username), origin + '/newname');
});

test('profile URLs never include internal ids, hashes, or a /profile segment', () => {
  const url = viewLocation('profile', alice.id, people, rstmc);
  assert.equal(url, '/alice');
  assert.ok(!url.includes(alice.id));
  assert.ok(!url.includes('#'));
  assert.ok(!url.includes('/profile'));
});

test('Share Profile UI uses one helper-built username link for display, copy, and share', () => {
  const source = readFileSync(new URL('../components/social/app.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('profileShareLink(window.location.origin, profile.username)'));
  assert.ok(!source.includes('/#/profile/" + encodeURIComponent(profile.id)'));
  assert.match(source, /navigator\.clipboard\.writeText\(link\)/);
  assert.match(source, /navigator\.share\(\{ title: profile\.name \+ t\("app\.on_rstmc"\), url: link \}\)/);
});

test('navigate() is the single producer of profile URLs and non-profile views stay hashed at /', () => {
  const source = readFileSync(new URL('../components/social/app.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('viewLocation(target, id, data.people, data.me)'));
  assert.ok(source.includes('parseLocation(window.location.pathname, window.location.hash)'));
  assert.ok(source.includes('popstate'));
  assert.ok(source.includes('hashchange'));
  assert.equal(viewLocation('explore', undefined, people, rstmc), '/#/explore');
});

test('existing top-level app routes stay reserved and are not shadowed', () => {
  const dirs = readdirSync('app', { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '[username]')
    .map(entry => entry.name);
  assert.deepEqual(dirs.sort(), ['admin-two-factor', 'api', 'p', 'reset-password', 'rstmcadmin', 'two-factor', 'verify-email']);
  for (const dir of dirs) assert.ok(RESERVED_PROFILE_PATHS.has(dir), dir);
  assert.ok(existsSync('app/[username]/page.tsx'));
  const usernamePage = readFileSync('app/[username]/page.tsx', 'utf8');
  assert.ok(usernamePage.includes('SocialHome'));
  assert.ok(usernamePage.includes('initialUsername'));
});

test('config does not intercept dotted usernames as static files', () => {
  assert.equal(existsSync('middleware.ts'), false);
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as Record<string, unknown>;
  assert.ok(!vercel.rewrites && !vercel.routes && !vercel.redirects);
  const next = readFileSync('next.config.ts', 'utf8');
  assert.ok(!next.includes('fileExtensions'));
  assert.ok(!next.includes('skipMiddlewareUrlNormalize'));
});

test('seeded demo usernames do not collide with reserved top-level routes', () => {
  const seed = readFileSync('lib/seed.ts', 'utf8');
  const names = [...seed.matchAll(/\['[a-z]+','([a-z0-9_.]+)'/g)].map(match => match[1]);
  assert.ok(names.includes('anaya.explores'));
  for (const username of names) assert.ok(!RESERVED_PROFILE_PATHS.has(username), username);
});
