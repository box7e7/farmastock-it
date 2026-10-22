# FarmaStock IT: MVP

Stock management for Italian pharmacies and chains (central warehouse plus stores). See [SPECS.md](SPECS.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Run locally (development)
```bash
npm run setup     # install, build the web UI, create the database with demo data
npm start         # http://localhost:47400
```
Dev mode with hot reload: `npm run dev` (web on http://localhost:5173, API on :47400).
Data (SQLite database, `config.json` with a random JWT secret, backups) lives in `api/data/`, or in `FARMASTOCK_DATA_DIR` if set.
Reset demo data: stop the app, delete `api/data/`, then run `npm start` (an empty database is migrated and seeded automatically).

## Portable package (self-contained, no Node.js install needed)
```bash
npm run build          # web UI + bundled server (dist/app)
npm run package:win    # release/FarmaStock-<ver>-portable-win-x64.zip
npm run package:local  # same for the current OS (e.g. macOS) for local testing
```
On Windows: unzip, then double-click **`Avvia FarmaStock.bat`**. The browser opens on http://localhost:47400. Data goes in `FarmaStock\data`.
Each push to `main` builds the zip **and tests it on a real Windows machine** (GitHub Actions, `.github/workflows/windows.yml`): fresh start, API smoke test, restart through the `.bat` launcher. The zip is downloadable from the workflow run's *Artifacts*.

## Database changes
Edit `api/prisma/schema.prisma`, then `npm run migration:new -w api -- <name>`. This creates `api/prisma/migrations/NNNN_<name>.sql`. Migrations are applied automatically at startup, after an online backup to `data/backups/`.

## Demo users
| Role | Email | Password |
|---|---|---|
| Admin | admin@farmastock.it | admin123 |
| Pharmacist (Milano) | farmacista@farmastock.it | farma123 |
| Cashier (Milano) | cassa@farmastock.it | cassa123 |
| Warehouse | magazzino@farmastock.it | magazzino123 |

## What the MVP covers
- Multi-site: central warehouse + 2 pharmacies, switch site in the header
- Catalogue: AIC/Minsan and EAN codes, classes A/C/H/SOP/OTC, Rx, narcotics, cold chain, DPC, VAT 4/5/10/22 %
- Perpetual inventory: append-only movement ledger with balances per lot/expiry/site and weighted average cost (CMP)
- Scanning: GS1 Data Matrix (product code, lot, expiry, serial), bollino `A`+AIC, EAN
- Receiving: free receipt or receipt against an order, with lot and expiry captured from the Data Matrix
- Automatic replenishment: min/max, 30-day demand, days of cover, open orders, lead time, pack multiples. Orders are split by supplier
- Counter: FEFO allocation, recalled or expired lots blocked, prescription confirmation, narcotics need the patient's tax code, DPC dispensed at €0, patient tax code for the scontrino parlante
- Expiry: 30/60/90/180-day buckets, return to supplier, write-off for destruction
- AIFA recalls: lots blocked across the whole network, affected stock per site, closure with return
- Narcotics register: read-only entry/exit view over the ledger
- Cycle counts and transfers between sites

## Not in the MVP (see the plan)
Fiscal printer (RT) and Sistema TS submission, NRE/SSN prescriptions and DPC with the region, wholesaler ordering via FarmaClick (orders are only marked as "sent"), SdI e-invoicing, Farmadati/Codifa import, robots (WWKS2), full DM 11/05/2010 compliance for the narcotics register.

All AIC codes, lots and names are **fictitious demo data**.

## Tests
`npm test`: unit tests for the GS1 parser and replenishment maths.
`npm run smoke`: end-to-end API test against a running server with demo data.
