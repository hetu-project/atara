# Development Server Port Design

## Goal

Run the local Vite development server on port `5174` because port `5173` is already occupied.

## Design

- Add `server.port: 5174` to `vite.config.ts` so `npm run dev` uses the new default.
- Leave Vite's `strictPort` option disabled. If port `5174` is unavailable, Vite may select the next available port instead of failing.
- Update current local-development URLs in `README.md` from port `5173` to `5174`, including the Supabase Site URL example.
- Historical design and implementation documents remain unchanged because they describe the project state at the time they were written.

## Verification

- Run the automated test suite and production build.
- Start the development server and confirm it reports `http://localhost:5174/`.
