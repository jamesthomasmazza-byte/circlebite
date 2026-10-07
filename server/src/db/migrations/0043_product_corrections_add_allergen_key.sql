-- The allergen a correction is about, as one key however it was spelled — what corroboration counts
-- on (recordCorrection.ts). The allergen column is stored verbatim from the reporting family's own
-- profile, and profile allergen names are free text, so counting on it meant "Peanut" and "peanut"
-- never added up, let alone "Peanut" and "Peanuts". Invisible at a threshold of one report; at two
-- families (2026-10-07) it meant two families could report the same real allergen and no warning
-- would ever spread — a false all-clear, with nothing to surface it.
--
-- New rows get the key from allergenKey() in matcher/match.ts at write time. allergen stays exactly
-- as the reporter said it; the history and the review queue render that.
--
-- The backfill is a SQL copy of allergenKey() as it stands today: trim, lowercase, then the synonym
-- cluster's first alias, else a trailing "s" stripped. The alias list below is generated from
-- matcher/synonyms.ts, and correctionsAllergenKey.test.ts runs this file against a copy of the table
-- to prove every backfilled key equals allergenKey(). A later change to the clusters applies to new
-- reports only — this file is a migration, a record of then.
--
-- Status is NOT re-evaluated, in either direction. Rows corroborated or rejected under the old
-- exact-text count are grandfathered (JT, Oct 7): re-checking them could remove warnings families
-- see now. Pending rows that now share a key with another family's stay pending until the next
-- report on that claim runs the threshold step.

ALTER TABLE product_corrections ADD COLUMN allergen_key TEXT;

WITH aliases(alias, key) AS (
  VALUES
    ('milk', 'milk'),
    ('dairy', 'milk'),
    ('lactose', 'milk'),
    ('whey', 'milk'),
    ('casein', 'milk'),
    ('caseinate', 'milk'),
    ('caseinates', 'milk'),
    ('buttermilk', 'milk'),
    ('wheat', 'wheat'),
    ('gluten', 'wheat'),
    ('barley', 'wheat'),
    ('rye', 'wheat'),
    ('shellfish', 'shellfish'),
    ('crustacean', 'shellfish'),
    ('crustaceans', 'shellfish'),
    ('shrimp', 'shellfish'),
    ('prawn', 'shellfish'),
    ('crab', 'shellfish'),
    ('crabmeat', 'shellfish'),
    ('lobster', 'shellfish'),
    ('peanut', 'peanut'),
    ('peanuts', 'peanut'),
    ('groundnut', 'peanut'),
    ('groundnuts', 'peanut'),
    ('tree nut', 'tree nut'),
    ('tree nuts', 'tree nut'),
    ('almond', 'almond'),
    ('almonds', 'almond'),
    ('hazelnut', 'hazelnut'),
    ('hazelnuts', 'hazelnut'),
    ('walnut', 'walnut'),
    ('walnuts', 'walnut'),
    ('cashew', 'cashew'),
    ('cashews', 'cashew'),
    ('pecan', 'pecan'),
    ('pecans', 'pecan'),
    ('pistachio', 'pistachio'),
    ('pistachios', 'pistachio'),
    ('brazil nut', 'brazil nut'),
    ('brazil nuts', 'brazil nut'),
    ('macadamia', 'macadamia'),
    ('macadamias', 'macadamia'),
    ('egg', 'egg'),
    ('eggs', 'egg'),
    ('soy', 'soy'),
    ('soya', 'soy'),
    ('fish', 'fish'),
    ('molluscs', 'molluscs'),
    ('mollusks', 'molluscs'),
    ('mollusc', 'molluscs'),
    ('mollusk', 'molluscs'),
    ('sesame', 'sesame'),
    ('celery', 'celery'),
    ('celeriac', 'celery'),
    ('lupin', 'lupin'),
    ('lupine', 'lupin'),
    ('sulphite', 'sulphite'),
    ('sulphites', 'sulphite'),
    ('sulfite', 'sulphite'),
    ('sulfites', 'sulphite')
),
normalized AS (
  SELECT id, lower(regexp_replace(allergen, '^\s+|\s+$', '', 'g')) AS name
  FROM product_corrections
  WHERE allergen IS NOT NULL
)
UPDATE product_corrections pc
   SET allergen_key = COALESCE(
         (SELECT a.key FROM aliases a WHERE a.alias = n.name),
         CASE WHEN length(n.name) > 1 AND right(n.name, 1) = 's' THEN left(n.name, -1) ELSE n.name END)
  FROM normalized n
 WHERE n.id = pc.id;

-- Every allergen claim has a key; wrong_product (allergen NULL) has neither.
ALTER TABLE product_corrections
  ADD CONSTRAINT product_corrections_allergen_key_present
  CHECK ((allergen IS NULL) = (allergen_key IS NULL));
