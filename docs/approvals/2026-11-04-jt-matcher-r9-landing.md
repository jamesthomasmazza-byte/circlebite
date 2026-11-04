# The matcher fixes, the R9 purge and the landing page; his October 29 ask in progress

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** November 4, 2026 (exact time not recorded)
**Answers:** his October 29, 7:23 PM email (`2026-10-29-yoest-judge-tests-and-card.md`), as an
interim reply: the ask itself is promised before the November 13 freeze.

Reproduced verbatim as sent. Line breaks inside paragraphs are not kept. Indexed in
`docs/approvals/conditions.md`.

**Where each claim is backed:**
- **The matcher:** `docs/evidence/2026-11-03-matcher-before-after.md`, with the three fixes' own
  evidence files beside it.
- **The R9 purge:** `docs/journal.md`, 2026-11-03.
- **The removal of older backups:** `docs/server-setup.md` §17.14. Not yet done when this was sent.

---

> Prof. Yoest,
>
> Your October 29 ask, the test names and the printed judge card, is in progress and will reach you before the November 13 freeze. In the meantime, three things, all live on production as of November 3.
>
> The matcher was missing allergens on real products. Checking it against real Open Food Facts products, about 1,800 in the main sample, I found three gaps. It didn't know wheat by some of its other names, such as durum, spelt, semolina, bulgur and wholewheat. It couldn't read allergens that Open Food Facts marks with underscores in its ingredient text, like _Sesame_. And it didn't recognise some of Open Food Facts' own allergen tags, such as "sesame seeds". In that sample, about 140 products read "No listed allergens found" for a child allergic to something they list, most of them for sesame and mostly as "may contain" warnings. All three fixes only add caution, and the evidence is in the repo.
>
> The synthetic-data rule: I removed my own test accounts, the only non-synthetic accounts on the deployment, with a dry run and a backup first, and kept one operator account with a role address for the admin pages. Older backups that held those accounts are being removed. One finding matters for the fake-family page. A sesame warning on a real butter spread had been confirmed by my two test accounts, which the app counted as two families. The ingredients have no sesame, so I removed it. As the fake-family page anticipated, two accounts from one person could only add a warning, never clear one, and the app can't tell that two accounts belong to one person.
>
> The site now has a landing page for signed-out visitors, explaining the app to a parent. It asks anyone who signs up to use a made-up name and a test email, not real information about a real child. Registration stays open so judges can try the sign-up; if you would rather I close it until after judging, I can.
>
> Best,
> James Mazza
