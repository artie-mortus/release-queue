# Book and web-novel search sources

Checked 2026-09-14. The app is a static browser client, so a useful source must work without a secret and accept cross-origin browser requests.

## Recommendation

Keep Open Library for ordinary books. Add AniList as a second live source for light novels. Use Wikidata and English Wikipedia as lower-ranked identity fallbacks for notable web novels, not as sources of reading-time estimates. Wikipedia's full-text search is useful for ambiguous titles that Wikidata entity search misses, such as *Worm*.

Do not build against scraped pages or private endpoints from Royal Road, Wattpad, or Scribble Hub. Give web novels a first-class manual path instead. A user should be able to paste a story URL and enter the current page count, word count, or hours. Store the platform, URL, progress unit, status, and "as of" date so an ongoing story does not look like a fixed-length book.

Suggested search flow:

1. Query Open Library and AniList together after the existing debounce.
2. If results are thin, query Wikidata and label those matches "metadata may be incomplete."
3. Group results as Books, Light novels, and Web novels. Show the source on every row and deduplicate normalized title plus author matches.
4. Always show "Add a web novel by URL" below the results. Offer link-outs to the official Royal Road, Wattpad, and Scribble Hub searches rather than fetching those sites.
5. Estimate published books from pages at the user's saved pages-per-hour pace. Estimate web fiction from words when available. Royal Road defines one of its displayed pages as 275 written words, which provides a defensible conversion for manually copied Royal Road page totals. Keep chapter counts informational unless the user supplies an average chapter length.

## Source comparison

| Source | Browser-direct fit | Useful coverage | Length metadata | Decision |
| --- | --- | --- | --- | --- |
| Open Library | Keyless JSON search. A live request returned `Access-Control-Allow-Origin: *`; this is observed behavior, not a documented compatibility promise. | Published books and editions. Some popular web novels appear after receiving cataloged editions, but discovery and edition data are uneven. | Edition page counts and a work-level median page count. No documented word count or reliable serialized-chapter model. | Keep as the main book source. |
| AniList | Free public GraphQL API. Anonymous media queries need no OAuth. A live preflight returned wildcard CORS and allowed `POST`; the docs do not promise CORS as a versioned contract. | Curated Japanese and translated light novels. AniList puts light novels under `type: MANGA, format: NOVEL`. It is not a general Royal Road, Wattpad, or Scribble Hub index. | `chapters` and `volumes`, defined as totals when the work is complete. No page or word count, so ongoing works often cannot produce a duration. | Add now for light-novel search and identity metadata. |
| Wikidata | Keyless Action API. Anonymous browser calls use `origin=*`, which MediaWiki documents for CORS. | Notable books, light novels, and web novels. `wbsearchentities` searches labels and aliases, so the client must reject adaptations or unrelated entities. | Properties exist for pages, words, and number of parts, but they are optional. `number of parts` does not by itself say whether the parts are chapters or volumes. | Use as a lower-ranked fallback. Never invent a duration when extent claims are absent or ambiguous. |
| English Wikipedia | Keyless MediaWiki search API with the same documented cross-site request mechanism. | Notable web fiction with dedicated articles. Full-text search finds some ambiguous works that entity search misses. | Article word count describes the encyclopedia article, not the story, so it cannot support a runtime. | Use only for title discovery, filter aggressively for web-fiction language, and show “length unavailable.” |
| Royal Road | No supported public search API was established. Its official API proposal is marked rejected, and staff said a proper version would need external authentication and dedicated endpoints. The terms prohibit automated access, scraping, crawling, and caching unless Royal Road permits it. | Excellent first-party web-fiction catalog. Its own search exposes status, tags, page count, and chapter count. | Displayed pages and chapters. Royal Road states that one page equals 275 written words. | Do not fetch or scrape. Support pasted URLs and manual page totals; link to official search. |
| Wattpad | No current supported public developer API was found in Wattpad's official policy and support surfaces. | Large catalog of original stories and fan fiction. | No supported API contract for length metadata was established. | Treat as manual/link-out only. Wattpad's terms explicitly prohibit crawling or otherwise removing site content. |
| Scribble Hub | No documented public API was found in its official Help Center or terms. Its HTML is not a stable data contract, and a live cross-origin request was blocked. | Strong original web-fiction catalog. The official Series Finder exposes filters for title, chapters, pages, words, status, and tags. | Its own results expose chapters, pages, and total words, which are ideal for estimates if the user copies them. | Treat as manual/link-out only unless Scribble Hub publishes an API or grants permission. |

## Integration details

### Open Library

Use `https://openlibrary.org/search.json` and request only the fields the UI renders. The Search API returns work records and can embed the best-matching edition. Useful fields are `key`, `title`, `alternative_title`, `author_name`, `first_publish_year`, `edition_count`, `cover_i`, `number_of_pages_median`, and `editions.number_of_pages`. Open Library documents page count as edition metadata "when the catalog has it," so the current null-safe estimate behavior should remain.

Open Library asks clients to cache responses and identifies a default rate limit of one request per second, or three per second for requests that identify the application. The current debounce, abort handling, and query cache should apply separately to each source.

Sources: [Search API](https://openlibrary.org/dev/docs/api/search), [search field guide](https://openlibrary.org/search/howto/more), [Books API](https://openlibrary.org/dev/docs/api/books), [API usage guidelines](https://openlibrary.org/developers/api).

### AniList

Query `Page.media` with `search: $query`, `type: MANGA`, `format: NOVEL`, and the app's adult-content choice. Request `id`, all title variants, `synonyms`, `status`, `chapters`, `volumes`, `countryOfOrigin`, `coverImage`, and `siteUrl`. Preserve both English and romanized titles for matching and deduplication.

AniList documents a nominal limit of 90 requests per minute, but its current warning says the service is temporarily limited to 30. It also has a burst limiter. Handle `429`, `Retry-After`, and the rate-limit headers, and let Open Library results render if AniList is unavailable.

Sources: [public API introduction](https://docs.anilist.co/guide/introduction), [GraphQL requests](https://docs.anilist.co/guide/graphql/), [media query examples](https://docs.anilist.co/guide/graphql/queries/media), [`NOVEL` format](https://docs.anilist.co/reference/enum/mediaformat), [Media fields](https://docs.anilist.co/reference/object/media), [rate limiting](https://docs.anilist.co/guide/rate-limiting).

### Wikidata

Call `wbsearchentities` for candidates, then batch candidate IDs through `wbgetentities`. Use descriptions plus `instance of` and `form of creative work` claims to keep written works and reject film, television, manga, and game adaptations. The useful extent properties are `number of pages` (`P1104`), `number of words` (`P6570`), and `number of parts of this work` (`P2635`). A missing claim means unknown, not zero.

Sources: [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API), [cross-site requests](https://www.mediawiki.org/wiki/API:Cross-site_requests), [book data model](https://www.wikidata.org/wiki/Wikidata:WikiProject_Books/Book_data_model), [`P1104`](https://www.wikidata.org/wiki/Property:P1104), [`P6570`](https://www.wikidata.org/wiki/Property:P6570), [`P2635`](https://www.wikidata.org/wiki/Property:P2635).

English Wikipedia uses the same MediaWiki Action API. Query `list=search` with the title plus web-fiction terms, then retain only close title matches whose title or snippet explicitly says web novel, web serial, or web fiction. Disambiguation pages and article `wordcount` values must be ignored. Source: [MediaWiki search API](https://www.mediawiki.org/wiki/API:Search).

### Unsupported web-fiction platforms

Royal Road's own pages prove that the desired metadata exists, but its terms make an unofficial crawler the wrong foundation. Wattpad's terms are equally direct about crawling. Scribble Hub exposes the richest length fields in its UI, yet offers no documented browser API. The product should make manual entry pleasant rather than hide it as an error fallback.

For a pasted URL, prefill only what can be derived locally from the URL, such as platform and canonical link. Ask for title, author, ongoing or complete status, and one of:

- pages, using the existing pages-per-hour calibration;
- words, using a saved words-per-hour pace or a transparent page conversion;
- hours, marked as user supplied;
- chapters only, stored without a duration until the user adds an average chapter length.

Sources: [Royal Road search](https://www.royalroad.com/fictions/search), [Royal Road chapter and page definition](https://www.royalroad.com/support/knowledgebase/83), [Royal Road API proposal](https://www.royalroad.com/ideas/482), [Royal Road terms](https://www.royalroad.com/tos), [Wattpad terms](https://policies.wattpad.com/terms), [Scribble Hub Series Finder](https://www.scribblehub.com/series-finder/), [Scribble Hub Help Center](https://www.scribblehub.com/help-center/), [Scribble Hub terms](https://www.scribblehub.com/terms-of-service/).
