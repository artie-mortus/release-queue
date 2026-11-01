(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.TimeBridgeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MIN_ITEM_HOURS = 0.1;
  const MAX_ITEM_HOURS = 100000;
  const MAX_PORTABLE_SAVE_BYTES = 10 * 1024 * 1024;
  // Calibrated from the owner's real pace: a 384-page Lightning Thief takes
  // about two hours, rather than the generic ten-hour estimate used before.
  const DEFAULT_BOOK_PAGES_PER_HOUR = 190;
  const LIGHT_NOVEL_PAGES_PER_VOLUME = 250;
  const VALID_KINDS = new Set(['Game', 'Show', 'Movie', 'Book', 'Podcast', 'YouTube']);

  const fold = value => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/&/g, ' and ');

  const loose = value => fold(value)
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function editDistance(a, b){
    if(a === b) return 0;
    if(!a.length) return b.length;
    if(!b.length) return a.length;
    let prev = Array.from({length:b.length + 1}, (_, i) => i);
    for(let i = 1; i <= a.length; i++){
      const next = [i];
      for(let j = 1; j <= b.length; j++){
        next[j] = Math.min(
          next[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = next;
    }
    return prev[b.length];
  }

  const STOP_WORDS = new Set(['a', 'an', 'and', 'of', 'the', 'to']);
  const acronym = text => loose(text).split(' ')
    .filter(token => token && !STOP_WORDS.has(token))
    .map(token => token[0]).join('');

  function textScore(candidate, query){
    const name = loose(candidate), q = loose(query);
    if(!q || !name) return 999;
    if(name === q) return 0;

    const compactName = name.replace(/ /g, '');
    const compactQuery = q.replace(/ /g, '');
    if(compactName === compactQuery || acronym(name) === compactQuery) return 1;
    if(name.startsWith(q)) return 5 + Math.min(4, (name.length - q.length) / 12);
    if(name.includes(` ${q}`)) return 10 + Math.min(5, (name.length - q.length) / 12);

    const nameTokens = name.split(' '), queryTokens = q.split(' ');
    const costs = queryTokens.map(queryToken => Math.min(...nameTokens.map(nameToken => {
      if(nameToken === queryToken) return 0;
      if(nameToken.startsWith(queryToken)) return 0.18;
      return editDistance(nameToken, queryToken) / Math.max(nameToken.length, queryToken.length, 1);
    })));
    if(costs.every(cost => cost <= 0.4)){
      const fuzzyCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
      return 14 + fuzzyCost * 45 + Math.max(0, nameTokens.length - queryTokens.length) * 0.7;
    }

    const wholeCost = editDistance(name, q) / Math.max(name.length, q.length, 1);
    if(wholeCost <= 0.38) return 24 + wholeCost * 50;
    return 100 + costs.filter(cost => cost > 0.4).length * 10 + wholeCost * 10;
  }

  function relevance(name, query, aliases = []){
    return Math.min(...[name, ...aliases].map(candidate => textScore(candidate, query)));
  }

  function suggestionRank(suggestion, query){
    const matchScore = Number(suggestion?.matchScore);
    return Number.isFinite(matchScore)
      ? matchScore
      : relevance(suggestion?.matchText || suggestion?.name, query, suggestion?.aliases || []);
  }

  const finiteNumber = (value, fallback = 0) => {
    if(value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const clampNumber = (value, min, max, fallback = min) =>
    Math.min(max, Math.max(min, finiteNumber(value, fallback)));

  function resolveItemHoursEdit(currentHours, input){
    const text = String(input ?? '').trim();
    const division = text.match(/^\/\s*(\d+(?:\.\d+)?)$/);
    const value = division
      ? Number(currentHours) / Number(division[1])
      : Number(text);
    if(!Number.isFinite(value) || value < MIN_ITEM_HOURS || value > MAX_ITEM_HOURS) return null;
    return +value.toFixed(6);
  }

  function estimateBookHours(pages, pagesPerHour = DEFAULT_BOOK_PAGES_PER_HOUR){
    const safePages = finiteNumber(pages, NaN);
    const safePace = finiteNumber(pagesPerHour, NaN);
    if(!(safePages > 0) || !(safePace > 0)) return null;
    return Math.max(1, Math.round(safePages / safePace * 2) / 2);
  }

  function remainingReadingHours(pages, pagesPerHour, completedUnits = 0, totalUnits = pages){
    const safePages = finiteNumber(pages, NaN);
    const safePace = finiteNumber(pagesPerHour, NaN);
    const completed = finiteNumber(completedUnits, NaN);
    const total = finiteNumber(totalUnits, NaN);
    if(!(safePages > 0) || !(safePace > 0) || !(total > 0)
      || completed < 0 || completed >= total) return null;
    const remainingPages = safePages * (1 - completed / total);
    return Math.max(MIN_ITEM_HOURS, +(remainingPages / safePace).toFixed(1));
  }

  function bookProgressMeta(book){
    if(book.chapters) return {label:'Read', unit:'chapters', total:book.chapters};
    if(book.basis === 'words' && book.words) return {label:'Read', unit:'words', total:Math.round(book.words)};
    return {label:'Read', unit:'pages', total:Math.max(1, Math.round(book.pages))};
  }
  function remainingHoursForBook(book){
    return remainingReadingHours(book.pages, book.pagesPerHour, book.progress || 0, bookProgressMeta(book).total);
  }
  function showRemainingHours(show){
    return remainingPlaylistHours(show.episodes.map(e => e.seconds), show.watched);
  }
  function adjustedHours(item, hours){
    return hours === null ? null : Math.min(MAX_ITEM_HOURS, Math.max(MIN_ITEM_HOURS, +(hours * (item.runtimeScale || 1)).toFixed(1)));
  }
  function calculatedHours(item, podcastGrowth = 0){
    if(item.book) return item.book.progress ? remainingHoursForBook(item.book)
      : estimateBookHours(item.book.pages, item.book.pagesPerHour);
    if(item.show) return showRemainingHours(item.show);
    if(item.youtube?.durations) return remainingPlaylistHours(item.youtube.durations, item.youtube.watched, item.youtube.watchedIndices);
    if(item.pod) return item.pod.backlog + podcastGrowth;
    return item.hours;
  }
  // Only date/pace-derived media need synchronization on ordinary renders.
  // Show and playlist progress use their saved source data in explicit actions.
  function syncItemHours(item, bookPace, podcastGrowth = 0){
    let changed = false, hours = item.hours;
    if(item.kind === 'Game'){
      if(!item.game){ item.game = {total:item.hours, played:0}; changed = true; }
      hours = remainingGameHours(item.game);
    }else if(item.book && !item.book.pinned){
      if(!item.runtimeScale && item.book.pagesPerHour !== bookPace){
        item.book.pagesPerHour = bookPace; changed = true;
      }
      hours = adjustedHours(item, calculatedHours(item));
    }else if(item.pod && !item.pod.pinned){
      const rawHours = calculatedHours(item, podcastGrowth);
      if(rawHours >= 1) hours = adjustedHours(item, +rawHours.toFixed(1));
    }
    if(hours !== item.hours){ item.hours = hours; changed = true; }
    return changed;
  }

  function playlistHours(durations){
    if(!Array.isArray(durations) || !durations.length) return null;
    let seconds = 0;
    for(const duration of durations){
      const value = Number(duration);
      if(!Number.isFinite(value) || value <= 0) return null;
      seconds += value;
    }
    return Math.max(MIN_ITEM_HOURS, +(seconds / 3600).toFixed(1));
  }

  function remainingPlaylistHours(durations, watched = 0, watchedIndices = null){
    if(!Array.isArray(durations) || !Number.isInteger(watched)
      || watched < 0 || watched >= durations.length) return null;
    if(watchedIndices !== null){
      if(!Array.isArray(watchedIndices) || watchedIndices.length !== watched
        || new Set(watchedIndices).size !== watched
        || watchedIndices.some(index => !Number.isInteger(index) || index < 0 || index >= durations.length)) return null;
      const done = new Set(watchedIndices);
      return playlistHours(durations.filter((_, index) => !done.has(index)));
    }
    return playlistHours(durations.slice(watched));
  }

  function nextPlaylistIndex(youtube){
    const done = new Set(youtube.watchedIndices || Array.from({length:youtube.watched}, (_, i) => i));
    return youtube.durations.findIndex((_, index) => !done.has(index));
  }

  // Reader returns YouTube's visible playlist page. Only accept a complete,
  // ordered list whose per-video runtimes match the advertised video count.
  function parsePlaylistReader(text, playlistId){
    if(typeof text !== 'string' || !/^[\w-]{10,80}$/.test(playlistId)) return null;
    const source = text.match(/^URL Source:\s*(\S+)/m);
    try{
      const url = new URL(source?.[1]);
      if(!['www.youtube.com', 'youtube.com'].includes(url.hostname)
        || url.pathname !== '/playlist' || url.searchParams.get('list') !== playlistId) return null;
    }catch(error){ return null; }
    const count = Number(text.match(/\b([\d,]+)\s+videos\b/i)?.[1].replace(/,/g, ''));
    if(!Number.isInteger(count) || count < 1 || count > 10000) return null;
    const unavailableCount = Number(text.match(/\b([\d,]+)\s+unavailable videos? (?:are|is) hidden\b/i)?.[1].replace(/,/g, '') || 0);
    const playableCount = count - unavailableCount;
    if(!Number.isInteger(playableCount) || playableCount < 1) return null;
    const entries = new Map();
    const pattern = /^\[!\[[^\r\n]*?\]\([^\r\n]*?\)\s+(\d{1,3}:\d{2}(?::\d{2})?)\]\((https:\/\/(?:www\.)?youtube\.com\/watch\?[^\s)]+)\)\s*$/gm;
    for(const match of text.matchAll(pattern)){
      const url = new URL(match[2].replace(/&amp;/g, '&'));
      if(url.searchParams.get('list') !== playlistId) continue;
      const index = Number(url.searchParams.get('index'));
      const videoId = url.searchParams.get('v');
      const parts = match[1].split(':').map(Number);
      if(!Number.isInteger(index) || index < 1 || index > playableCount || !/^[\w-]{11}$/.test(videoId || '')
        || parts[parts.length - 1] > 59 || (parts.length === 3 && parts[1] > 59)) return null;
      const seconds = parts.reduce((total, part) => total * 60 + part, 0);
      if(seconds <= 0 || seconds > 604800) return null;
      const prior = entries.get(index);
      if(prior && (prior.videoId !== videoId || prior.seconds !== seconds)) return null;
      entries.set(index, {videoId, seconds});
    }
    if(entries.size !== playableCount) return null;
    const durations = Array.from({length:playableCount}, (_, index) => entries.get(index + 1).seconds);
    durations.videoIds = Array.from({length:playableCount}, (_, index) => entries.get(index + 1).videoId);
    if(unavailableCount) durations.unavailableCount = unavailableCount;
    return durations;
  }

  function refreshedPlaylist(durations, watched, latestDurations, identity = {}){
    if(!Array.isArray(durations) || !Array.isArray(latestDurations)
      || !latestDurations.length
      || !Number.isInteger(watched) || watched < 0 || watched >= durations.length
      || latestDurations.some(seconds => !Number.isInteger(seconds) || seconds <= 0 || seconds > 604800)){
      return null;
    }
    if(identity.videoIds && identity.latestVideoIds){
      if(!Array.isArray(identity.videoIds) || !Array.isArray(identity.latestVideoIds)
        || identity.videoIds.length !== durations.length || identity.latestVideoIds.length !== latestDurations.length
        || [...identity.videoIds, ...identity.latestVideoIds].some(id => !/^[\w-]{11}$/.test(id))
        || remainingPlaylistHours(durations, watched, identity.watchedIndices ?? null) === null) return null;
      const occurrenceKeys = ids => {
        const counts = new Map();
        return ids.map(id => { const n = counts.get(id) || 0; counts.set(id, n + 1); return `${id}:${n}`; });
      };
      const priorKeys = occurrenceKeys(identity.videoIds);
      const latestKeys = occurrenceKeys(identity.latestVideoIds);
      const priorIndices = identity.watchedIndices || Array.from({length:watched}, (_, i) => i);
      const done = new Set(priorIndices.map(index => priorKeys[index]));
      const watchedIndices = latestKeys.flatMap((key, index) => done.has(key) ? [index] : []);
      if(durations.length === latestDurations.length
        && durations.every((seconds, index) => seconds === latestDurations[index])
        && priorKeys.every((key, index) => key === latestKeys[index])) return null;
      return {durations:latestDurations.slice(), watched:watchedIndices.length, watchedIndices,
        hours:remainingPlaylistHours(latestDurations, watchedIndices.length, watchedIndices)};
    }
    // Noncontiguous progress cannot be mapped safely without IDs from both reads.
    if(identity.watchedIndices?.some((index, i) => index !== i)) return null;
    if(durations.length === latestDurations.length
      && durations.every((seconds, index) => seconds === latestDurations[index])) return null;
    const nextWatched = Math.min(watched, latestDurations.length - 1);
    const hours = remainingPlaylistHours(latestDurations, nextWatched);
    return hours === null ? null : {durations:latestDurations.slice(), watched:nextWatched, hours};
  }

  function estimateLightNovelPages(volumes){
    const safeVolumes = finiteNumber(volumes, NaN);
    if(!(safeVolumes > 0) || safeVolumes > 1000) return null;
    return Math.round(safeVolumes * LIGHT_NOVEL_PAGES_PER_VOLUME);
  }

  function bookPageCount(doc){
    const direct = finiteNumber(doc?.number_of_pages_median, NaN);
    if(direct >= 16 && direct <= 10000) return Math.round(direct);
    const editionPages = (doc?.editions?.docs || [])
      .map(edition => finiteNumber(edition?.number_of_pages, NaN))
      .filter(pages => pages >= 16 && pages <= 10000)
      .sort((a, b) => a - b);
    if(!editionPages.length) return null;
    const middle = Math.floor(editionPages.length / 2);
    const median = editionPages.length % 2
      ? editionPages[middle]
      : (editionPages[middle - 1] + editionPages[middle]) / 2;
    return Math.round(median);
  }

  function prepareBookSuggestions(docs, query, limit = 5){
    return (Array.isArray(docs) ? docs : [])
      .map((doc, sourceRank) => {
        const authors = Array.isArray(doc?.author_name) ? doc.author_name : [];
        const alternateTitles = Array.isArray(doc?.alternative_title) ? doc.alternative_title : [];
        const matchText = [doc?.title, ...alternateTitles, ...authors].filter(Boolean).join(' ');
        return {...doc, authors, matchText, sourceRank,
          matchScore: relevance(matchText, query), pages: bookPageCount(doc)};
      })
      // Open Library also ranks on series and subject data that we do not show.
      // Keep its first result even when the visible title omits the series name,
      // as with "The Lightning Thief" for a "Percy Jackson" query.
      .filter(doc => doc.title && (doc.sourceRank === 0 || doc.matchScore < 60))
      .sort((a, b) => a.sourceRank - b.sourceRank)
      .slice(0, Math.max(1, Math.floor(finiteNumber(limit, 5))));
  }

  function prepareLightNovelSuggestions(media, query, limit = 5){
    return (Array.isArray(media) ? media : [])
      .map((entry, sourceRank) => {
        const titles = [entry?.title?.english, entry?.title?.romaji, entry?.title?.native]
          .filter(Boolean);
        const aliases = [...titles.slice(1), ...(Array.isArray(entry?.synonyms) ? entry.synonyms : [])];
        const name = titles[0] || aliases[0];
        return {...entry, name, aliases, sourceRank,
          matchScore: relevance(name, query, aliases),
          pages: estimateLightNovelPages(entry?.volumes)};
      })
      .filter(entry => entry.name && entry.matchScore < 60)
      .sort((a, b) => a.matchScore - b.matchScore || a.sourceRank - b.sourceRank)
      .slice(0, Math.max(1, Math.floor(finiteNumber(limit, 5))));
  }

  function calculateSchedule({fullPace, ceiling, ytPerWeek = 0, startOff = 0, jobHours = 0, jobOff = Infinity}){
    const safeCeiling = Math.max(0, finiteNumber(ceiling));
    const safeFullPace = clampNumber(fullPace, 0, safeCeiling, 0);
    const safeYouTube = Math.max(0, finiteNumber(ytPerWeek));
    const safeJobHours = Math.max(0, finiteNumber(jobHours));
    const safeStart = Math.max(0, finiteNumber(startOff));
    const safeJobOff = Number.isFinite(jobOff) ? Math.max(safeStart, jobOff) : Infinity;
    const freeAfter = Math.max(0, safeCeiling - safeJobHours);
    const jobPace = safeCeiling > 0 ? safeFullPace * (freeAfter / safeCeiling) : 0;
    const pace = Math.max(0, safeFullPace - safeYouTube);
    const paceAfter = Math.max(0, jobPace - safeYouTube);
    const perDayBefore = pace / 7, perDayAfter = paceAfter / 7;
    const capBefore = safeJobOff === Infinity ? Infinity : (safeJobOff - safeStart) * perDayBefore;

    const dayForHour = hours => {
      if(hours <= 0) return safeStart;
      if(perDayBefore <= 0) return Infinity;
      if(hours <= capBefore) return safeStart + hours / perDayBefore;
      if(perDayAfter <= 0) return Infinity;
      return safeJobOff + (hours - capBefore) / perDayAfter;
    };
    const hoursByDay = day => {
      if(!Number.isFinite(day) || day <= safeStart) return 0;
      const beforeDays = Math.max(0, Math.min(day, safeJobOff) - safeStart);
      const afterDays = Number.isFinite(safeJobOff) ? Math.max(0, day - safeJobOff) : 0;
      return beforeDays * perDayBefore + afterDays * perDayAfter;
    };
    return {
      pace, paceAfter, fullPace:safeFullPace, jobPace, ceiling:safeCeiling, freeAfter,
      startOff:safeStart, jobOff:safeJobOff, dayForHour, hoursByDay,
      slows:safeJobHours > 0 && paceAfter < pace,
      stalls:safeJobHours > 0 && paceAfter <= 0 && pace > 0,
      ytStalls:safeYouTube > 0 && pace <= 0
    };
  }

  function queuePositionAtHours(items, completedHours){
    let hoursLeft = Math.max(0, Number(completedHours) || 0);
    for(let index = 0; index < items.length; index++){
      const itemHours = Math.max(0, Number(items[index].hours) || 0);
      if(hoursLeft >= itemHours - 1e-9){
        hoursLeft -= itemHours;
        continue;
      }
      return {index, remainingHours:itemHours - hoursLeft, itemsAfter:items.length - index - 1};
    }
    return null;
  }

  // Previews need only totals; timeline segments and queue position are optional
  // consumers of the same calendar model, not prerequisites for coverage.
  function forecastTotals(totalHours, plan, releaseDay, capacity){
    const days = Math.max(0, finiteNumber(releaseDay));
    capacity ??= plan.hoursByDay(days);
    const finishDay = plan.dayForHour(totalHours);
    return {totalHours, capacity, finishDay,
      missingHours:Math.max(0, capacity - totalHours),
      remainingHours:Math.max(0, totalHours - capacity),
      gapDays:Number.isFinite(finishDay) ? Math.max(0, days - finishDay) : 0,
      stalled:totalHours > 0 && !Number.isFinite(finishDay)};
  }

  // Summarize a positive-duration, immediately available item appended after
  // the current queue. It cannot fill earlier waits, so preserve those totals
  // and calculate only the new tail beyond the existing forecast endpoint.
  function previewAppend(before, plan, releaseDay, hours){
    const addedHours = Math.max(0, finiteNumber(hours));
    const days = Math.max(0, finiteNumber(releaseDay));
    // Undated queues already have exact cumulative hours. Converting their
    // endpoint back into hours can round a finish past a budget-stall boundary.
    if(!('waitingHours' in before)){
      return forecastTotals(before.totalHours + addedHours, plan, days, before.capacity);
    }
    const finishDay = Number.isFinite(before.finishDay)
      ? Math.max(before.finishDay, plan.dayForHour(plan.hoursByDay(before.finishDay) + addedHours))
      : Infinity;
    const consumed = Number.isFinite(before.finishDay)
      ? Math.min(addedHours, Math.max(0, before.capacity - plan.hoursByDay(before.finishDay)))
      : 0;
    const tailGap = finish => Number.isFinite(finish) ? Math.max(0, days - finish) : 0;
    const summary = {totalHours:before.totalHours + addedHours, capacity:before.capacity, finishDay,
      missingHours:Math.max(0, before.missingHours - consumed),
      remainingHours:before.remainingHours + addedHours - consumed,
      gapDays:before.gapDays - tailGap(before.finishDay) + tailGap(finishDay),
      stalled:before.totalHours + addedHours > 0 && !Number.isFinite(finishDay)};
    if('waitingHours' in before) summary.waitingHours = before.waitingHours;
    return summary;
  }

  // Calendar offsets and capacity come from the same piecewise schedule.
  function forecastQueue(items, plan, releaseDay, {today} = {}){
    if(items.some(item => item.show?.episodes.some(episode => episode.availableOn))){
      return forecastAvailableQueue(items, plan, releaseDay, today);
    }
    const days = Math.max(0, finiteNumber(releaseDay));
    let totalHours = 0;
    const segments = items.map(item => {
      const startDay = plan.dayForHour(totalHours);
      totalHours += Math.max(0, finiteNumber(item.hours));
      return {startDay, endDay:plan.dayForHour(totalHours)};
    });
    const totals = forecastTotals(totalHours, plan, days);
    return {...totals, segments, position:queuePositionAtHours(items, totals.capacity)};
  }

  // Playback order stays fixed. A known airdate can delay an episode and all
  // later items; that idle capacity is a gap, even if content remains at launch.
  function forecastAvailableQueue(items, plan, releaseDay, today){
    const now = new Date();
    const origin = parseDateValue(today) || new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
    const days = Math.max(0,finiteNumber(releaseDay));
    const capacity = plan.hoursByDay(days), waits = [], plays = [];
    let cursor = plan.startOff, totalHours = 0, consumed = 0, waitingHours = 0, waitingDays = 0;
    const segments = items.map((item,index) => {
      const hours = Math.max(0,finiteNumber(item.hours));
      totalHours += hours;
      const episodes = item.show?.episodes.slice(item.show.watched);
      const seconds = episodes?.reduce((sum,episode) => sum + episode.seconds,0);
      const chunks = seconds > 0 ? episodes.map(episode => ({
        hours:hours * episode.seconds / seconds,
        day:episode.availableOn ? Math.max(0,(parseDateValue(episode.availableOn) - origin) / 86400000) : 0
      })) : [{hours,day:0}];
      let startDay = null;
      for(const chunk of chunks){
        if(chunk.hours <= 0) continue;
        if(Number.isFinite(cursor) && chunk.day > cursor){
          waits.push({startDay:cursor,endDay:chunk.day});
          waitingHours += Math.max(0,plan.hoursByDay(Math.min(days,chunk.day)) - plan.hoursByDay(Math.min(days,cursor)));
          waitingDays += Math.max(0,Math.min(days,chunk.day) - Math.min(days,cursor));
          cursor = chunk.day;
        }
        startDay ??= cursor;
        if(cursor < days) consumed += Math.min(chunk.hours,Math.max(0,capacity - plan.hoursByDay(cursor)));
        const from = cursor;
        if(Number.isFinite(cursor)) cursor = Math.max(cursor,plan.dayForHour(plan.hoursByDay(cursor) + chunk.hours));
        const previous = plays.at(-1);
        if(previous?.index === index && previous.endDay === from) previous.endDay = cursor;
        else plays.push({index,startDay:from,endDay:cursor});
      }
      return {startDay:startDay ?? cursor,endDay:cursor};
    });
    consumed = Math.min(totalHours,capacity,consumed);
    return {totalHours,capacity,finishDay:cursor,segments,plays,waits,waitingHours,
      missingHours:Math.max(0,capacity-consumed), remainingHours:Math.max(0,totalHours-consumed),
      gapDays:waitingDays + (Number.isFinite(cursor) ? Math.max(0,days-cursor) : 0),
      stalled:totalHours > 0 && !Number.isFinite(cursor),position:queuePositionAtHours(items,consumed)};
  }

  function adjustPodcastCatalogCount(catalogCount, sampleCount, includedCount, futureCount = 0){
    const catalog = Math.max(0, Math.floor(finiteNumber(catalogCount)));
    const sampled = Math.max(0, Math.floor(finiteNumber(sampleCount)));
    const included = Math.max(0, Math.floor(finiteNumber(includedCount)));
    const future = Math.max(0, Math.floor(finiteNumber(futureCount)));
    const availableCatalog = Math.max(0, catalog - future);
    const availableSample = Math.max(0, sampled - future);
    if(!availableSample) return Math.max(included, availableCatalog);
    const keepShare = Math.min(1, included / availableSample);
    return Math.max(included, Math.round(availableCatalog * keepShare));
  }

  function parsePodCell(cell){
    if(!/eps=/.test(cell || '')) return null;
    const get = key => {
      const match = new RegExp(`${key}=([\\d.]+)`).exec(cell);
      return match ? Number(match[1]) : null;
    };
    const eps = get('eps'), avgMin = get('min'), perWeek = get('wk') || 0;
    if(!Number.isFinite(eps) || !Number.isFinite(avgMin) || !Number.isFinite(perWeek)
      || eps <= 0 || eps > 1000000 || avgMin <= 0 || avgMin > 1440 || perWeek < 0 || perWeek > 1000)
      return null;
    return {eps, avgMin, perWeek, ongoing:get('on') === 1,
      pinned:get('pin') === 1, backlog:+(eps * avgMin / 60).toFixed(1)};
  }

  function parseBookCell(cell){
    if(!/pages=/.test(cell || '')) return null;
    const get = key => {
      const match = new RegExp(`${key}=([\\d.]+)`).exec(cell);
      return match ? Number(match[1]) : null;
    };
    const pages = get('pages'), pagesPerHour = get('pph');
    const basis = /(?:^|;)basis=(pages|volumes|words|web-pages)(?:;|$)/.exec(cell)?.[1];
    if(!Number.isFinite(pages) || !Number.isFinite(pagesPerHour)
      || pages <= 0 || (basis !== 'words' && pages < 1) || pages > 10000000 || pagesPerHour < 1 || pagesPerHour > 1000)
      return null;
    const book = {pages, pagesPerHour, pinned:get('pin') === 1};
    const volumes = get('vol');
    if(basis === 'volumes'){
      if(!Number.isFinite(volumes) || volumes <= 0 || volumes > 1000) return null;
      book.basis = basis;
      book.volumes = volumes;
    }else if(basis === 'words' || basis === 'web-pages'){
      const platform = /(?:^|;)platform=(royal-road|wattpad|scribble-hub|ao3|fanfiction|web)(?:;|$)/.exec(cell)?.[1];
      const asOf = /(?:^|;)asof=(\d{4}-\d{2}-\d{2})(?:;|$)/.exec(cell)?.[1];
      const encodedUrl = /(?:^|;)url=([^;]+)(?:;|$)/.exec(cell)?.[1];
      const words = get('words');
      let url = null;
      try{
        url = new URL(decodeURIComponent(encodedUrl || ''));
        if(!/^https?:$/.test(url.protocol)) url = null;
      }catch(error){ /* invalid or missing URL */ }
      if(!platform || !validDateValue(asOf) || !url
        || (basis === 'words' && (!Number.isFinite(words) || words <= 0))) return null;
      book.basis = basis;
      book.platform = platform;
      book.asOf = asOf;
      book.url = url.href;
      if(basis === 'words') book.words = words;
    }
    const chapters = get('chapters');
    const progress = get('done');
    if(chapters !== null){
      if(!['words', 'web-pages'].includes(basis) || !Number.isInteger(chapters)
        || chapters < 1 || chapters > 100000) return null;
      book.chapters = chapters;
    }
    if(progress !== null){
      const total = chapters ?? (basis === 'words' ? book.words : Math.round(pages));
      if(!Number.isInteger(progress) || progress < 0 || !Number.isFinite(total) || progress >= total) return null;
      book.progress = progress;
    }
    return book;
  }

  function parsePlaylistUrl(value){
    try{
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      const playlistId = url.searchParams.get('list');
      return url.protocol === 'https:'
        && ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)
        && /^[\w-]{10,80}$/.test(playlistId || '') ? {url, playlistId} : null;
    }catch(error){ return null; }
  }

  function parseYouTubeCell(cell){
    const encodedUrl = /(?:^|;)url=([^;]+)(?:;|$)/.exec(cell || '')?.[1];
    if(!encodedUrl) return null;
    try{
      const parsed = parsePlaylistUrl(decodeURIComponent(encodedUrl));
      if(!parsed) return null;
      const {url, playlistId} = parsed;
      const youtube = {url:url.href, playlistId};
      const checkedText = /(?:^|;)checked=([^;]*)(?:;|$)/.exec(cell)?.[1];
      if(checkedText !== undefined){
        const checkedAt = Number(checkedText);
        if(!/^\d+$/.test(checkedText) || !Number.isSafeInteger(checkedAt) || checkedAt <= 0) return null;
        youtube.checkedAt = checkedAt;
      }
      const videos = /(?:^|;)videos=([\d.,]+)(?:;|$)/.exec(cell)?.[1];
      const watchedText = /(?:^|;)watched=(\d+)(?:;|$)/.exec(cell)?.[1];
      if(videos || watchedText){
        if(!videos || watchedText === undefined) return null;
        const durations = videos.split(',').map(Number);
        const watched = Number(watchedText);
        if(!durations.length || durations.length > 10000
          || durations.some(seconds => !Number.isInteger(seconds) || seconds <= 0 || seconds > 604800)
          || !Number.isInteger(watched) || watched < 0 || watched >= durations.length) return null;
        youtube.durations = durations;
        youtube.watched = watched;
      }
      const idsText = /(?:^|;)videoIds=([^;]*)(?:;|$)/.exec(cell)?.[1];
      if(idsText !== undefined){
        const videoIds = idsText.split(',');
        if(!youtube.durations || videoIds.length !== youtube.durations.length
          || videoIds.some(id => !/^[\w-]{11}$/.test(id))) return null;
        youtube.videoIds = videoIds;
      }
      const indicesText = /(?:^|;)watchedIndices=([^;]*)(?:;|$)/.exec(cell)?.[1];
      if(indicesText !== undefined){
        const indices = indicesText ? indicesText.split(',').map(Number) : [];
        if(!youtube.videoIds || !/^(?:\d+(?:,\d+)*)?$/.test(indicesText)
          || indices.length !== youtube.watched || new Set(indices).size !== indices.length
          || indices.some(index => !Number.isInteger(index) || index < 0 || index >= youtube.durations.length)) return null;
        youtube.watchedIndices = indices.sort((a, b) => a - b);
      }
      return youtube;
    }catch(error){
      return null;
    }
  }

  function parseDateValue(value, {local = false, minYear = 100} = {}){
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if(!match) return null;
    const year = Number(match[1]), month = Number(match[2]) - 1, day = Number(match[3]);
    if(year < minYear) return null;
    const date = local ? new Date(year, month, day) : new Date(Date.UTC(year, month, day));
    return (local ? date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
      : date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) ? date : null;
  }
  function validDateValue(value){
    return parseDateValue(value) !== null;
  }

  function remainingGameHours(game){
    if(!game || !Number.isFinite(game.total) || game.total < MIN_ITEM_HOURS || game.total > MAX_ITEM_HOURS
      || !Number.isFinite(game.played) || game.played < 0 || game.played > MAX_ITEM_HOURS) return null;
    return Math.max(0, +(game.total - game.played).toFixed(1));
  }

  // Read the completion category explicitly. The combined, side-content and
  // multiplayer figures on the same page are different planning quantities.
  function parseGameMainStory(text, id, names){
    if(typeof text !== 'string' || !/^[1-9]\d{0,8}$/.test(String(id)) || !Array.isArray(names)) return null;
    const title = text.match(/^Title: How long is (.+)\? \| HowLongToBeat\s*$/m)?.[1];
    const source = text.match(/^URL Source: (\S+)\s*$/m)?.[1];
    if(!title || !names.some(name => loose(name) === loose(title))
      || source !== `https://howlongtobeat.com/game/${id}`) return null;
    const value = text.match(/^#{1,6}\s+Main Story\s*\r?\n\s*#{1,6}\s+([^\r\n]+)/m)?.[1]
      .trim().replace(/(\d)([½¼¾])/g, (_, n, fraction) => String(+n + ({'½':0.5,'¼':0.25,'¾':0.75}[fraction])));
    if(!value) return null;
    const time = value.match(/^(?:(\d+(?:\.\d+)?)\s*(?:Hours?|Hrs?))?(?:\s*(\d+(?:\.\d+)?)\s*(?:Minutes?|Mins?))?$/i);
    if(!time || (!time[1] && !time[2])) return null;
    const hours = Number(time[1] || 0) + Number(time[2] || 0) / 60;
    return hours > 0 && hours <= MAX_ITEM_HOURS ? Math.max(MIN_ITEM_HOURS, +hours.toFixed(1)) : null;
  }

  function gameProgress(game, field, value){
    if(!['played','total'].includes(field) || !String(value).trim()) return null;
    const updated = {...game, [field]:Number(value)};
    if(remainingGameHours(updated) === null) return null;
    updated[field] = +updated[field].toFixed(1);
    return updated;
  }

  function showProgress(show, season, episode){
    const updated = {...show, season, watched:show.episodes.filter(e =>
      e.season < season || (e.season === season && e.number <= episode)).length};
    delete updated.pinned;
    return updated;
  }

  function parseGameCell(detail){
    try{
      if(!detail.startsWith('game=')) return null;
      const game = JSON.parse(decodeURIComponent(detail.slice(5)));
      if(remainingGameHours(game) === null) return null;
      const source = game.sourceUrl !== undefined || game.checkedOn !== undefined;
      if(source && (typeof game.sourceUrl !== 'string' || !/^https:\/\/howlongtobeat\.com\/game\/[1-9]\d{0,8}$/.test(game.sourceUrl)
        || !validDateValue(game.checkedOn))) return null;
      return {total:game.total, played:game.played,
        ...(source ? {sourceUrl:game.sourceUrl, checkedOn:game.checkedOn} : {})};
    }catch(error){ return null; }
  }

  function parseShowCell(detail){
    try{
      if(!detail.startsWith('show=')) return null;
      const show = JSON.parse(decodeURIComponent(detail.slice(5)));
      if(!Array.isArray(show.episodes) || !show.episodes.length || show.episodes.length > 100000
        || !Number.isInteger(show.watched) || show.watched < 0 || show.watched >= show.episodes.length
        || (show.pinned !== undefined && typeof show.pinned !== 'boolean')) return null;
      let previous = null;
      for(const e of show.episodes){
        if(!Number.isInteger(e.season) || e.season < 0 || !Number.isInteger(e.number) || e.number < 1
          || !Number.isInteger(e.seconds) || e.seconds <= 0 || e.seconds > 86400
          || (e.availableOn !== undefined && !validDateValue(e.availableOn))
          || (previous && (e.season < previous.season || (e.season === previous.season && e.number <= previous.number)))) return null;
        previous = e;
      }
      if(show.season !== undefined && (!Number.isInteger(show.season)
        || !show.episodes.some(e => e.season === show.season))) return null;
      if(playlistHours(show.episodes.map(e => e.seconds)) === null) return null;
      return show;
    }catch(error){ return null; }
  }

  function validateReleaseTarget(value){
    if(!value || typeof value !== 'object') return null;
    const cleanText = (text, limit) => typeof text === 'string' && text.trim().length > 0
      && text.length <= limit && !/[\r\n<>]/.test(text);
    if(!cleanText(value.gameName, 120) || !cleanText(value.gameShortName, 120)
      || !cleanText(value.dateLabel, 120) || !parseDateValue(value.releaseDate, {minYear:1900})) return null;
    const sourceUrl = value.sourceUrl || '';
    if(typeof sourceUrl !== 'string' || (sourceUrl && !/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(sourceUrl))) return null;
    return {gameName:value.gameName.trim(), gameShortName:value.gameShortName.trim(),
      releaseDate:value.releaseDate, dateLabel:value.dateLabel.trim(), sourceUrl};
  }

  function queueItemsMatch(a,b){
    if(!a || !b || a.kind !== b.kind) return false;
    const identity = item => {
      if(item.youtube?.playlistId) return `playlist:${item.youtube.playlistId}`;
      if(item.book?.url){
        try{
          const url = new URL(item.book.url), platform = webStoryPlatform(url.href);
          const pattern = platform === 'ao3' ? /^\/works\/(\d+)/
            : platform === 'fanfiction' ? /^\/s\/(\d+)/
            : platform === 'royal-road' ? /^\/fiction\/(\d+)/
            : platform === 'scribble-hub' ? /^\/series\/(\d+)/ : null;
          const match = pattern && url.pathname.match(pattern);
          return match ? `${platform}:${match[1]}`
            : `story:${url.hostname.toLowerCase().replace(/^www\./,'')}${url.pathname.replace(/\/$/,'')}`;
        }catch(error){ /* Legacy malformed source URLs fall back to the title. */ }
      }
      return item.catalogId || '';
    };
    const first = identity(a), second = identity(b);
    if(first && second) return first === second;
    return !!loose(a.name) && loose(a.name) === loose(b.name);
  }

  const escCell = v => String(v).replace(/\|/g, '\\|');

  // A podcast's hours are derived from four numbers, so the four numbers are what
  // gets saved. Storing only the total would freeze a growing show at whatever it
  // happened to be the day you closed the tab.
  const podCell = pod => !pod ? '' :
    `eps=${pod.eps};min=${pod.avgMin};wk=${pod.perWeek};on=${pod.ongoing ? 1 : 0};pin=${pod.pinned ? 1 : 0}`;
  const bookCell = book => !book ? '' :
    `pages=${book.pages};pph=${book.pagesPerHour};pin=${book.pinned ? 1 : 0}`
      + (book.basis === 'volumes' ? `;basis=volumes;vol=${book.volumes}` : '')
      + (book.basis === 'words'
        ? `;basis=words;words=${book.words};platform=${book.platform};asof=${book.asOf};url=${encodeURIComponent(book.url)}` : '')
      + (book.basis === 'web-pages'
        ? `;basis=web-pages;platform=${book.platform};asof=${book.asOf};url=${encodeURIComponent(book.url)}` : '')
      + (book.chapters ? `;chapters=${book.chapters}` : '')
      + (book.progress ? `;done=${book.progress}` : '');
  const youtubeCell = youtube => !youtube ? '' : `url=${encodeURIComponent(youtube.url)}`
    + (youtube.durations
      ? `;videos=${youtube.durations.join(',')};watched=${youtube.watched}` : '')
    + (youtube.checkedAt ? `;checked=${youtube.checkedAt}` : '')
    + (youtube.videoIds ? `;videoIds=${youtube.videoIds.join(',')}` : '')
    + (youtube.watchedIndices ? `;watchedIndices=${youtube.watchedIndices.join(',')}` : '');
  const showCell = show => !show ? '' : `show=${encodeURIComponent(JSON.stringify(show))}`;
  const gameCell = game => !game ? '' : `game=${encodeURIComponent(JSON.stringify(game))}`;
  const detailCell = item => podCell(item.pod) || bookCell(item.book) || youtubeCell(item.youtube) || showCell(item.show) || gameCell(item.game);

  const extraCell = item => encodeURIComponent(JSON.stringify({runtimeScale:item.runtimeScale,
    estimateNeeded:item.estimateNeeded, completedAt:item.completedAt, runtimeSource:item.runtimeSource, runtimeBasis:item.runtimeBasis,catalogId:item.catalogId}));
  const stateRows = items => items.map(x =>
    `| ${escCell(x.name)} | ${x.kind} | ${x.hours} | ${detailCell(x)} | ${extraCell(x)} |`).join('\n');
  function serializeState({appName, target, savedAt, schedule, queue, completed}){
    const rows = stateRows(queue);
    return `# ${appName}

<!-- queue-save:v1 -->
<!-- queue-target:v1 ${encodeURIComponent(JSON.stringify(target))} -->

Saved ${savedAt.toLocaleString()}. Use Load file in ${appName} to restore this queue and its settings.
Target: ${target.gameName}, ${target.releaseDate}. Loading this file restores this game and release date.

## Schedule

- Schedule mode: ${schedule.scheduleMode}
- Fall asleep: ${schedule.sleepStart}
- Wake up: ${schedule.sleepEnd}
- Hours per week: ${schedule.pace}
- Start on: ${schedule.startDate}
- Job hours: ${schedule.jobHours}
- Job starts: ${schedule.jobDate}
- YouTube per: ${schedule.ytUnit}
- YouTube amount: ${schedule.ytAmount}
- Book pages per hour: ${schedule.bookPagesPerHour}

## Queue

| Item | Kind | Hours | Detail | Metadata |
| --- | --- | --- | --- | --- |
${rows || '| (empty) | | | |'}

## Completed

| Item | Kind | Hours | Detail | Metadata |
| --- | --- | --- | --- | --- |
${stateRows(completed) || '| (empty) | | | | |'}
`;
  }


  function parseStateRows(section, {archive = false} = {}){
    if(archive && !/^\|\s*Item\s*\|\s*Kind\s*\|\s*Hours\s*\|/im.test(section))
      return {ok:false, error:'The queue save is incomplete.'};
    const queue = [];
    for(const line of section.split('\n')){
      const match = line.match(/^\s*\|(.+)\|\s*$/);
      if(!match) continue;
      const cells = match[1].split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
      const [name, kind, hours, detail, extra] = cells;
      const isHeader = name === 'Item' && kind === 'Kind' && hours === 'Hours';
      const isDivider = cells.every(cell => /^-+$/.test(cell));
      const isEmpty = name === '(empty)' && !kind && !hours;
      if(isHeader || isDivider || isEmpty) continue;
      const parsedHours = Number(hours);
      const game = kind === 'Game' && detail ? parseGameCell(detail) : null;
      if(kind === 'Game' && detail && !game) return {ok:false, error:`Invalid game details for ${name}.`};
      if(cells.length < 3 || !VALID_KINDS.has(kind) || !Number.isFinite(parsedHours)
        || parsedHours < (game ? 0 : MIN_ITEM_HOURS) || parsedHours > MAX_ITEM_HOURS){
        return {ok:false, error:`Invalid queue row: ${line.trim().slice(0, 100)}`};
      }
      const show = kind === 'Show' && detail ? parseShowCell(detail) : null;
      if(kind === 'Show' && detail && !show) return {ok:false, error:`Invalid show details for ${name}.`};
      const pod = kind === 'Podcast' && detail ? parsePodCell(detail) : null;
      const book = kind === 'Book' && detail ? parseBookCell(detail) : null;
      const youtube = kind === 'YouTube' && detail ? parseYouTubeCell(detail) : null;
      if(kind === 'Podcast' && detail && !pod){
        return {ok:false, error:`Invalid podcast details for ${name}.`};
      }
      if(kind === 'Book' && detail && !book){
        return {ok:false, error:`Invalid book details for ${name}.`};
      }
      if(kind === 'YouTube' && !youtube){
        return {ok:false, error:`Invalid YouTube playlist details for ${name}.`};
      }
      queue.push(pod ? {name, kind, hours:parsedHours, pod}
        : book ? {name, kind, hours:parsedHours, book}
        : game ? {name, kind, hours:remainingGameHours(game), game}
        : show ? {name, kind, hours:show.pinned ? parsedHours : remainingPlaylistHours(show.episodes.map(e => e.seconds), show.watched), show}
        : youtube ? {name, kind, hours:parsedHours, youtube}
        : {name, kind, hours:parsedHours});
      if(extra){
        try{
          const metadata = JSON.parse(decodeURIComponent(extra));
          if(!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
            || (metadata.runtimeScale !== undefined && (!Number.isFinite(metadata.runtimeScale) || metadata.runtimeScale <= 0 || metadata.runtimeScale > 1000000))
            || (metadata.estimateNeeded !== undefined && typeof metadata.estimateNeeded !== 'boolean')
            || (metadata.runtimeSource !== undefined && (typeof metadata.runtimeSource !== 'string' || metadata.runtimeSource.length > 160))
            || (metadata.runtimeBasis !== undefined && !['measured','estimated','manual'].includes(metadata.runtimeBasis))
            || (metadata.catalogId !== undefined && (typeof metadata.catalogId !== 'string' || !/^(tvmaze|itunes|wikidata):[A-Za-z0-9_-]{1,100}$/.test(metadata.catalogId)))
            || (metadata.completedAt !== undefined && !validDateValue(metadata.completedAt))) throw new Error();
          const item = queue[queue.length - 1];
          for(const key of ['runtimeScale', 'estimateNeeded', 'completedAt', 'runtimeSource', 'runtimeBasis','catalogId']) if(metadata[key] !== undefined) item[key] = metadata[key];
          if(item.runtimeScale !== undefined) item.hours = parsedHours;
        }catch(error){ return {ok:false, error:`Invalid estimate details for ${name}.`}; }
      }
    }
    if(archive && queue.some(item => !item.completedAt))
      return {ok:false, error:'Completed items need a completion date.'};
    return {ok:true, items:queue};
  }

  function stateSections(text){
    const sections = new Map();
    const headings = [...text.matchAll(/^##[ \t]+([^\r\n]+?)[ \t]*\r?$/gm)];
    headings.forEach((heading, index) => {
      const name = heading[1].toLowerCase();
      if(!sections.has(name)) sections.set(name, text.slice(heading.index + heading[0].length,
        headings[index + 1]?.index ?? text.length));
    });
    return sections;
  }

  function parseStateText(text){
    if(typeof text !== 'string') return {ok:false, error:'This is not a queue save file.'};
    if(!(/^<!-- queue-save:v1 -->\s*$/m.test(text)
      || /^#\s+(?:GTA Queue|Time Bridge)\s*$/im.test(text))){
      return {ok:false, error:'This is not a queue save file.'};
    }
    const sections = stateSections(text);
    if(!sections.has('schedule') || !sections.has('queue')) return {ok:false, error:'This is not a queue save file.'};
    const pick = regexp => {
      const match = sections.get('schedule').match(regexp);
      return match ? match[1] : null;
    };
    const schedule = {
      sleepStart:pick(/-\s*Fall asleep:\s*(\d+)/i),
      sleepEnd:pick(/-\s*Wake up:\s*(\d+)/i),
      pace:pick(/-\s*Hours per week:\s*([\d.]+)/i),
      startDate:pick(/-\s*Start on:\s*(\d{4}-\d{2}-\d{2})/i),
      jobHours:pick(/-\s*Job hours:\s*([\d.]+)/i),
      jobDate:pick(/-\s*Job starts:\s*(\d{4}-\d{2}-\d{2})/i),
      ytUnit:pick(/-\s*YouTube per:\s*(day|week)/i),
      ytAmount:pick(/-\s*YouTube amount:\s*([\d.]+)/i)
    };
    const scheduleMode = pick(/-\s*Schedule mode:\s*(\w+)/i) || 'advanced';
    if(!['simple', 'advanced'].includes(scheduleMode)) return {ok:false, error:'Invalid schedule mode.'};
    const bookPagesPerHour = pick(/-\s*Book pages per hour:\s*([\d.]+)/i);
    const required = Object.values(schedule);
    if(required.some(value => value === null) || !/^\|\s*Item\s*\|\s*Kind\s*\|\s*Hours\s*\|/im.test(text)){
      return {ok:false, error:'The queue save is incomplete.'};
    }
    const ytMax = schedule.ytUnit.toLowerCase() === 'week' ? 168 : 24;
    if(!['20','21','22','23','0','1','2','3','4'].includes(schedule.sleepStart)
      || !['5','6','7','8','9','10','11','12'].includes(schedule.sleepEnd)
      || !validDateValue(schedule.startDate) || !validDateValue(schedule.jobDate)
      || !Number.isFinite(Number(schedule.pace)) || Number(schedule.pace) < 1 || Number(schedule.pace) > 168
      || !Number.isFinite(Number(schedule.jobHours)) || Number(schedule.jobHours) < 0 || Number(schedule.jobHours) > 90
      || !Number.isFinite(Number(schedule.ytAmount)) || Number(schedule.ytAmount) < 0 || Number(schedule.ytAmount) > ytMax
      || (bookPagesPerHour !== null && (!Number.isFinite(Number(bookPagesPerHour))
        || Number(bookPagesPerHour) < 20 || Number(bookPagesPerHour) > 1000))){
      return {ok:false, error:'The saved schedule contains values outside their allowed range.'};
    }
    const active = parseStateRows(sections.get('queue'));
    if(!active.ok) return active;
    const queue = active.items;
    let completed = [];
    if(sections.has('completed')){
      const archive = parseStateRows(sections.get('completed'), {archive:true});
      if(!archive.ok) return {ok:false, error:'Invalid completed archive: ' + archive.error};
      completed = archive.items;
    }
    let target = null;
    const targetMarker = text.match(/<!-- queue-target:v1 ([^\s]+) -->/);
    if(text.includes('<!-- queue-target:')){
      try{ target = targetMarker && validateReleaseTarget(JSON.parse(decodeURIComponent(targetMarker[1]))); }
      catch(error){ /* Reject malformed targets before applying any imported state. */ }
      if(!target) return {ok:false, error:'Invalid game or release date in this save.'};
    }
    return {ok:true, schedule:{...schedule, bookPagesPerHour, scheduleMode}, queue, completed, ...(target ? {target} : {})};
  }

  function webStoryPlatform(sourceUrl){
    let host;
    try{ host = new URL(sourceUrl).hostname.toLowerCase(); }catch(error){ return 'web'; }
    for(const [domain, platform] of [['royalroad.com', 'royal-road'], ['wattpad.com', 'wattpad'],
      ['scribblehub.com', 'scribble-hub'], ['archiveofourown.org', 'ao3'], ['fanfiction.net', 'fanfiction']]){
      if(host === domain || host.endsWith(`.${domain}`)) return platform;
    }
    return 'web';
  }

  function parseWebNovelMetadata(text, sourceUrl = ''){
    const clean = String(text || '').replace(/\r/g, '');
    const titleLine = clean.match(/^Title:\s*(.+)$/mi)?.[1]
      || clean.match(/^#\s+(.+)$/m)?.[1]
      || clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    let title = titleLine ? titleLine.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    title = title.replace(/\s*[|–—-]\s*(Royal Road|Wattpad|Scribble Hub)\s*$/i, '').trim();

    const platform = webStoryPlatform(sourceUrl);
    if(platform === 'ao3' || platform === 'fanfiction'){
      // Reader returns Markdown links in stats. Only use explicit stats, never
      // chapter numbers mentioned in a title, summary, or the story itself.
      const stats = clean.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '');
      const count = label => {
        const match = stats.match(new RegExp(`\\b${label}\\s*:\\s*([\\d,]+)`, 'i'));
        const number = match ? Number(match[1].replace(/,/g, '')) : null;
        return Number.isInteger(number) && number > 0 ? number : null;
      };
      let chapters = count('Chapters');
      const words = count('Words');
      const storyTitle = clean.match(/^Story Title:\s*(.+)$/mi)?.[1];
      if(storyTitle) title = storyTitle.trim();
      else if(platform === 'ao3'){
        title = title.replace(/\s*\|\s*Archive of Our Own\s*$/i, '')
          .split(/\s+-\s+(?:Chapter\s+\d+\s+-\s+)?/i)[0].trim();
      }else{
        title = title.replace(/\s*\|\s*FanFiction(?:\.net)?\s*$/i, '')
          .replace(/\s+Chapter\s+\d+\b[\s\S]*$/i, '')
          .replace(/,\s+(?:an?\s+)?[^,]+\s+fanfic\s*$/i, '').trim();
      }
      // FanFiction.net omits the chapter stat on single-chapter stories.
      if(platform === 'fanfiction' && !chapters && words) chapters = 1;
      if(!words && !chapters) title = '';
      return {title:title.slice(0, 120), chapters:chapters <= 100000 ? chapters : null,
        words:words <= 500000000 ? words : null, wordsEstimated:false};
    }

    const counts = [];
    const countPatterns = [
      /\b(?:total\s+)?chapters?\s*[:|·-]?\s*([\d,]{1,7})\b/gi,
      /\b([\d,]{1,7})\s+(?:published\s+)?chapters?\b/gi,
      /\bchapter\s+count\s*[:|·-]?\s*([\d,]{1,7})\b/gi
    ];
    for(const pattern of countPatterns){
      for(const match of clean.matchAll(pattern)){
        const count = Number(match[1].replace(/,/g, ''));
        if(Number.isInteger(count) && count > 0 && count <= 100000) counts.push(count);
      }
    }

    const chapterUrls = new Set();
    const baseHost = (() => { try{ return new URL(sourceUrl).hostname.replace(/^www\./, ''); }catch(error){ return ''; } })();
    for(const match of clean.matchAll(/https?:\/\/[^\s)>\]]+/gi)){
      try{
        const url = new URL(match[0].replace(/[.,;]+$/, ''));
        const host = url.hostname.replace(/^www\./, '');
        if((!baseHost || host === baseHost) && /(?:\/chapter(?:[-_/]|\d)|\/chapters\/|\/read\/[^/]+\/chapter)/i.test(url.pathname)){
          url.hash = '';
          chapterUrls.add(url.href);
        }
      }catch(error){ /* Ignore malformed links in extracted page text. */ }
    }
    if(chapterUrls.size) counts.push(chapterUrls.size);

    const numberAfterLabel = label => {
      const match = clean.match(new RegExp(`\\b${label}\\s*[:|·-]?\\s*(?:\\n\\s*[*-]?\\s*)?([\\d,]+)\\b`, 'i'));
      if(!match) return null;
      const value = Number(match[1].replace(/,/g, ''));
      return Number.isInteger(value) && value > 0 && value <= 500000000 ? value : null;
    };
    const reportedWords = numberAfterLabel('(?:total\\s+)?word(?:s|\\s+count)');
    const reportedPages = numberAfterLabel('pages?');
    const isRoyalRoad = baseHost === 'royalroad.com' || baseHost.endsWith('.royalroad.com');
    const words = reportedWords || (isRoyalRoad && reportedPages ? reportedPages * 275 : null);

    return {
      title:title.slice(0, 120),
      chapters:counts.length ? Math.max(...counts) : null,
      words,
      wordsEstimated:!reportedWords && Boolean(words)
    };
  }

  return {
    MIN_ITEM_HOURS, MAX_ITEM_HOURS, MAX_PORTABLE_SAVE_BYTES, DEFAULT_BOOK_PAGES_PER_HOUR, LIGHT_NOVEL_PAGES_PER_VOLUME,
    loose, relevance, suggestionRank, editDistance, finiteNumber, clampNumber, resolveItemHoursEdit,
    estimateBookHours, remainingReadingHours, bookProgressMeta, remainingHoursForBook, showRemainingHours,
    adjustedHours, calculatedHours, syncItemHours,
    playlistHours, remainingPlaylistHours, nextPlaylistIndex, refreshedPlaylist, parsePlaylistReader,
    estimateLightNovelPages, bookPageCount, prepareBookSuggestions, prepareLightNovelSuggestions,
    calculateSchedule, queuePositionAtHours, forecastTotals, forecastQueue, previewAppend, adjustPodcastCatalogCount, parsePodCell, parseBookCell, parsePlaylistUrl, parseYouTubeCell,
    remainingGameHours, parseGameMainStory, gameProgress, showProgress, parseGameCell, parseShowCell, serializeState, parseStateText, parseWebNovelMetadata, webStoryPlatform, parseDateValue, validateReleaseTarget,queueItemsMatch
  };
});
