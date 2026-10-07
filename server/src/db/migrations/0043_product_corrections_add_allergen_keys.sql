-- Two keys for the allergen a correction is about, however it was spelled — what corroboration
-- counts on (recordCorrection.ts). The allergen column is stored verbatim from the reporting
-- family's own profile, and profile allergen names are free text, so counting on it meant "Peanut"
-- and "peanut" never added up, let alone "Peanut" and "Peanuts". Invisible at a threshold of one
-- report; at two families (2026-10-07) two families could report the same real allergen and no
-- warning would ever spread — a false all-clear, with nothing to surface it.
--
-- Two keys, because the two directions must not merge the same way (match.ts):
--   allergen_fold_key    trim, lowercase, trailing "s". What a removal (remove_caution) counts on:
--                        "Milk", "Lactose" and "Whey" stay three claims — lactose-free isn't
--                        whey-free, and three families mustn't clear a milk caution having
--                        reported three different things.
--   allergen_family_key  the fold key plus the synonym cluster — "cluster:<id>" for a cluster
--                        alias, else "name:<fold key>". What an addition (add_caution) counts on:
--                        escalation is safe to over-merge.
-- allergen stays exactly as the reporter said it; the history and the review queue render that.
--
-- NULLABLE here, and required only from 0044 on. release.sh migrates before it swaps the symlink, so
-- for a few seconds this schema runs under the previous release, which doesn't write these keys; a
-- NOT NULL or CHECK here would turn a parent's report in that window into a 500 on a safety write
-- path. 0044 adds the constraint in a later deploy, once the code that writes the keys is live.
--
-- The backfill is a frozen SQL copy of allergenFoldKey()/allergenFamilyKey() as they stand today,
-- kept as a function so a row written in that window can be keyed later — 0044 refuses to run and
-- names it if any row is missing a key. The alias list is generated from matcher/synonyms.ts, keyed
-- by each cluster's stable id; correctionsAllergenKey.test.ts runs this file against a copy of the
-- table and proves every key equals the TypeScript functions'. A later change to the clusters
-- applies to new reports only — this file is a record of then. It only fills keys that are NULL.
--
-- Status is NOT re-evaluated, in either direction. Rows corroborated, rejected or pending under the
-- old exact-text count stay as they are (JT, Oct 7): re-checking could remove warnings families see.

ALTER TABLE product_corrections
  ADD COLUMN allergen_fold_key TEXT,
  ADD COLUMN allergen_family_key TEXT;

CREATE OR REPLACE FUNCTION product_corrections_backfill_allergen_keys() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  WITH aliases(alias, family_key) AS (
    VALUES
      ('milk', 'cluster:dairy'),
      ('dairy', 'cluster:dairy'),
      ('lactose', 'cluster:dairy'),
      ('whey', 'cluster:dairy'),
      ('casein', 'cluster:dairy'),
      ('caseinate', 'cluster:dairy'),
      ('caseinates', 'cluster:dairy'),
      ('buttermilk', 'cluster:dairy'),
      ('wheat', 'cluster:gluten'),
      ('gluten', 'cluster:gluten'),
      ('barley', 'cluster:gluten'),
      ('rye', 'cluster:gluten'),
      ('shellfish', 'cluster:crustacean'),
      ('crustacean', 'cluster:crustacean'),
      ('crustaceans', 'cluster:crustacean'),
      ('shrimp', 'cluster:crustacean'),
      ('prawn', 'cluster:crustacean'),
      ('crab', 'cluster:crustacean'),
      ('crabmeat', 'cluster:crustacean'),
      ('lobster', 'cluster:crustacean'),
      ('peanut', 'cluster:peanut'),
      ('peanuts', 'cluster:peanut'),
      ('groundnut', 'cluster:peanut'),
      ('groundnuts', 'cluster:peanut'),
      ('tree nut', 'cluster:tree-nut'),
      ('tree nuts', 'cluster:tree-nut'),
      ('almond', 'cluster:almond'),
      ('almonds', 'cluster:almond'),
      ('hazelnut', 'cluster:hazelnut'),
      ('hazelnuts', 'cluster:hazelnut'),
      ('walnut', 'cluster:walnut'),
      ('walnuts', 'cluster:walnut'),
      ('cashew', 'cluster:cashew'),
      ('cashews', 'cluster:cashew'),
      ('pecan', 'cluster:pecan'),
      ('pecans', 'cluster:pecan'),
      ('pistachio', 'cluster:pistachio'),
      ('pistachios', 'cluster:pistachio'),
      ('brazil nut', 'cluster:brazil-nut'),
      ('brazil nuts', 'cluster:brazil-nut'),
      ('macadamia', 'cluster:macadamia'),
      ('macadamias', 'cluster:macadamia'),
      ('egg', 'cluster:egg'),
      ('eggs', 'cluster:egg'),
      ('soy', 'cluster:soy'),
      ('soya', 'cluster:soy'),
      ('fish', 'cluster:fish'),
      ('molluscs', 'cluster:mollusc'),
      ('mollusks', 'cluster:mollusc'),
      ('mollusc', 'cluster:mollusc'),
      ('mollusk', 'cluster:mollusc'),
      ('sesame', 'cluster:sesame'),
      ('celery', 'cluster:celery'),
      ('celeriac', 'cluster:celery'),
      ('lupin', 'cluster:lupin'),
      ('lupine', 'cluster:lupin'),
      ('sulphite', 'cluster:sulphite'),
      ('sulphites', 'cluster:sulphite'),
      ('sulfite', 'cluster:sulphite'),
      ('sulfites', 'cluster:sulphite')
  ),
  normalized AS (
    SELECT id, lower(regexp_replace(allergen, '^\s+|\s+$', '', 'g')) AS name
    FROM product_corrections
    WHERE allergen IS NOT NULL AND (allergen_fold_key IS NULL OR allergen_family_key IS NULL)
  ),
  folded AS (
    SELECT id, name,
           CASE WHEN length(name) > 1 AND right(name, 1) = 's' THEN left(name, -1) ELSE name END AS fold_key
    FROM normalized
  )
  UPDATE product_corrections pc
     SET allergen_fold_key = f.fold_key,
         allergen_family_key = COALESCE((SELECT a.family_key FROM aliases a WHERE a.alias = f.name), 'name:' || f.fold_key)
    FROM folded f
   WHERE f.id = pc.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

SELECT product_corrections_backfill_allergen_keys();
