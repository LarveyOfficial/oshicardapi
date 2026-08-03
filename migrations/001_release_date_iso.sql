-- Convert cards.release_date from the official site's display format
-- ("July 11, 2025") to ISO ("2025-07-11") so RELEASE_DATE sorts
-- chronologically instead of alphabetically by month name.
--
-- Idempotent: rows already in ISO are excluded by the GLOB guard, and the month
-- IN list leaves unrecognised formats untouched rather than nulling them out.
--
--   npx wrangler d1 execute oshicard-db-prod --file=./migrations/001_release_date_iso.sql --remote

UPDATE cards
SET release_date =
  substr(release_date, -4)
  || '-'
  || CASE substr(release_date, 1, instr(release_date, ' ') - 1)
       WHEN 'January'   THEN '01'
       WHEN 'February'  THEN '02'
       WHEN 'March'     THEN '03'
       WHEN 'April'     THEN '04'
       WHEN 'May'       THEN '05'
       WHEN 'June'      THEN '06'
       WHEN 'July'      THEN '07'
       WHEN 'August'    THEN '08'
       WHEN 'September' THEN '09'
       WHEN 'October'   THEN '10'
       WHEN 'November'  THEN '11'
       WHEN 'December'  THEN '12'
     END
  || '-'
  || printf('%02d', CAST(substr(release_date, instr(release_date, ' ') + 1) AS INTEGER))
WHERE release_date IS NOT NULL
  AND release_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  AND instr(release_date, ' ') > 0
  AND substr(release_date, 1, instr(release_date, ' ') - 1) IN (
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  );
