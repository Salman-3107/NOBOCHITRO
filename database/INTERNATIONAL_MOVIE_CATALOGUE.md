# NOBOCHITRO — 1,000 International Movies

This project now includes `backend/scripts/seed-international-movies.js`.

It uses the TMDB Discover API to add **up to 1,000 unique movies from 100 countries**, including:
- title
- release year
- original language
- country
- synopsis
- poster URL
- TMDB genre mappings

The script also expands the NOBOCHITRO `Genre` table to cover the common TMDB genres:
Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family,
Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction,
TV Movie, Thriller, War, Western.

## Run

From the backend folder:

```bash
npm install
npm run seed:international
```

The backend `.env` must already contain a valid `TMDB_ACCESS_TOKEN`.

## Important

- The script does **not** hard-code 1,000 fabricated movie records.
- It pulls current catalogue metadata from TMDB at seed time.
- It skips movies already present in NOBOCHITRO when the same title + release year exists.
- It also deduplicates movies encountered across multiple countries.
- It commits periodically so a large seed does not remain in one uncommitted transaction.
- Runtime is left `NULL` because the Discover endpoint does not return runtime. This avoids 1,000 additional API calls. Selected movies can be enriched later through the TMDB details endpoint.

TMDB data and images are subject to TMDB's terms and attribution requirements. This seeder is intended for the NOBOCHITRO academic/project catalogue.
