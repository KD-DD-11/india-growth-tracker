# Sources: what is official, what is not, and where the live trackers are

Goal: every number on the page comes from an Indian government source, pulled from an official
live feed where one exists. This file is the audit. `npm run check:data` prints the figures that are
not yet from a government source (the `sourceType` field on each figure: `government`, `multilateral`,
`unknown`).

Audit date: 8 September 2026. Nothing below changes a number on the page; it says where each one
should come from and what it would take to switch.

## Official machine-readable feeds that actually work

| Feed | What it has | How to reach it | Verified |
|---|---|---|---|
| **MoSPI eSankhyiki API** — `https://api.mospi.gov.in/` | National Accounts (GDP levels and growth, quarterly and annual, current and constant prices; GVA by industry; consumption, investment, trade; a Back series from 1950-51 at 2011-12 prices), PLFS, CPI, WPI, IIP, ASI, HCES, energy, gender and time-use statistics. Docs per dataset at `https://api.mospi.gov.in/nas`, `/plfs`, `/cpi`, … (Swagger). | Plain GET, JSON, paged 10 rows at a time (`page=`). **Works server-side without a key. Browser calls are rejected ("CORS blocked")**, so the page cannot call it live; `npm run refresh:mospi` pulls it into `src/data/mospi.json` and the monthly workflow keeps that fresh. The server uses legacy TLS renegotiation; the script handles that. | Yes — pulled 8 Sep 2026 |
| **data.gov.in (Open Government Data)** — `https://api.data.gov.in/resource/<id>?api-key=…` | Thousands of ministry datasets, including NPCI UPI monthly statistics, MoRTH road statistics, TRAI telecom subscribers, RBI series. | JSON with a free personal API key (register at data.gov.in). The shared sample key is rate-limited. Cross-origin behaviour not verified. | Reachable; needs your key |
| **World Bank Indicators API** | The four series the page uses today (not Indian government) | Public JSON, CORS enabled, used live by the page | Yes |

Checked and **not** usable as a feed: RBI DBIE (`data.rbi.org.in`, blocks scripted access), NPCI statistics
pages (HTML/PDF, 403 to scripts), Jal Jeevan Mission dashboard (HTML only), PIB (press releases; RSS
feed exists for alerts, not numbers).

## Figure by figure

Legend: **Gov** = Indian government source already. **Swap** = official source exists; needs a change
to copy or units, so it is a deliberate edit, not a restructure. **Verify** = fill in a source.

| Where on the page | Figure | Current source | Status | Official source / live tracker |
|---|---|---|---|---|
| Compare periods | GDP from 1950-51, ₹ crore, real (2011-12 prices) and nominal | MoSPI NAS Back series + Current series (latest revision per year), `src/data/gdp-long-run.json` | Gov | Refreshed monthly by `refresh:mospi`. Annual rows carry revision labels; quarterly rows do not. |
| Hero chart | GDP, current US$ (1991–) | World Bank `NY.GDP.MKTP.CD`, live | Swap | MoSPI NAS indicator 5 (GDP, ₹ crore, current and constant prices; annual back to 2011-12 in the current series, older in the "Back" series) via `refresh:mospi`. Showing it in ₹ instead of US$ changes the caption and axis. For a US$ series the official route is RBI's reference exchange rate applied to MoSPI GDP. |
| Pulse + Economy tiles | 7.8% real growth, ₹81.4 L cr, 10.3% nominal, Q1 FY27 | MoSPI | Gov | MoSPI NAS indicator 22 (growth) and 5 (levels), quarterly — now in `src/data/mospi.json` |
| Economy tile | "4th largest economy by nominal GDP" | IMF WEO | Swap | No Indian government body publishes a country ranking. Keep IMF (a government-member body) or drop the tile. |
| Economy chart | Real GDP growth by quarter | MoSPI | Gov | MoSPI NAS indicator 22, quarterly, `constant_price`. The API returns several estimate vintages per quarter without labels — pick by hand. Q3 FY26 is present in the official feed (7.7%) and is left `null` on the page on purpose. |
| Economy chart | GDP per person, current US$ | World Bank `NY.GDP.PCAP.CD`, live | Swap | MoSPI per capita net national income / per capita GDP (₹, National Accounts press releases; NAS API has GNI, NDP — check for a per-capita indicator). Same units caveat as GDP. |
| Infra tiles | UPI volume and value, Aug 2026 | NPCI | Gov (NPCI is promoted by RBI and IBA) | NPCI monthly statistics; also on data.gov.in (needs key) |
| Infra tile | National highway km | MoRTH | Gov | MoRTH annual "Basic Road Statistics" / PIB; data.gov.in road datasets |
| Infra tile | Vande Bharat services | Indian Railways | Gov | Ministry of Railways / PIB |
| Infra chart | UPI transactions in August, 2019–2026 | NPCI | Gov | as above |
| Infra chart | Highways 2014 vs 2026 | MoRTH | Gov | as above |
| Then/now | Highways, expressways | MoRTH | Gov | |
| Then/now | Major port capacity | MoPSW | Gov | MoPSW / PIB |
| Then/now | UPI per month | NPCI | Gov | |
| Then/now | Operational airports (74 → 160+) | none recorded | Verify | Ministry of Civil Aviation / AAI via PIB — record the release |
| Then/now | Metro rail km (~250 → 1,000+) | none recorded | Verify | Ministry of Housing and Urban Affairs via PIB — record the release |
| Society tile | 2.3% in extreme poverty (US$2.15/day) | World Bank | Swap | No Indian government series on the $2.15 line. Official alternatives measure something different: NITI Aayog Multidimensional Poverty Index (2023 discussion paper), or MoSPI HCES 2022-23/2023-24 consumption data (via the MoSPI API `/hces`). Changing the tile changes its label. |
| Society tile | Literacy 80.9% | PLFS 2023-24 (MoSPI) | Gov | MoSPI API `/plfs` |
| Society tile | Women in the labour force 41.7% | PLFS 2023-24 | Gov | MoSPI API `/plfs` indicator 1 (LFPR), verified reachable |
| Society tile | Rural households with tap water 80%+ | Jal Jeevan Mission dashboard | Gov | `ejalshakti.gov.in/jjmreport` (HTML dashboard, no JSON feed found) |
| Society chart | Life expectancy at birth | World Bank `SP.DYN.LE00.IN`, live | Swap | Registrar General of India, Sample Registration System (SRS) abridged life tables — PDF releases, not an API. Five-year periods rather than annual points. |
| Society chart | People using the internet, % | World Bank `IT.NET.USER.ZS` (ITU estimates), live | Swap | TRAI quarterly "Indian Telecom Services Performance Indicators" (internet subscribers, not users; PDF/XLSX; also on data.gov.in). Different definition from the ITU series, so the caption changes. |
| Map | Per-capita NSDP by state, 2014-15 and 2023-24 | RBI Handbook of Statistics on Indian States, Table 19, both columns | **Gov, verified 12 Sep 2026** | Read from the published XLSX, see below |

## Map figures: verified 12 September 2026

Both map columns now come from **RBI Handbook of Statistics on Indian States, Table 19 — Per Capita Net
State Domestic Product (Current Prices), base 2011-12**, read from the published spreadsheet
(`rbidocs.rbi.org.in/rdocs/Publications/DOCs/19T_11122025B8CC230E4A34431999B4D6A107707BCA.XLSX`, linked
from the Handbook's annual-publications page). Using one publication for both years keeps the change
ratio like-for-like.

What the check found, replacing figures that had been typed from memory:

- **21 of 33 states had the wrong 2014-15 value.** Worst cases: Goa was carrying its own 2011-12 figure
  (₹2,59,444 instead of ₹2,89,185), West Bengal was out by ₹7,124, Sikkim by ₹10,852.
- **Two of the three states previously flagged `verified` were wrong**: Puducherry by ₹28,085 (19%) and
  Haryana by ₹306. Only Delhi was right. The flag itself was not trustworthy, which is why everything
  was re-read rather than spot-checked.
- **The 2023-24 column was already correct**: all 33 states RBI publishes matched exactly.

Independent corroboration: MoSPI's eSankhyiki NAS API (indicator 25, Per Capita NSDP) agrees with every
imported 2014-15 value, 17 exactly and 16 off by exactly ₹1 through rounding.

Two divergences worth knowing about:

- **Karnataka 2014-15.** NAS indicator 32 reports ₹1,43,902 where RBI Table 19 and NAS indicator 25 both
  report ₹1,30,024. Two sources against one, so the ₹1,30,024 figure is used.
- **2023-24 vintages.** MoSPI's live API carries a newer vintage than the Handbook, differing by up to
  ~8% (Goa ₹5,85,953 vs ₹5,42,341, Uttarakhand ₹2,46,178 vs ₹2,32,457). The Handbook values are kept so
  both years share one vintage. Revisit if you would rather track MoSPI's latest.
- **Gujarat 2023-24** is the single exception: RBI prints "-", so its ₹2,99,860 comes from NAS
  indicator 32 and the state records that in its own `bSource`.

Still not published, by design: **the all-India baseline**. Neither RBI Table 19 nor any NAS indicator
(1-34 checked) carries an All-India per-capita row, and per capita net national income is a different
measure from per capita NSDP anyway. The side panel simply omits the India line until you supply a
figure read off a MoSPI release.

## Recommended order of work

1. Fill in the two missing sources (airports, metro) from the PIB releases you took the numbers from.
2. Source the all-India per-capita baseline from a MoSPI publication, or drop the India comparison.
3. Decide on the four World Bank charts. Two honest options: keep them as clearly-labelled World Bank
   series (they are compiled from MoSPI and RGI data anyway), or replace them with MoSPI ₹ series from
   `src/data/mospi.json` and update the captions. The refresh script already delivers the data for the
   GDP ones.
4. Register for a data.gov.in key if you want UPI/MoRTH/TRAI series refreshed automatically; add the
   resource ids to a puller like `scripts/refresh-mospi.js`.
