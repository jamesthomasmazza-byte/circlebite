# Reply: followers see the reporter's role, not their name

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** October 27, 2026, 11:51 AM ET, in the same thread as his October 27 email
**Answers:** his October 27 ask (`2026-10-27-yoest-follower-reporter-name.md`): "tell me in two or
three sentences whether followers should see the reporter's name, and why"

Reproduced verbatim. Line breaks inside paragraphs are not kept. Indexed in
`docs/approvals/conditions.md`.

---

> Prof. Yoest,
>
> Followers should see the reporter's role, not their name. A babysitter in the aisle needs to know the warning came from someone the parent trusts with the profile, and "A co-manager in Maya's circle reported eggs present and photographed the label" tells her that; who exactly filed it matters to the owner and co-managers, who can act on it, and they still see the name. It was also the one place a follower could learn who else is in the circle, which the rest of the app already keeps from followers, so the server now withholds the name entirely: it never reaches a follower's phone. That is tested and live on production as of this morning.
>
> Best,
> James Mazza

---

## What the repo shows

- **The decision and its tests:** `79f299c` (the wording) and `3d285fb` (the server), recorded in
  `docs/principles.md`'s Decision precedents, October 27.
- **"Live on production as of this morning":** accurate. Production has run `29854ef`, which
  includes `3d285fb`, since about 11:44 AM ET, confirmed by JT at 11:45 (`docs/journal.md`,
  October 27). Verified by tests and a local check, not yet by a follower account on production.
