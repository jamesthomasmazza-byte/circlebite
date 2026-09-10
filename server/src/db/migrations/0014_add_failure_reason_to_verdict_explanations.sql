-- Every failed AI call was being stored as an empty findings array with no clue why it failed —
-- indistinguishable in the database whether the spend cap refused the call, the key was missing,
-- the API returned an error, or the response didn't parse. Surfaced by the first live smoke test
-- against a real deployment: every scan came back unable_to_confirm and there was no way to tell
-- why from the data alone. See server/src/verdict/aiClient.ts and reasonVerdict.ts.

ALTER TABLE verdict_explanations ADD COLUMN failure_reason TEXT;
