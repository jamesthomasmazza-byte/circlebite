# Authorization — the convention for every route added from here on

This build has no row-level security. `docs/legacy-spec.md` §2 and `docs/coppa.md` §2.2/§2.5 are
explicit: every access check has to live in application code, on the server, on every query, and
must not be skippable by any other code path. That only holds if every future route follows the
same shape — this file is the shape.

## Two separate questions, two separate layers

**Identity — "who is making this request?"** Answered once, by `auth/requireAuth.ts`. It resolves
the session cookie to a user and attaches `req.user`. It does not, and should not, know anything
about profiles, circles, or what that user is allowed to touch.

**Resource access — "can this user touch this specific thing?"** Answered here, per resource, and
only once `allergen_profiles` / `profile_managers` / `follow_relationships` exist (weeks 2–3).
Identity never implies access — an authenticated user is not automatically entitled to any
particular profile, scan, or correction.

## The rule for a new resource-scoped route

1. Write one function per resource-and-action in this directory, e.g.
   `assertCanReadProfile(userId, profileId)`, `assertCanManageProfile(userId, profileId)`. Each
   does exactly one query and throws (a 403, caught by the route's error handling) on failure. It
   does not return a boolean — a boolean can be checked and then silently ignored by a caller in a
   hurry; a throw can't.
2. **Fetch access, not existence.** The query should be shaped like
   `WHERE id = $1 AND (owner check OR manager check OR accepted-follow check)`, not "fetch by id,
   then check." A profile that exists but isn't visible to this user should look identical to a
   profile that doesn't exist — a 403 and a 404 are functionally the same information
   ("you can't see this"), and returning a 404 for "exists but not yours" avoids confirming
   someone's guess at another circle's profile IDs.
3. **Call it in the route handler, before the query that touches the row**, not from a shared list
   of "protected routes" that a new route could be added to without anyone remembering. The check
   lives next to the code it's protecting, so a reviewer sees both at once.
4. Never trust `req.session.actingProfileId` as authorization. It's a UX hint (last profile
   selected — see `auth/session.ts`) that gets out of date the moment access is revoked mid-session
   (a follow pulled, a co-manager removed). Every profile-scoped request re-checks through this
   layer regardless of what the session remembers.

## What exists here today

Nothing yet — Week 1 has no profile-scoped resources. This file exists so weeks 2–3 have a pattern
to slot `assertCanReadProfile` etc. into rather than inventing one under deadline.
