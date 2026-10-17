# Security and privacy

What protects accounts, who can see what, and the checks that keep it that way.

## Accounts

Sign-in is next-auth with credentials and JWT sessions (`src/lib/auth.ts`),
accepting an email or a username.

**Passwords.** bcrypt, cost 12. At least 8 characters and no composition rules,
following NIST SP 800-63B. At most 72 bytes, which is refused rather than
silently truncated by bcrypt.

**Sign-in limits.** 20 attempts per 15 minutes per IP, and 10 per account per IP.
The account limit was once global, which let anyone lock the owner out by
guessing; keyed per IP, a stranger's guesses only block the stranger. bcrypt
runs even for a missing account, against a fixed hash, so response time does
not reveal which emails are registered.

**Revocation.** Each user has a `sessionVersion` stored in their token. Every
request compares it with the database, cached per render. Changing your password
bumps it, signing out every other device, and re-issues the current device's
cookie so you stay signed in. A password reset bumps it too.

**Email links.**

- Verification links open a page with a Confirm button, and the token is spent
  only when it is pressed. Mail scanners such as Outlook Safe Links open every
  link and were spending tokens before people did.
- Reset tokens last an hour, verification tokens 24 hours. Each is checked and
  spent in a single `updateMany`, so a double click or a race cannot use one
  twice. A spent reset link answers 410 with a way to request a new one.
- Forgot password, resend verification and registration answer the same way
  whether or not the account exists, and are limited per IP and per address.

**Usernames** are 3 to 20 letters, digits, `_` or `-`, and may not match a page
the site already has, since profiles live at `/{username}`.

## Who can see a photo

One module decides it: `src/lib/photoVisibility.ts`.

- `PUBLIC_PHOTO` is spread into roughly forty queries that show photos to
  anyone. A rule remembered forty times is one that gets forgotten.
- `visibleToViewer(viewerId)` also includes the viewer's own private photos,
  for their profile and albums.
- `canViewPhoto` gates likes, comments, downloads and the API.
- `canOpenPhotoPage` additionally lets the owner open an unfinished upload and
  lets admins open anything.
- A photo is public only once `screening` is `CLEAR`: new uploads wait for the
  nudity check, and flagged ones wait for an admin. See [vision](vision.md#screening).

A private photo or album answers the same 404 as one that does not exist, so its
existence is not confirmed. The proxy sets that status before rendering.

## Blocking and reports

- **Words.** Slurs, sexual words, swearing and insults are refused in names,
  comments, bios, captions, notes and album names. Search refuses them and
  requests for nudity too. See [vision](vision.md#the-word-filter).

- **Blocks** are stored one way and applied both ways (`src/lib/blocks.ts`).
  Blocked accounts disappear from feeds, search, comments, notes, likes and
  notifications, cannot follow, like or comment, and any follows between the two
  are removed.
- **Reports** cover photos, comments, users and notes. One per person per
  target; reporting yourself is refused. Admins are emailed and work them in
  `/admin/reports`.
- **Feedback** is open to signed-out visitors, with a honeypot field. Each
  thread gets a reference like `AX-` plus ten random characters (50 bits), which
  is also the key to its status page.

## Request handling

- **Rate limits** are one table, `src/lib/rateLimitPolicy.ts`, each with its
  reason: uploads, writes, reactions, content search, exports, feedback, catalog
  creation, sign-in and email flows. The limiter (`src/lib/rateLimit.ts`) is an
  in-memory sliding window keyed by the nginx-set client IP, capped at 10,000
  keys. In-memory is correct only for a single process, which is one reason the
  app runs as one fork.
- **Request bodies** are read through `src/lib/requestBody.ts`: malformed JSON is
  a 400 rather than a 500, and declared sizes are checked before buffering.
- **Redirect targets** after sign-in are resolved as same-origin paths. A check
  for "starts with `/` but not `//`" let `/\evil.com` through.
- **Writes are scoped to the owner** in the `where` clause itself, so a bulk
  action or delete cannot reach someone else's rows by id.
- **Headers** (`next.config.ts`): `frame-ancestors 'none'`, `base-uri`,
  `form-action` and `object-src` restrictions, `X-Frame-Options: DENY`,
  `nosniff`, a strict referrer policy, a permissions policy denying camera,
  microphone and geolocation, and HSTS in production.

## Checks that run

- **`scripts/check-api-leaks.ts`** calls every API route against a running server
  and fails if any response contains a password hash, a token or an email
  address it should not. It exists because a hand fix for one leaked
  `passwordHash` missed an identical call a few lines below. Never
  `include: { user: true }`; use `publicUserSelect` or `bylineUserSelect`.
- **`scripts/assert-client-bundle-clean.mjs`** runs after every build and fails it
  if the database client reached the browser bundle, which once happened through
  a module-scope `Prisma.raw()`.
- **CI** runs the sign-in gate against a real database. One thing it pins is the
  order of the checks: the password is compared before the verified-email check,
  so a wrong password on an unconfirmed account says "wrong password" and does
  not reveal that the address is registered.

## Admin

The admin layout checks `isAdmin` before rendering anything beneath it, so a new
admin page cannot be left unprotected. API routes call `requireAdmin`. Fields an
admin can write are an allowlist in `src/lib/admin/resources.ts`, and anything
outside it is refused by name rather than dropped. Bulk actions take at most 200
ids, and granting admin from a bulk edit asks for confirmation. Admin API routes
answer 401 when signed out and 403 when signed in without admin.
