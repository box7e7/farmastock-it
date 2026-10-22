# FarmaStock IT: Software Specification

Stock-management-centred pharmacy software for the **Italian market**, designed for single pharmacies up to multi-store chains (a "CVS-style" network: stores plus a central warehouse). It covers **all products**: medicines (Rx/SOP/OTC), parapharmacy, medical devices, cosmetics, veterinary products, galenic raw materials and services.

> Items marked **[VERIFY]** are regulatory points that need confirming against the official text or with a pharmacy consultant before implementation. Online sources were partial or vendor-written.

---

## 1. Context and market

### 1.1 Incumbent Italian software (benchmark)
| Product | Notes |
|---|---|
| **Wingesfar** (CGM, formerly Studiofarma) | Market leader. The vendor claims more than 12,000 pharmacies. Wholesaler orders built in through the FarmaClick protocol. Strong at keeping up with regulation |
| **Winfarm** (Pharmaservice) | Second most cited. Counter sales (banco) and warehouse, data export through an API |
| **Farmagest**, Selesta, Farmakon and others | Smaller share |
| Add-ons | **Carep** (cloud auto-replenishment across wholesalers), e-commerce connectors, robot vendors (Rowa/BD, Apostore, etc.) |

**Gaps we can exploit:** modern web UX, real multi-store / central warehouse management, analytics-driven replenishment (incumbents rely on add-ons like Carep), an open API, cloud deployment, and e-commerce/marketplace sync. A 2026 study found that none of seven gestionali analysed offers repricing for price comparison sites.

### 1.2 What "CVS-style" adds over a single pharmacy
- **Perpetual inventory** (stock updated in real time by every sale, receipt, return and adjustment), with **cycle counting** instead of a single yearly count
- **Automatic replenishment**: min/max levels, reorder point and demand forecasting. Orders are generated automatically and the pharmacist approves them
- **Central warehouse → store** distribution, transfers between stores, and chain-level purchasing
- Central catalogue, pricing, promotions and loyalty programme across stores
- Chain-level KPIs: rotation, stock coverage days, dead stock, stock-outs, expiry losses

---

## 2. Italian regulatory and integration requirements

| # | Area | Requirement | Impact on software |
|---|---|---|---|
| R1 | **Product master / drug database** | Medicines are identified by **AIC/Minsan** code (9 digits). Parapharmacy items have Minsan codes or EAN. Classes **A, C, C-bis, H, SOP, OTC**, plus narcotics tables. Prices: class A set by AIFA; class C prices can only rise in January of odd years. Commercial data come from **Farmadati** or **Codifa** (paid subscriptions), and official data from the **AIFA Banca Dati Farmaco** | Product catalogue fed by a periodic import of the drug database (prices, class, VAT, generic-equivalence/transparency list, withdrawals, supply shortages) |
| R2 | **Traceability: Data Matrix (FMD)** | Italy is moving from the bollino ottico (sticker) to the GS1 **Data Matrix** (product code, lot, expiry, serial number). The stabilisation period runs until **8 Feb 2027** [VERIFY exact day]. Packs with the old sticker can still be sold until they expire | Scanner must read 1D barcodes, the bollino and 2D Data Matrix codes. Parse GS1 Application Identifiers (01/21/10/17). Store **lot and expiry for every receipt and sale**. Prepare for serial verification/decommissioning through the national hub [VERIFY whether pharmacy-level decommissioning applies in Italy] |
| R3 | **Electronic prescriptions (ricetta dematerializzata)** | The pharmacy retrieves the prescription with the **NRE** (electronic prescription number) and the patient's tax code (codice fiscale) through the **Sistema TS**. It sends the dispensing data, including pack identifiers, in real time so the prescription is marked "erogata" | Integration with the regional prescription service (SAC/SAR) through Sistema TS web services. Handles **regional patient co-payments (ticket)**, exemptions, and the reference price for generics (the patient pays the difference) |
| R4 | **DPC (distribuzione per conto)** | Some medicines are owned by the regional health authority (ASL/region) and the pharmacy dispenses them on its behalf | **Separate stock ownership** (`owner = ASL`). These items are excluded from the pharmacy's valuation, have their own orders and receipts through the regional DPC platform, and their own reporting |
| R5 | **Monthly SSN billing (DCR)** | Monthly summary of prescriptions dispensed under the national health service (SSN), sent to the ASL for reimbursement | Monthly closing per ASL, plus a reconciliation report |
| R6 | **Narcotics register (registro stupefacenti)** | DPR 309/90 and **DM 11 May 2010** (computerised register) [VERIFY full requirements]. Entries and exits per substance and table, records that cannot be altered, closure, numbered printing, authorised staff only | Dedicated module: append-only ledger, corrections only through counter-entries with a reason, digital-signature or strong-auth hooks, periodic closure, print or PDF export, annual count with variance |
| R7 | **Sales receipts (corrispettivi) and fiscal till** | Every sale goes through a **Registratore Telematico (RT)** that sends daily totals to the tax agency (Agenzia delle Entrate). A "**scontrino parlante**" (receipt showing the patient's tax code and "farmaco/medicinale") is needed for the medical-expense tax deduction. POS payment terminal must be linked to the RT from 2026 [VERIFY] | **We do not build the fiscal device.** We drive certified RT printers (Epson, RCH, Custom…) through their protocols. Lines are tagged by deduction type |
| R8 | **Health-expense data (Sistema TS / 730)** | Pharmacies send each expense document to Sistema TS (web service). Each record has the patient tax code, expense type (FC, TK, etc.) and amounts. Patients can opt out [VERIFY current deadline: monthly] | Automatic submission queue with retries, acknowledgements and an error dashboard |
| R9 | **VAT** | Medicines are usually **10 %**, most other goods **22 %**. Some devices and other items use 4 %, 5 % or 10 % [VERIFY per category] | VAT taken per item from the drug database, with overrides allowed |
| R10 | **E-invoicing (SdI)** | B2B invoices go through SdI in **FatturaPA XML**. Supplier invoices and delivery notes (DDT) from wholesalers arrive as electronic files. Invoices to private individuals containing health data are restricted [VERIFY ban status] | Generate and receive XML through an SdI intermediary. **Automatic stock receipt from the wholesaler's electronic DDT or invoice** |
| R11 | **Recalls / withdrawals** | AIFA and the regions issue AIC revocations and **lot recalls**. Class I recalls are urgent (24 h) | Recall module: import the notice, match it against lots in stock, **block those lots at the till**, create a quarantine and return task, keep an audit trail |
| R12 | **Expired drugs and returns** | Returns to wholesalers. Expired medicines go to the Assinde/regional disposal and reimbursement scheme [VERIFY] | Expiry-return workflow, a quarantine location, and destruction reports |
| R13 | **Galenic preparations** | Magistral/official preparations, priced with the Tariffa Nazionale. Raw materials are traced by lot. NBP good practice | Optional module: recipes (bill of materials), lot consumption, preparation register and labels |
| R14 | **Veterinary** | Electronic veterinary prescription (**REV**) through Vetinfo | Integration in phase 3 |
| R15 | **Privacy (GDPR)** | Health data is a special category of personal data | Encryption, role-based access, access audit logs, retention rules, data protection impact assessment (DPIA), hosting in the EU |

---

## 3. Functional specification

### 3.1 Product master (catalogue)
- Product types: medicine, parapharmacy, medical device, cosmetic, food/supplement, veterinary, galenic raw material, service
- Codes: AIC/Minsan, EAN/GTIN, internal SKU, multiple barcodes per product, Data Matrix product code
- Attributes: class (A/C/H/SOP/OTC), Rx requirement, narcotics table, DPC flag, cold-chain flag (2–8 °C), VAT, ATC code, active ingredient, manufacturer, pack size, generic-equivalence group (transparency list) for substitution
- Prices: public price (from the database), purchase price per supplier, **average cost (CMP)**, chain list price, store override, promotions
- Import from Farmadati or Codifa, scheduled daily or weekly, with a change log (price changes, new codes, withdrawals, **shortages**)
- Category tree for the shop floor (CVS-style: OTC → pain relief → …) and planogram location

### 3.2 Locations and stock structure
- Organisation → **stores** and **central warehouse(s)**
- Each site has **locations**: shelf/aisle, drawers, **robot**, fridge, narcotics safe, quarantine, returns, and DPC
- Stock is tracked per **product × location × lot × expiry**, with an owner of either PHARMACY or ASL (for DPC)
- Optional serial-number tracking (Data Matrix)

### 3.3 Perpetual inventory and movements
Movement types: purchase receipt, sale, Rx dispensing, DPC dispensing, customer return, return to supplier, transfer out/in, adjustment (+/-), breakage, expiry write-off, recall quarantine, galenic consumption/production, and inventory count variance.

Rules:
- **FEFO** picking suggestion (first expiry, first out). Cashiers are warned when they scan a lot that is not the oldest
- Negative stock allowed only as a configurable soft warning, because pharmacies sell products that have not yet been receipted
- Every movement is immutable, timestamped and attributed to a user. Stock levels are derived from the movements, with a cached balance

### 3.4 Purchasing and replenishment
- Suppliers: wholesalers (Unico, Comifar, Alliance, CEF, …), manufacturers (direct orders), the central warehouse, and the DPC platform
- **Replenishment engine:**
  - Per product per store: min, max, reorder point, safety stock, lead time and pack multiple
  - Policies: min/max, days of cover, and forecast (moving average plus seasonality, e.g. flu season and allergy season)
  - Proposal **split by supplier** according to price, availability and supplier priority
  - Several order runs per day, because Italian wholesalers deliver 2–3 times a day
  - The pharmacist reviews and approves the proposal before it is sent
- Sending orders: an adapter for the **FarmaClick protocol** (real-time availability check and order), with email, CSV or portal as fallback. "Mancanti" are shortages reported by the wholesaler, and they automatically move to the next wholesaler
- **Receiving:** import the wholesaler's electronic DDT or invoice, match it to the order, scan Data Matrix codes to capture lot and expiry, record variances (missing, extra, damaged), update average cost, and print labels
- Supplier invoice reconciliation (SdI XML) against receipts, and tracking of supplier discounts and bonuses
- Chain mode: stores order from the central warehouse, the central warehouse orders from suppliers, and transfer documents move stock between them

### 3.5 Counter / POS (banco)
- Fast scanning (1D, bollino and Data Matrix), product search by name, active ingredient or AIC
- Sale types: free sale, **SSN prescription** (NRE retrieval, co-payment, generic substitution with difference paid by the patient), **DPC**, ricetta bianca, veterinary prescription (REV), deferred sale (product ordered for later collection)
- Patient tax code (from the health card scan) for the scontrino parlante
- Payments: cash, card (with the POS-RT link), mixed, vouchers, loyalty points
- Fiscal printer driver (RT), daily close, and returns or voids
- Rx alerts: prescription required, narcotics (writes automatically to the register), cold chain, recalled lot (**blocked**)
- Offline mode for the till: sales are queued locally and synced later. RT printing is still done locally

### 3.6 Inventory control
- **Cycle counts** generated by ABC class (A items every month, B every quarter, C every year), by location, or by exception (negative stock, high-value items, narcotics)
- Blind counts on handheld or mobile device, a variance approval workflow, and adjustment movements
- Annual full inventory with valuation (average cost, last cost), plus the closing report for the accountant

### 3.7 Expiry, recalls and returns
- Expiry dashboard: expired, expiring within 30/60/90/180 days, and value at risk
- Automatic **return proposals** to suppliers within their return window. Products close to expiry can be marked down or transferred to another store
- Recall: import or enter the notice (AIC plus lots), find the affected stock across every store, block it at the till, generate pick lists, record what was returned, and close the recall with evidence

### 3.8 Narcotics register
- Medicines flagged by narcotics table (Tabella Medicinali, sections A–E)
- Automatic entries from receipts (with order voucher references) and dispensing (prescription data, patient/doctor references as required)
- Append-only ledger per substance, page and period closure, PDF printing, and corrections by counter-entry only
- Count vs. register comparison, plus a report for inspection by the ASL or NAS (health police)

### 3.9 Robot and automation integration
- **WWKS2** protocol (the de facto open standard for pharmacy robots: Rowa/BD, Apostore, Mach4, …): stock info, input (load), output (dispense to counter), task status
- Labels and shelf-edge price labels, electronic shelf labels (ESL) optional

### 3.10 Customers and loyalty (CVS-style)
- Customer profile with consent management (GDPR): tax code, family members, purchase history, deferred orders
- Loyalty card, points and coupons, chain-wide promotions (3x2, percentage off, by category or brand)
- Notifications (SMS, email, WhatsApp) when an order is ready or a prescription needs refilling (opt-in)

### 3.11 Reporting and analytics
- Stock value per store, location and class. Rotation (turnover), days of cover, dead stock, overstock, stock-out rate, fill rate per wholesaler
- Sales and margin by category, brand and store. Effect of generic substitution
- Expiry losses, recall effect, inventory accuracy (variance rate)
- Regulatory outputs: DCR summary, Sistema TS submission status, narcotics register, VAT summary
- Exports to Excel or CSV, plus an accounting export

### 3.12 Administration
- Multi-tenant (one tenant = one pharmacy or chain), multiple stores
- Roles: Owner (titolare), Director, Pharmacist, Assistant/cashier, Warehouse clerk, Central buyer, Accountant (read-only), plus custom roles
- Permissions per module and action, separated by store
- Full audit log, mandatory for sensitive actions (narcotics, price changes, adjustments, voids)
- Settings: store data (ASL code, regional code, VAT number), RT devices, wholesaler accounts, scheduler

---

## 4. Non-functional requirements
| Area | Requirement |
|---|---|
| Performance | Barcode scan → line added in under 200 ms. Replenishment proposal for 15k SKUs in under 30 s |
| Availability | Central system 99.5 %. **Store POS keeps working offline** for at least 24 h |
| Scale | Up to 200 stores, 50k SKUs, 5M movements per year per chain |
| Security | Single sign-on and two-factor authentication for privileged roles, TLS everywhere, encryption at rest, separation of health data, OWASP ASVS L2 |
| Compliance | GDPR (DPIA, records of processing activities, retention), data hosted in the EU or Italy, fiscal documents kept 10 years |
| Localization | Italian UI first (English second). Dates, € formatting and comma decimals per it-IT |
| Hardware | 2D scanners (HID keyboard emulation), RT printers, label printers (ZPL), WWKS2 robots, Android handhelds for counts and receiving, fridge temperature sensors (optional) |
| Integrability | Public REST API plus webhooks, and an import/export toolkit for migrating from Wingesfar/Winfarm (CSV) |

---

## 5. Architecture (proposed)

```
                ┌──────────── Cloud (EU) ─────────────────────────────┐
  Web back-office│ React (Vite, TS) ─► API (Node/NestJS, TS) ─► PostgreSQL│
  (chain, buyers)│                     │        ▲                       │
                 │                     ▼        │                       │
                 │          Job queue (BullMQ/Redis)                     │
                 │   ┌────────────┬────────────┬──────────┬──────────┐  │
                 │   │DrugDB sync │Wholesaler  │Sistema TS│SdI       │  │
                 │   │(Farmadati) │(FarmaClick)│(730/NRE) │intermed. │  │
                 │   └────────────┴────────────┴──────────┴──────────┘  │
                 └──────────────────────▲──────────────────────────────┘
                                        │ sync (HTTPS, outbox/inbox)
              ┌──────── Store (each pharmacy) ─────────────────────┐
              │ Store Agent (Node service, local SQLite cache)      │
              │   ├─ POS UI (PWA, offline queue)                    │
              │   ├─ RT fiscal printer driver (local network)       │
              │   ├─ Robot WWKS2 gateway (TCP)                      │
              │   └─ Scanners / label printers                      │
              └─────────────────────────────────────────────────────┘
```

- **Modular monolith** on the backend (one deployable, with modules split along domain boundaries: catalogue, inventory, purchasing, sales, compliance, integration), so modules can be split out later
- **Event-sourced stock ledger** (movements table) plus a projected balance table
- **Store Agent**: needed for local hardware (RT printer, robot) and for offline operation. A browser alone cannot reliably talk to these devices
- Each external system sits behind an **integration adapter interface**, so providers can be swapped and mocks used in tests

### Core data model (excerpt)
`Tenant, Store, Location, User, Role` ·
`Product, ProductCode, PriceList, Price, Promotion, EquivalenceGroup` ·
`StockLot (product, lot, expiry, serial?, owner)`, `StockBalance (lot × location)`, `StockMovement` ·
`Supplier, PurchaseOrder(+Line), Receipt(+Line), SupplierInvoice, ReturnToSupplier` ·
`Sale(+Line, Payment)`, `Prescription (NRE, type SSN/DPC/bianca/REV)`, `FiscalReceipt` ·
`ReplenishmentRule, ReplenishmentProposal` · `CountSession, CountLine` ·
`Recall, RecallLot, RecallTask` · `NarcoticsRegisterEntry` · `TsSubmission` · `AuditLog`

---

## 6. Out of scope for v1 (explicitly)
Building our own fiscal RT firmware, building our own drug database (licensed instead), full accounting/payroll, telemedicine and "farmacia dei servizi" booking (phase 3), and an e-commerce storefront (integrations only).

## 7. Open questions for the business
1. Target customer: an independent pharmacy, a chain, or both? Do we have a pilot pharmacy?
2. Stock-only product **alongside** an existing gestionale (faster, much less certification), or a **full replacement** of the gestionale (needs RT, Sistema TS, NRE, DCR)?
3. Drug database provider: Farmadati or Codifa (licence cost and terms)?
4. Which regions first? Co-payments and DPC differ by region.
5. Robot brands present at the pilot sites?

## Sources
- [CGM Wingesfar](https://www.cgm.com/ita_it/prodotti/farmacie/soluzioni-software/wingesfar.html) · [FarmaciaVirtuale: survey of gestionali](https://farmaciavirtuale.it/gestionale-farmacia-qual-e-il-migliore/) · [FarmaciaVirtuale: list of gestionali](https://farmaciavirtuale.it/software-gestionali-farmacia-elenco-dei-principali-sul-mercato/) · [FarmaBooster: 2026 observatory](https://www.farmabooster.com/osservatorio-gestionali-farmacia) · [Pharmaservice: Winfarm case](https://www.pharmaservice.it/blog/il-gestionale-e-il-nostro-farmacista-trentennale-la-farmacia-san-nullo-racconta-un-anno-con-winfarm/)
- [Quotidiano Sanità: Data Matrix by 8 Feb 2027](https://www.quotidianosanita.it/uncategorized/tracciabilita-dei-farmaci-dal-ministero-le-istruzioni-per-il-data-matrix-entro-l8-febbraio-2027-ladeguamento-dei-sistemi/) · [Farmacista33: Data Matrix for pharmacies](https://www.farmacista33.it/aggiornamento-professionale/33542/farmaci-ministero-aggiorna-le-istruzioni-sul-data-matrix-cosa-cambia-per-le-farmacie.html) · [Pharmaretail: stabilisation period](https://www.pharmaretail.it/news/data-matrix-decreto-istituisce-periodo-stabilizzazione-febbraio-2027/)
- [RGS-MEF: ricetta elettronica via Sistema TS](https://www.rgs.mef.gov.it/VERSIONE-I/attivita_istituzionali/previsione/spesa_sociale/sistema_tessera_sanitaria/ricetta_elettronica_ssn/) · [Sistema TS: dispensers' guidelines](https://sistemats1.sanita.finanze.it/portale/documents/20182/44538/Invio+Telematico+-+Erogatori+-+Testo+delle+linee+guida+%E2%80%93+invio+ricette.pdf/86836607-7d21-2ee6-ea94-878be347975f) · [DM 2 Nov 2011](https://www.regione.sardegna.it/documenti/1_274_20150402115829.pdf) · [Alice Pharmacist: ricetta dematerializzata](https://www.alicepharmacist.it/blog/ricetta-elettronica-dematerializzata)
- [Spese sanitarie web service spec (TS)](https://www.alfadocs.com/hubfs/730%20Spese%20Sanitarie%20-%20WS%20Sincrono%20-%20Invio%20dati%20di%20spesa%20%20sanitaria%2020_12_2020.pdf) · [Altroconsumo: receipts and 730](https://www.altroconsumo.it/soldi/730/news/scontrini-farmaci-730-fascicolo-sanitario)
- [Regione ER: computerised narcotics register (DM 11/05/2010)](https://poloarchivistico.regione.emilia-romagna.it/conservazione/documentazione/modelli-per-la-realizzazione-dei-sip/documenti/sanitari/registroinformaticodellesostanzestupefacentipsicotrope_v1-0.pdf/@@download/file) · [Example pharmacy procedure](https://www.farmagalenica.it/wp-content/uploads/2018/10/Procedure-Registro-Elettronico-Farmacia-Dr.-Ternelli.pdf)
- [AIFA Banca Dati Farmaco](https://www.aifa.gov.it/en/-/e-online-sul-sito-dell-aifa-la-prima-banca-dati-completa-dei-farmaci-in-italia) · [AIFA: class C price updates](https://www.aifa.gov.it/-/aggiornamento-prezzi-dei-farmaci-classificati-in-fascia-c-con-ricetta-1) · [Regione ER: Farmadati as source](https://salute.regione.emilia-romagna.it/siseps/applicazioni/farmarer/files/presentazione-16122020.pdf)
- [FarmaClick protocol presentation](https://www.farmaclick.it/file/s/FARMACLICK/f/Pagine/PresentazioneFarmaclickCosmofarma2010.pdf) · [Carep auto-replenishment](https://www.clubsalute.it/hubfs/Carep%20CS%20per%20convenzioni.pdf)
- [AIFA quality-defect procedures (UCQP)](https://www.aifa.gov.it/documents/20142/3513833/Procedimenti_UCQP_maggio-2026.pdf) · [Example lot recall (Valsartan)](https://regione.lazio.it/sites/default/files/documentazione-farmaci/Ritiro_VALSARTAN_EG_sottoposti_a_ritiro_nota_AIFA_467524_del_30.7.2018.pdf)
- [ComputerTalk: perpetual inventory](https://www.computertalk.com/five-ways-perpetual-inventory-managing-boosts-pharmacy/) · [SureCost Inventory Manager](https://www.surecost.com/hubfs/Marketing/Content%20Assets/Overviews/SureCost_InventoryManagerOverview.pdf?hsLang=en)
