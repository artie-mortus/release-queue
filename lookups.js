/* Release Queue lookups: public catalogs and services that turn a title or
   URL into runtime data. Loads as a classic script before app.js and only
   declares things at load time. Functions read app.js globals, such as the
   reading pace, when they run, never while this file loads.               */

/* ---- catalogs ---------------------------------------------------------- */
// The original entries through Portal 2 came with this prototype, attributed
// to HowLongToBeat and unverified against that source. Later entries are rough
// main-story estimates from general knowledge, not scraped provider data.
// All runtimes remain editable. Aliases support search without changing titles.
const hltbGames=[
 {name:'Red Dead Redemption',aliases:['RDR1'],main:18},
 {name:'Red Dead Redemption 2',main:50.5},
 {name:'Grand Theft Auto III',aliases:['GTA 3','GTA III'],main:14},
 {name:'Grand Theft Auto: Vice City',aliases:['GTA Vice City','Vice City'],main:17},
 {name:'Grand Theft Auto: San Andreas',aliases:['GTA San Andreas','GTASA','GTA SA','San Andreas'],main:30},
 {name:'Grand Theft Auto IV',aliases:['GTA 4','GTA IV'],main:27},
 {name:'Grand Theft Auto V',aliases:['GTA 5','GTA V'],main:32},
 {name:'Grand Theft Auto: Liberty City Stories',aliases:['LCS'],main:15},
 {name:'Grand Theft Auto: Vice City Stories',aliases:['VCS'],main:15.5},
 {name:'Cyberpunk 2077',main:26},
 {name:'The Witcher 3: Wild Hunt',main:51.5},
 {name:"Baldur's Gate 3",aliases:['BG3'],main:75},
 {name:'Portal 2',main:8.5},

 // Fallout
 {name:'Fallout',aliases:['Fallout 1','F1'],main:15},
 {name:'Fallout 2',aliases:['F2'],main:25},
 {name:'Fallout 3',aliases:['F3'],main:24},
 {name:'Fallout: New Vegas',aliases:['New Vegas','FNV','Fallout NV'],main:28},
 {name:'Fallout 4',aliases:['F4'],main:27},
 {name:'Fallout 76',aliases:['F76'],main:25},
 {name:'Fallout Tactics',main:22},

 // The rest of Rockstar, since that is the itch being scratched
 {name:'Bully',aliases:['Canis Canem Edit'],main:14},
 {name:'L.A. Noire',aliases:['LA Noire'],main:20},
 {name:'Max Payne',main:9},
 {name:'Max Payne 2',main:7},
 {name:'Max Payne 3',main:9},
 {name:'Manhunt',main:9},
 {name:'Midnight Club: Los Angeles',aliases:['Midnight Club LA'],main:11},

 // Bethesda-adjacent open worlds
 {name:'The Elder Scrolls IV: Oblivion',aliases:['Oblivion','TES4'],main:27},
 {name:'The Elder Scrolls V: Skyrim',aliases:['Skyrim','TES5'],main:34},
 {name:'Starfield',main:24},

 // Big-backlog open worlds and action games
 {name:'Elden Ring',main:59},
 {name:'Dark Souls',main:31},
 {name:'Dark Souls III',aliases:['DS3','Dark Souls 3'],main:32},
 {name:'Bloodborne',main:34},
 {name:'Sekiro: Shadows Die Twice',aliases:['Sekiro'],main:29},
 {name:'God of War',aliases:['GoW 2018'],main:21},
 {name:'God of War Ragnarok',aliases:['Ragnarok','GoW Ragnarok'],main:26},
 {name:'Ghost of Tsushima',aliases:['Tsushima'],main:25},
 {name:'Horizon Zero Dawn',aliases:['HZD'],main:23},
 {name:'Horizon Forbidden West',aliases:['Forbidden West'],main:29},
 {name:"Marvel's Spider-Man",aliases:['Spider-Man','Spiderman'],main:17},
 {name:'The Last of Us',aliases:['TLOU'],main:15},
 {name:'The Last of Us Part II',aliases:['TLOU2','Last of Us 2'],main:24},
 {name:'Death Stranding',main:40},
 {name:'Metal Gear Solid V: The Phantom Pain',aliases:['MGSV','MGS5'],main:46},
 {name:'Assassin\u2019s Creed Odyssey',aliases:['AC Odyssey'],main:44},
 {name:'Assassin\u2019s Creed Valhalla',aliases:['AC Valhalla'],main:61},
 {name:'Watch Dogs 2',main:19},
 {name:'Sleeping Dogs',main:15},
 {name:'Days Gone',main:30},
 {name:'Control',main:11},
 {name:'Alan Wake 2',main:17},
 {name:'Mafia: Definitive Edition',aliases:['Mafia'],main:10},

 // RPGs and long-tail time sinks
 {name:'Persona 5 Royal',aliases:['P5R','Persona 5'],main:103},
 {name:'Final Fantasy VII Remake',aliases:['FF7 Remake','FF7R'],main:33},
 {name:'Mass Effect 2',main:25},
 {name:'Mass Effect Legendary Edition',aliases:['Mass Effect'],main:96},
 {name:'Disco Elysium',main:22},
 {name:'Hollow Knight',main:27},
 {name:'Hades',main:21},
 {name:'Stardew Valley',main:53},
 {name:'Outer Wilds',main:16},
 {name:'Return of the Obra Dinn',aliases:['Obra Dinn'],main:8}
];
function createQueryCache(limit = 100, ttl = 15 * 60 * 1000){
  const entries = new Map();
  return {
    get(key){
      const entry = entries.get(key);
      if(!entry) return undefined;
      entries.delete(key);
      if(entry.expires <= Date.now()) return undefined;
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value){
      entries.delete(key);
      entries.set(key, {value, expires:Date.now() + ttl});
      while(entries.size > limit) entries.delete(entries.keys().next().value);
      return value;
    }
  };
}
const lookupCache = createQueryCache();

/* ---- lookup sources ----------------------------------------------------
   Every source below is keyless and sends `Access-Control-Allow-Origin: *`,
   which is what lets the site stay static with no server behind it.
   Verified directly: Steam's storesearch, SteamSpy, and Google Books do NOT,
   which is why none of them are here.

     shows   TVMaze          real runtime  (episode runtimes, summed)
     movies  Wikidata P2047  real runtime  (minutes, from the film entity)
     books   Open Library    ESTIMATE      (median page count / reading rate)
     light   AniList         ESTIMATE      (known volumes x 250 pages / reading rate)
     web     Wikimedia       unknown       (identification only; you set the hours)
     games   HowLongToBeat   ESTIMATE      (main-story completion via Jina Reader)
             local table     rough fallback (unverified main-story estimates)
             Wikidata        unknown       (identification only; you set the hours)

   Wikidata has no playtime property for games and its P136 genres are too
   noisy to derive one from, so an unknown game is added as an unknown rather
   than dressed up with a fabricated number.                               */

const WD = 'https://www.wikidata.org/w/api.php?origin=*&format=json&';
const WP = 'https://en.wikipedia.org/w/api.php?origin=*&format=json&';
const ANILIST = 'https://graphql.anilist.co';
const FETCH_TIMEOUT = 4000; // A source that has not answered by now is not going to.
const providerIntervals = {'openlibrary.org':1000, 'graphql.anilist.co':2100, 'itunes.apple.com':3100};
const providerStates = new Map();
function providerState(url){
  const host = new URL(url).hostname;
  if(!providerStates.has(host)) providerStates.set(host,
    {nextAt:0, interval:providerIntervals[host] || 250, waiting:Promise.resolve()});
  return providerStates.get(host);
}
function abortableDelay(ms, signal){
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if(error) reject(error); else resolve();
    };
    const abort = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => finish(), ms);
    signal?.addEventListener('abort', abort, {once:true});
    if(signal?.aborted) abort();
  });
}
function waitForProvider(url, signal){
  const state = providerState(url);
  // Reserve starts in order. Cancelled queries never consume the next slot;
  // response time on one provider cannot hold up another provider.
  state.waiting = state.waiting.catch(() => {}).then(async () => {
    signal?.throwIfAborted();
    while(state.nextAt > Date.now()) await abortableDelay(Math.min(60000, state.nextAt - Date.now()), signal);
    signal?.throwIfAborted();
    state.nextAt = Date.now() + state.interval;
  });
  return state.waiting;
}
function coolDownProvider(url, response){
  const header = response.headers.get('Retry-After');
  const seconds = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : NaN;
  const date = header ? Date.parse(header) : NaN;
  const reset = Number(response.headers.get('X-RateLimit-Reset')) * 1000;
  const now = Date.now();
  const until = Number.isFinite(seconds) ? now + seconds * 1000
    : Number.isFinite(date) ? date : reset > now ? reset : now + 60000;
  const state = providerState(url);
  state.nextAt = Math.max(state.nextAt, until);
}
// Keep the timeout alive through response parsing, and clean up cancellation
// listeners on every outcome. Cache, pacing and source errors stay with callers.
async function withRequestTimeout(timeoutMs, signal, request, timeoutMessage){
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  signal?.addEventListener('abort', cancel, {once:true});
  try{
    const result = await request(controller.signal);
    signal?.throwIfAborted();
    controller.signal.throwIfAborted();
    return result;
  }catch(error){
    if(timeoutMessage && controller.signal.aborted && !signal?.aborted) throw new Error(timeoutMessage);
    throw error;
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
async function fetchJson(url, options, signal){
  signal?.throwIfAborted();
  const key = url + '\n' + (options.body || '');
  const cached = lookupCache.get(key);
  if(cached !== undefined) return cached;
  await waitForProvider(url, signal);
  const data = await withRequestTimeout(FETCH_TIMEOUT, signal, async requestSignal => {
    const response = await fetch(url, {...options, signal:requestSignal});
    if(response.status === 429) coolDownProvider(url, response);
    if(!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    signal?.throwIfAborted();
    if(data?.error || data?.errors?.length) throw new Error('The lookup service returned an error.');
    return data;
  });
  return lookupCache.set(key, data);
}
function jget(url, signal = null){
  return fetchJson(url, {}, signal);
}
function jpost(url, body, signal = null){
  return fetchJson(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}, signal);
}

function gameSuggestions(query){
  return hltbGames
    .map(g => ({...g, matchScore:relevance(g.name, query, g.aliases || [])}))
    .filter(g => g.matchScore < 60)
    .sort((a, b) => a.matchScore - b.matchScore)
    .slice(0, 5)
    .map(g => ({kind:'Game', name:g.name, aliases:g.aliases || [], hours:g.main, estimated:true,
      sourceRank:g.matchScore, note:`Unverified local estimate · about ${g.main}h main story · checks source on add`}));
}

async function findShows(query, signal = null){
  const data = await jget('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(query), signal);
  const hits = data.map((x, sourceRank) => ({
      kind:'Show', name:`${x.show.name} (${(x.show.premiered||'').slice(0,4) || 'year unknown'})`,
      matchText:x.show.name, showId:x.show.id, hours:null, sourceRank,
      note:`TVMaze · ${x.show.status || 'status unknown'}${x.show.averageRuntime ? ` · ~${x.show.averageRuntime} min/ep` : ''}`
    }))
    .filter(hit => relevance(hit.matchText, query) < 60)
    .slice(0, 3);
  return hits;
}

async function findBooks(query, signal = null){
  const fields = 'key,title,alternative_title,author_name,number_of_pages_median,'
    + 'first_publish_year,edition_count,cover_i,editions,editions.number_of_pages';
  const data = await jget(
    'https://openlibrary.org/search.json?limit=12&lang=en&fields='
      + encodeURIComponent(fields) + '&q=' + encodeURIComponent(query), signal);
  const pagesPerHour = readBookPace();
  return prepareBookSuggestions(data.docs, query, 5).map(d => {
    const hours = estimateBookHours(d.pages, pagesPerHour);
    const facts = [d.first_publish_year, d.pages ? `${d.pages} pages` : 'page count unavailable'];
    if(hours) facts.push(`about ${hours}h at your pace`);
    return {
      kind:'Book',
      // Duplicate matching ignores punctuation, so older "Title — Author" names still match.
      name:`${d.title}${d.authors.length ? `, ${d.authors[0]}` : ''}`,
      matchText:d.matchText,
      sourceRank:d.sourceRank,
      matchScore:d.matchScore,
      hours,
      estimated:hours != null,
      coverId:Number.isFinite(Number(d.cover_i)) ? Number(d.cover_i) : null,
      book:d.pages ? {pages:d.pages, pagesPerHour, pinned:false} : null,
      note:`Open Library · ${facts.filter(Boolean).join(' · ')}`
    };
  });
}

async function findLightNovels(query, signal = null){
  const gql = `query ($search: String!) {
    Page(page: 1, perPage: 8) {
      media(type: MANGA, format: NOVEL, search: $search, isAdult: false) {
        id title { romaji english native } synonyms status chapters volumes
        startDate { year } coverImage { medium } countryOfOrigin
      }
    }
  }`;
  const data = await jpost(ANILIST, {query:gql, variables:{search:query}}, signal);
  const pagesPerHour = readBookPace();
  return prepareLightNovelSuggestions(data.data?.Page?.media, query, 4).map(entry => {
    const hours = estimateBookHours(entry.pages, pagesPerHour);
    const volumeText = entry.volumes
      ? `${entry.volumes} volume${entry.volumes === 1 ? '' : 's'}`
      : 'length unavailable';
    return {
      kind:'Book', name:entry.name, aliases:entry.aliases, matchText:entry.name,
      sourceRank:entry.sourceRank, matchScore:entry.matchScore, hours,
      estimated:hours != null,
      coverUrl:/^https:\/\/s4\.anilist\.co\//.test(entry.coverImage?.medium || '')
        ? entry.coverImage.medium : null,
      book:entry.pages ? {pages:entry.pages, pagesPerHour, pinned:false,
        basis:'volumes', volumes:entry.volumes} : null,
      note:`AniList · light novel · ${volumeText}`
        + (hours ? ` · about ${hours}h at your pace` : '')
    };
  });
}

async function findWebFiction(query, signal = null){
  const terms = `${query} ("web novel" OR "web serial" OR "web fiction")`;
  const data = await jget(WP + 'action=query&list=search&srlimit=8&srnamespace=0&srsearch='
      + encodeURIComponent(terms), signal);
  return (data.query?.search || []).map((entry, sourceRank) => {
    const name = entry.title.replace(/\s*\((?:web (?:novel|serial|fiction)|novel)\)\s*$/i, '');
    const description = `${entry.title} ${entry.snippet || ''}`;
    return {kind:'Book', name, matchText:name, sourceRank, hours:null,
      note:'Wikipedia · web fiction · length unavailable', description};
  }).filter(entry => !/\(disambiguation\)/i.test(entry.description)
    && /web[ -]?(?:novel|serial|fiction)/i.test(entry.description)
    && relevance(entry.matchText, query) < 60)
    .slice(0, 3);
}

/* ---- podcasts: a back catalogue that is still growing -------------------
   iTunes Search is keyless and CORS-open, and its podcastEpisode lookup carries
   both `trackTimeMillis` and `releaseDate`, which is everything the model needs:
   average an episode, count the catalogue, read the upload rhythm off the dates.

   The one trap is that Apple does not return a clean recent window. It returns a
   complete head and a thinned tail: The Daily comes back with the last five days
   in full and then jumps to one a week, so averaging gaps across the whole sample
   calls a daily show weekly. `releaseRate` works around it by trusting the
   smallest window that holds enough episodes, because thinning only ever eats
   the old end.                                                              */

/* Apple is the awkward one. Its JSONP endpoint avoids CORS, but a script loaded
   into this page could read the queue and local storage. Run it in a sandboxed
   frame with an opaque origin, then accept only the one structured message that
   frame is expected to send.                                                */
let jsonpSeq = 0;
async function jsonp(url, signal = null){
  signal?.throwIfAborted();
  const cached = lookupCache.get(url);
  if(cached !== undefined) return cached;
  await waitForProvider(url, signal);
  return new Promise((resolve, reject) => {
    const cb = `__tbPodcast${++jsonpSeq}`;
    const token = `${cb}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.sandbox = 'allow-scripts';
    frame.title = 'Podcast lookup';
    let settled = false;
    const finish = (fn, arg) => {
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      window.removeEventListener('message', receive);
      frame.remove();
      fn(arg);
    };
    const timer = setTimeout(() => finish(reject, new Error('timed out')), FETCH_TIMEOUT);
    const abort = () => finish(reject, signal.reason || new DOMException('Aborted', 'AbortError'));
    const receive = event => {
      if(settled || event.source !== frame.contentWindow || event.data?.token !== token) return;
      if(event.data.error) finish(reject, new Error('could not reach Apple'));
      else if(!Array.isArray(event.data.data?.results)) finish(reject, new Error('Invalid podcast response'));
      else finish(resolve, lookupCache.set(url, event.data.data));
    };
    signal?.addEventListener('abort', abort, {once:true});
    if(signal?.aborted){ abort(); return; }
    window.addEventListener('message', receive);
    const scriptUrl = `${url}&callback=${cb}`;
    frame.srcdoc = `<script>
      const send = message => parent.postMessage({token:${JSON.stringify(token)}, ...message}, '*');
      window[${JSON.stringify(cb)}] = data => send({data});
      const script = document.createElement('script');
      script.src = ${JSON.stringify(scriptUrl)};
      script.onerror = () => send({error:true});
      document.head.appendChild(script);
    <\/script>`;
    document.body.appendChild(frame);
  });
}

const PODCAST_ONGOING_DAYS = 60;  // silent for two months reads as finished, not slow
const PROMO = /\b(trailer|teaser|promo|preview|introducing|coming soon|announcing|announcement)\b/i;
// Median, not mean: one four-hour anniversary special should not redraw a
// thirty-minute show.
function median(xs){
  const a = xs.slice().sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

function releaseRate(dates){
  const now = Date.now();
  for(const days of [7, 14, 30, 60, 90, 180, 365, 1095]){
    const cut = now - days * 86400000;
    const n = dates.filter(d => d >= cut).length;
    if(n >= 3) return n / days * 7;
  }
  // Too sparse to window. A show this quiet has not been thinned, so the raw
  // span across the whole sample is the honest reading.
  if(dates.length < 2) return 0;
  const span = (Math.max(...dates) - Math.min(...dates)) / 86400000;
  return span > 0 ? (dates.length - 1) / span * 7 : 0;
}

// Hours a still-running show will add between today and launch day. Fixed on
// purpose: it counts the calendar, not your progress, so reordering the queue
// or dragging the pace slider never moves it.
function podcastAccrual(pod, target = TARGET, now = new Date()){
  if(!pod || !pod.ongoing || !(pod.perWeek > 0)) return 0;
  const days = Math.max(0, dayNumber(target) - dayNumber(now));
  return pod.perWeek * (pod.avgMin / 60) * days / 7;
}
const podcastHours = pod => pod.backlog + podcastAccrual(pod);

async function findPodcasts(query, signal = null){
  const data = await jsonp('https://itunes.apple.com/search?media=podcast&limit=6&term='
    + encodeURIComponent(query), signal);
  return (data.results || [])
    // iTunes will hand back a fan podcast for any game or film you type, so the
    // bar is that every word typed appears in the title. That keeps "Red Dead
    // Redemption 2" from dragging in Red Dead Radio, while still allowing the
    // apostrophe-s in "Dan Carlin's Hardcore History".
    .map((r, sourceRank) => ({...r, sourceRank,
      matchText:`${r.collectionName || ''} ${r.artistName || ''}`}))
    .filter(r => r.collectionId && relevance(r.matchText, query) < 60)
    .slice(0, 3).map(r => ({
      kind:'Podcast', name:r.collectionName, podId:r.collectionId, hours:null,
      matchText:r.matchText, sourceRank:r.sourceRank,
      note:`Apple Podcasts · ${r.artistName || 'unknown'}`
        + (r.trackCount ? ` · ${r.trackCount} episode${r.trackCount === 1 ? '' : 's'}` : '')
    }));
}

async function podcastProfile(collectionId){
  const data = await jsonp(`https://itunes.apple.com/lookup?id=${collectionId}&media=podcast`
    + '&entity=podcastEpisode&limit=200');
  const rows = data.results || [];
  const coll = rows.find(r => r.wrapperType !== 'podcastEpisode') || {};
  const now = Date.now();
  const episodeRows = rows.filter(r => r.wrapperType === 'podcastEpisode');
  const futureCount = episodeRows.filter(r => r.releaseDate && +new Date(r.releaseDate) > now).length;
  const all = episodeRows.filter(r => !r.releaseDate || +new Date(r.releaseDate) <= now);
  // A finished show's feed often keeps only a chapter or two plus a pile of
  // trailers for the network's other shows. S-Town came back as a 4.5-minute
  // podcast until these were dropped.
  const real = all.filter(e => !PROMO.test(e.trackName || ''));
  const eps = real.length ? real : all;
  let mins = eps.map(e => e.trackTimeMillis / 60000).filter(m => m > 0);
  if(!mins.length) throw new Error('no episode durations');
  let avgMin = median(mins);
  // Second pass for untitled promo stubs: on a long-form show, a sub-five-minute
  // entry is an announcement, not an episode. Left alone anywhere else, so a
  // genuine fifteen-minute short still counts.
  if(avgMin > 20){
    const full = mins.filter(m => m >= 5);
    if(full.length) avgMin = median(full);
  }
  const dates = eps.map(e => +new Date(e.releaseDate)).filter(d => d);
  const newest = dates.length ? Math.max(...dates) : 0;
  // trackCount is the whole catalogue; the episode list is only a sample of it.
  const count = adjustPodcastCatalogCount(coll.trackCount, episodeRows.length, eps.length, futureCount);
  // Round the average first and derive the backlog from the rounded figure. The
  // saved file keeps only these four numbers, so a reloaded podcast has to land
  // on the same total as a freshly added one.
  const avg = +avgMin.toFixed(1);
  return {
    eps: count,
    avgMin: avg,
    perWeek: +releaseRate(dates).toFixed(2),
    ongoing: newest > 0 && (Date.now() - newest) < PODCAST_ONGOING_DAYS * 86400000,
    backlog: +(count * avg / 60).toFixed(1)
  };
}

// Wikidata's own descriptions are the cheapest reliable type classifier: a film entity
// says "film", a game says "video game". Anything else here is noise we don't want.
function wikidataKind(desc){
  const d = (desc || '').toLowerCase();
  if(!d || /\b(franchise|universe|episode|album|song|soundtrack|edition of|landform)\b/.test(d)) return null;
  // Games first: "video game based on the Godfather movie trilogy" is a game, and
  // classifying it as a film let it shadow the actual film under the same name.
  if(/video game/.test(d)) return 'Game';
  if(/\bfilm\b|\bmovie\b/.test(d)) return 'Movie';
  if(/\bweb\s?(?:novel|serial|fiction)\b|\blight novel\b|\bnovel series\b/.test(d)) return 'Book';
  if(/\bseries\b/.test(d)) return null;
  return null;
}

async function findWikidata(query, signal = null){
  const data = await jget(WD + 'action=wbsearchentities&language=en&uselang=en&limit=12&search='
    + encodeURIComponent(query), signal);
  const hits = [];
  for(const [sourceRank, r] of (data.search || []).entries()){
    const kind = wikidataKind(r.description);
    if(!kind) continue;
    // The local table beats Wikidata on hours, so check it before offering a blank.
    const known = kind === 'Game' && hltbGames.find(g => loose(g.name) === loose(r.label));
    hits.push({kind, name:r.label, aliases:r.aliases || [], matchText:r.label,
      sourceRank, qid:r.id, hours: known ? known.main : null, estimated:kind === 'Game',
      note: known ? `Unverified local estimate · about ${known.main}h main story · checks source on add`
        : `Wikidata · ${kind === 'Book' ? (/light novel/i.test(r.description) ? 'light novel · ' : 'web fiction · ') : ''}${r.description}`});
    if(hits.length >= 5) break;
  }
  return hits;
}

/* ---- resolving a pick to real hours ------------------------------------ */
async function gameMainStoryProfile(pick){
  let id = pick.game?.sourceUrl?.match(/^https:\/\/howlongtobeat\.com\/game\/([1-9]\d{0,8})$/)?.[1];
  let qid = pick.qid;
  const names = [pick.name,...(pick.aliases || [])];
  if(!id){
    // Wikidata does not list every game or every completion-time source.
    // Missing metadata must not prevent a title lookup at the source itself.
    try{
      if(!qid){
        const matches = (await findWikidata(pick.name)).filter(hit => hit.kind === 'Game'
          && names.some(name => loose(hit.name) === loose(name)));
        if(matches.length === 1) qid = matches[0].qid;
      }
      if(qid){
        const data = await jget(WD + 'action=wbgetentities&props=claims&ids=' + encodeURIComponent(qid));
        const claims = (data.entities?.[qid]?.claims?.P2816 || []).filter(claim => claim.rank !== 'deprecated');
        const preferred = claims.filter(claim => claim.rank === 'preferred');
        const ids = [...new Set((preferred.length ? preferred : claims).map(claim => claim.mainsnak?.datavalue?.value)
          .filter(value => typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value)))];
        if(ids.length === 1) id = ids[0];
      }
    }catch(error){ /* The public source search below can still resolve this game. */ }
    if(!id){
      const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(pick.name)}`;
      const text = await fetchStoryText(`https://r.jina.ai/${searchUrl}`, {}, null, 20000);
      const matches = [...text.matchAll(/^#{1,6}\s+\[([^\]\r\n]+)\]\(https:\/\/howlongtobeat\.com\/game\/([1-9]\d{0,8})(?: "[^"\r\n]*")?\)/gm)]
        .filter(match => names.some(name => loose(name) === loose(match[1])));
      const ids = [...new Set(matches.map(match => match[2]))];
      if(ids.length !== 1) throw new Error('Could not identify an exact game match at the completion-time source.');
      id = ids[0];
    }
  }
  const sourceUrl = `https://howlongtobeat.com/game/${id}`;
  // Public completion data, read through the same browser-compatible reader
  // as story and playlist lookups. No private credential or backend is used.
  // Let the reader render the category headings; its direct engine can omit them.
  const text = await fetchStoryText(`https://r.jina.ai/${sourceUrl}`, {}, null, 20000);
  const hours = parseGameMainStory(text, id, names);
  if(hours === null) throw new Error('The source did not provide a matching main-story time.');
  const checkedOn = toDateValue(new Date());
  return {hours, game:{total:hours,played:0,sourceUrl,checkedOn},
    runtimeSource:`HowLongToBeat · main story · retrieved ${checkedOn}`, runtimeBasis:'estimated',
    ...(qid ? {catalogId:`wikidata:${qid}`} : {})};
}

async function wikidataHours(qid, kind){
  if(kind === 'Movie'){
    const e = await jget(WD + 'action=wbgetentities&props=claims&ids=' + qid);
    const mins = e.entities?.[qid]?.claims?.P2047?.[0]?.mainsnak?.datavalue?.value?.amount;
    if(mins) return {hours: Math.max(0.5, Math.round(Math.abs(+mins) / 60 * 10) / 10), known: true};
    return {hours: 2, known: false}; // A film with no runtime recorded. Two hours is the honest default.
  }
  if(kind === 'Book') return {hours:2, known:false};
  return {hours: 10, known: false}; // Wikidata carries no playtime for games.
}

async function showProfile(showId){
  const s = await jget(`https://api.tvmaze.com/shows/${showId}?embed=episodes`);
  // TVMaze includes scheduled episodes. The queue only counts episodes available
  // by launch, which matches the cutoff used for a podcast's projected backlog.
  const eps = (s._embedded?.episodes || []).filter(episode => {
    const airDate = episode.airstamp ? new Date(episode.airstamp) : fromDateValue(episode.airdate);
    return !airDate || airDate <= TARGET;
  });
  if(!eps.length) throw new Error('no episodes available before launch');
  // Fill isolated runtime gaps with the show's average instead of dropping those
  // episodes from the total or inventing a ten-episode season.
  const perEp = s.averageRuntime || s.runtime || 45;
  // Normalized to the saved-file rules, so a catalog quirk such as a repeated
  // episode number cannot make the next reload reject the whole queue.
  const episodes = TimeBridgeCore.normalizeShowEpisodes(eps.map(e => {
    const stamp = e.airstamp ? new Date(e.airstamp) : null;
    const availableOn = parseDateValue(e.airdate) ? e.airdate
      : stamp && Number.isFinite(+stamp) ? toDateValue(stamp) : null;
    return {season:e.season,number:e.number,seconds:Math.round((e.runtime || perEp) * 60),...(availableOn ? {availableOn} : {})};
  }));
  if(!episodes.length) throw new Error('No numbered episodes found');
  return {episodes, watched:0};
}

function storyMetadataFromHtml(html, sourceUrl){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const platform = webStoryPlatform(sourceUrl);
  const title = platform === 'ao3' ? doc.querySelector('h2.title')?.textContent
    : platform === 'fanfiction' ? doc.querySelector('#profile_top b.xcontrast_txt')?.textContent : '';
  const stats = platform === 'ao3' ? doc.querySelector('dl.stats')
    : platform === 'fanfiction' ? doc.querySelector('#profile_top .xgray') : null;
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  // Preserve boundaries between labels and values in detached HTML documents.
  doc.querySelectorAll('br,p,div,li,dt,dd,h1,h2,h3').forEach(node => node.append('\n'));
  const links = [...doc.querySelectorAll('a[href]')].flatMap(link => {
    try{ return [new URL(link.getAttribute('href'), sourceUrl).href]; }
    catch(error){ return []; }
  });
  const text = `Title: ${doc.title}\n`
    + (title ? `Story Title: ${title.trim()}\n` : '')
    + ((stats || doc.body)?.textContent || '') + '\n' + links.join('\n');
  return parseWebNovelMetadata(text, sourceUrl);
}

async function fetchStoryText(url, headers, signal, timeoutMs){
  return withRequestTimeout(timeoutMs, signal, async requestSignal => {
    const response = await fetch(url, {signal:requestSignal, headers});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  });
}

let youtubeApiPromise = null;
function loadYoutubePlayerApi(){
  if(window.YT?.Player) return Promise.resolve(window.YT);
  if(youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => reject(new Error('YouTube took too long to respond.')), 15000);
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      clearTimeout(timer);
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.dataset.youtubeIframeApi = 'true';
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('The YouTube player could not load.'));
    };
    document.head.append(script);
  }).catch(error => {
    youtubeApiPromise = null;
    throw error;
  });
  return youtubeApiPromise;
}

async function readYoutubePlaylistDurations(playlistId, onProgress){
  const YT = await loadYoutubePlayerApi();
  return new Promise((resolve, reject) => {
    const probe = $('youtubePlayerProbe');
    const holder = document.createElement('div');
    const mount = document.createElement('div');
    holder.append(mount);
    probe.append(holder);
    let player, videoIds = [], durations = [], index = 0, timer = null, settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      setTimeout(() => {
        try{ player?.destroy(); }catch(error){}
        holder.remove();
      }, 0);
    };
    const fail = message => {
      if(settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const cueCurrent = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fail(`Video ${index + 1} did not return a runtime.`), 12000);
      player.cueVideoById(videoIds[index]);
    };

    timer = setTimeout(() => fail('The YouTube player did not get ready.'), 15000);
    player = new YT.Player(mount, {
      width:'200', height:'200',
      playerVars:{listType:'playlist', list:playlistId, autoplay:0, controls:0, playsinline:1},
      events:{
        onReady(){
          player.getIframe().tabIndex = -1;
          videoIds = player.getPlaylist() || [];
          if(!videoIds.length) return fail('No playable videos were found in that playlist.');
          onProgress(0, videoIds.length);
          cueCurrent();
        },
        onStateChange(event){
          if(settled || event.data !== YT.PlayerState.CUED) return;
          if(player.getVideoData()?.video_id !== videoIds[index]) return;
          const duration = player.getDuration();
          if(!Number.isFinite(duration) || duration <= 0){
            return fail(`Video ${index + 1} did not return a runtime.`);
          }
          clearTimeout(timer);
          durations.push(duration);
          index += 1;
          onProgress(index, videoIds.length);
          if(index < videoIds.length) return cueCurrent();
          settled = true;
          cleanup();
          durations.videoIds = videoIds.slice();
          resolve(durations);
        },
        onError(){ fail(`Video ${index + 1} is unavailable or cannot be embedded.`); }
      }
    });
  });
}

async function readReaderPlaylistDurations(playlistId, onProgress){
  return withRequestTimeout(25000, null, async signal => {
    const response = await fetch(`https://r.jina.ai/https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`, {
      signal, headers:{Accept:'text/plain', 'X-No-Cache':'true'}
    });
    if(!response.ok) throw new Error('The playlist page could not be read.');
    const durations = parsePlaylistReader(await response.text(), playlistId);
    if(!durations) throw new Error('The playlist page did not include every video runtime.');
    onProgress(durations.length, durations.length);
    return durations;
  });
}

async function readDirectFilePlaylistDurations(playlistId, onProgress, minimumCount = 0){
  // A cached calculator response can omit a newly added video. Prefer the
  // current public page, accepting it only when all advertised videos appear.
  try{ return await readReaderPlaylistDurations(playlistId, onProgress); }
  catch(error){ /* Larger or inaccessible pages use the existing calculator. */ }
  const body = new FormData();
  body.set('search_string', `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`);
  body.set('range_start', '');
  body.set('range_end', '');
  body.set('custom_speed', '');
  body.set('youtube_api', '');
  const payload = await withRequestTimeout(20000, null, async signal => {
    const response = await fetch('https://youtubeplaylistlength.org/api/calculate', {
      method:'POST', body, signal
    });
    if(!response.ok) throw new Error('The direct-file playlist service could not complete the lookup.');
    return response.json();
  }, 'The direct-file playlist service timed out.');
  const result = payload?.success && payload.results?.find(item =>
    item?.type === 'playlist' && item.id === playlistId);
  if(!result) throw new Error('The direct-file playlist service returned an invalid result.');
  const videoCount = Number(result.videoCount);
  const consideredCount = Number(result.consideredCount);
  const unavailableCount = Number(result.unavailableCount);
  const durations = Array.isArray(result.videos)
    ? result.videos.filter(video => video?.considered).map(video => Number(video.durationSeconds))
    : [];
  if(!Number.isInteger(videoCount) || videoCount < 1
    || !Number.isInteger(consideredCount) || consideredCount < 1
    || !Number.isInteger(unavailableCount) || unavailableCount < 0
    || unavailableCount > 0 || consideredCount !== videoCount
    || durations.length !== consideredCount
    || durations.some(duration => !Number.isFinite(duration) || duration <= 0)){
    throw new Error(unavailableCount > 0
      ? `${unavailableCount} playlist video${unavailableCount === 1 ? ' is' : 's are'} unavailable.`
      : 'The direct-file playlist service returned incomplete runtimes.');
  }
  if(videoCount < minimumCount){
    throw new Error(`The fallback returned ${videoCount} videos, fewer than the saved ${minimumCount}. The current playlist page could not be verified.`);
  }
  onProgress(consideredCount, videoCount);
  const videoIds = result.videos.filter(video => video?.considered).map(video => video.id || video.videoId);
  if(videoIds.every(id => /^[\w-]{11}$/.test(id || ''))) durations.videoIds = videoIds;
  return durations;
}

function readPlaylistDurations(playlistId, onProgress, minimumCount = 0){
  return location.protocol === 'file:'
    ? readDirectFilePlaylistDurations(playlistId, onProgress, minimumCount)
    : readYoutubePlaylistDurations(playlistId, onProgress);
}

async function readYoutubePlaylistTitle(playlistId){
  // Always request the playlist itself, even when the pasted URL is a video.
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  try{
    return await withRequestTimeout(10000, null, async signal => {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {signal});
      if(!response.ok) throw new Error('Title lookup failed.');
      const data = await response.json();
      if(typeof data.title !== 'string' || !data.title.trim()) throw new Error('Missing playlist title.');
      return data.title.trim().slice(0, 120);
    });
  }catch(error){
    throw new Error('Could not read the playlist name from YouTube. Enter a name to add it manually.');
  }
}
