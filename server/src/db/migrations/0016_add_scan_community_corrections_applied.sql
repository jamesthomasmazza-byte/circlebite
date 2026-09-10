-- Which corroborated community additions a scan applied at the moment it was performed —
-- server/src/corrections/applyCommunityCorrections.ts, Week 8 part 2.
--
-- scans.result and scans.matched_allergens stay the engine's own output (matcher + AI merge),
-- never overwritten by the community layer: the AI accuracy report measures the engine, and the
-- kill switch (COMMUNITY_CORRECTIONS) has to be able to revert every view without touching data.
-- This column is the audit half of docs/principles.md principle 4 — what a person was actually
-- told, and which reports changed it, is recoverable after the fact even if a report is later
-- rejected.
--
-- JSONB array of { allergenName, reportedAs, correctionIds, reporterCount }. Three states, kept
-- distinct on purpose: NULL = the kill switch was off (nothing was checked); [] = checked, nothing
-- matched; non-empty = what was applied. correction ids are stored by value, not as a foreign key,
-- for the same reason product_corrections denormalizes (N17) — the record must survive the row it
-- points at. A GIN index isn't added: the audit query in docs/server-setup.md §11 is an occasional
-- manual lookup, not a request path.

ALTER TABLE scans ADD COLUMN community_corrections_applied JSONB;
