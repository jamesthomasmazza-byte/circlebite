# Prof. Yoest, Nov 13: the video, the judge link's expiry, and the S3 backups

Two replies from Prof. Jack Yoest (yoest@cua.edu) to JT (mazzajt@cua.edu), November 13, 2026.

## 1. "Re: Vibe Contest Reminders" — 18:08 UTC (1:08 PM ET)

Answers the questions in JT's Nov 7 RSVP (video focus, scoring, format, delivery).

> James,
> Thank you for confirming, and sorry for the late reply. Putting the judge link in your final submission is fine.
> Your questions, in order.
> What judges should come away with: your plan is right. Open with the problem in about thirty seconds, since the person feeding the child usually isn't the parent, and that is your whole case. Spend most of the time on the live scan and verdict.
> Show the AI escalating but never clearing, because that is the rule a judge will remember.
> Then show the circle. Leave the code tour out, since the repo speaks for the build.
> Give the business case one sentence and save what you learned for the Zoom.
> How it is used: judges may watch the video before the Zoom, so let the video carry the demo.
> Then the Zoom can go to questions, your design decisions, and what you learned. Don't repeat the same walkthrough twice.
> Format: a screen recording of the live app with your voice over it is right. A few seconds on camera at the start, saying who you are and what CircleBite does, is a nice touch but optional.
> Delivery: an unlisted YouTube link. It plays with one click on any device and never asks a judge to sign in or request access, which a Drive link sometimes does. Put the same link at the top of your README.
> Please send your final submission by the freeze, Monday, November 16, at 11:59 p.m., with the video link included.
> Cheers,
> Jack

## 2. "Re: CircleBite: shared escalations, and three corrections" — 18:03 UTC (1:03 PM ET)

> James,
> Very good. All three items, two days early, and the link is exactly what I asked for.
> Closing registration at the server rather than hiding the button is the right call. A hidden button only stops the people who use the button.
> On the link, you answered my caution better than I posed it.
> Keeping the secret after the # so it never reaches your logs, clearing it from the address bar, capping it at 10 worlds in 10 minutes, and giving yourself a kill switch shows you thought about how the link gets misused, not only how it gets used.
> Running the admin test against every route in the router, so a page added next month is covered without anyone remembering to add it, is the detail a judge will notice.
> The card is ready. The link comes first, the scan is optional, and the butter-spread case is the most honest paragraph on it. You show judges a real failure from your own testing and explain why the safeguard held.
> Leave it as it is.
> Keeping one encrypted copy on your Mac so the purge can be undone is sound judgment. Delete it when judging ends, as you said.
> One thing to check. Final judging runs to the end of November, and your link stops working on November 21. Please match the expiry to the judging window. November 30 is safe.
> Here is my ask. By Monday, November 16, confirm the new expiry date and confirm that the older S3 backups are gone. Then send me the one-time link after your final reseed, as planned. And be ready to resend (when I lose it...).
> Cheers,
> Jack

## Asks, by Nov 16

1. `JUDGE_LINK_EXPIRES` to cover all of November 30: `2026-12-01T00:00:00-05:00`. Confirm to him.
2. Confirm the pre-purge S3 versions are gone (`docs/server-setup.md` §17.14 step 3).
3. The one-time link after the final reseed, in the final submission. Be ready to re-push it.
4. The video as above: unlisted YouTube, also at the top of `README.md`.

**Bears on:** judging now runs to the end of November, not Nov 20. Everything keyed to "after judging"
(no reseed, the server up, `JUDGE_LINK=off`, deleting the Mac's pre-purge copy) moves to after Nov 30.
"Leave it as it is" covers the judge card.
