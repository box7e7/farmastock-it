# FarmaStock IT: Implementation Plan

Companion to [SPECS.md](SPECS.md). Strategy: **ship the stock-management core first** so it can run alongside an existing gestionale (Wingesfar/Winfarm) through import and sync, then add the regulated counter-side integrations to become a full replacement.

## 1. Delivery strategy

| Track | Why |
|---|---|
| **A. Stock core (no certification needed)** | Fastest value: perpetual inventory, replenishment, expiry, recalls, multi-store. Sells to chains that keep their existing gestionale |
| **B. Regulated integrations** | Sistema TS, NRE, RT fiscal printers, SdI, DPC and the narcotics register. These need accreditation, test environments and regional differences, so they start early in parallel because their lead time is long |

## 2. Phases

### Phase 0: Foundations (weeks 1–3)
- Monorepo (`apps/api`, `apps/web`, `apps/store-agent`, `packages/shared`), CI, linting, test setup
- Stack: TypeScript everywhere. NestJS + PostgreSQL + Prisma for the API, React + Vite + TanStack Query + Tailwind for the web app, BullMQ/Redis for jobs
- Auth (OIDC-ready, two-factor for privileged roles), tenant/store/role model, audit log, Italian/English i18n
- Docker Compose for local development (Postgres, Redis, API, web, mock adapters)
- **Exit criterion:** a user logs in, creates a chain with two stores, and the audit log records it

### Phase 1: Catalogue and stock ledger (weeks 4–8)
- Product master with multiple codes, classes, VAT, flags (Rx, narcotics, DPC, cold chain)
- **Drug database import** adapter (Farmadati/Codifa file format) with a mock dataset, a diff and a change log
- Locations, lots and expiry, owner (pharmacy or ASL), **movement ledger** with balance projection
- **GS1 Data Matrix / bollino / EAN parser** (shared package with unit tests)
- Manual receipts, adjustments, transfers, and a stock enquiry screen
- **Exit criterion:** importing 20k products and posting 100k movements gives correct balances per lot and location (property-based tests)

### Phase 2: Purchasing and replenishment (weeks 9–14)
- Suppliers, purchase orders, receiving with scanning, variance handling, average-cost update
- **Electronic DDT/invoice import** (FatturaPA XML) → automatic receipt matching
- Replenishment engine: min/max, days of cover, moving-average forecast, supplier split, approval UI
- Wholesaler adapter interface. Implement **FarmaClick** if the spec is obtainable from the partner; otherwise use CSV/email ordering. "Mancanti" handling
- Central warehouse → store ordering and transfers
- **Exit criterion:** an overnight proposal for one store matches the pharmacist's manual order to within ±10 % on the pilot data

### Phase 3: Inventory control, expiry and recalls (weeks 15–18)
- Cycle counts (ABC), mobile/handheld count PWA, blind count, variance approval
- Expiry dashboard, return-to-supplier workflow, quarantine
- Recall module: notice entry/import, cross-store lot search, block flag, tasks, closure report
- Analytics v1: stock value, rotation, days of cover, dead stock, stock-outs, expiry losses
- **Exit criterion:** a simulated Class I recall is traced and blocked in every store within 15 minutes

### 🚩 Milestone M1 (≈ month 4–5): Pilot "Stock Companion"
Deploy at **one pilot pharmacy or chain** next to its existing gestionale. Sales come in from the gestionale through a daily CSV/API export. Measure stock accuracy, reduction in stock-outs and expiry losses.

### Phase 4: Store Agent and counter (weeks 19–26)
- Store Agent (Node service with SQLite): sync outbox/inbox, offline queue, device gateway
- POS PWA: scanning, search, free sale, payments, returns, deferred orders, recalled-lot block, FEFO hints
- **RT fiscal printer drivers** (start with Epson FP and RCH protocols), daily closure, scontrino parlante with tax code
- Loyalty card and promotions engine (basic)
- **Exit criterion:** 8 hours of offline sales at the pilot sync with no loss, and the fiscal totals match the RT

### Phase 5: SSN, Sistema TS and compliance (weeks 20–34, started early in parallel)
- **Sistema TS** onboarding: test credentials, health-expense submission (730), acknowledgements and retries
- **Electronic prescription (NRE)**: retrieve and dispense through SAC/SAR, generic substitution against the transparency list, regional co-payment rules (first region only)
- **DPC** flow for the first region, with ASL-owned stock
- **DCR** monthly summary
- **Narcotics register** (DM 11/05/2010): append-only ledger, closure, printing. Validation with a consultant and an ASL inspector
- SdI intermediary integration for outgoing invoices
- GDPR package: DPIA, records of processing, retention jobs, export/erase tools
- **Exit criterion:** certification or acceptance in the official TS test environment, and the pilot runs a full month-end closing

### Phase 6: Automation and scale (weeks 35–44)
- **WWKS2 robot gateway** (test with the robot simulator, then a real Rowa/BD unit)
- Data Matrix serial handling (verify/decommission) once the national rules are final, before **Feb 2027**
- Advanced forecasting (seasonality, flu and allergy seasons, promotions), chain-level buying
- Public REST API, webhooks, and an e-commerce/marketplace stock sync
- Migration toolkit from Wingesfar/Winfarm exports
- Load test at 200 stores, security pen-test, ISO 27001-style controls

### 🚩 Milestone M2 (≈ month 10–11): Full replacement gestionale for the first region

### Phase 7 (later)
Galenic preparations, veterinary REV, more regions, farmacia dei servizi (bookings, vaccinations), electronic shelf labels, temperature monitoring, BI dashboards.

## 3. Team (suggested)
| Role | FTE |
|---|---|
| Product owner with pharmacy background (or a pharmacist consultant) | 1 (part-time consultant acceptable) |
| Tech lead / architect | 1 |
| Backend engineers (TS) | 2–3 |
| Frontend engineer | 1–2 |
| Integration engineer (TS, SdI, RT, robots) | 1 |
| QA / test automation | 1 |
| DevOps (part-time) | 0.5 |
| Regulatory / privacy advisor (DPO) | external |

## 4. Key risks and mitigations
| Risk | Mitigation |
|---|---|
| Sistema TS / NRE accreditation and regional differences take long | Start onboarding in phase 0. Go region by region. Track A has value without it |
| Drug database licence cost and format | Negotiate early. Abstract the adapter and run on mock data until signed |
| Wholesaler protocol access (FarmaClick) | Partner with one wholesaler. Fall back to CSV/email |
| Fiscal printer variety | Support 2 brands first. The device-driver interface sits in the Store Agent |
| Data Matrix rules still changing up to Feb 2027 | Parser and serial model in place from phase 1. Plug in the hub integration later |
| Displacing a mature incumbent | Position as a companion first (M1), then migrate with the toolkit |
| Health data (GDPR) breach | Least privilege, encryption, audit, pen-test, EU hosting, DPIA before the pilot |

## 5. Testing strategy
- Unit tests for the domain (ledger, average cost, FEFO, replenishment maths, GS1 parser, VAT/co-payment rules)
- Contract tests per adapter against recorded or mock responses (TS, SdI, FarmaClick, RT, WWKS2)
- End-to-end tests (Playwright) for the main flows: receive → sell → count → recall
- Offline/sync chaos tests for the Store Agent
- Pilot UAT with pharmacists, and regulatory checklist reviews per module

## 6. Immediate next steps
1. Answer the open questions in SPECS.md §7 (especially **companion vs full replacement** and the **pilot pharmacy**)
2. Request specs and test access: Sistema TS (erogatori), Farmadati/Codifa sample feed, FarmaClick, an RT printer SDK
3. Book a pharmacy consultant to validate the **[VERIFY]** items
4. Start Phase 0 locally (I can scaffold the monorepo and the Phase 1 stock ledger next)
