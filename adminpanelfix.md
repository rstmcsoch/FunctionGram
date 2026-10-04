FunctionGram — Authority Profile/Admin Panel Access Fix

Objective

Fix the routing/access problem caused by the new clean public profile URL system:

"https://functiongram.vercel.app/<username>"

For example, an admin username may be:

"rstmcadmin"

So:

"https://functiongram.vercel.app/rstmcadmin"

is now correctly treated as that user's public profile, but this creates a problem if the same path was previously being used or expected as an Admin Panel entry point.

Do not remove or change the new "/<username>" profile URL system.

Instead, create a proper authority-user destination chooser that lets administrators/moderators/staff choose between their normal profile and the Admin Panel.

---

1. Who should get this feature

This must work for every authenticated account that has elevated authority, based on the application's existing role/permission system.

This may include:

- Super Admin
- Admin
- Moderator
- Content Moderator
- Staff/Support roles
- Any custom role with Admin Panel permissions
- Any future role that receives Admin Panel permissions

Do not hard-code "rstmcadmin" or any other username.

Use the existing server-side roles/permissions/feature-policy system.

---

2. Authority chooser popup

For an authority user, show a small modern popup/modal:

After successful login

After the normal login/authentication process completes, detect whether the user has Admin Panel authority.

If yes, show:

Choose destination

My Profile
Open your normal FunctionGram profile

Admin Panel
Open your authorized management panel

The user must be able to choose either option.

Do not automatically force an authority user into the Admin Panel.

The popup must also be dismissible.

---

3. Show the same chooser from the profile picture

When an authority user clicks their profile picture/avatar, open the same chooser.

Do not immediately navigate to the public profile for authority users.

Use the same reusable chooser component where practical.

For normal users, keep the existing profile-picture behavior.

---

4. Destinations

My Profile

This must use the new clean profile URL:

"/<username>"

For example:

"https://functiongram.vercel.app/rstmcadmin"

Admin Panel

This must use the application's existing dedicated Admin Panel route.

Do not send the user to "/<username>".

Do not create a second Admin Panel.

Inspect the existing routing structure and reuse the current protected Admin Panel destination.

---

5. VERY IMPORTANT — existing 2-step verification

The existing Admin Panel 2-step verification/security process must remain exactly as it currently works.

The new chooser must NOT bypass, weaken, remove, or replace it.

The flow should be:

"Login"
→ "Authority detected"
→ "Choose destination"
→ "Admin Panel selected"
→ "Existing Admin authorization"
→ "Existing 2-step verification"
→ "Admin Panel"

If 2-step verification is required, the user must still complete it before entering the Admin Panel.

If different authority roles have different existing security requirements, preserve those requirements.

Do not create a new weaker verification path.

---

6. Permission-aware Admin Panel

Do not assume every authority role has full access.

For example:

- Full admin → existing full permissions
- Moderator → existing moderator permissions
- Limited staff → existing limited permissions

The chooser only determines where the user wants to go.

The existing server-side permission system must remain responsible for determining what that user can actually access.

A user must not gain additional privileges by:

- changing the URL
- modifying client-side state
- manipulating the popup
- manually entering an Admin Panel URL

---

7. Fix route collision correctly

The application now has:

"/<username>"

for public profiles.

This means usernames can collide with old application route names.

Fix routing so that:

- protected/static application routes continue to work
- the Admin Panel continues to have its dedicated protected route
- dynamic "/<username>" profile routing does not swallow protected routes
- clean profile URLs remain unchanged

Do not solve this by removing the clean profile URL feature.

Do not hard-code:

if (username === "rstmcadmin")

Use proper route precedence/reserved-route handling and the existing routing architecture.

---

8. Normal users

For a normal user who has no Admin Panel authority:

- Do not show the authority chooser after login.
- Do not show the Admin Panel option.
- Keep normal profile behavior.
- "/<username>" continues to open their profile.
- Existing Admin Panel security remains unchanged.

---

9. Security requirements

Verify all of the following:

1. Only authenticated authority users receive the Admin Panel option.
2. Authority status comes from the real server-side permission/role system.
3. Existing server-side Admin Panel authorization remains active.
4. Existing 2-step verification remains mandatory where required.
5. Normal users cannot obtain Admin access through URL manipulation.
6. Client-side code cannot grant permissions.
7. Removing a user's authority removes their Admin Panel access according to the existing authorization/session system.
8. Do not expose secrets, verification codes, tokens, or sensitive permission information in the browser.
9. Do not duplicate authentication or authorization logic.

---

10. UI requirements

Make the popup modern and consistent with FunctionGram.

Example:

Choose destination

👤 My Profile
Open your normal FunctionGram profile

🛡️ Admin Panel
Open your authorized management panel

Requirements:

- Mobile friendly
- Tablet friendly
- Desktop friendly
- Large touch targets
- Existing FunctionGram visual style
- Existing dark-mode support
- Easy to dismiss
- No unnecessary large UI
- No duplicate popups

---

11. Implementation process

Before changing code, inspect:

1. Existing authentication implementation
2. Existing roles/permissions
3. Existing Admin Panel route
4. Existing Admin Panel authorization
5. Existing 2-step verification flow
6. Current "/<username>" profile route
7. Current profile-avatar navigation
8. Any existing authority/admin navigation components

Then implement the smallest clean solution.

Prefer reusing existing:

- auth utilities
- permission checks
- Admin Panel security checks
- 2-step verification
- profile routing
- UI components

---

12. Required scenarios

Normal user

Login → no authority popup → normal profile behavior.

Full admin

Login → authority chooser appears.

Choose My Profile → "/<username>"

Choose Admin Panel → existing Admin Panel authorization → existing 2-step verification → Admin Panel.

Moderator

Login → authority chooser appears.

Choose My Profile → "/<username>"

Choose Admin Panel → existing authorization/security flow → moderator's permitted Admin Panel sections only.

Authority user clicking avatar

Click avatar → same authority chooser appears.

Authority user with username "rstmcadmin"

Choose My Profile → "/rstmcadmin"

Choose Admin Panel → dedicated Admin Panel route.

These two destinations must never become confused.

Unauthorized user

Manually opening the Admin Panel URL must still be rejected/redirected according to the existing security system.

---

13. Acceptance criteria

The task is complete only when:

- [ ] "/<username>" profile URLs still work.
- [ ] All elevated authority roles are detected through the real permission system.
- [ ] Authority users see the chooser after login.
- [ ] Authority users see the chooser when clicking their avatar.
- [ ] Normal users do not see the chooser.
- [ ] My Profile opens "/<username>".
- [ ] Admin Panel opens the existing Admin Panel route.
- [ ] "/rstmcadmin" remains a profile URL when "rstmcadmin" is the username.
- [ ] Admin Panel does not depend on the username URL.
- [ ] Existing 2-step verification still works and remains required.
- [ ] Existing role-based Admin Panel restrictions remain intact.
- [ ] Direct Admin Panel URLs remain protected server-side.
- [ ] No privilege escalation is introduced.
- [ ] No secrets or verification information are exposed client-side.
- [ ] Works on mobile/tablet/desktop.
- [ ] Existing dark mode continues to work.

---

Final instruction

Implement this directly in the existing FunctionGram architecture.

Do not remove "/<username>" profile URLs.

Do not hard-code "rstmcadmin".

Do not weaken or bypass the existing 2-step verification.

Do not create a parallel authentication/authorization system.

The final behavior should let every authorized admin/moderator/staff user easily choose between:

My Profile → "/<username>"

and

Admin Panel → existing protected Admin Panel route.
