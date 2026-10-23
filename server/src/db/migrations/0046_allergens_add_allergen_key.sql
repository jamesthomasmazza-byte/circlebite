-- Which listed allergen each profile allergen is (server/src/matcher/allergenChoices.ts), and
-- whether a manager needs to look at it. Profiles took free text, so "treenuts" reached James
-- Mazza's profile; the matcher's aliases are "tree nut"/"tree nuts", and on 2026-10-16 a chewy bar
-- (barcode 096619160761) listing ALMONDS and ALMOND BUTTER came back clear for tree nuts. Same class
-- as the Peanut/peanut bug. New allergens are picked from the list from now on; this records what
-- the existing ones are.
--
--   allergen_key       a synonyms.ts cluster id, 'other' (a typed name a manager chose to keep), or
--                      NULL (a typed name nobody has decided on). The matcher reads it as soon as it
--                      exists (matcher/profileAllergens.ts): a key only ever ADDS keywords to what
--                      the name already matched (match.ts keywordsFor), so it is safe unreviewed.
--   key_needs_review   true when a manager must see this allergen and decide — the profile page and
--                      dashboard say so until they do. Never cleared by anything but a manager's
--                      choice, which is an ordinary logged edit when it renames.
--
-- NOTHING IS RENAMED OR REMOVED HERE. name is untouched, so the history trigger (0036/0041 —
-- name, severity, notes, traces) writes no entries and no profile reads differently. An allergen
-- that matches nothing keeps being checked exactly as before, as the word typed.
--
-- The backfill, in two passes against a frozen copy of synonyms.ts's aliases as they stand today
-- (generated from that file; allergenChoices.test.ts runs this file and checks every row against
-- recognizeAllergenName):
--   1. The name is an alias as written, case and surrounding space aside ("milk", "tree nut",
--      "eggs"). The matcher already found these clusters; nothing changes and nothing needs review.
--   2. Otherwise, the name is an alias with spaces, hyphens, case and a trailing "s" ignored
--      ("treenuts"). The matcher missed these; the key fixes that now, and a manager is asked to
--      confirm. On production that is exactly one row (2026-10-23 count: "treenuts").
--   Anything left — a name no alias matches — gets no key and needs review.
--
-- Defaults are NULL and false, with no CHECK and no NOT NULL on the key: release.sh migrates before
-- it swaps the symlink, and an allergen the previous release adds in that window has no key and is
-- matched by its name as it always was.

ALTER TABLE allergens
  ADD COLUMN allergen_key TEXT,
  ADD COLUMN key_needs_review BOOLEAN NOT NULL DEFAULT false;

CREATE TEMP TABLE allergen_alias_0046 (alias TEXT PRIMARY KEY, spelling TEXT NOT NULL, key TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO allergen_alias_0046 (alias, spelling, key) VALUES
      ('milk', 'milk', 'dairy'),
      ('dairy', 'dairy', 'dairy'),
      ('lactose', 'lactose', 'dairy'),
      ('whey', 'whey', 'dairy'),
      ('casein', 'casein', 'dairy'),
      ('caseinate', 'caseinate', 'dairy'),
      ('caseinates', 'caseinate', 'dairy'),
      ('buttermilk', 'buttermilk', 'dairy'),
      ('wheat', 'wheat', 'gluten'),
      ('gluten', 'gluten', 'gluten'),
      ('barley', 'barley', 'gluten'),
      ('rye', 'rye', 'gluten'),
      ('shellfish', 'shellfish', 'crustacean'),
      ('crustacean', 'crustacean', 'crustacean'),
      ('crustaceans', 'crustacean', 'crustacean'),
      ('shrimp', 'shrimp', 'crustacean'),
      ('prawn', 'prawn', 'crustacean'),
      ('crab', 'crab', 'crustacean'),
      ('crabmeat', 'crabmeat', 'crustacean'),
      ('lobster', 'lobster', 'crustacean'),
      ('peanut', 'peanut', 'peanut'),
      ('peanuts', 'peanut', 'peanut'),
      ('groundnut', 'groundnut', 'peanut'),
      ('groundnuts', 'groundnut', 'peanut'),
      ('tree nut', 'treenut', 'tree-nut'),
      ('tree nuts', 'treenut', 'tree-nut'),
      ('almond', 'almond', 'almond'),
      ('almonds', 'almond', 'almond'),
      ('hazelnut', 'hazelnut', 'hazelnut'),
      ('hazelnuts', 'hazelnut', 'hazelnut'),
      ('walnut', 'walnut', 'walnut'),
      ('walnuts', 'walnut', 'walnut'),
      ('cashew', 'cashew', 'cashew'),
      ('cashews', 'cashew', 'cashew'),
      ('pecan', 'pecan', 'pecan'),
      ('pecans', 'pecan', 'pecan'),
      ('pistachio', 'pistachio', 'pistachio'),
      ('pistachios', 'pistachio', 'pistachio'),
      ('brazil nut', 'brazilnut', 'brazil-nut'),
      ('brazil nuts', 'brazilnut', 'brazil-nut'),
      ('macadamia', 'macadamia', 'macadamia'),
      ('macadamias', 'macadamia', 'macadamia'),
      ('egg', 'egg', 'egg'),
      ('eggs', 'egg', 'egg'),
      ('soy', 'soy', 'soy'),
      ('soya', 'soya', 'soy'),
      ('fish', 'fish', 'fish'),
      ('molluscs', 'mollusc', 'mollusc'),
      ('mollusks', 'mollusk', 'mollusc'),
      ('mollusc', 'mollusc', 'mollusc'),
      ('mollusk', 'mollusk', 'mollusc'),
      ('sesame', 'sesame', 'sesame'),
      ('celery', 'celery', 'celery'),
      ('celeriac', 'celeriac', 'celery'),
      ('lupin', 'lupin', 'lupin'),
      ('lupine', 'lupine', 'lupin'),
      ('sulphite', 'sulphite', 'sulphite'),
      ('sulphites', 'sulphite', 'sulphite'),
      ('sulfite', 'sulfite', 'sulphite'),
      ('sulfites', 'sulfite', 'sulphite');

UPDATE allergens a
   SET allergen_key = al.key
  FROM allergen_alias_0046 al
 WHERE a.allergen_key IS NULL AND lower(trim(a.name)) = al.alias;

UPDATE allergens a
   SET allergen_key = al.key, key_needs_review = true
  FROM (SELECT DISTINCT spelling, key FROM allergen_alias_0046) al
 WHERE a.allergen_key IS NULL
   AND regexp_replace(regexp_replace(lower(a.name), '[^a-z]', '', 'g'), '(.)s$', '\1') = al.spelling;

UPDATE allergens SET key_needs_review = true WHERE allergen_key IS NULL;
