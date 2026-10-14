# Research Personnel Dashboard — research.uwo-drugchecking.ca

Internal dashboard for the Western research team (partner data, exemption tracker, utilization, site notes). React + Vite + Tailwind, deployed to GitHub Pages. The whole site sits behind a password (`VITE_RESEARCH_PASSWORD`, set at build time; no fallback in the source, so an empty value locks the site).

## Where the content lives

`src/shared/` and `src/data/*.json` are copied from the partner dashboard repo (the source of truth) with `bash _scripts/sync_shared.sh` run from `Partner-Dashboard-PARTNERS`. Do not edit the copies here except:

- `src/data/site_notes.json` — research-only notes and action items (owner, due date, priority), fed from the weekly agenda.

`exemptions.json` (one row per decision letter in `HealthCan-UWO/Legal & Regulatory`) drives the Exemption 56 tracker; `metrics.json` drives the performance report and the per-site utilization table (regenerate with `scatr_full_pull/make_dashboard_metrics.py` after a full pull).

## Building and deploying

Local: `npm ci`, then `npm run dev` or `npm run build` with `.env.local` (see `.env.example`). Deploy: pushing to `main` runs `.github/workflows/deploy.yml`, which builds with the `VITE_RESEARCH_PASSWORD` repository secret and publishes `dist/` to `gh-pages` (custom domain via `public/CNAME`). The secret exists (added 14 Oct 2026); if it is missing the workflow validates the data files and skips the build and publish, so the live site is never replaced by a locked build. `npm run deploy` from a local build remains a fallback; if it refuses to push after an Actions deploy, run `npx gh-pages-clean` and retry.

The password gate is a deterrent for a shared internal link, not per-user authentication; the password is embedded in the built bundle. Rotate it by changing the secret and redeploying.
