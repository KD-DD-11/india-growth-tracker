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
| Then/now | Operational airports, 74 (2014) → 165 (15 Jul 2026) | PIB backgrounder, Ministry of Civil Aviation | **Gov, verified 12 Sep 2026** | See below |
| Then/now | Metro rail, 248 km (2014) → 1,155+ km (2026) | PIB factsheet, MoHUA content | **Gov, verified 12 Sep 2026** | See below |
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

## Airports and metro: sourced 12 September 2026

Both rows previously carried no source. Each figure below was fetched and read directly.

**Operational airports — 74 (2014) to 165 (as on 15 July 2026).**
PIB backgrounder, *Modified UDAN: Strengthening India's Regional Aviation Network*, 17 July 2026, page 1:
"The number of operational airports increased from 74 in 2014 to 165 as of 15th July 2026."
`static.pib.gov.in/WriteReadData/specificdocs/documents/2026/jul/doc2026717924201.pdf`
Corroborated by the PIB factsheet of 12 August 2026: "Operational airports increased from 74 in 2014 to
165 in July 2026."

*Definition trap, do not repeat it.* The document says only "operational airports" and gives no breakdown.
Do **not** describe the 165 as including heliports and water aerodromes. That wording belongs to a
different and smaller count in the same document — the 95 airports, heliports and water aerodromes on the
UDAN network. The two share an as-on date, which is exactly why they get conflated.

**Metro rail — 248 km (2014) to over 1,155 km (2026).**
PIB factsheet, *India's Infrastructure Transformation: From Connectivity to Capacity*, 12 August 2026:
"Metro network expanded from 248 km in 2014 to over 1,155 km in 2026", with cities rising from 5 to 26.
`pib.gov.in/FactsheetDetails.aspx?ModuleId=16&NoteId=150842&id=150842&reg=48&lang=2`

*Definition caveat.* MoHUA's recent totals include the 55 km Delhi–Meerut RRTS (Namo Bharat), while the
2014 baseline is metro only, because RRTS did not exist then. The government publishes the comparison
that way itself, so the row follows it, but the two endpoints are not quite the same measure. MoHUA's
Annual Report 2025-26 gives about 1,096 km as on 15 January 2026 on the same basis, and a Lok Sabha answer
of 18 December 2025 gives 1,083 km across 25 cities — the series is consistent, it simply grows.

The "Then and now" table now prints `source · asOf` under each row and links the two rows that record the
document they came from. Before this it printed only a date, so even the rows that had a source did not
show it.

## Every remaining figure: verified 13 September 2026

After the map and the airports and metro rows, every other hand-entered figure on the page was checked
against the document it cites. Each was read directly from the source, then independently re-fetched by a
second reader before anything changed. NPCI's figures were additionally read first-hand from NPCI's own
monthly statistics feed. Each figure now records its `url` and a `verified` date in the data files.

**Corrected**

| Figure | Was | Now | Why |
|---|---|---|---|
| Quarterly real GDP growth chart | 6.5, 5.6, 6.4, 7.4, 6.9, 8.2, —, 8.6, 7.8 | 7.5, 7.3, 7.4, 6.6, 6.9, 8.1, —, 8.6, 7.8 | Captioned "at 2022–23 prices", but three bars were 2011-12-base figures and two matched neither base. Now all from Fig. 1 of the MoSPI press note of 31 Aug 2026. Q3 FY26 stays blank by choice. |
| Headline text | "…and the fastest quarter in two years" | phrase removed | False on MoSPI's own series: Q2 FY26 (8.1%) and Q4 FY26 (8.6%) both exceed 7.8%. It also contradicted the chart directly below it. |
| UPI, August 2025 | 19.63 bn | 20.01 bn | 19.63 bn is **September** 2025. NPCI: August 2025 = 20,008.31 Mn. |
| UPI, August 2021 and 2023 | 3.55, 10.58 | 3.56, 10.59 | Mis-rounded from NPCI's 3,555.55 Mn and 10,586.02 Mn. |
| Expressways, Feb 2026 | 3,052 km (33×) | 3,644 km (39×) | 3,052 km is the December 2025 figure, labelled Feb 2026. Lok Sabha Q6318 and Rajya Sabha Q4244 (both April 2026) give 3,644 km as of February 2026, same definition. |
| Major port capacity, 2026 | 1,726 MMTPA | 1,728 MMTPA | 1,726 matched no source. PIB factsheet, 12 Aug 2026: 873 to 1,728 MMTPA. |
| Rural tap water | "80%+", 2025, from 17% in 2019 | 82.4%, 13 Sep 2026, from 16.7% in Aug 2019 | Precise figure from the Jal Jeevan Mission live dashboard: 15,94,39,373 of 19,35,51,364 households. |
| Vande Bharat | "Indian Railways · early 2026" | "Ministry of Railways via PIB · 12 Aug 2026" | 164 was right — 162 Chair Car plus 2 Sleeper services — but the date and source were vague. |

**Confirmed correct, unchanged:** 7.8% real growth, ₹81.4 lakh crore real GDP (officially ₹81.36), 10.3%
nominal, 11.9% investment, 7.1% consumption, the RBI's 7.0% projection, UPI volume 24.5 bn and value
₹29.8 lakh crore for August 2026, UPI August volumes for 2019, 2020, 2022, 2024 and 2026, national
highways 91,287 to 1,46,572 km (+61%), the 93 km expressway baseline, 873 MMTPA port baseline, literacy
80.9%, female labour force participation 41.7% (from 23.3%), and the 2.3% and 16.2% World Bank poverty
figures.

**A mistake this round nearly made.** The August 2026 UPI *value* could not be found in any PIB document,
which carry only July (₹29.88 lakh crore). That looked like evidence the stored ₹29.8 lakh crore was July's
figure mislabelled, and the fix drafted was to relabel it. Reading NPCI directly showed August 2026 is
₹29,82,355.95 crore — the stored figure was right. Absence from a secondary source is not evidence against
a figure. Go to the source the figure actually cites.

**Worth knowing about the sources**

- NPCI publishes its monthly UPI table as JSON, which is the most direct official feed for these figures.
  It sits behind bot protection: a real browser clears it on a normal page load, but scripted requests get
  a 403, so it cannot yet be pulled by the monthly refresh workflow.
- MoPSW's own Annual Report carries a *different* port-capacity series from PIB (800.52 MT in 2013-14,
  1,717.96 MT provisional to December 2025). The row uses PIB's pair so both endpoints share one series.
- The Economic Survey's 5,364 km of high-speed corridors adds State HSCs to the national figure. Do not set
  it against the 93 km national baseline.

## Recommended order of work

1. Source the all-India per-capita baseline from a MoSPI publication, or drop the India comparison.
3. Decide on the four World Bank charts. Two honest options: keep them as clearly-labelled World Bank
   series (they are compiled from MoSPI and RGI data anyway), or replace them with MoSPI ₹ series from
   `src/data/mospi.json` and update the captions. The refresh script already delivers the data for the
   GDP ones.
4. Register for a data.gov.in key if you want UPI/MoRTH/TRAI series refreshed automatically; add the
   resource ids to a puller like `scripts/refresh-mospi.js`.
