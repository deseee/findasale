# 50-State Scraper Data Source Audit
*Completed S701 — all 14 secondhand sale types, not just auctioneers*

---

## Tier 1 — Build Immediately (Free API/CSV, No Login, Machine-Readable)

These states have public datasets covering broad business categories. Scrapers should use full keyword filtering for all 14 sale types — not just auctioneers.

| State | Dataset | URL | Format | Notes |
|-------|---------|-----|--------|-------|
| **Alaska** | DCCED Active Business License CSV | https://gis.data.alaska.gov/datasets/DCCED::alaska-dcced-cbpl-active-business-license-csv-file-download | CSV + ArcGIS JSON API | NAICS codes included — filter 453310, 459510, 522298, 453998, 561990, 453920. Best dataset in the country. |
| **Connecticut** | State Licenses and Credentials | https://data.ct.gov/Business/State-Licenses-and-Credentials/fxib-2xng | Socrata CSV/JSON API | 2M records, 800+ credential types, daily updated. Filter license_type = "Auctioneer" + keyword search. |
| **Delaware** | Business Licenses (Active) | https://data.delaware.gov/api/views/5zy2-grhr/rows.csv?accessType=DOWNLOAD | CSV (Socrata) | In progress — S701. Already built with keyword filter for all 14 types. |
| **Illinois** | IDFPR Professional Licensing | https://data.illinois.gov/resource/pzzh-kp68.csv | Socrata CSV/JSON API | 1.2M+ records. Filter license_type = 'AUCTIONEER'. Chicago Business Licenses: https://data.cityofchicago.org/resource/uupf-x98q.csv |
| **New York** | NYC Secondhand Dealer General | https://data.cityofnewyork.us/Business/Secondhand-Dealer-General-and-Scrap-Metal-Processo/9jmq-ziz9 | Socrata CSV/JSON API | Dedicated secondhand dealer dataset. Also: Active Pawnbroker Licenses dataset at https://data.cityofnewyork.us/Business/Active-Pawnbroker-Licenses/u7z4-p9uq. NYC covers majority of NY market. |
| **Oregon** | Active Businesses ALL | https://data.oregon.gov/api/views/tckn-sxa6/rows.csv?accessType=DOWNLOAD | CSV (Socrata) | Full statewide business registration CSV. Keyword filter on business name. DFR pawnbroker search: https://www4.cbs.state.or.us/exs/all/mylicsearch/ |
| **Pennsylvania** | Registered Businesses by County | https://data.pa.gov/api/views/xvd7-5r2c/rows.csv?accessType=DOWNLOAD | CSV (Socrata) | Full statewide CSV. Keyword filter. PALS for auctioneers: https://www.pals.pa.gov/#!/page/search. Pittsburgh PLI for secondhand: https://pittsburghpa.gov/pli/secondhand-license |
| **Texas** | TDLR All Licenses | https://data.texas.gov/dataset/TDLR-All-Licenses/7358-krk7 | Socrata CSV/JSON API | Filterable by license_type. Auctioneers = "AUC". OCCC for pawnshops separately. TxDMV for salvage dealers. Best structured state. |
| **Virginia** | Business Licenses (data.virginia.gov) + DPOR Regulant Lists | https://data.virginia.gov/dataset/business-licenses | CSV/XLSX + ASCII tab-delimited | Two free sources. DPOR bulk download covers all licensed professions including auctioneers: https://www.dpor.virginia.gov/RegulantLists |
| **Washington** | Business Lookup | https://data.wa.gov/Consumer-Protection/Business-Lookup/4wur-kfnr | Socrata CSV/JSON API | All active WA business licenses + endorsements. DOL data request for auctioneer bulk: https://dol.wa.gov/about/data-services-requests/business-and-profession-data-requests |

---

## Tier 2 — Good Sources, Moderate Build Effort

| State | Dataset | URL | Format | Notes |
|-------|---------|-----|--------|-------|
| **Florida** | DBPR Weekly CSV Bulk Download | http://www.myfloridalicense.com/DBPR/sto/file_download/index.html | CSV (weekly) | Covers all DBPR professions including auctioneers. No login. DOR secondhand dealer registry is NOT public — law enforcement only. |
| **Hawaii** | DCCED Business Registration (Honolulu) | https://data.honolulu.gov/resource/9k54-ztb8.csv | Socrata CSV | Covers Honolulu businesses. DCCA PVL dataset on opendata.hawaii.gov for licensed professions. County-level secondhand/pawn separate. |
| **Iowa** | data.iowa.gov + DIAL license search | https://data.iowa.gov | Socrata + HTML | DIAL for auctioneer licenses: https://dial.iowa.gov/i-need/records. Agricultural auction directory via iowaagriculture.gov. |
| **Louisiana** | OFI Pawnbroker Registry + LALB Auctioneer Search | https://ofi.la.gov/non-depository/pawnbrokers/licensees/ | HTML (scrape) | 144 pawnbroker licensees. LALB: https://www.lalb.org/locate_auctioneer.php. Both require HTML scraping. |
| **Maryland** | Judiciary Business Licenses Online | https://jportal.mdcourts.gov/license/index_disclaimer.jsp | HTML (statewide, 24 jurisdictions) | Covers Auctioneer, Secondhand Dealer, Pawnbroker across all MD counties. DLLR precious metal dealers: https://labor.maryland.gov/pq/ |
| **Mississippi** | Auctioneer Commission Licensee Search | https://www.mac.webapps.ms.gov/PublicView/PublicIndSearch.aspx | HTML | Clean public search. DBCF pawnbroker registry: https://dbcf.ms.gov/consumer-finance/ (confirm if public or NMLS-gated). |
| **Nevada** | Las Vegas Open Data Business Licenses | https://opendata.lasvegasnevada.gov/API-Integration-/Business-Licenses/jv8a-mrfg/data | Socrata JSON API | Covers 70%+ of Nevada population. Filter by license type for secondhand, pawn, auction. |
| **New Jersey** | NJDOBI Pawnbroker Search | https://www-dobi.nj.gov/DOBI_LicSearch/ | HTML | Confirmed public registry. Filter by "Pawnbroker" license type. Consumer Affairs mylicense bulk: https://newjersey.mylicense.com/Verification_Bulk/ |
| **Ohio** | eLicense (auctioneers) + NMLS (pawnbrokers) | https://elicense.ohio.gov/OH_VerifyLicense | HTML | ODA eLicense for auctioneers (ORC 4707). NMLS Consumer Access for pawnbrokers (ORC 4727): https://www.nmlsconsumeraccess.org/ |
| **Oklahoma** | OKDOCC PDF Rosters | https://oklahoma.gov/content/dam/ok/en/okdocc/documents/rosters/4.30.2026.PB-OK.pdf | PDF (monthly) | Pawnbroker + Precious Metals & Gem dealer rosters. URL pattern is date-based. No auctioneers (not state-licensed in OK). |
| **South Carolina** | Consumer Affairs Pawnbroker XLS + LLR Auctioneer Lookup | https://consumer.sc.gov/licensee-lookup | XLS download + HTML | Pawnbroker XLS is direct download — best ready-to-use file in Southeast. Auctioneer: https://verify.llronline.com/LicLookup/Auctioneer/Auctioneer.aspx?div=29 |

---

## Tier 3 — Requires Purchase or Records Request

| State | Path | Cost/Effort |
|-------|------|-------------|
| **Colorado** | data.colorado.gov SOS entity dataset — name keyword filter | Free, name-only filtering |
| **Georgia** | Auctioneer Commission roster purchase via sos.ga.gov | Nominal fee; SOS bulk FTP: paid subscription |
| **Indiana** | PLA licensee list download | Paid; covers auctioneers |
| **Minnesota** | SOS bulk CSV | $30/week; no business type codes |
| **Nebraska** | SOS Corporate Special Request CSV | Free per search; keyword filter needed |
| **Utah** | DCP secondhand dealer registry (pawn.utah.gov) | Public records request to commerce.utah.gov — contact pawnshop@utah.gov |
| **Vermont** | bizfilings.vermont.gov bulk download | Free; keyword filter needed |
| **Wisconsin** | DSPS CLPS auction company bulk list | Paid; 48hr fulfillment |
| **Wyoming** | Banking Division pawnbroker list | Free HTML — small list |
| **West Virginia** | WVDA auctioneer directory | HTML or FOIA; small state |

---

## Tier 4 — City-by-City Only (No Usable State Registry)

No single state registry exists for any of the 14 sale categories. Must scrape individual city/county clerk portals.

| State | Priority Cities | Notes |
|-------|----------------|-------|
| **Alabama** | Birmingham, Huntsville, Mobile, Montgomery | Auctioneer board HTML scrape at auctioneer.alabama.gov/licensee-search/ only state option |
| **Arizona** | Phoenix, Tucson, Mesa, Chandler, Scottsdale, Tempe | No state license for any category; all city-level |
| **Arkansas** | Little Rock, Fort Smith, Fayetteville | Auctioneer directory at Arkansas.lnpweb.com; pawn/secondhand local only |
| **California** | SF (DataSF), LA, San Diego, Sacramento | SF DataSF has Business Locations CSV. CDTFA PRA request for statewide seller permits. No state registry. |
| **Idaho** | Boise, Nampa, Meridian | DOPL for auctioneers; pawn/secondhand local only |
| **Kansas** | Wichita, Kansas City KS, Overland Park | No state registry for any category |
| **Kentucky** | Louisville, Lexington | KBA licensee PDF for auctioneers (auctioneers.ky.gov); pawn local only |
| **Maine** | Portland, Bangor, Lewiston | ALMS Online for auctioneers; pawn local only |
| **Michigan** | Detroit, Grand Rapids, Lansing | No state registry; LARA covers other professions only |
| **Missouri** | Kansas City, St. Louis | County-level auctioneers (114 counties); pawn municipal |
| **Montana** | Billings, Missoula, Great Falls | DLI public portal; thin market |
| **New Hampshire** | Manchester, Nashua, Concord | OPLC auctioneer list; pawn local only |
| **New Mexico** | Albuquerque, Las Cruces | RLD public search + Albuquerque city portal |
| **North Carolina** | Charlotte, Raleigh, Durham, Greensboro | NCALB auctioneer HTML search; pawn local only |
| **North Dakota** | Fargo, Bismarck | SOS data list (paid); FOIA for auctioneer registrants |
| **Rhode Island** | Providence (dominant market) | Providence Open Data Socrata + DBR auctioneer lookup |
| **South Dakota** | Sioux Falls, Rapid City | SOS paid bulk download; pawn municipal |
| **Tennessee** | Nashville, Memphis, Knoxville | verify.tn.gov for auctioneers; pawn county-level |

---

## FOIA / Records Requests to Send Now

These will unlock registries that aren't publicly downloadable:

1. **Delaware** — dsp-prolicense@delaware.gov — "FOIA Request: current licensed pawnbroker list under Title 24 Chapter 23"
2. **Utah** — pawnshop@utah.gov — "Public records request: list of all registered pawnshops and secondhand merchandise dealers under PSMCCTIA"
3. **Massachusetts** — Division of Standards — request full auctioneer licensee CSV
4. **Georgia** — sos.ga.gov/page/licensing-roster-requests-form — purchase Auctioneers Commission roster
5. **Wisconsin** — dspslicenselist.wi.gov — purchase Auction Company credential list

---

## Key NAICS Codes for Filtering

Use these when datasets include NAICS codes:
- **453310 / 459510** — Used merchandise / secondhand stores
- **522298** — Pawnbrokers
- **453998** — Miscellaneous retailers (includes some auction types)
- **561990** — Other support services (auction services)
- **453920** — Antique dealers
- **812990** — Estate sale organizers (often here or 453998)

---

*Generated S701. Research agents covered all 50 states. Priority: build Tier 1 scrapers first — 10 states with free machine-readable APIs covering all 14 sale types.*
