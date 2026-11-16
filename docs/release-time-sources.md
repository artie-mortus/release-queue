# Regional game unlock-time sources

Checked November 13, 2026 US Central, November 14 UTC. Research only. Sources below are first-party pages, APIs, source code, or specifications. HTTP fields and CORS results are live observations, not service guarantees.

## Recommendation

Automatic lookup is feasible for part of the catalog while preserving static hosting and direct-file use. Xbox has a keyless, browser-readable title search and regional catalog with useful release timestamps. Wikidata can supply identity, store IDs, and release dates, but cannot supply an unlock time. PlayStation publishes regional timestamps in product HTML, yet the tested routes do not allow this site's JavaScript to read them. No universal, supported, keyless browser API for exact game unlocks was established.

Use a general source adapter and an evidence-bearing schedule format. Resolve platform, edition, and store market before selecting a timestamp. Store `sourceUrl`, source field, market, platform, edition, checked time, event kind, and precision with every result. Distinguish `base-unlock`, `advance-access`, `preload`, and `announcement`; represent `instant`, `local-time-rule`, `date-only`, and `unknown` separately. Never manufacture midnight from a calendar date or treat every ISO timestamp as an exact unlock.

## GTA VI: official schedule and an unresolved regional detail

[Rockstar's regional support article](https://support.rockstargames.com/articles/29jV3Cv2cCgvwM1XgtMO5o/grand-theft-auto-vi-regional-pre-load-and-release-times-on-playstation-5-and-xbox-series-x-or-s), updated November 3, states that both PS5 and Xbox Series X|S release at local midnight on November 19, 2026, across all regions. It separately gives PS5 preload as local midnight November 10 and Xbox preload as November 10 at 00:00 GMT worldwide. [PlayStation support](https://www.playstation.com/en-us/support/games/gta-vi-support/) independently confirms the PS5 release and preload dates and local-midnight wording. These are explicit release-time statements, not dates inferred from an announcement's publication time.

However, country storefronts publish one instant per market. The US PS Store and Xbox catalog both give `2026-11-19T05:00:00Z`. That is midnight New York, but 23:00 November 18 in Chicago and 21:00 in Los Angeles. Australia's observed timestamp is midnight Sydney, not midnight in every Australian zone. The support wording does not resolve this within-country difference. Preserve both sources and disclose the conflict instead of silently replacing a storefront timestamp with browser-local midnight.

## PlayStation: real regional timestamps, blocked browser reads

The public product HTML contains `releaseDate` in its embedded application data, including the product cache inside `__NEXT_DATA__`/batarang payloads. The visible preorder header also shows a UTC time. Match the requested product object rather than taking the first date anywhere in the page, which can contain editions and add-ons.

Observed GTA VI Standard Edition values:

| Store | Product ID | `releaseDate` | Primary source |
| --- | --- | --- | --- |
| US | `EP1004-PPSA01547_00-GTAVISTANDARD001` | `2026-11-19T05:00:00Z` | [US product](https://store.playstation.com/en-us/product/EP1004-PPSA01547_00-GTAVISTANDARD001) |
| GB | Same as US | `2026-11-19T00:00:00Z` | [GB product](https://store.playstation.com/en-gb/product/EP1004-PPSA01547_00-GTAVISTANDARD001) |
| NZ | `EP1004-PPSA38500_00-GTAVISTANDARD001` | `2026-11-18T11:00:00Z` | [NZ product](https://store.playstation.com/en-nz/product/EP1004-PPSA38500_00-GTAVISTANDARD001) |
| AU | Same as NZ | `2026-11-18T13:00:00Z` | [AU product](https://store.playstation.com/en-au/product/EP1004-PPSA38500_00-GTAVISTANDARD001) |

These are market-specific catalog instants corroborated here by an explicit publisher schedule. No public contract was found saying every product's `releaseDate` is its base-game unlock. Verify edition and event semantics before calling other titles exact.

Getting the ID:

- Extract it from a regional `/product/{id}` URL. `/concept/{id}` identifies a game concept, not an edition. The [NZ GTA VI concept page](https://store.playstation.com/en-nz/concept/10000730) exposed the NZ product IDs. Reusing the US product ID under `/en-nz/` instead redirected to an error page, despite a final HTTP 200. Do not derive region IDs by replacing `UP` with `EP`.
- Wikidata defines [P5944, North America](https://www.wikidata.org/wiki/Property:P5944), [P5971, Europe](https://www.wikidata.org/wiki/Property:P5971), and [P5999, Japan](https://www.wikidata.org/wiki/Property:P5999). Fetch claims after title search; inspect platform qualifiers. [GTA V](https://www.wikidata.org/wiki/Q17452) has several older console IDs. Its tested PS4 ID led to an error page. [GTA VI](https://www.wikidata.org/wiki/Q23648408) had none of these three properties at check time. Coverage and current-edition mapping are incomplete.
- [Sony's title search](https://store.playstation.com/en-us/search/grand%20theft%20auto%20vi) is a useful link-out, but returned a client-rendered shell without usable results in the HTTP read. No supported browser-direct search API was verified.

Product HTML returned HTTP 200 without `Access-Control-Allow-Origin`; normal cross-origin browser fetches failed. Sony's own page configuration points to `https://web.np.playstation.com/api/graphql/v1/`. A GET query for `productRetrieve { id name releaseDate }` returned HTTP 403 without CORS, including when sent with Sony's store Origin; browser fetch also failed. This proves that tested route unusable here, not that every Sony API necessarily fails. Legacy Chihiro routes returned 204 with no body or 404. They are not a verified fallback.

## Xbox: implementable live discovery and regional catalog

Microsoft's [own winget source](https://github.com/microsoft/winget-cli/blob/master/src/AppInstallerCommonCore/MSStoreDownload.cpp) uses `displaycatalog.mp.microsoft.com/v7.0/products`. These catalog requests also worked anonymously from the browser. No documented public release-time API contract or availability promise was established.

Tested keyless discovery:

```text
https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?query=Grand%20Theft%20Auto%20VI&market=US&languages=en-us&productFamilyNames=Games
https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P3H4968GRSM&market=US&languages=en-us
```

The [search response](https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?query=Grand%20Theft%20Auto%20VI&market=US&languages=en-us&productFamilyNames=Games) includes standard product `9P3H4968GRSM`, Ultimate `9NNZSNHLR63L`, an upgrade, and underlying game `9NL3WWNZLZZN`. [Wikidata P5885](https://www.wikidata.org/wiki/Property:P5885) can seed Microsoft product IDs, but GTA VI's current claim points to that underlying record, whose `OriginalReleaseDate` is the placeholder `9998-12-30`. Search must be able to recover the purchasable edition.

For standard product `9P3H4968GRSM`, `Products[].MarketProperties[].OriginalReleaseDate` and the preorder availability's `Properties.PreOrderReleaseDate` agreed:

| Market | UTC release timestamp | Primary API response |
| --- | --- | --- |
| US | `2026-11-19T05:00:00Z` | [US](https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P3H4968GRSM&market=US&languages=en-us) |
| GB | `2026-11-19T00:00:00Z` | [GB](https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P3H4968GRSM&market=GB&languages=en-us) |
| NZ | `2026-11-18T11:00:00Z` | [NZ](https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P3H4968GRSM&market=NZ&languages=en-us) |
| AU | `2026-11-18T13:00:00Z` | [AU](https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P3H4968GRSM&market=AU&languages=en-us) |
| JP | `2026-11-18T15:00:00Z` | [JP](https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P3H4968GRSM&market=JP&languages=en-us) |

Select the relevant market, SKU, and preorder availability explicitly. `Sku.Properties.IsPreOrder` identifies preorder SKUs; `IsBundle` and `BundledSkus` help distinguish editions and underlying content. Do not require `IsBundle=false`: this standard edition is itself a bundle. Do not use `Conditions.StartDate` as unlock time. GTA VI's preorder sale starts in June, while play starts in November. Ignore sentinel years such as 1753 and 9998 and unrelated sale, licensing, or modification dates.

This is broader than GTA. [Starfield's catalog](https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9NCJSXWZTP88&market=US&languages=en-us) gives `OriginalReleaseDate=2023-09-06T00:00:00Z`, matching [Bethesda's explicit base-game schedule](https://bethesda.net/en-US/news/starfield-faq). Its current purchase availability starts in 2026, showing why availability start is unsafe. Bethesda separately describes edition-specific early access. A catalog timestamp is useful evidence; it still needs the correct edition and meaning, and must never be transplanted to another platform without support.

## Steam and Wikidata: dates are not unlock times

[Steam appdetails](https://store.steampowered.com/api/appdetails?appids=1174180&cc=us&l=english) returned `release_date: {coming_soon:false,date:"Dec 5, 2019"}` for RDR2. This has day precision and no time or zone. Valve's [release-date documentation](https://partner.steamgames.com/doc/store/release_dates) permits exact dates, months, quarters, years, or Coming Soon as player-facing display. Sorting dates can be the final day of a displayed range. Do not infer an unlock from those labels or normalized timestamps.

Valve's [release process](https://partner.steamgames.com/doc/store/releasing) says the developer releases the app when desired and the operation applies the current timestamp. [Advance Access](https://partner.steamgames.com/doc/store/advancedaccess) separately enables eligible packages at a staged time. That is distinct from both base release and Steam's unfinished-game Early Access model.

The keyless [StoreBrowse probe](https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A1174180%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_release%22%3Atrue%7D%7D) returned `release.steam_release_date=1575565200` for this released app. It returned no CORS permission and failed browser fetch. A historical Unix timestamp does not establish a supported future regional-unlock service. The literal [store `/api/release_dates/` route](https://store.steampowered.com/api/release_dates/) returned 403, `access denied`. The Steamworks page named `release_dates` is documentation, not a public JSON API.

Wikidata's [time datatype explicitly lacks time-of-day support](https://www.wikidata.org/wiki/Help:Data_type#Limitations). Its [data model](https://www.mediawiki.org/wiki/Wikibase/DataModel#Dates_and_times) says to use precision to determine meaningful digits: 9 is year, 10 month, 11 day. Thus GTA VI's `+2026-11-19T00:00:00Z`, precision 11, is a date, not midnight UTC. Filter deprecated claims and retain platform `P400`, publication-place `P291`, references, and rank. Its older 2025 and May 2026 dates are deprecated. Wikidata owns the identifier schema and API, but its community-entered release claims are not publisher announcements.

## Browser verification and other candidates

Probes used Chromium through Playwright with ordinary `fetch(url, {credentials:"omit"})`, no security-disabling flags, cookies, keys, or proxy. Both a real `file://` document and an intercepted HTTPS document at `https://release-research.invalid/` made real network requests. Only the HTTPS probe document was supplied locally. Header checks also used HTTP GET with `Origin: null` and the HTTPS origin. Successful command-line HTTP reads alone were not counted as browser compatibility.

| Route | Direct-file / HTTPS fetch | Observation |
| --- | --- | --- |
| Xbox autosuggest and product catalog | Readable / readable | HTTP 200 JSON; HTTP probes echoed the requesting Origin, including literal `null`. |
| Wikidata `wbsearchentities` and `wbgetentities`, `origin=*` | Readable / readable | HTTP 200 JSON. [MediaWiki documents anonymous CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests). A Python default User-Agent got a robot-policy 403; browser requests succeeded. |
| PlayStation product HTML and support page | Failed / failed | Product HTTP 200 lacks CORS. Support is evidence for curated schedules, not a verified fetch source. |
| Tested Sony GraphQL GET | Failed / failed | HTTP probe 403, no CORS. |
| Steam appdetails, StoreBrowse, Steam news | Failed / failed | appdetails and StoreBrowse HTTP 200 lack CORS. News fetch failed; no browser news parser established. |
| [Epic free-games catalog](https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US) | Failed / failed | HTTP 200 JSON without CORS. Promotional offer windows are not general base-game unlock schedules. |

[IGDB](https://api-docs.igdb.com/#authentication) requires client credentials and explicitly blocks browser-direct requests. [RAWG](https://rawg.io/apidocs) requires a key on every request. Neither satisfies keyless browser use. These observations do not exclude every possible service, but establish no additional reliable live source for exact unlocks. `no-cors` fetch gives an unreadable response; a third-party reader/proxy would add another dependency and does not turn these into first-party browser APIs.

## Static-compatible implementation path

1. Detect the device's IANA zone with `Intl.DateTimeFormat().resolvedOptions().timeZone`; default presentation to it. This is the configured system zone, not verified physical location or account market. [ECMA-402](https://tc39.es/ecma402/#sec-initializedatetimeformat) defines the default; [IANA's zone table](https://data.iana.org/time-zones/tzdb/zone1970.tab) shows that countries and zones are not one-to-one. Allow a saved platform/store-country choice without requiring time entry.
2. Resolve title candidates through Wikidata and Xbox search. Fetch the selected Xbox edition for that market; retain provider field names and reject placeholders or ambiguous candidates. Cache by product, market, platform, and edition; fail back to saved data on timeout, HTTP errors, or CORS changes.
3. For PlayStation and other blocked sources, ship a reusable, cited schedule catalog covering multiple games and platforms. Records can express a global instant, a market instant, or an explicitly announced local-time rule. This requires editorial verification, but no runtime backend or user time entry. Bundle it in a classic script for direct-file use, rather than requiring `fetch('./schedules.json')`. Portable file-picker imports can update local data.
4. Apply local-midnight calculations only when a source explicitly supplies that rule, using the target date's zone offset rather than today's offset. Keep source conflicts visible, including GTA VI's US discrepancy. Do not infer PS5 time from Xbox or a deluxe unlock from standard edition.
5. When only a date is known, show "Release date known; unlock time unconfirmed" and offer the official store link or an imported schedule. Keep the clock unknown instead of starting a falsely precise countdown. This is the unavoidable coverage limit if the app must stay static and exactness matters.

## Review embargo times: no keyless browser source established

Checked November 15, 2026. Publishers announce review embargos in press releases, press-kit emails, and posts on their own or outlet channels. This is public information, but none of the tested routes exposes it to browser JavaScript without credentials:

| Route | Result |
| --- | --- |
| [OpenCritic API](https://api.opencritic.com/api/game/search?criteria=gta) | HTTP 400, "API key is required" with a RapidAPI signup link, on both `api.opencritic.com` and `opencritic.com/api`. The same response carries `access-control-allow-origin: *`, so CORS is not the blocker; the key is. |
| Wikidata property search for "embargo" | Only [P11140 "embargoed until"](https://www.wikidata.org/wiki/Property:P11140), a qualifier of P953 for academic articles. No game embargo property or structured claims. |
| [GamesPress](https://www.gamespress.com/?q=embargo) | HTML journalist resource, HTTP 200 without `Access-Control-Allow-Origin`; no verified JSON feed route. Browser fetch would fail CORS. |

Until a supported keyless source appears, the embargo timing mode is manual entry: pick "Review embargo", then enter the announced time and zone on the release date. The form note says lookup does not confirm embargo times.
