# FarmaStock IT: MVP

Stock management for Italian pharmacies and chains (central warehouse plus stores). See [SPECS.md](SPECS.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Run locally
```bash
npm run setup     # install, create SQLite DB with demo data, build web
npm start         # http://localhost:4000
```
Dev mode with hot reload: `npm run dev` (web on http://localhost:5173, API on :4000).
Reset demo data: delete `api/prisma/farmastock.db`, then `npm run db:setup -w api`.

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
