/* Pure calculation stays separate from DOM rendering. */
let queue = [], completed = [];
const undoStack = [];
let dismissedUndoEntry = null;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const {MIN_ITEM_HOURS, MAX_ITEM_HOURS, DEFAULT_BOOK_PAGES_PER_HOUR, LIGHT_NOVEL_PAGES_PER_VOLUME,
       loose, relevance, suggestionRank, clampNumber, estimateBookHours, prepareBookSuggestions,
       prepareLightNovelSuggestions, calculateSchedule, adjustPodcastCatalogCount, playlistHours,
       remainingPlaylistHours, nextPlaylistIndex, refreshedPlaylist, parsePlaylistReader, parseStateText, parseWebNovelMetadata,
       remainingGameHours, parseGameMainStory, gameProgress, showProgress, parseDateValue, parsePlaylistUrl, bookProgressMeta, remainingHoursForBook,
       showRemainingHours, adjustedHours, syncItemHours, resolveItemHoursEdit, forecastTotals, forecastQueue, webStoryPlatform, validateReleaseTarget,queueItemsMatch} = TimeBridgeCore;
const KIND_ICON = {Game:'game-controller', Show:'television', Movie:'film-reel', Book:'book',
                   Podcast:'microphone-stage', YouTube:'youtube-logo'};
const num1 = n => +(+n).toFixed(1);
const WEB_WORDS_PER_PAGE = 275;
const WEB_PLATFORM_LABEL = {'royal-road':'Royal Road', wattpad:'Wattpad',
  'scribble-hub':'Scribble Hub', ao3:'AO3', fanfiction:'FanFiction.net', web:'Web novel'};

const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
// Normalised through UTC so a clock change inside the span cannot shift the
// count by a day. Local midnight over 86400000 does exactly that wherever the
// offset crosses zero (the UK and Portugal, every October).
const dayNumber = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
const fmtDate = d => d.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Build these by hand: `new Date('2026-09-15')` parses as UTC and lands on the wrong local day.
const toDateValue = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function fromDateValue(v){
  return parseDateValue(v, {local:true});
}
let TARGET = fromDateValue(SITE_CONFIG.releaseDate);
if(!TARGET) throw new Error('SITE_CONFIG.releaseDate must be a valid YYYY-MM-DD date.');
function currentReleaseTarget(){
  const {gameName, gameShortName, releaseDate, dateLabel, sourceUrl = ''} = SITE_CONFIG;
  return {gameName, gameShortName, releaseDate, dateLabel, sourceUrl};
}
function setReleaseTarget(target){
  SITE_CONFIG = Object.freeze({...DEFAULT_SITE_CONFIG, ...target});
  TARGET = fromDateValue(SITE_CONFIG.releaseDate);
  document.title = `${APP_NAME} · ${SITE_CONFIG.gameName}`;
  $('brandName').textContent = SITE_CONFIG.gameName;
  $('targetLabel').textContent = SITE_CONFIG.dateLabel;
  $('targetDate').textContent = TARGET.toLocaleDateString('en-GB', {
    weekday:'short', day:'2-digit', month:'short', year:'numeric'
  }).replace(/,/g, '');
  $('selectedGameName').textContent = SITE_CONFIG.gameName;
  scenarioDirty = false;
  syncGameTargetForm();
}
// The tool has no notion of progress already made, so a start before today would
// quietly claim you had already done those hours. Today is the floor.
function startDate(today = midnight(new Date()), value = $('startDate').value){
  const picked = fromDateValue(value);
  return (!picked || picked < today) ? today : picked;
}
const fmtHours = h => `${+h.toFixed(1)} hour${h === 1 ? '' : 's'}`;

function readSchedule(){
  const sleepStart = $('sleepStart').value, sleepEnd = $('sleepEnd').value, mode = $('scheduleMode').value;
  const start = +sleepStart, end = +sleepEnd;
  const sleep = (end - start + 24) % 24 || 24, awake = 24 - sleep, ceiling = awake * 7;
  const budgetCeiling = mode === 'simple' ? 168 : ceiling;
  return {sleep, awake, ceiling:budgetCeiling, pace:clampNumber($('paceInput').value, 1, budgetCeiling, 1),
    mode, sleepStart, sleepEnd};
}

function readBookPace(){
  return clampNumber($('bookPace').value, 20, 1000, DEFAULT_BOOK_PAGES_PER_HOUR);
}

function renderBookPaceHint(bookPace = readBookPace()){
  const hours = estimateBookHours(384, bookPace);
  $('bookPaceHint').textContent = `384 pages lands at about ${fmtHours(hours)}.`;
}

/* ---- countdown --------------------------------------------------------- */
function renderCountdown(now = new Date()){
  const diff = TARGET - now;
  if(diff <= 0){
    $('cd-d').textContent = '00'; $('cd-h').textContent = '00';
    $('cd-m').textContent = '00'; $('cd-s').textContent = '00';
    $('cdText').textContent = `${SITE_CONFIG.gameName} release date has passed`;
    return;
  }
  const sec = Math.floor(diff / 1000);
  const pad = n => String(n).padStart(2, '0');
  $('cd-d').textContent = Math.floor(sec / 86400);
  $('cd-d').style.fontSize = $('cd-d').textContent.length > 4 ? 'clamp(24px,3vw,40px)' : '';
  $('cd-h').textContent = pad(Math.floor(sec % 86400 / 3600));
  $('cd-m').textContent = pad(Math.floor(sec % 3600 / 60));
  $('cd-s').textContent = pad(sec % 60);
  $('cdText').textContent = `${Math.floor(sec/86400)} days until ${SITE_CONFIG.gameName}`;
}

/* ---- the pace model ----------------------------------------------------
   A job starting mid-timeline means the pace is piecewise, not constant: full
   rate until the job begins, a reduced rate after. Everything downstream asks
   `dayForHour` how far into the calendar a given cumulative hour lands, rather
   than dividing by one rate.                                              */
function readJob(today = midnight(new Date()), mode = $('scheduleMode').value){
  const hoursValue = $('jobHours').value, dateValue = $('jobStart').value;
  const hours = mode === 'simple' ? 0 : clampNumber(hoursValue, 0, 90, 0);
  const picked = fromDateValue(dateValue);
  const date = (!picked || picked < today) ? today : picked;
  return {hours, date, hoursValue, dateValue, startOff:Math.max(0, dayNumber(date) - dayNumber(today))};
}

/* ---- YouTube: a rate, not a pile --------------------------------------
   One dial, read as hours a day or hours a week. It comes off your *pace*
   rather than off the ceiling the way a job does, because YouTube is drawn
   from exactly the leisure budget the queue draws from, so it has to cost
   you something at every slider position rather than only when it squeezes
   past the ceiling. Slower pace, slower burn, so fewer queue hours are
   needed to reach launch day: that is the whole point of it.            */
let ytUnit = 'day';
function readYouTube(){
  const value = $('ytAmount').value;
  const amount = clampNumber(value, 0, ytUnit === 'week' ? 168 : 24, 0);
  const perDay = ytUnit === 'week' ? amount / 7 : amount;
  return {amount, value, unit:ytUnit, perDay, perWeek:perDay * 7};
}
function setYtUnit(unit, {convert = false, renderNow = true} = {}){
  if(unit !== 'day' && unit !== 'week') unit = 'day';
  // Toggling reads the same dial in other units; it must not silently mean
  // something seven times larger.
  if(convert && unit !== ytUnit){
    const v = Math.max(0, +$('ytAmount').value || 0);
    $('ytAmount').value = unit === 'week' ? num1(v * 7) : +(v / 7).toFixed(2);
  }
  ytUnit = unit;
  $('quickYoutube').value = $('ytAmount').value;
  $('ytAmount').max = unit === 'week' ? 168 : 24;
  $('ytAmount').step = unit === 'week' ? 1 : 0.5;
  $('ytPerDay').setAttribute('aria-checked', String(unit === 'day'));
  $('ytPerWeek').setAttribute('aria-checked', String(unit === 'week'));
  $('ytPerDay').tabIndex = unit === 'day' ? 0 : -1;
  $('ytPerWeek').tabIndex = unit === 'week' ? 0 : -1;
  if(renderNow) render();
}

function readGrassHours(){ return clampNumber($('grassHours').value, 0, 168, 0); }

function readComputationInputs(now = new Date()){
  const today = midnight(now), schedule = readSchedule(), startValue = $('startDate').value;
  return {now, today, schedule, startValue, start:startDate(today, startValue),
    job:readJob(today, schedule.mode), yt:readYouTube(), grassHours:readGrassHours(), bookPace:readBookPace()};
}
function buildSchedule(paceOverride = null, inputs = readComputationInputs()){
  const {pace, ceiling} = inputs.schedule;
  const fullPace = paceOverride === null ? pace : clampNumber(paceOverride, 1, ceiling, pace);
  const {yt, job, grassHours, now, start} = inputs;
  const startOff = Math.max(0, dayNumber(start) - dayNumber(now));
  // A job dated before the queue starts simply applies from the queue's own start.
  const jobOff = job.hours > 0 ? Math.max(startOff, job.startOff) : Infinity;
  const model = calculateSchedule({fullPace, ceiling, ytPerWeek:yt.perWeek, grassHours,
    startOff, jobHours:job.hours, jobOff});
  // YouTube's hours are an output: its daily rate across the span actually spent
  // working the queue.
  const ytHoursFor = h => {
    const end = model.dayForHour(h);
    return isFinite(end) ? yt.perDay * Math.max(0, end - startOff) : Infinity;
  };
  return {...model, job, yt, grassHours, ytHoursFor};
}

// Contexts live only for one render or result paint. Async responses and later
// edits always read fresh inputs, so they cannot reuse yesterday's forecast.
function computationContext({timeline = true, inputs = readComputationInputs()} = {}){
  syncQueueItems(inputs);
  const plan = buildSchedule(null, inputs);
  const daysLeft = Math.max(0, dayNumber(TARGET) - dayNumber(inputs.now));
  const forecast = forecastItems(queue, plan, daysLeft, inputs.now, {timeline});
  return {...inputs, plan, daysLeft, forecast, totalQueued:forecast.totalHours};
}

function forecastItems(items, plan, daysLeft, now, {timeline = true} = {}){
  return timeline || items.some(item => item.show?.episodes.some(episode => episode.availableOn))
    ? forecastQueue(items, plan, daysLeft, {today:toDateValue(now)})
    : forecastTotals(items.reduce((sum,item) => sum + Math.max(0,Number(item.hours) || 0),0),plan,daysLeft);
}
function plotSegments(forecast){
  return forecast.plays || forecast.segments.map((segment,index) => ({...segment,index}));
}
function episodeWaitMarkup(forecast, pct){
  const bounded = day => Math.max(0,Math.min(100,pct(day)));
  return (forecast.waits || []).map(wait => `<div class="episode-wait" style="left:${bounded(wait.startDay)}%;width:${Math.max(0,bounded(wait.endDay)-bounded(wait.startDay))}%" role="img" aria-label="Waiting for an episode to air" title="Waiting for an episode to air"></div>`).join('');
}

/* ---- the bridge: the queue drawn against real calendar time ------------- */
function renderBridge(context){
  if(!$('timelinePanel').open) return;
  const {now, daysLeft, start, plan, forecast, totalQueued:totalHours} = context || computationContext();
  const leadDays = plan.startOff;
  const endDay = forecast.finishDay;
  // A stalled queue has no end, so give the axis a fixed overrun to draw into.
  // YouTube can stall it with no job on the books, and `jobOff` is Infinity in
  // that case, so the fallback has to stay finite on its own.
  const spanDay = isFinite(endDay) ? endDay
    : Math.max(daysLeft, isFinite(plan.jobOff) ? plan.jobOff : 0,(forecast.waits || []).reduce((end,wait) => Math.max(end,wait.endDay),0)) * 1.6;
  // The axis stretches to whichever runs longer, so an overrun stays visible instead of clipping.
  const axisDays = Math.max(daysLeft, spanDay, 1) * 1.04;
  const pct = d => d / axisDays * 100;
  const clampDay = d => isFinite(d) ? d : axisDays;

  const track = $('track');
  // Segment widths come from the schedule, not a flat rate, so an item that
  // straddles the job's start date visibly stretches past it.
  const segs = plotSegments(forecast).map(dates => {
    const x = queue[dates.index];
    const finishDay = forecast.segments[dates.index].endDay;
    const from = clampDay(dates.startDay);
    const to = clampDay(dates.endDay);
    const left = pct(from), w = Math.max(0, pct(to) - left);
    const label = w > 7 ? `<span>${esc(x.name)}</span>` : '';
    return `<div class="seg" ${forecast.plays ? `data-tone="${dates.index % 2}"` : ''} style="left:${left}%;width:${w}%"
      title="${esc(x.name)}, ${fmtHours(x.hours)}. ${isFinite(finishDay) ? `Projected finish ${esc(fmtDate(addDays(now, Math.ceil(finishDay))))}` : 'No finish at this pace'}" role="img"
      aria-label="${esc(x.name)}, ${fmtHours(x.hours)}, ${isFinite(finishDay) ? `ends ${esc(fmtDate(addDays(now, Math.ceil(finishDay))))}` : 'stalled'}">${label}</div>`;
  }).join('');
  // Recurring YouTube is already deducted from the segment pace.
  const ytHours = plan.yt.perDay * Math.max(0,endDay-plan.startOff);
  const cursor = clampDay(endDay);

  const leadW = pct(leadDays);
  const lead = leadDays
    ? `<div class="lead" style="width:${leadW}%" title="Not started until ${esc(fmtDate(start))}">`
      + `${leadW > 12 ? `<span>Starts ${esc(fmtDate(start))}</span>` : ''}</div>`
    : '';

  // Where the pace drops, marked so the stretch downstream has a visible cause.
  const jobX = plan.job.hours && isFinite(plan.jobOff) && plan.jobOff < axisDays ? pct(plan.jobOff) : null;
  const jobMark = jobX === null ? '' :
    `<div class="marker marker--job ${jobX > 88 ? 'marker--end' : jobX < 8 ? 'marker--start' : ''}" style="left:${jobX}%">`
    + `<span class="flag">Job starts</span></div>`;

  const relX = pct(daysLeft);
  track.innerHTML = lead + segs + episodeWaitMarkup(forecast,pct)
    + (queue.length ? '' : '<p class="track-empty">Nothing on the timeline yet.</p>')
    + (cursor > daysLeft ? `<div class="overrun" style="left:${relX}%"></div>` : '');
  $('markers').innerHTML = jobMark
    + `<div class="marker ${relX > 88 ? 'marker--end' : relX < 8 ? 'marker--start' : ''}" style="left:${relX}%"><span class="flag">`
    + `<svg class="icon" aria-hidden="true"><use href="#i-flag-checkered"/></svg>Release</span></div>`;

  // Month ticks give the axis a real scale rather than an abstract 0-100%.
  const ticks = [`<span class="tick tick--now" style="left:0">Today</span>`];
  const walker = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let lastTick = 0; // Labels overlap below ~7% apart, so a month too close to Today is dropped.
  while((walker - now) / 86400000 < axisDays * 0.94){
    const x = pct((walker - now) / 86400000);
    if(x - lastTick >= 7){
      ticks.push(`<span class="tick" style="left:${x}%">${walker.toLocaleDateString(undefined, {month:'short'})}</span>`);
      lastTick = x;
    }
    walker.setMonth(walker.getMonth() + 1);
  }
  $('axis').innerHTML = ticks.join('');

  $('scaleDays').textContent = `${Math.round(axisDays)} days`;
  $('scaleQueue').textContent = !queue.length ? 'empty'
    : isFinite(endDay) ? `${Math.round(endDay - leadDays)} days` : 'never clears';
  $('bridgeNote').textContent = forecast.waits?.length
    ? 'Playback stays in queue order and waits for known episode airdates. Hatched gaps are waiting time; move available items earlier to fill them. Older episodes without dates are treated as available.'
    : !queue.length
    ? 'Add something and it lands here, measured against the time you actually have.'
    : plan.recurringStalls
      ? `Your recurring time commitments take your whole pace, so the queue never moves.`
    : isFinite(ytHours) && ytHours > 0
      ? `Recurring YouTube takes ${num1(plan.yt.perWeek)} h/wk from your budget. Each item already stretches to its actual projected finish at the remaining pace.`
    : plan.stalls
      ? (plan.yt.perWeek || plan.grassHours)
        ? `The job and recurring commitments leave none of your committed pace for the queue from ${fmtDate(plan.job.date)}, so it stops there.`
        : `The job takes the whole budget from ${fmtDate(plan.job.date)}, so the queue stops there.`
    : plan.slows && isFinite(plan.jobOff)
      ? `Segments widen after ${fmtDate(plan.job.date)}. Same hours, fewer per week once the job starts.`
    : leadDays && cursor <= daysLeft
      ? `Nothing moves until ${fmtDate(start)}. The queue still clears the marker after that.`
    : cursor > daysLeft
      ? 'The queue runs past the release marker. That overhang is what you still have left to play.'
      : `The queue clears the marker with room to spare. You run out before ${SITE_CONFIG.gameShortName} arrives.`;
}

function currentForecast(items = queue, plan = null, target = TARGET, now = new Date()){
  plan ||= buildSchedule(null, readComputationInputs(now));
  return forecastItems(items, plan, Math.max(0, dayNumber(target) - dayNumber(now)), now);
}
function coverageText(forecast){
  if(forecast.capacity <= 0) return 'No queue time available before this date.';
  if(forecast.stalled) return 'The queue stops when your time budget runs out. Adjust your budget to forecast a finish.';
  if(forecast.waitingHours > 0.05) return `${fmtHours(num1(forecast.missingHours))} of available time is uncovered, including ${fmtHours(num1(forecast.waitingHours))} waiting for episodes. Move available items earlier to fill these gaps.`;
  if(forecast.missingHours > 0.05) return `Add about ${fmtHours(num1(forecast.missingHours))} to fill the wait at this pace.`;
  return `${fmtHours(num1(forecast.remainingHours))} of your queue remains at release.`;
}
function candidateCoverage(hours, estimated = true, context){
  if(!Number.isFinite(hours) || hours < MIN_ITEM_HOURS) return 'Coverage preview available after runtime lookup.';
  const {now, plan, forecast:before, daysLeft} = context || computationContext({timeline:false});
  if(now >= TARGET) return 'The release date has passed.';
  const after = TimeBridgeCore.previewAppend(before, plan, daysLeft, hours);
  if(before.stalled || before.capacity <= 0) return 'No queue time available. Adjust your time budget first.';
  if(after.stalled) return 'This addition would have no projected finish at this pace.';
  const prefix = estimated ? 'Estimated: ' : '';
  if(before.missingHours > 0.05 && after.missingHours <= 0.05) return `${prefix}gets your queue to release.`;
  if(after.missingHours > 0.05) return `${prefix}fills ${fmtHours(num1(Math.max(0,before.missingHours-after.missingHours)))} of the gap; ${fmtHours(num1(after.missingHours))} still needed.${after.waitingHours > 0.05 ? ' Move it before the waiting episodes to fill earlier gaps.' : ''}`;
  const extraDays = after.finishDay - before.finishDay;
  return `${prefix}${isFinite(extraDays) ? `adds about ${num1(extraDays)} days; ` : ''}${fmtHours(num1(after.remainingHours))} left at release.`;
}
function renderAddPreview(context){
  const title = $('name').value.trim();
  const enabled = title && !addUrlInput(title) && $('kind').value && Number($('amount').value) >= MIN_ITEM_HOURS;
  $('addPreview').hidden = !enabled;
  if(enabled) $('addPreview').textContent = `Your estimate of ${fmtHours(Number($('amount').value))}: ${candidateCoverage(Number($('amount').value), true, context)}`;
}
function estimateContext(item){
  if(item.estimateNeeded) return 'Placeholder runtime. Enter an estimate for a useful forecast.';
  if(item.runtimeScale || item.book?.pinned || item.show?.pinned || item.pod?.pinned) return 'Your runtime correction is preserved when progress or source data changes.';
  if(item.runtimeSource) return item.runtimeSource;
  if(item.youtube?.durations) return 'Saved per-video runtimes';
  if(item.show?.episodes) return item.show.episodes.some(episode => episode.availableOn)
    ? 'Episode runtimes; waits for known airdates. Episodes without dates are treated as available.'
    : 'Episode runtimes; airdates unavailable, treated as available.';
  if(item.book) return 'Reading estimate from length and your reading pace';
  if(item.pod) return 'Podcast estimate from feed data and projected new episodes';
  return 'Your estimate';
}
function runtimeCanVary(item){
  return !!(item.runtimeScale || item.estimateNeeded || item.book || item.pod
    || !(item.runtimeBasis === 'measured' || item.youtube?.durations));
}
let scenarioDirty = false;
function renderScenarios(context){
  if(!$('timelinePanel').open) return;
  context ||= computationContext();
  const {now, today, schedule} = context;
  if(!scenarioDirty){
    $('scenarioPace').value = schedule.pace;
    $('scenarioDate').value = SITE_CONFIG.releaseDate;
  }
  if(!$('scenarioPanel').open) return;
  const target = fromDateValue($('scenarioDate').value);
  const pace = Number($('scenarioPace').value);
  const ceiling = schedule.ceiling;
  $('scenarioPace').max = ceiling;
  const valid = target && target > today && $('scenarioPace').value.trim() && Number.isInteger(pace) && pace >= 1 && pace <= ceiling;
  $('scenarioVisual').hidden = !valid;
  $('scenarioApplyPace').disabled = !valid || pace === schedule.pace;
  if(!valid){
    $('scenarioResult').textContent = 'Choose a future date and a weekly budget within the allowed range.';
    $('scenarioExplanation').textContent = `Use whole available hours between 1 and ${ceiling}.`;
    return;
  }
  const plan = buildSchedule(pace, context);
  const items = queue.map(item => item.pod && !item.pod.pinned
    ? {...item, hours:adjustedHours(item, item.pod.backlog + podcastAccrual(item.pod, target, now))} : item);
  const forecast = currentForecast(items, plan, target, now);
  const releaseDays = dayNumber(target) - dayNumber(now);
  const axisDays = Math.max(releaseDays, isFinite(forecast.finishDay) ? forecast.finishDay : releaseDays * 1.5, 1) * 1.04;
  const pct = day => Math.min(100, (isFinite(day) ? day : axisDays) / axisDays * 100);
  $('scenarioTrack').innerHTML = plotSegments(forecast).map(segment => {
    const item = items[segment.index];
    const left = pct(segment.startDay), width = Math.max(0, pct(segment.endDay) - left);
    return `<div class="seg" ${forecast.plays ? `data-tone="${segment.index % 2}"` : ''} style="left:${left}%;width:${width}%" role="img" aria-label="${esc(item.name)}, ${fmtHours(num1(item.hours))}">`
      + (width > 12 ? `<span>${esc(item.name)}</span>` : '') + '</div>';
  }).join('') + episodeWaitMarkup(forecast,pct) || '<span class="track-empty">Add items to compare coverage.</span>';
  const releaseX = pct(releaseDays);
  $('scenarioMarkers').innerHTML = `<div class="marker ${releaseX > 88 ? 'marker--end' : ''}" style="left:${releaseX}%"><span class="flag">Preview release</span></div>`;
  $('scenarioTimelineLabel').textContent = `Preview timeline at ${pace} h/wk. Release ${fmtDate(target)}.`;
  const variance = Number($('scenarioVariance').value) / 100;
  const variant = factor => forecastItems(items.map(item => ({...item,hours:item.hours * (runtimeCanVary(item) ? factor : 1)})),plan,releaseDays,now,{timeline:false});
  const shorter = variant(1 - variance);
  const longer = variant(1 + variance);
  const format = f => f.capacity <= 0 ? 'No queue time' : f.stalled ? 'Queue stalls' : f.missingHours > 0.05
    ? `${num1(f.missingHours)} hours short` : `${num1(f.remainingHours)} hours left`;
  $('scenarioResult').innerHTML = [[shorter,'Shorter runtimes'],[forecast,'Current runtimes'],[longer,'Longer runtimes']]
    .map(([f,label]) => `<div><span>${label}</span><b>${format(f)}</b><span>${isFinite(f.finishDay) ? `Finishes ${esc(fmtDate(addDays(now, Math.ceil(f.finishDay))))}` : 'Queue has no finish at this pace'}</span></div>`).join('');
  const current = context.forecast;
  const delta = num1(forecast.missingHours - current.missingHours);
  const placeholder = queue.some(item => item.estimateNeeded);
  $('scenarioExplanation').textContent = `${coverageText(forecast)} ${delta > 0 ? `That is ${delta} more hours needed than your current plan.` : delta < 0 ? `That is ${Math.abs(delta)} fewer hours needed than your current plan.` : 'The missing hours are unchanged from your current plan.'} `
    + `${Math.round(variance * 100)}% variation applies to estimates and corrections; saved video runtimes stay fixed. These are assumptions, not probabilities.`
    + (placeholder ? ' Placeholder runtimes make these results provisional.' : '')
    + (queue.some(item => item.show) ? ' The saved TV episode list and known airdates stay fixed in this preview. Playback waits in queue order.' : '');
}

/* ---- main render ------------------------------------------------------- */
let lastTotal = null, lastSig = null, booted = false;
let stateRevision = 0, historyRevision = 0, queueDirty = true, forecastRowsSig = null;
function computationSignature(context){
  const {now, startValue, bookPace, plan, schedule} = context;
  return `${schedule.pace}::${schedule.sleepStart}-${schedule.sleepEnd}::${startValue}`
    + `::${plan.job.hoursValue}-${plan.job.dateValue}::${plan.yt.unit}-${plan.yt.value}`
    + `::grass-${plan.grassHours}::book-${bookPace}::${schedule.mode}::${stateRevision}`
    + `::${SITE_CONFIG.gameName}-${SITE_CONFIG.releaseDate}::${dayNumber(now)}`;
}
function syncQueueItems({now, bookPace}){
  let changed = false;
  for(const item of queue){
    if(syncItemHours(item, bookPace, item.pod ? podcastAccrual(item.pod, TARGET, now) : 0)) changed = true;
  }
  if(changed) stateRevision++;
}

function itemNote(x, now = new Date()){
  if(x.kind === 'Game') return x.hours > 0 ? `Game · ${num1(x.hours)} hours left`
    : 'Estimate reached · increase total hours or mark finished';
  const seasons = x.show && new Set(x.show.episodes.map(e => e.season)).size;
  if(x.show) return `Show · ${seasons} season${seasons === 1 ? '' : 's'} · ${x.show.watched} watched · ${x.show.episodes.length - x.show.watched} episode${x.show.episodes.length - x.show.watched === 1 ? '' : 's'} left${x.show.episodes.some(e => e.availableOn > toDateValue(now)) ? ' · includes upcoming episodes' : ''}${x.show.pinned ? ' · hours edited' : ''}`;
  if(x.youtube){
    const total = x.youtube.durations?.length;
    return total ? `YouTube playlist · ${total} videos · ${x.youtube.watched} watched · ${total - x.youtube.watched} left`
      : 'YouTube playlist · finite queue item';
  }
  if(x.book){
    const pace = x.book.pinned ? 'hours edited' : `about ${x.book.pagesPerHour} pages/hour`;
    if(x.book.basis === 'volumes'){
      return `Light novel · ${x.book.volumes} volume${x.book.volumes === 1 ? '' : 's'} · rough ${LIGHT_NOVEL_PAGES_PER_VOLUME} pages each · ${pace}`;
    }
    if(x.book.basis === 'words'){
      const wordPace = x.book.pinned ? 'hours edited'
        : `about ${(x.book.pagesPerHour * WEB_WORDS_PER_PAGE).toLocaleString()} words/hour`;
      const chapters = x.book.chapters ? ` · ${x.book.chapters} chapters` : '';
      return `${WEB_PLATFORM_LABEL[x.book.platform]} · ${Math.round(x.book.words).toLocaleString()} words${chapters} as of ${x.book.asOf} · ${wordPace}`;
    }
    if(x.book.basis === 'web-pages'){
      const chapters = x.book.chapters ? ` · ${x.book.chapters} chapters` : '';
      return `${WEB_PLATFORM_LABEL[x.book.platform]} · ${Math.round(x.book.pages).toLocaleString()} pages${chapters} as of ${x.book.asOf} · ${pace}`;
    }
    return `Book · ${x.book.pages} pages · ${pace}`;
  }
  const p = x.pod;
  if(!p) return x.kind;
  const bits = [`${p.eps} \u00d7 ${Math.round(p.avgMin)} min`];
  if(!p.ongoing) bits.push('finished');
  else if(p.perWeek >= 1) bits.push(`${num1(p.perWeek)}/wk`);
  else if(p.perWeek * 4.35 >= 1) bits.push(`${num1(p.perWeek * 4.35)}/mo`);
  else if(p.perWeek > 0) bits.push(`${num1(p.perWeek * 52)}/yr`);
  const acc = podcastAccrual(p, TARGET, now);
  if(p.pinned) bits.push('hours edited');
  else if(acc >= 0.1) bits.push(`+${num1(acc)}h by launch`);
  return `Podcast \u00b7 ${bits.join(' \u00b7 ')}`;
}

function render({forceQueue = false, preserveQueue = false, animate = true} = {}){
  const inputs = readComputationInputs();
  const simple = inputs.schedule.mode === 'simple';
  $('sleepSettings').hidden = $('jobSettings').hidden = $('awakeNote').hidden = simple;
  $('scheduleExplanation').textContent = simple
    ? 'Enter time available after work, sleep, and other commitments. YouTube and Touch grass hours below are deducted from this budget.'
    : 'The job reduces your chosen pace in proportion to waking hours. Use this only if your pace does not already account for work. YouTube and Touch grass hours are deducted afterward.';
  renderBookPaceHint(inputs.bookPace);
  const context = computationContext({inputs});
  const {now, start, plan, forecast, totalQueued, schedule:{sleep, ceiling, pace}} = context;
  renderCountdown(now);
  const released = now >= TARGET;
  $('paceInput').max = ceiling;
  if(+$('paceInput').value > ceiling) $('paceInput').value = ceiling;
  $('paceNumber').max = ceiling;
  if(document.activeElement !== $('paceNumber')) $('paceNumber').value = pace;

  const leadDays = plan.startOff; // runway spent before you begin
  const finishDay = forecast.finishDay;
  $('launchPosition').hidden = released;
  if(!released){
    const position = forecast.position;
    $('launchTitle').textContent = !queue.length ? 'Add a queue to see where you’ll be.'
      : position ? queue[position.index].name : 'Queue cleared before launch';
    $('launchDetail').textContent = !position ? ''
      : `${position.remainingHours < 0.05 ? 'Less than 0.1 hour' : fmtHours(num1(position.remainingHours))} left in this item`
        + (position.itemsAfter ? ` · ${position.itemsAfter} more ${position.itemsAfter === 1 ? 'item' : 'items'} after it` : '');
  }
  const stalled = totalQueued > 0 && !isFinite(finishDay);
  // Recurring YouTube continues throughout the actual span, including waits
  // for episodes. Queue consumption already uses the reduced weekly budget.
  const ytHours = stalled ? 0 : plan.yt.perDay * Math.max(0,finishDay-plan.startOff);
  const total = totalQueued + ytHours;
  const finish = stalled ? null : addDays(now, Math.ceil(finishDay));
  // Duration comes from the same piecewise calendar walk as the finish date.
  // Dividing by the initial pace lies as soon as a job changes that pace later.
  const activeDays = stalled ? Infinity : Math.max(0, finishDay - leadDays);
  const weeks = activeDays / 7;
  // Round once, on calendar days, so the buffer always agrees with the finish date beside it.
  const buffer = stalled ? -Infinity : dayNumber(TARGET) - dayNumber(finish);
  const waiting = forecast.waitingHours > 0.05;
  const state = released ? 'shipped' : !total ? 'empty'
    : stalled ? 'stalled' : waiting || buffer > 0 ? 'ahead' : buffer === 0 ? 'tie' : 'behind';

  $('budgetSummary').textContent = `${pace} h/wk · edit`;
  $('awakeOut').textContent = ceiling;
  $('sleepTime').textContent = `${sleep} hours`;
  $('committed').textContent = pace;
  const yt = plan.yt;
  const daysToLaunch = Math.max(0, dayNumber(TARGET) - dayNumber(start));
  $('ytOut').textContent = yt.perWeek ? `${num1(yt.amount)} h/${yt.unit === 'week' ? 'wk' : 'day'}` : 'none';
  $('ytNote').innerHTML = '<svg class="icon note-icon" aria-hidden="true">'
    + '<use href="#i-youtube-logo"/></svg> ' + (!yt.perWeek
    ? 'Nothing set. YouTube is taking no cut of your pace.'
    : plan.recurringStalls
      ? `YouTube${plan.grassHours ? ' and Touch grass' : ''} uses your whole <b>${pace}</b> h/wk budget. Nothing is left for the queue.`
      : `<b>${num1(yt.perDay)}</b> h/day is <b>${num1(yt.perWeek)}</b> h/wk off the top, so the queue runs at `
        + `<b>${num1(plan.pace)}</b> h/wk. That is <b>${Math.round(yt.perDay * daysToLaunch)}</b> fewer queue `
        + `hours needed to reach launch day.`);

  $('grassOut').textContent = plan.grassHours ? `${num1(plan.grassHours)} h/wk` : 'none';
  $('grassNote').textContent = !plan.grassHours
    ? 'Outside has great graphics. Reserve a few hours away from the queue.'
    : plan.recurringStalls
      ? 'Grass successfully touched. Your recurring commitments use the whole time budget, leaving no time for the queue.'
      : `${num1(plan.grassHours)} h/wk reserved for the outside world. The queue gets ${num1(plan.pace)} h/wk${plan.job.hours ? ' before the day job adjustment' : ''}. The grass thanks you.`;

  const jobPace = plan.paceAfter;
  const cut = Math.max(0, plan.pace - jobPace);
  const share = `takes ${plan.job.hours} of your ${plan.ceiling} waking hours`;
  $('jobOut').textContent = plan.job.hours ? `${plan.job.hours} h/wk` : 'none';
  $('jobNote').textContent = !plan.job.hours
    ? 'No job on the books. Full pace the whole way.'
    : plan.stalls
      ? (plan.yt.perWeek || plan.grassHours)
        ? `From ${fmtDate(plan.job.date)}, the job and recurring commitments leave none of your committed pace for the queue. It stops there.`
        : `${plan.job.hours} h/wk leaves no waking time from ${fmtDate(plan.job.date)}. The queue stops there.`
    : cut < 0.05
      ? `${plan.job.hours} h/wk barely dents ${num1(plan.pace)} h/wk, so the pace holds.`
    : plan.jobOff === 0
      ? `Working from today, so the job ${share} and the queue runs at ${num1(jobPace)} h/wk instead of ${num1(plan.pace)}.`
      : `${num1(plan.pace)} h/wk until ${fmtDate(plan.job.date)}, then ${num1(jobPace)} h/wk once the job ${share}.`;

  $('leadNote').hidden = !leadDays;
  if(leadDays) $('leadNote').textContent = `Starting ${fmtDate(start)} costs you `
    + `${leadDays} day${leadDays === 1 ? '' : 's'} of runway before the queue moves at all.`;
  $('total').textContent = fmtHours(total);
  $('weeks').textContent = !total ? '0 weeks' : stalled ? 'never' : `${weeks.toFixed(1)} weeks`;
  $('finish').textContent = !total ? 'Add a queue' : stalled ? 'never, at this pace' : fmtDate(finish);
  // The label carries the sign, so the row never reads "Spare days ... 12 days behind".
  $('bufferLabel').textContent = total && !released && (stalled || buffer < 0)
    ? 'Days past the release' : 'Spare days after queue';
  $('buffer').textContent = !total ? '—' : released ? 'target passed' : stalled ? 'never finishes'
    : buffer === 0 ? 'photo finish'
    : `${Math.abs(buffer)} day${Math.abs(buffer) === 1 ? '' : 's'}`;
  // Tone matches the verdict card, which already scores this backwards on purpose:
  // running past the release is the win, because you still have things left to play.
  // Clearing early means you ran out.
  $('buffer').dataset.tone = !total || released || waiting ? '' : stalled ? 'neg' : buffer < 0 ? 'pos' : buffer > 0 ? 'neg' : 'tie';

  const finishLabel = stalled ? 'never' : fmtDate(finish);
  const copy = {
    stalled: ['No time available', plan.ytStalls
      ? 'Reduce recurring YouTube or increase your weekly budget to make room for the queue.'
      : `From ${fmtDate(plan.job.date)}, no queue time remains. Adjust the job or weekly budget, or use available-hours mode if work is already accounted for.`],
    shipped: ['The target date is here', `Your planning date for ${SITE_CONFIG.gameShortName} has arrived. Choose your next release in Settings to keep planning. Your queue stays in place.`],
    empty:   ['Build your queue before launch.', 'Add games, shows, books, or podcasts to fill the wait.'],
    ahead:   waiting ? ['Gaps while episodes arrive', 'Your queue waits for known airdates. Move available items earlier to cover that time.']
      : ['Room for a little more', `Starting ${leadDays ? fmtDate(start) : 'today'}, you finish around ${finishLabel}.`],
    tie:     ['Right on time', 'Your queue takes you all the way to release day.'],
    behind:  ['You’re covered until launch', `At this pace, you’ll still have ${queue.length === 1 ? 'some of this item' : 'items in your queue'} on release day.`]
  }[state];
  $('verdictCard').dataset.state = state;
  $('signal').textContent = copy[0];
  $('signalText').textContent = copy[1];
  $('coverageNote').textContent = released ? '' : (queue.some(item => item.estimateNeeded) ? 'Provisional: ' : '') + coverageText(forecast);
  renderAddPreview(context);
  renderScenarios(context);

  // The whole question in one number: how much room is left once the queue is done.
  const showGap = total && !released && !stalled;
  $('gapBlock').hidden = !showGap;
  if(showGap){
    $('gapNum').textContent = waiting ? Math.ceil(forecast.gapDays) : Math.abs(buffer);
    $('gapUnit').textContent = waiting ? 'days uncovered' : buffer > 0 ? `day${buffer === 1 ? '' : 's'} empty`
      : buffer === 0 ? 'days either way' : `day${buffer === -1 ? '' : 's'} left to play`;
  }

  // Flash only the number that actually moved — motion that carries information.
  if(!animate){
    ['total','weeks','buffer'].forEach(id => $(id).classList.remove('flash'));
  }else if(lastTotal !== null && lastTotal !== total){
    const metrics = ['total','weeks','buffer'].map($);
    metrics.forEach(node => node.classList.remove('flash'));
    void metrics[0].offsetWidth;
    metrics.forEach(node => node.classList.add('flash'));
  }
  lastTotal = total;

  // Mutations/imports bump revisions. Scalar inputs and the calendar day also
  // invalidate derived rows without serializing every saved episode each tick.
  const sig = computationSignature(context);
  if(sig !== lastSig || forceQueue){
    lastSig = sig;
    queueDirty = true;
    if(booted) saveState(); // The boot render is a restore, not a change worth re-saving.
    renderBridge(context);
  }
  // Deferred rows catch up on reopening or once the user leaves their input.
  if(queueDirty && !$('queueBody').hidden && (forceQueue || (!preserveQueue && !$('queue').contains(document.activeElement))))
    renderQueue({animate, context});
  renderWorkspace(context);
  return context;
}

let dragState = null;

function announceQueueMove(name, index){
  $('queueStatus').textContent = `${name} moved to position ${index + 1} of ${queue.length}.`;
}

function moveQueueItem(from, to, {focus = false, announce = true, commit = true} = {}){
  if(!Number.isInteger(from) || !Number.isInteger(to) || from === to
    || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return false;
  // Delegated edits resolve the row index, so commit focus before order changes.
  document.activeElement?.blur();
  const [item] = queue.splice(from, 1);
  queue.splice(to, 0, item);
  if(commit) commitQueueChange(null, () => {});
  else renderQueue();
  if(focus) $('queue').querySelector(`[data-drag-index="${to}"]`)?.focus();
  if(announce) announceQueueMove(item.name, to);
  return true;
}

function markDraggedRow(){
  const row = $('queue').querySelector(`[data-item-index="${dragState?.index}"]`);
  if(row){ row.classList.add('is-dragging'); row.inert = true; }
}

function dragMove(e){
  if(!dragState || e.pointerId !== dragState.pointerId) return;
  e.preventDefault();
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-item-index]');
  if(!target || !$('queue').contains(target)) return;
  const hoverIndex = Number(target.dataset.itemIndex);
  if(!Number.isInteger(hoverIndex)) return;
  const box = target.getBoundingClientRect();
  let to = e.clientY < box.top + box.height / 2 ? hoverIndex : hoverIndex + 1;
  if(to > dragState.index) to -= 1;
  if(to === dragState.index || to < 0 || to >= queue.length) return;
  const from = dragState.index;
  dragState.index = to;
  if(moveQueueItem(from, to, {announce:false, commit:false})){
    dragState.moved = true;
    $('queue').classList.add('is-sorting');
    markDraggedRow();
  }else dragState.index = from;
}

function dragEnd(e){
  if(!dragState || e.pointerId !== dragState.pointerId) return;
  const {index, name, moved} = dragState;
  dragState = null;
  document.removeEventListener('pointermove', dragMove);
  document.removeEventListener('pointerup', dragEnd);
  document.removeEventListener('pointercancel', dragEnd);
  $('queue').classList.remove('is-sorting');
  $('queue').querySelectorAll('.is-dragging').forEach(row => { row.classList.remove('is-dragging'); row.inert = false; });
  if(moved) commitQueueChange(null, () => {}, {forceQueue:false});
  $('queue').querySelector(`[data-drag-index="${index}"]`)?.focus();
  if(moved) announceQueueMove(name, index);
}

// Each row uses the same calendar walk as the finish date. That matters when a
// job starts partway through an item. YouTube spans the whole queue because it
// is watched alongside the items, not after them.
function wkLabel(from, to){
  return isFinite(from) && isFinite(to) ? `${((to - from) / 7).toFixed(1)} wk` : 'never';
}

function queueWeekLabels({forecast, plan} = computationContext()){
  return {items:forecast.segments.map(segment => wkLabel(segment.startDay, segment.endDay)),
    youtube:wkLabel(plan.startOff, forecast.finishDay),finishDay:forecast.finishDay};
}

function youtubeRowHtml(plan, totalQueued, labels){
  const ytHours = plan.yt.perDay * Math.max(0,labels.finishDay-plan.startOff);
  return (queue.length && isFinite(ytHours) && ytHours > 0) ? `<div class="item item--yt">
      <div class="item-order">
        <span class="slot" aria-hidden="true"></span>
        <span class="position" aria-hidden="true">\u2013\u2013</span>
        <svg class="icon kind" aria-hidden="true"><use href="#i-youtube-logo"/></svg>
      </div>
      <div><b>YouTube</b><small>Constant \u00b7 ${num1(plan.yt.perDay)} h/day</small></div>
      <span class="hours"><b>${num1(ytHours)}</b>h</span>
      <span class="wk">${labels.youtube}</span>
      <span class="slot" aria-hidden="true"></span>
    </div>` : '';
}

function syncQueueDerivedState(context = computationContext()){
  if($('queueBody').hidden){ queueDirty = true; return; }
  const {plan, totalQueued} = context;
  const labels = queueWeekLabels(context);
  $('queue').querySelectorAll('[data-item-index]').forEach((row, i) => {
    row.querySelector('.wk').textContent = labels.items[i];
    const hours = row.querySelector('[data-hours]');
    if(hours && document.activeElement !== hours) hours.value = queue[i].hours;
    row.querySelector('small').textContent = itemNote(queue[i], context.now) + (queue[i].runtimeScale ? ' · custom estimate' : '');
    row.querySelector('.estimate-badge').hidden = !queue[i].estimateNeeded;
    row.querySelector('[data-reset-estimate]').hidden = !(queue[i].runtimeScale || queue[i].book?.pinned || queue[i].show?.pinned || queue[i].pod?.pinned);
    row.querySelector('.estimate-context').textContent = estimateContext(queue[i]);
  });
  const existing = $('queue').querySelector('.item--yt');
  const html = youtubeRowHtml(plan, totalQueued, labels);
  if(existing && html){
    existing.querySelector('small').textContent = `Constant · ${num1(plan.yt.perDay)} h/day`;
    existing.querySelector('.hours b').textContent = num1(plan.yt.perDay * Math.max(0,labels.finishDay-plan.startOff));
    existing.querySelector('.wk').textContent = labels.youtube;
  }
  else if(existing) existing.remove();
  else if(html) $('queue').insertAdjacentHTML('beforeend', html);
  renderQueueSummary();
  applyQueueFilters();
  queueDirty = false;
}

function gameProgressHtml(item, index){
  if(item.kind !== 'Game') return '';
  const game = item.game;
  return `<span class="youtube-progress game-progress">
    <label>Played <input type="number" inputmode="decimal" min="0" max="${MAX_ITEM_HOURS}" step="0.1"
      value="${game.played}" data-game-played="${index}" aria-label="Hours played for ${esc(item.name)}">h</label>
    <label>Total <input type="number" inputmode="decimal" min="${MIN_ITEM_HOURS}" max="${MAX_ITEM_HOURS}" step="0.1"
      value="${game.total}" data-game-total="${index}" aria-label="Total estimated hours for ${esc(item.name)}">h</label>
    <button type="button" data-game-lookup="${index}" ${loadingItems.has(item) ? 'disabled' : ''}>${loadingItems.has(item) ? 'Looking up…' : 'Update main-story time'}</button>
    ${game.sourceUrl ? `<a data-game-source="${index}" href="${esc(game.sourceUrl)}" target="_blank" rel="noopener noreferrer">View time source</a>` : ''}
    <button type="button" data-game-finish="${index}" aria-label="Mark ${esc(item.name)} finished">Finished</button>
  </span>${actionFeedbackHtml(item, index)}`;
}

function showProgressHtml(item, index){
  if(item.kind !== 'Show') return '';
  if(!item.show) return `<span class="youtube-progress"><button type="button" data-show-load="${index}" ${loadingItems.has(item) ? 'disabled' : ''}>${loadingItems.has(item) ? 'Loading…' : 'Load episodes'}</button></span>${actionFeedbackHtml(item, index)}`;
  const show = item.show;
  const last = show.episodes[show.watched - 1];
  const season = show.season ?? last?.season ?? show.episodes[0].season;
  const seasons = [...new Set(show.episodes.map(e => e.season))];
  return `<span class="youtube-progress show-progress">
    <span>Watched through</span>
    <label>Season <select data-show-season="${index}" aria-label="Watched season for ${esc(item.name)}">${seasons.map(n => `<option value="${n}" ${n === season ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Episode <select data-show-episode="${index}" aria-label="Last watched episode for ${esc(item.name)}">
      <option value="0">0</option>${show.episodes.filter(e => e.season === season).map(e => `<option value="${e.number}" ${e.season === last?.season && e.number === last?.number ? 'selected' : ''}>${e.number}</option>`).join('')}
    </select></label>
  </span>`;
}

function bookProgressHtml(book, index){
  if(!book) return '';
  const progress = bookProgressMeta(book);
  const value = book.progress || 0;
  return `<span class="book-progress">
    <label for="br${index}">${progress.label}
      <input id="br${index}" name="book-progress-${index}" type="number" inputmode="numeric"
        min="0" max="${progress.total}" step="1" value="${value}" data-book-progress="${index}"
        aria-describedby="br${index}-total">
      <span class="reading-total" id="br${index}-total">/ ${progress.total.toLocaleString()} ${progress.unit}</span>
    </label>
  </span>`;
}

function calculatedHours(item){
  return TimeBridgeCore.calculatedHours(item, item.pod ? podcastAccrual(item.pod) : 0);
}
// Count UTF-16 code units conservatively; quota recovery also handles other
// storage on this origin. Keep current state ahead of optional Undo history.
const UNDO_MAX_CHARS = 500000;
function trimUndoStack(){
  if(undoStack.length > 20) undoStack.splice(0, undoStack.length - 20);
  let text = JSON.stringify(undoStack);
  while(text.length > UNDO_MAX_CHARS && undoStack.length){
    undoStack.shift();
    text = JSON.stringify(undoStack);
  }
  return text;
}
// A change can carry a longer message and one follow-up action while it is
// the latest Undo entry. Only the short message is stored with the history.
let undoNotice = null;
function syncUndoStatus(){
  const entry = undoStack.at(-1);
  const notice = entry && undoNotice?.entry === entry ? undoNotice : null;
  $('undoBar').hidden = !entry || entry === dismissedUndoEntry;
  $('undoMessage').textContent = notice?.text || entry?.message || '';
  $('undoAction').hidden = !notice?.action;
  $('undoAction').textContent = notice?.action?.label || '';
  $('undo').title = 'Restore the previous queue and settings';
}
function noteUndo(text, action = null){
  if(!undoStack.length) return;
  undoNotice = {entry:undoStack.at(-1), text, action};
  syncUndoStatus();
}
$('undoAction').onclick = () => {
  const action = undoNotice?.action;
  if(!action) return;
  undoNotice.action = null;
  syncUndoStatus();
  action.run();
};
function editEstimateAction(item){
  return {label:'Edit estimate', run:() => focusQueueItem(item)};
}
function checkpoint(message){
  undoStack.push({state:serializeState(), message});
  trimUndoStack();
  syncUndoStatus();
}
function archiveItem(index){
  const item = queue[index];
  historyRevision++;
  completed.unshift({...structuredClone(item), completedAt:toDateValue(new Date())});
  queue.splice(index, 1);
}
let historySig = null;
function renderHistory(){
  $('completedSummary').textContent = `Completed · ${completed.length}`;
  if(!$('completedSummary').parentElement.open) return;
  if(historySig?.items === completed && historySig.revision === historyRevision) return;
  historySig = {items:completed, revision:historyRevision};
  $('completedList').innerHTML = completed.length ? completed.map((item, i) =>
    `<div class="history-row"><span><b>${esc(item.name)}</b><small>Finished ${esc(item.completedAt)}</small></span><button type="button" data-restore="${i}">Restore</button></div>`).join('')
    : '<p class="note">Finished items appear here. Restore returns an item to its last active progress.</p>';
}

// Callers choose checkpoint boundaries; drags and refresh batches commit once.
function commitQueueChange(message, mutate, options = {}){
  if(message) checkpoint(message);
  mutate();
  stateRevision++;
  lastSig = null;
  const context = render({forceQueue:true, ...options});
  if(options.preserveQueue) syncQueueDerivedState(context);
  return context;
}
function restoreItem(index){
  if(!completed[index]) return;
  commitQueueChange('Restored a completed item', () => {
    const [item] = completed.splice(index, 1);
    historyRevision++;
    delete item.completedAt;
    queue.push(item);
  });
  ($('completedList').querySelector('[data-restore]') || $('quickAdd')).focus();
}
function finishItem(index, {game = false} = {}){
  const item = queue[index];
  if(!item) return;
  commitQueueChange(`Finished ${item.name}`, () => archiveItem(index));
  if(game){
    $('queueStatus').textContent = `${item.name} finished and left the queue.`;
    ($('queue').querySelector(`[data-remove="${Math.min(index, queue.length - 1)}"]`) || $('quickAdd')).focus();
  }else ($('queue').querySelector('[data-remove]') || $('quickAdd')).focus();
}
function removeItem(index){
  if(!queue[index]) return;
  commitQueueChange(`Removed ${queue[index].name}`, () => queue.splice(index, 1));
  const rows = $('queue').querySelectorAll('[data-remove]');
  (rows[Math.min(index, rows.length - 1)] || $('quickAdd')).focus();
}
function resetEstimate(index){
  const item = queue[index];
  if(!item) return;
  commitQueueChange(`Restored estimate for ${item.name}`, () => {
    delete item.runtimeScale;
    for(const details of [item.book, item.show, item.pod]) if(details) details.pinned = false;
    if(item.show || item.youtube?.durations) item.hours = calculatedHours(item);
  });
  ($('queue').querySelector(`[data-hours="${index}"]`) || $('quickAdd')).focus();
}
function setRemainingEstimate(item, value){
  commitQueueChange(`Updated estimate for ${item.name}`, () => {
    const calculated = calculatedHours(item);
    if((item.book || item.youtube?.durations || item.show || item.pod) && calculated > 0){
      item.runtimeScale = value / calculated;
      for(const details of [item.book, item.show, item.pod]) if(details) details.pinned = false;
    }else if(item.book || item.show || item.pod){
      // Nothing left to scale, such as a podcast whose projected growth ended
      // at release. Keep the typed hours as a fixed correction instead.
      delete item.runtimeScale;
      for(const details of [item.book, item.show, item.pod]) if(details) details.pinned = true;
    }else if(!item.youtube){
      item.runtimeSource = 'Your remaining-time estimate'; item.runtimeBasis = 'manual';
    }
    item.hours = value;
    item.estimateNeeded = false;
  }, {forceQueue:false, preserveQueue:true});
}
function setGameProgress(index, field, value){
  const item = queue[index];
  if(!item?.game) return false;
  const updated = gameProgress(item.game, field, value);
  if(!updated){
    $('queueStatus').textContent = `Enter ${field === 'played' ? '0' : MIN_ITEM_HOURS} to ${MAX_ITEM_HOURS} hours.`;
    return false;
  }
  commitQueueChange(`Updated ${item.name}`, () => {
    if(field === 'total'){
      item.estimateNeeded = false;
      item.runtimeSource = 'Your total runtime estimate'; item.runtimeBasis = 'manual';
      delete updated.sourceUrl; delete updated.checkedOn;
    }
    item.game = updated;
    item.hours = remainingGameHours(updated);
    $('queueStatus').textContent = `${item.name}: ${updated.played} hours played, ${item.hours} hours left.`;
  });
  $('queue').querySelector(`[data-game-${field}="${index}"]`)?.focus();
  return true;
}
function setShowProgress(index, season, episode){
  const item = queue[index];
  if(!item?.show) return;
  const show = showProgress(item.show, season, episode);
  const hours = showRemainingHours(show);
  commitQueueChange(`Updated ${item.name}`, () => {
    if(hours === null){
      archiveItem(index); // Preserve the last active progress for Restore.
      $('queueStatus').textContent = `${item.name} finished and left the queue.`;
    }else{
      item.show = show;
      item.hours = adjustedHours(item, hours);
      $('queueStatus').textContent = `${item.name}: watched through season ${season}, episode ${episode}.`;
    }
  });
}
function setBookProgress(index, value){
  const item = queue[index], book = item?.book;
  if(!book) return false;
  const progress = bookProgressMeta(book);
  if(!Number.isInteger(value) || value < 0 || value > progress.total) return false;
  commitQueueChange(`Updated ${item.name}`, () => {
    if(value === progress.total){
      archiveItem(index);
      $('queueStatus').textContent = `${item.name} finished and left the queue.`;
    }else{
      book.progress = value;
      book.pinned = false;
      item.hours = adjustedHours(item, remainingHoursForBook(book));
      $('queueStatus').textContent = `${item.name}: ${value.toLocaleString()} of ${progress.total.toLocaleString()} ${progress.unit} read.`;
    }
  });
  return true;
}
function setYoutubeProgress(index, watched, {next = false} = {}){
  const item = queue[index], youtube = item?.youtube;
  if(!youtube?.durations || !Number.isInteger(watched) || watched < 0 || watched > youtube.durations.length) return false;
  if(watched === youtube.watched) return true;
  const indices = next ? [...(youtube.watchedIndices || Array.from({length:youtube.watched}, (_, i) => i)), nextPlaylistIndex(youtube)].sort((a,b) => a-b)
    : Array.from({length:watched}, (_, i) => i);
  const hours = remainingPlaylistHours(youtube.durations, watched, youtube.videoIds ? indices : undefined);
  const finished = hours === null;
  commitQueueChange(`Updated ${item.name}`, () => {
    if(finished){
      archiveItem(index);
      if(!next) $('queueStatus').textContent = `${item.name} finished and left the queue.`;
    }else{
      youtube.watched = watched;
      if(youtube.videoIds) youtube.watchedIndices = indices;
      else delete youtube.watchedIndices;
      item.hours = adjustedHours(item, hours);
      if(!next) $('queueStatus').textContent = `${item.name}: ${watched} watched, ${youtube.durations.length - watched} left.`;
    }
  }, {forceQueue:finished || next, preserveQueue:!finished && !next, animate:false});
  if(finished && !next) ($('queue').querySelector(`[data-youtube-count="${index}"]`) || $('name')).focus();
  return true;
}
function continueNext(){
  if(activeView !== 'queue') setView('queue');
  if(queueFilter || queueQuery){
    queueFilter = queueQuery = ''; $('queueSearch').value = '';
    applyQueueFilters(); updateFilterRoute();
  }
  const item = queue[0];
  if(!item) return;
  const next = item.show?.episodes[item.show.watched];
  if(next) setShowProgress(0, next.season, next.number);
  else if(item.youtube?.durations) setYoutubeProgress(0, item.youtube.watched + 1, {next:true});
  else if(item.game) setGameProgress(0, 'played', num1(item.game.played + 1));
  else{
    const row = $('queue').querySelector('[data-item-index="0"]');
    row?.scrollIntoView({block:'center'});
    row?.querySelector('[data-book-progress], [data-hours]')?.focus();
  }
  if(next || item.youtube?.durations || item.game) ($('continueProgress') || $('name')).focus();
}

function renderQueueSummary(){
  if($('queueBody').hidden){ queueDirty = true; return; }
  const item = queue[0];
  const next = item?.show?.episodes[item.show.watched];
  const youtube = item?.youtube;
  const nextVideo = youtube?.durations ? nextPlaylistIndex(youtube) : youtube?.watched;
  const reading = item?.book && bookProgressMeta(item.book);
  const position = next ? `Season ${next.season}, episode ${next.number}`
    : youtube?.durations ? `Video ${nextVideo + 1} of ${youtube.durations.length}`
    : reading ? `${(item.book.progress || 0).toLocaleString()} of ${reading.total.toLocaleString()} ${reading.unit} read`
    : item?.game ? `${num1(item.game.played)} hours played` : '';
  const videoId = youtube?.videoIds?.[nextVideo];
  const href = videoId ? `https://www.youtube.com/watch?v=${videoId}&list=${encodeURIComponent(youtube.playlistId)}&index=${nextVideo + 1}`
    : youtube?.url || item?.book?.url;
  $('continueNext').hidden = !item;
  $('continueNext').dataset.kind = item?.kind || '';
  $('continueNext').innerHTML = item ? `<span class="continue-media">${iconMarkup(KIND_ICON[item.kind] || 'book')}</span><span class="continue-copy"><small>Up next</small><b>${esc(item.name)}</b><span>${position ? esc(position) + ' · ' : ''}${fmtHours(item.hours)} remaining</span></span>
    <span class="youtube-progress">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${videoId ? 'Open next video' : youtube ? 'Open playlist' : 'Open story'}</a>` : ''}
    <button type="button" id="continueProgress">${next || youtube?.durations ? 'Mark watched' : reading ? 'Update reading' : item.game ? '+1 hour played' : 'Go to item'}</button></span>` : '';
  const uncertain = queue.filter(item => item.estimateNeeded);
  $('estimateSummary').hidden = !uncertain.length;
  $('estimateSummary').textContent = `${uncertain.length} item${uncertain.length === 1 ? ' needs' : 's need'} an estimate: ${fmtHours(uncertain.reduce((sum, item) => sum + item.hours, 0))} of placeholder time is included in this forecast.`;
}
function renderQueue({animate = true, context = computationContext()} = {}){
  if($('queueBody').hidden){ queueDirty = true; return; }
  const {plan, totalQueued} = context;
  const labels = queueWeekLabels(context);
  // Pinned last, matching its block on the timeline. No grip, because a rate has
  // no position in a playback order, and no hours field, because they are
  // derived. You turn it off with the dial, not with a remove button.
  const ytRow = youtubeRowHtml(plan, totalQueued, labels);

  renderHistory();
  renderQueueSummary();
  $('queue').innerHTML = (queue.length ? queue.map((x, i) => `<div class="item" data-item-index="${i}" data-kind="${esc(x.kind)}" style="animation-delay:${Math.min(i * 35, 280)}ms">
      <div class="item-order">
        <button class="drag-handle" type="button" data-drag-index="${i}"
          aria-label="Drag ${esc(x.name)} to reorder" aria-describedby="dragInstructions" title="Drag to reorder">
          <svg class="icon" aria-hidden="true"><use href="#i-dots-six-vertical"/></svg></button>
        <span class="position" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <svg class="icon kind" aria-hidden="true"><use href="#i-${KIND_ICON[x.kind] || 'book'}"/></svg>
      </div>
      <div><b>${x.book?.url || x.youtube?.url
        ? `<a class="item-title" href="${esc(x.book?.url || x.youtube.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`
        : esc(x.name)}</b><small>${esc(itemNote(x, context.now))}${x.runtimeScale ? " · custom estimate" : ""}</small>
        <span class="estimate-badge" ${x.estimateNeeded ? '' : 'hidden'}>Estimate needed</span>
        <span class="estimate-context">${esc(estimateContext(x))}</span>
        ${i > 0 ? `<button type="button" class="reset-estimate move-next" data-next="${i}" aria-label="Move ${esc(x.name)} to next">Move to next</button>` : ""}
        <button class="reset-estimate" type="button" data-reset-estimate="${i}" ${x.runtimeScale || x.book?.pinned || x.show?.pinned || x.pod?.pinned ? '' : 'hidden'}>Use calculated estimate</button>
        ${x.kind !== 'Game' ? `<button class="reset-estimate" type="button" data-finish="${i}">Finished</button>` : ""}
        ${x.youtube?.durations ? `<span class="youtube-progress">
          <label for="yw${i}">Watched
            <input id="yw${i}" name="youtube-watched-${i}" type="number" inputmode="numeric"
              min="0" max="${x.youtube.durations.length}" step="1" value="${x.youtube.watched}"
              data-youtube-count="${i}" aria-describedby="yt${i}-total">
            <span class="video-total" id="yt${i}-total">/ ${x.youtube.durations.length}</span>
          </label>
          <button type="button" data-youtube-refresh="${i}" aria-label="Refresh playlist for ${esc(x.name)}"
            ${playlistRefreshing.has(x) ? 'disabled' : ''}>${playlistRefreshing.has(x) ? 'Refreshing…' : 'Refresh playlist'}</button>
        </span><span class="playlist-status" data-youtube-status="${i}" aria-live="polite">${esc(playlistStatus(x))}</span>` : x.youtube ? `<span class="youtube-progress">
          <button type="button" data-youtube-track="${i}" ${loadingItems.has(x) ? 'disabled' : ''}>${loadingItems.has(x) ? 'Loading…' : 'Load videos'}</button>
        </span>${actionFeedbackHtml(x, i)}` : ''}${bookProgressHtml(x.book, i)}${showProgressHtml(x, i)}${gameProgressHtml(x, i)}</div>
      ${x.kind === 'Game' ? `<span class="hours" aria-label="${x.hours} hours remaining"><b>${x.hours}</b>h</span>` : `<span class="hours"><label class="sr" for="h${i}">Hours for ${esc(x.name)}</label>
        <input id="h${i}" type="text" inputmode="decimal" value="${x.hours}" data-hours="${i}"
          title="Enter hours, or /2 to divide the current hours by 2" aria-label="Hours for ${esc(x.name)}. Enter a number, or slash then a number to divide.">h</span>`}
      <span class="wk">${labels.items[i]}</span>
      <button class="remove" type="button" data-remove="${i}" aria-label="Remove ${esc(x.name)}" title="Remove item">
        <svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
    </div>`).join('')
    : `<div class="empty"><h3>What's first in your queue?</h3><p>Add something you want to play, watch or read. Your queue will show how much of the wait it fills at your weekly pace.</p><div class="empty-actions"><button type="button" class="primary" data-empty-add="Game">Add a game</button><button type="button" data-empty-add="Book">Add a book</button><button type="button" data-empty-add="YouTube">Add a playlist</button></div></div>`) + ytRow;

  if(!animate) $('queue').querySelectorAll('.item').forEach(row => { row.style.animation = 'none'; });

  if(dragState){
    $('queue').classList.add('is-sorting');
    markDraggedRow();
  }
  applyQueueFilters();
  queueDirty = false;
}

const loadingItems = new WeakSet();
function loadingButton(item, action, label){
  const button = $('queue').querySelector(`[data-${action}="${queue.indexOf(item)}"]`);
  if(button){ button.disabled = loadingItems.has(item); button.textContent = label; }
}
async function updateGameMainStory(item){
  if(!item?.game || loadingItems.has(item)) return;
  const {total, sourceUrl} = item.game, basis = item.runtimeBasis;
  loadingItems.add(item);
  setActionFeedback(item, 'Looking up main-story completion time…');
  loadingButton(item, 'game-lookup', 'Looking up…');
  try{
    const result = await gameMainStoryProfile({...item,qid:item.catalogId?.match(/^wikidata:(Q\d+)$/)?.[1]});
    if(!queue.includes(item)) return;
    if(item.game.total !== total || item.game.sourceUrl !== sourceUrl || item.runtimeBasis !== basis){
      setActionFeedback(item, 'Your total changed during lookup. Your estimate was kept.');
      return;
    }
    loadingItems.delete(item);
    commitQueueChange(`Updated main-story time for ${item.name}`, () => {
      item.game = {...result.game, played:item.game.played};
      item.hours = remainingGameHours(item.game);
      item.runtimeSource = result.runtimeSource; item.runtimeBasis = 'estimated';
      if(result.catalogId) item.catalogId = result.catalogId;
      item.estimateNeeded = false;
      delete item.runtimeScale;
      actionFeedback.set(item, `Main story: ${result.hours}h total, ${item.hours}h left after ${item.game.played}h played.`);
    });
  }catch(error){
    if(queue.includes(item)) setActionFeedback(item, `${error.message} Your total and played hours were kept. Edit Total or try again.`);
  }finally{
    loadingItems.delete(item);
    if(queue.includes(item)) loadingButton(item, 'game-lookup', 'Update main-story time');
  }
}
async function loadShow(item){
  if(!item || loadingItems.has(item)) return;
  loadingItems.add(item);
  setActionFeedback(item, 'Loading episodes…');
  loadingButton(item, 'show-load', 'Loading…');
  try{
    const query = item.name.replace(/\s*\((?:\d{4}|year unknown)\)$/, '');
    const matches = (await findShows(query)).filter(p => loose(p.name) === loose(item.name) || loose(p.matchText) === loose(item.name));
    if(matches.length !== 1) throw new Error('Choose this show from search to identify its episode list.');
    const show = await showProfile(matches[0].showId);
    if(!queue.includes(item)) return;
    commitQueueChange(null, () => {
      item.show = show; item.hours = showRemainingHours(show);
      item.catalogId = catalogIdForPick(matches[0]);
      actionFeedback.delete(item);
    });
  }catch(error){
    if(queue.includes(item)){
      setActionFeedback(item, `${error.message} Try Load episodes again.`);
      $('queueStatus').textContent = `${item.name}: ${error.message}`;
    }
  }finally{
    loadingItems.delete(item);
    loadingButton(item, 'show-load', 'Load episodes');
  }
}
async function loadPlaylist(item){
  const youtube = item?.youtube;
  if(!youtube || youtube.durations || loadingItems.has(item)) return;
  loadingItems.add(item);
  setActionFeedback(item, 'Loading videos…');
  loadingButton(item, 'youtube-track', 'Loading…');
  try{
    const durations = await readPlaylistDurations(youtube.playlistId, (done, total) => {
      loadingButton(item, 'youtube-track', `${done}/${total}`);
    });
    if(!queue.includes(item)) return;
    commitQueueChange(null, () => {
      youtube.durations = durations.map(seconds => Math.round(seconds));
      if(durations.videoIds) youtube.videoIds = durations.videoIds;
      youtube.watched = 0; youtube.checkedAt = Date.now();
      item.hours = remainingPlaylistHours(youtube.durations, 0);
      actionFeedback.delete(item);
    });
  }catch(error){
    if(queue.includes(item)){
      setActionFeedback(item, error.message);
      $('queueStatus').textContent = `${item.name}: ${error.message}`;
    }
  }finally{
    loadingItems.delete(item);
    loadingButton(item, 'youtube-track', actionFeedback.has(item) ? 'Try loading again' : 'Load videos');
  }
}
async function refreshPlaylist(item){
  if(!item?.youtube?.durations || playlistRefreshing.has(item)) return;
  playlistRefreshing.add(item);
  setPlaylistFeedback(item, 'Checking the playlist for changes…');
  try{
    await refreshYoutubePlaylists({forceItem:item, onProgress:(done, total) => {
      setPlaylistFeedback(item, `Reading video runtimes: ${done}/${total}.`);
    }});
  }finally{
    playlistRefreshing.delete(item);
    setPlaylistFeedback(item, playlistFeedback.get(item) || '');
  }
}

// Stable containers own handlers. Rebuilt rows contain only markup.
$('completedList').addEventListener('click', event => {
  const button = event.target.closest('[data-restore]');
  if(button) restoreItem(+button.dataset.restore);
});
$('continueNext').addEventListener('click', event => {
  if(event.target.closest('#continueProgress')) continueNext();
});
$('queue').addEventListener('click', event => {
  const button = event.target.closest('button');
  const row = button?.closest('[data-item-index]');
  if(!row) return;
  const index = +row.dataset.itemIndex, item = queue[index];
  if(button.hasAttribute('data-remove')) removeItem(index);
  else if(button.hasAttribute('data-finish')) finishItem(index);
  else if(button.hasAttribute('data-game-finish')) finishItem(index, {game:true});
  else if(button.hasAttribute('data-game-lookup')) updateGameMainStory(item);
  else if(button.hasAttribute('data-reset-estimate')) resetEstimate(index);
  else if(button.hasAttribute('data-show-load')) loadShow(item);
  else if(button.hasAttribute('data-youtube-track')) loadPlaylist(item);
  else if(button.hasAttribute('data-youtube-refresh')) refreshPlaylist(item);
});
$('queue').addEventListener('change', event => {
  const input = event.target, row = input.closest('[data-item-index]');
  if(!row) return;
  const index = +row.dataset.itemIndex, item = queue[index];
  if(!item) return;
  if(input.matches('[data-game-played], [data-game-total]')){
    const field = input.hasAttribute('data-game-played') ? 'played' : 'total';
    if(!setGameProgress(index, field, input.value)) input.value = item.game[field];
  }else if(input.matches('[data-show-season], [data-show-episode]')){
    const season = +row.querySelector('[data-show-season]').value;
    setShowProgress(index, season, input.hasAttribute('data-show-season') ? 0 : +input.value);
    ($('queue').querySelector(`[data-show-episode="${index}"]`) || $('name')).focus();
  }else if(input.matches('[data-book-progress]')){
    if(!setBookProgress(index, Number(input.value))) input.value = item.book.progress || 0;
  }else if(input.matches('[data-youtube-count]')){
    if(!input.value.trim() || !setYoutubeProgress(index, Number(input.value))) input.value = item.youtube.watched;
  }
});
// blur does not bubble; focusout deliberately commits estimates on the container.
$('queue').addEventListener('focusout', event => {
  const input = event.target;
  if(!input.matches('[data-hours]')) return;
  const item = queue[+input.dataset.hours];
  if(!item) return;
  const value = resolveItemHoursEdit(item.hours, input.value);
  if(value !== null && (value !== item.hours || item.estimateNeeded)) setRemainingEstimate(item, value);
  input.value = item.hours;
});
$('queue').addEventListener('keydown', event => {
  const handle = event.target.closest('[data-drag-index]');
  if(handle && !handle.disabled){
    const from = +handle.dataset.dragIndex;
    const to = event.key === 'ArrowUp' ? from - 1 : event.key === 'ArrowDown' ? from + 1 : from;
    if(to !== from){ event.preventDefault(); moveQueueItem(from, to, {focus:true}); }
  }else if(event.key === 'Enter' && event.target.matches('input')) event.target.blur();
});
$('queue').addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-drag-index]');
  if(!handle || handle.disabled || dragState || (event.button !== 0 && event.pointerType === 'mouse')) return;
  event.preventDefault();
  const index = +handle.dataset.dragIndex;
  dragState = {index, pointerId:event.pointerId, name:queue[index].name, moved:false};
  $('queue').classList.add('is-sorting'); markDraggedRow();
  document.addEventListener('pointermove', dragMove, {passive:false});
  document.addEventListener('pointerup', dragEnd);
  document.addEventListener('pointercancel', dragEnd);
});

const duplicateRequests = [];
let focusAfterAddClose = null;
function showDuplicateRequest(){
  const request = duplicateRequests[0];
  if(!request || $('duplicateDialog').open) return;
  $('duplicateMessage').textContent = `${request.item.name} matches ${request.existing.name}, already in your queue. Adding another copy counts its runtime again. You can keep both for a replay or a different edition.`;
  $('duplicateDialog').showModal();
}
function focusQueueItem(item){
  queueFilter = queueQuery = ''; $('queueSearch').value = '';
  setView('queue'); updateFilterRoute();
  renderQueue({animate:false});
  const row = $('queue').querySelector(`[data-item-index="${queue.indexOf(item)}"]`);
  row?.scrollIntoView({block:'center'});
  const input = row?.querySelector('[data-game-total],[data-hours],[data-book-progress]');
  (input || $('quickAdd')).focus({preventScroll:true});
  input?.select();
}
function addToQueue({name, hours, kind, ...details}, {allowDuplicate = false, onAdded = null} = {}){
  if(!name || !Number.isFinite(hours) || hours < MIN_ITEM_HOURS || hours > MAX_ITEM_HOURS) return false;
  const item = {name,hours,kind,...details};
  const existing = queue.find(saved => queueItemsMatch(item,saved));
  if(existing && !allowDuplicate){
    duplicateRequests.push({item:structuredClone(item),existing,onAdded});
    showDuplicateRequest();
    return false;
  }
  const replay = completed.some(saved => queueItemsMatch(item,saved));
  commitQueueChange(`Added ${name}`, () => queue.push(item));
  if($('addDialog').open) $('addDialog').close();
  noteUndo(item.estimateNeeded ? `Added ${name} with a ${fmtHours(hours)} placeholder. Set your own estimate for a useful forecast.`
    : `Added ${name}.${replay ? ' You have finished a matching item before.' : ''}`,item.estimateNeeded ? editEstimateAction(item) : null);
  onAdded?.();
  return true;
}
$('duplicateAdd').onclick = () => {
  const request = duplicateRequests[0];
  $('duplicateDialog').close();
  if(request) addToQueue(request.item,{allowDuplicate:true,onAdded:request.onAdded});
};
$('duplicateExisting').onclick = () => {
  const item = duplicateRequests[0]?.existing;
  $('duplicateDialog').close();
  if($('addDialog').open){ focusAfterAddClose = item; $('addDialog').close(); }
  else if(item) focusQueueItem(item);
};
$('duplicateDialog').addEventListener('close',() => {
  duplicateRequests.shift();
  if(duplicateRequests.length) showDuplicateRequest();
});

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

/* ---- saved state ------------------------------------------------------
   A static page opened from disk cannot write files, and browsers block it
   from reading a sibling file too (verified: Chromium refuses `fetch` on a
   file:// neighbour). localStorage is the one local store that works either
   way, so that is the autosave. It holds plain Markdown, so the same text
   exports to a real file with no second format to maintain.              */

const STORE_KEY = SITE_CONFIG.storageKey;
function serializeState(){
  return TimeBridgeCore.serializeState({appName:APP_NAME, target:currentReleaseTarget(), savedAt:new Date(),
    queue, completed, schedule:{scheduleMode:$('scheduleMode').value,
      sleepStart:$('sleepStart').value, sleepEnd:$('sleepEnd').value, pace:$('paceInput').value,
      startDate:$('startDate').value, jobHours:$('jobHours').value, jobDate:$('jobStart').value,
      ytUnit, ytAmount:$('ytAmount').value, grassHours:readGrassHours(), bookPagesPerHour:readBookPace()}});
}

function applyState(parsed){
  if(!parsed?.ok) return 0;
  if(parsed.target) setReleaseTarget(parsed.target);
  const state = parsed.schedule;
  $('scheduleMode').value = state.scheduleMode || 'advanced';
  $('paceInput').max = 168;
  completed = parsed.completed || [];
  if(state.sleepStart && [...$('sleepStart').options].some(o => o.value === state.sleepStart))
    $('sleepStart').value = state.sleepStart;
  if(state.sleepEnd && [...$('sleepEnd').options].some(o => o.value === state.sleepEnd))
    $('sleepEnd').value = state.sleepEnd;
  if(state.pace !== null) $('paceInput').value = clampNumber(state.pace, 1, 168, 21);
  // A saved start date that has since passed is meaningless; fall back to today.
  $('startDate').value = toDateValue(fromDateValue(state.startDate) || new Date());
  $('startDate').value = toDateValue(startDate());
  if(state.jobHours !== null) $('jobHours').value = clampNumber(state.jobHours, 0, 90, 0);
  $('grassHours').value = clampNumber(state.grassHours, 0, 168, 0);
  $('bookPace').value = clampNumber(state.bookPagesPerHour, 20, 1000, DEFAULT_BOOK_PAGES_PER_HOUR);
  $('jobStart').value = toDateValue(fromDateValue(state.jobDate) || new Date());
  $('jobStart').value = toDateValue(readJob().date);
  // Restoring, not toggling: the saved number is already in the saved unit.
  const unit = (state.ytUnit || 'day').toLowerCase();
  $('ytAmount').value = clampNumber(state.ytAmount, 0, unit === 'week' ? 168 : 24, 0);
  setYtUnit(unit, {renderNow:false});
  queue = parsed.queue;
  stateRevision++; historyRevision++;
  return queue.length;
}

// A save that fails validation is never silently replaced. It is copied here
// first; if even that copy fails, autosave stays off until the user acts.
const UNREADABLE_KEY = STORE_KEY + '.unreadable';
let saveBlocked = false, unreadableText = null;
function readUnreadableSave(){
  try{ return localStorage.getItem(UNREADABLE_KEY) || unreadableText; }catch(error){ return unreadableText; }
}
function syncUnreadableSave(){
  $('unreadableSave').hidden = !readUnreadableSave();
}
function keepUnreadableSave(text){
  try{ if(localStorage.getItem(UNREADABLE_KEY) === text) return true; }catch(error){ return false; }
  for(const clear of [() => {}, () => localStorage.removeItem(STORE_KEY + '.undo')]){
    try{ clear(); localStorage.setItem(UNREADABLE_KEY, text); return true; }
    catch(error){ /* Retry once with Undo history cleared, then give up. */ }
  }
  return false;
}
$('downloadUnreadable').onclick = () => {
  const text = readUnreadableSave();
  if(!text) return syncUnreadableSave();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/markdown'}));
  a.download = 'release-queue-unreadable.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('discardUnreadable').onclick = () => {
  try{ localStorage.removeItem(UNREADABLE_KEY); }catch(error){ /* Nothing else to clean up. */ }
  saveBlocked = false; unreadableText = null;
  syncUnreadableSave();
  setSaveStatus('Deleted the kept copy of the unreadable save.');
  saveState();
};

let saveTimer, savePending = false, pendingSaveNote;
function setSaveStatus(message){
  $('saveState').textContent = message;
  $('backupStatus').textContent = message;
  $('storageNotice').hidden = !/could not|invalid/i.test(message);
  $('storageNoticeText').textContent = message;
}
function saveState(note){
  clearTimeout(saveTimer);
  savePending = true;
  pendingSaveNote = note;
  saveTimer = setTimeout(flushSave, 400);
}
function flushSave(){
  if(!savePending) return;
  clearTimeout(saveTimer);
  savePending = false;
  if(saveBlocked){
    setSaveStatus('Changes could not be saved locally because an unreadable save could not be copied first. Use Export queue to keep this queue.');
    return;
  }
  try{
    const text = serializeState();
    try{ localStorage.setItem(STORE_KEY, text); }
    catch(error){
      if(error.name !== 'QuotaExceededError') throw error;
      localStorage.removeItem(STORE_KEY + '.undo');
      localStorage.setItem(STORE_KEY, text);
    }
  }catch(error){
    setSaveStatus('Could not save locally. Use Export queue to keep a copy.');
    return;
  }
  let historySaved = false;
  let history = trimUndoStack();
  for(;;){
    try{
      localStorage.setItem(STORE_KEY + '.undo', history);
      historySaved = true;
      break;
    }catch(error){
      if(error.name !== 'QuotaExceededError' || !undoStack.length) break;
      undoStack.shift();
      history = trimUndoStack();
    }
  }
  syncUndoStatus();
  setSaveStatus((pendingSaveNote
    || `Saved locally · ${queue.length} item${queue.length === 1 ? '' : 's'} · ${new Date().toLocaleTimeString()}`)
    + (historySaved ? '' : ' · Undo history could not be saved.'));
}

function loadState(){
  let text = null;
  try{
    for(const key of [STORE_KEY, ...SITE_CONFIG.legacyStorageKeys]){
      text = localStorage.getItem(key);
      if(text) break;
    }
  }
  catch(e){ /* storage unavailable; start empty */ }
  if(!text) return false;
  const parsed = parseStateText(text);
  if(!parsed.ok){
    unreadableText = text;
    saveBlocked = !keepUnreadableSave(text);
    syncUnreadableSave();
    setSaveStatus(`Your saved queue could not be read. ${parsed.error} `
      + (saveBlocked ? 'Autosave is paused so it is not overwritten.' : 'A copy is kept in Settings.'));
    return false;
  }
  const n = applyState(parsed);
  setSaveStatus(n
    ? `Restored ${n} item${n === 1 ? '' : 's'} from your last session.`
    : 'Nothing saved yet.');
  return true;
}

function recommendationPrompt(){
  const {now, plan, forecast} = computationContext({timeline:false});
  const rows = queue.map((item, index) => `${index + 1}. ${item.name} | ${item.kind} | ${fmtHours(num1(item.hours))} remaining`);
  const timing = now >= TARGET
    ? 'The selected release date has passed. No additional hours are needed for this wait.'
    : forecast.capacity <= 0
      ? 'No queue time is available before release with my current time budget. Missing time: 0 hours.'
      : `Time still needed: ${fmtHours(num1(forecast.missingHours))} to fill the wait before ${SITE_CONFIG.gameName} releases on ${SITE_CONFIG.releaseDate}.`;
  return `Add recommendations on top of the queue.

Current queue, in playback order:
${rows.join('\n') || '(The queue is empty.)'}

${timing}
Current queue total: ${fmtHours(num1(forecast.totalHours))}.
Available queue time before release: ${fmtHours(num1(forecast.capacity))}, after recurring YouTube${plan.grassHours ? ' and Touch grass' : ''} time is deducted.
${plan.yt.perDay > 0 ? `Recurring YouTube: ${fmtHours(num1(plan.yt.perDay))} per day, alongside the queue.\n` : ''}
${plan.grassHours > 0 ? `Touch grass: ${fmtHours(num1(plan.grassHours))} per week away from the queue.\n` : ''}
Suggest what to play, watch or read next based on this queue. Put your recommendations first, avoid titles already listed, and include estimated runtimes and a brief reason for each. Aim to cover the missing time when there is a gap.`;
}
function copyPromptFallback(text){
  const focused = document.activeElement;
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const input = $('promptCopyText');
  input.value = text;
  $('promptCopyFeedback').hidden = $('promptCopyManual').hidden = false;
  input.focus({preventScroll:true});
  input.select();
  let copied = false;
  try{ copied = document.execCommand('copy'); }catch(error){}
  if(copied){
    $('promptCopyManual').hidden = true;
    focused?.focus({preventScroll:true});
    window.scrollTo(scrollX, scrollY);
  }
  return copied;
}
async function copyRecommendations(){
  // Commit a focused remaining-time edit before taking the queue snapshot.
  if($('queue').contains(document.activeElement)) document.activeElement.blur();
  const text = recommendationPrompt();
  const button = document.activeElement === $('queueRecommend') ? $('queueRecommend') : $('copyPrompt');
  const restoreButtonFocus = document.activeElement === button;
  let copied = false;
  try{
    button.disabled = true;
    if(navigator.clipboard?.writeText){
      try{ await navigator.clipboard.writeText(text); copied = true; }catch(error){}
    }
    if(copied){
      $('promptCopyFeedback').hidden = false;
      $('promptCopyManual').hidden = true;
      $('promptCopyStatus').textContent = 'Recommendation prompt copied. Paste it into your chat.';
      if(button === $('queueRecommend')) notifyAction('Recommendation prompt copied. Paste it into your chat.');
    }else{
      // Clipboard access failed and the manual-copy field lives in Settings, so land
      // there before the fallback focuses and selects it. Apply navigation
      // synchronously so a later hashchange cannot steal focus from the selected
      // manual-copy field or reset its scroll position.
      if(location.hash !== '#settings') history.pushState(null,'','#settings');
      setView('settings');
      copied = copyPromptFallback(text);
      $('promptCopyFeedback').hidden = false;
      $('promptCopyManual').hidden = copied;
      $('promptCopyStatus').textContent = copied ? 'Recommendation prompt copied. Paste it into your chat.' : 'Select and copy the prompt below to paste it into your chat.';
      $('promptCopyText').scrollIntoView({block:'center'});
    }
  }finally{
    button.disabled = false;
    if(copied && restoreButtonFocus && [document.body, $('promptCopyText')].includes(document.activeElement))
      button.focus({preventScroll:true});
  }
};
$('copyPrompt').onclick = copyRecommendations;
$('export').onclick = () => {
  const blob = new Blob([serializeState()], {type:'text/markdown'});
  if(blob.size > TimeBridgeCore.MAX_PORTABLE_SAVE_BYTES){
    const limit = TimeBridgeCore.MAX_PORTABLE_SAVE_BYTES / (1024 * 1024);
    setSaveStatus(`Could not export this queue. Portable backups are limited to ${limit} MiB so supported exports can be loaded again.`);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = SITE_CONFIG.exportFilename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('importBtn').onclick = () => $('importFile').click();
async function readQueueBackup(file){
  const limit = TimeBridgeCore.MAX_PORTABLE_SAVE_BYTES;
  if(file.size > limit) throw new Error('The selected file exceeds the supported 10 MiB limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = /\.zip$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  if(!isZip) return new TextDecoder().decode(bytes);
  if(typeof fflate === 'undefined') throw new Error('ZIP support could not load. Extract the Markdown backup and load it directly.');
  const candidates = [];
  try{
    // Inspect the directory first, without decompressing any entry.
    fflate.unzipSync(bytes, {filter(entry){
      if(!entry.name.startsWith('__MACOSX/') && /\.(md|markdown)$/i.test(entry.name)) candidates.push(entry);
      return false;
    }});
  }catch(error){ throw new Error('This ZIP could not be read. Use an unencrypted ZIP or load the Markdown backup directly.'); }
  if(candidates.length !== 1) throw new Error('Choose a ZIP containing exactly one Markdown backup.');
  const entry = candidates[0];
  if(entry.originalSize > limit) throw new Error('The extracted backup exceeds the supported 10 MiB limit.');
  let extracted;
  try{
    extracted = fflate.unzipSync(bytes, {filter:item => item.name === entry.name})[entry.name];
    if(!extracted || extracted.length !== entry.originalSize) throw new Error('Invalid ZIP entry.');
  }catch(error){ throw new Error('The backup could not be extracted. Use an unencrypted ZIP or load the Markdown backup directly.'); }
  return new TextDecoder().decode(extracted);
}
$('importFile').onchange = async () => {
  const file = $('importFile').files[0];
  if(!file) return;
  try{
    const parsed = parseStateText(await readQueueBackup(file));
    if(!parsed.ok) throw new Error(parsed.error);
    checkpoint(`Loaded ${file.name}`);
    const n = applyState(parsed);
    lastSig = null;
    render({forceQueue:true});
    saveState(`Loaded ${n} item${n === 1 ? '' : 's'} from ${file.name}.`);
  }catch(error){
    setSaveStatus(`Could not load ${file.name}. ${error.message}`);
  }finally{
    $('importFile').value = ''; // so re-picking the same file fires change again
  }
};

/* ---- lookup sources ----------------------------------------------------
   Every source below is keyless and sends `Access-Control-Allow-Origin: *`,
   which is what lets this stay one static file with no server behind it.
   Verified directly: Steam's storesearch, SteamSpy, and Google Books do NOT,
   which is why none of them are here.

     shows   TVMaze          real runtime  (episode runtimes, summed)
     movies  Wikidata P2047  real runtime  (minutes, from the film entity)
     books   Open Library    ESTIMATE      (median page count / reading rate)
     light   AniList         ESTIMATE      (known volumes x 250 pages / reading rate)
     web     Wikimedia       unknown       (identification only; you set the hours)
     games   HowLongToBeat   ESTIMATE      (main-story completion via Jina Reader)
             local table     rough fallback (unverified main-story estimates)
             RAWG            unknown       (identification; playtime is not completion)
             Wikidata        unknown       (identification only; you set the hours)

   Wikidata has no playtime property for games and its P136 genres are too
   noisy to derive one from, so an unknown game is added as an unknown rather
   than dressed up with a fabricated number.                               */

const RAWG_KEY = '';         // Optional title discovery. Activity playtime is not a completion estimate.
const WD = 'https://www.wikidata.org/w/api.php?origin=*&format=json&';
const WP = 'https://en.wikipedia.org/w/api.php?origin=*&format=json&';
const ANILIST = 'https://graphql.anilist.co';
const FETCH_TIMEOUT = 4000; // A source that has not answered by now is not going to.
let searchAbort = null;
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

/* ---- release target picker -------------------------------------------
   Public Wikibase API, shared request timeout/cache/pacing with media lookup.
   Day-precision Gregorian claims only; uncertain dates remain manual. */
let gameLookupController = null, gameDraftSource = '', gameDraftDate = '';
function cancelGameLookup(){
  gameLookupController?.abort();
  gameLookupController = null;
  $('gameSearchButton').disabled = false;
  $('gameSearchButton').textContent = 'Search';
  $('gameResults').removeAttribute('aria-busy');
}
function syncGameTargetForm(){
  cancelGameLookup();
  $('targetGameName').value = SITE_CONFIG.gameName;
  $('targetGameDate').value = SITE_CONFIG.releaseDate;
  gameDraftSource = SITE_CONFIG.sourceUrl || '';
  gameDraftDate = SITE_CONFIG.releaseDate;
  $('gameDatesField').hidden = true;
  $('gameResults').replaceChildren();
  $('gameSource').hidden = !gameDraftSource;
  if(gameDraftSource) $('gameSource').href = gameDraftSource;
  $('gameDateNote').textContent = 'Your queue stays in place when you change games.';
  $('useGame').disabled = false;
}
function gameReleaseDates(entity){
  const claims = (entity?.claims?.P577 || []).filter(claim => claim.rank !== 'deprecated');
  // A preferred claim replaces obsolete normal-rank planned dates.
  const current = claims.some(claim => claim.rank === 'preferred')
    ? claims.filter(claim => claim.rank === 'preferred') : claims;
  return [...new Set(current.map(claim => {
    const value = claim.mainsnak?.datavalue?.value;
    if(!value || !Number.isInteger(value.precision) || value.precision < 11 || value.before || value.after
      || value.calendarmodel !== 'http://www.wikidata.org/entity/Q1985727') return null;
    const match = /^\+(\d{4}-\d{2}-\d{2})T/.exec(value.time || '');
    return match && fromDateValue(match[1]) && +match[1].slice(0, 4) >= 1900 ? match[1] : null;
  }).filter(Boolean))].sort();
}
async function searchReleaseGames(event){
  event.preventDefault();
  cancelGameLookup();
  const query = $('gameSearch').value.trim();
  $('gameResults').replaceChildren();
  if(query.length < 2){ $('gameSearchStatus').textContent = 'Enter at least 2 characters to search games.'; return; }
  const controller = new AbortController();
  gameLookupController = controller;
  $('gameSearchButton').disabled = true;
  $('gameSearchButton').textContent = 'Searching…';
  $('gameResults').setAttribute('aria-busy', 'true');
  $('gameSearchStatus').textContent = 'Searching games…';
  try{
    const data = await jget(WD + 'action=wbsearchentities&language=en&uselang=en&limit=20&search='
      + encodeURIComponent(query), controller.signal);
    if(controller.signal.aborted) return;
    const games = (data.search || []).filter(hit => /^Q\d+$/.test(hit.id)
      && typeof hit.label === 'string' && wikidataKind(hit.description) === 'Game').slice(0, 8);
    for(const game of games){
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'game-result';
      const title = document.createElement('b'), description = document.createElement('small');
      title.textContent = game.label; description.textContent = game.description;
      button.append(title, description);
      button.onclick = () => pickReleaseGame(game);
      $('gameResults').append(button);
    }
    $('gameSearchStatus').textContent = games.length ? 'Choose a game to get its release date.'
      : 'No matching games found. Try another title, or enter a title and date below.';
  }catch(error){
    if(!controller.signal.aborted) $('gameSearchStatus').textContent = 'Game search is unavailable. Try again, or enter a title and release date below.';
  }finally{ if(gameLookupController === controller) cancelGameLookup(); }
}
async function pickReleaseGame(game){
  cancelGameLookup();
  const controller = new AbortController();
  gameLookupController = controller;
  gameDraftSource = `https://www.wikidata.org/wiki/${game.id}`;
  gameDraftDate = '';
  $('targetGameName').value = game.label.slice(0, 120);
  $('targetGameDate').value = '';
  $('gameDatesField').hidden = true;
  $('gameSource').href = gameDraftSource;
  $('gameSource').hidden = false;
  $('useGame').disabled = true;
  $('gameSearchStatus').textContent = `Getting the release date for ${game.label}…`;
  $('gameResults').replaceChildren();
  try{
    const data = await jget(WD + 'action=wbgetentities&props=claims&ids=' + game.id, controller.signal);
    if(controller.signal.aborted) return;
    const dates = gameReleaseDates(data.entities?.[game.id]);
    gameDraftDate = dates[0] || '';
    $('targetGameDate').value = gameDraftDate;
    $('gameDates').replaceChildren(...dates.map(date => new Option(fmtDate(fromDateValue(date)), date)));
    $('gameDatesField').hidden = dates.length < 2;
    $('gameDateNote').textContent = dates.length > 1
      ? 'Several dates are listed, often for different platforms or regions. The earliest is selected. Choose or enter the date you want.'
      : dates.length ? 'Release date from Wikidata. Check the source or edit the date for your platform.'
      : 'No exact release day is listed. Enter an announced date or your own planning date.';
    $('gameSearchStatus').textContent = dates.length ? 'Release details loaded. Use game to update your countdown.' : 'This game needs a release date before you can use it.';
  }catch(error){
    if(!controller.signal.aborted){
      $('gameSearchStatus').textContent = 'Could not load the release date. Enter it below, or search again.';
      $('gameDateNote').textContent = 'Enter an announced date or your own planning date.';
    }
  }finally{
    if(gameLookupController === controller){ cancelGameLookup(); syncUseGameButton(); }
  }
}
function syncUseGameButton(){
  $('useGame').disabled = !$('targetGameName').value.trim() || !$('targetGameDate').validity.valid
    || !fromDateValue($('targetGameDate').value);
}
function useReleaseTarget(target){
  checkpoint('Changed target game');
  setReleaseTarget(target);
  // A result computed for the previous launch date must be searched again.
  closeSuggestions();
  lastSig = null;
  render({forceQueue:true, animate:false});
  syncAddButton();
  saveState(`Saved target · ${SITE_CONFIG.gameName}`);
  $('gameTargetStatus').textContent = `Countdown updated for ${SITE_CONFIG.gameName}. Your queue is still here.`;
}
$('gameSearchForm').onsubmit = searchReleaseGames;
$('gameSearch').oninput = () => {
  cancelGameLookup(); $('gameResults').replaceChildren();
  $('gameSearchStatus').textContent = 'Press Search to find matching games.';
};
for(const id of ['targetGameName', 'targetGameDate']) $(id).oninput = () => {
  const loading = !!gameLookupController;
  cancelGameLookup();
  if(loading) $('gameSearchStatus').textContent = 'Lookup stopped. You can enter the details below.';
  $('gameTargetStatus').textContent = '';
  if(id === 'targetGameName'){
    gameDraftSource = ''; gameDraftDate = '';
    $('gameSource').hidden = $('gameDatesField').hidden = true;
  }
  $('gameDateNote').textContent = 'Your entered date will be used for the countdown and timeline.';
  syncUseGameButton();
};
$('gameDates').onchange = () => { $('targetGameDate').value = $('gameDates').value; gameDraftDate = $('gameDates').value; syncUseGameButton(); };
$('gameTargetForm').onsubmit = event => {
  event.preventDefault();
  const name = $('targetGameName').value.trim(), date = $('targetGameDate').value;
  const fromSource = !!gameDraftSource && date === gameDraftDate;
  const target = validateReleaseTarget({gameName:name, gameShortName:name, releaseDate:date,
    dateLabel:fromSource ? 'Wikidata release date' : 'Your planned release date', sourceUrl:gameDraftSource});
  if(!target){ $('gameTargetStatus').textContent = 'Enter a game title and a valid release date.'; return; }
  useReleaseTarget(target);
};
$('resetGame').onclick = () => useReleaseTarget(DEFAULT_SITE_CONFIG);

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

async function findRawgGames(query, signal = null){
  if(!RAWG_KEY) return [];
  const data = await jget(`https://api.rawg.io/api/games?key=${RAWG_KEY}&page_size=4&search=`
    + encodeURIComponent(query), signal);
  return (data.results || []).map(g => ({
    kind:'Game', name:g.name, hours:null, estimated:true, note:'RAWG · main-story time checked on add'
  }));
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

/* ---- suggestion UI ----------------------------------------------------- */
// The list is a combobox popup, so the input keeps focus and points at the
// highlighted row through aria-activedescendant. `currentPicks` is what Enter
// and the arrow keys act on; a skeleton or a note leaves it empty on purpose.
let currentPicks = [], activePick = -1;

function openSuggestions(){
  $('suggestions').hidden = false;
  $('name').setAttribute('aria-expanded', 'true');
}
function clearActive(){
  activePick = -1;
  $('name').removeAttribute('aria-activedescendant');
}
function cancelPendingSearch(){
  clearTimeout(searchTimer);
  searchSeq++;
  searchAbort?.abort();
  searchAbort = null;
}
const closeSuggestions = ({cancel = true} = {}) => {
  if(cancel) cancelPendingSearch();
  $('suggestions').hidden = true;
  $('name').setAttribute('aria-expanded', 'false');
  currentPicks = [];
  clearActive();
};
function setActive(i){
  const opts = $('suggestions').querySelectorAll('[data-pick]');
  if(!opts.length) return clearActive();
  activePick = (i + opts.length) % opts.length; // wraps at both ends
  opts.forEach((o, k) => {
    const on = k === activePick;
    o.classList.toggle('is-active', on);
    o.setAttribute('aria-selected', String(on));
  });
  $('name').setAttribute('aria-activedescendant', opts[activePick].id);
  opts[activePick].scrollIntoView({block:'nearest'});
}
function suggestionSkeleton(){
  currentPicks = []; clearActive();
  $('suggestions').innerHTML = ['52%','66%','44%'].map(w =>
    `<div class="skeleton-row"><div class="skeleton" style="width:${w}"></div>`
    + `<div class="skeleton" style="width:28%"></div></div>`).join('');
  openSuggestions();
}
function suggestionNote(text){
  currentPicks = []; clearActive();
  $('suggestions').innerHTML = `<p class="sugg-note">${esc(text)}</p>`;
  openSuggestions();
}
// Redrawn every time a source lands, so the highlight is restored by identity
// rather than by index: a late result must not move what Enter is pointing at.
function renderPicks(picks, pending, failures){
  const context = computationContext({timeline:false});
  const held = activePick >= 0 ? currentPicks[activePick] : null;
  currentPicks = picks.slice().sort((a, b) => a.rank - b.rank || a.tier - b.tier
    || (a.sourceRank || 0) - (b.sourceRank || 0)).slice(0, 10);
  const tail = pending
    ? `<p class="sugg-note">Still checking ${pending} more source${pending === 1 ? '' : 's'}.</p>`
    : failures ? `<p class="sugg-note">Some sources did not answer.</p>` : '';
  $('suggestions').innerHTML = currentPicks.map((p, i) => `
      <button class="suggestion" type="button" role="option" id="sugg-${i}" tabindex="-1"
        aria-selected="false" data-pick="${i}">
        <span class="body">
          ${p.coverUrl
            ? `<img class="suggestion-cover" src="${esc(p.coverUrl)}" width="32" height="48" alt="">`
            : p.coverId
            ? `<img class="suggestion-cover" src="https://covers.openlibrary.org/b/id/${p.coverId}-S.jpg" width="32" height="48" alt="">`
            : `<svg class="icon" aria-hidden="true"><use href="#i-${KIND_ICON[p.kind]}"/></svg>`}
          <span><b>${esc(p.name)}</b><small><span class="result-kind">${esc(p.kind)}</span> · ${esc(p.note)}${queue.some(item => queueItemsMatch({...p,catalogId:catalogIdForPick(p)},item)) ? ' · Already in queue' : completed.some(item => queueItemsMatch({...p,catalogId:catalogIdForPick(p)},item)) ? ' · Completed before' : ''}</small></span>
        </span>
        <span class="tail">${p.hours != null ? esc((p.estimated ? '~' : '') + p.hours + 'h') : 'Set time'}<span class="candidate-coverage">${esc(candidateCoverage(p.hours, !!p.estimated, context))}</span></span>
      </button>`).join('') + tail;
  openSuggestions();
  $('suggestions').querySelectorAll('[data-pick]').forEach(b =>
    b.onclick = () => choosePick(currentPicks[+b.dataset.pick]));
  const back = held ? currentPicks.indexOf(held) : -1;
  if(back >= 0) setActive(back); else clearActive();
}

function catalogIdForPick(pick){
  return pick.showId ? `tvmaze:${pick.showId}` : pick.podId ? `itunes:${pick.podId}` : pick.qid ? `wikidata:${pick.qid}` : undefined;
}
async function choosePick(pick){
  if(!pick) return;
  const typed = $('name').value;
  closeSuggestions();
  searchAbort = null; // Resolving a pick is its own errand; the next search must not kill it.
  $('name').value = ''; syncAddButton();
  try{
    let hours = pick.hours, known = hours != null;
    let pod = null, book = pick.book || null, show = null, gameRuntime = null, gameFallback = false;
    if(pick.kind === 'Game'){
      $('estimateNote').textContent = `Looking up main-story completion time for ${pick.name}…`;
      $('estimateNote').hidden = false;
      try{
        gameRuntime = await gameMainStoryProfile(pick);
        hours = gameRuntime.hours; known = true;
      }catch(error){
        const local = hltbGames.find(g => [g.name,...(g.aliases || [])].some(name => loose(name) === loose(pick.name)));
        hours = local ? local.main : 10; known = !!local; gameFallback = true;
        gameRuntime = {runtimeSource:local ? 'Unverified local main-story estimate · lookup unavailable' : 'Main-story time unavailable',runtimeBasis:'estimated'};
      }
      $('estimateNote').hidden = true;
    }
    else if(pick.showId) { show = await showProfile(pick.showId); hours = showRemainingHours(show); known = true; }
    else if(pick.podId){ pod = await podcastProfile(pick.podId); hours = podcastHours(pod); known = true; }
    else if(pick.qid){ const r = await wikidataHours(pick.qid, pick.kind); hours = r.hours; known = r.known; }
    // Missing page data should not make a valid book impossible to add. Two
    // hours is a visible placeholder and the row stays editable.
    if(!known && pick.kind === 'Book') hours = 2;
    const runtime = pick.kind === 'Game' ? gameRuntime
      : pick.kind === 'Movie' && known ? {runtimeSource:'Wikidata runtime', runtimeBasis:'measured'} : null;
    if(!addToQueue({name:pick.name, hours, kind:pick.kind, pod, book, show, estimateNeeded:!known,catalogId:catalogIdForPick(pick), ...(runtime || {})},
      {onAdded:() => {
        if($('name').value === typed){ $('name').value = ''; syncAddButton(); }
        if(gameFallback && known) noteUndo(`Added ${pick.name} with an unverified local estimate of ${hours}h. Main-story lookup was unavailable; review Total.`,editEstimateAction(queue.at(-1)));
      }})){
      if(!$('name').value){ $('name').value = typed; syncAddButton(); }
      return;
    }
    if(book){
      const note = $('estimateNote');
      note.textContent = book.basis === 'volumes'
        ? `${pick.name} has ${book.volumes} known volume${book.volumes === 1 ? '' : 's'}. Using a rough ${LIGHT_NOVEL_PAGES_PER_VOLUME} pages per volume, that comes to ${fmtHours(hours)} at your pace.`
        : `${pick.name} is ${book.pages} pages. At about ${book.pagesPerHour} pages an hour, that comes to ${fmtHours(hours)}.`;
      note.hidden = false;
      clearTimeout(estimateNoteTimer);
      estimateNoteTimer = setTimeout(() => { note.hidden = true; }, 9000);
    }
  }catch(e){
    // A lookup selected before a new search must not overwrite what the user is
    // typing now. Restore the old query only when the box is still untouched.
    if(!$('name').value){
      $('name').value = typed;
      if(!$('kind').value) $('kind').value = pick.kind;
      syncAddButton();
      suggestionNote('That lookup failed. Set the hours yourself and press Add.');
    }else{
      const note = $('estimateNote');
      note.textContent = `${pick.name} could not be added because its runtime lookup failed.`;
      note.hidden = false;
      clearTimeout(estimateNoteTimer);
      estimateNoteTimer = setTimeout(() => { note.hidden = true; }, 9000);
    }
  }
}

let estimateNoteTimer;

let searchTimer, searchSeq = 0;
function addUrlInput(value){
  let url;
  try{ url = new URL(value); }catch(error){ return null; }
  if(!/^https?:$/.test(url.protocol)) return null;
  const playlist = parsePlaylistUrl(url.href);
  if(playlist) return {...playlist, kind:'playlist'};
  return {url, kind:webStoryPlatform(url.href) !== 'web' ? 'story' : 'unsupported'};
}
function prepareAddUrl(input){
  if(input.kind === 'playlist'){
    $('playlistAddPanel').open = true;
    if(!$('youtubeUrl').disabled) $('youtubeUrl').value = input.url.href;
  }else if(input.kind === 'story'){
    $('storyAddPanel').open = true;
    if($('webUrl').value !== input.url.href){
      $('webUrl').value = input.url.href;
      $('webUrl').oninput();
    }
  }
}
function syncAddButton(){
  const title = $('name').value.trim();
  const input = addUrlInput(title);
  const hours = Number($('amount').value);
  const button = $('add');
  if(input){
    button.textContent = input.kind === 'story' ? 'Get details' : input.kind === 'playlist' ? 'Add playlist' : 'Add';
    button.disabled = input.kind === 'unsupported' || input.kind === 'playlist' && $('youtubeAdd').disabled;
    $('addHelp').textContent = input.kind === 'playlist' ? 'Playlist detected. Add it now, or enter a name below.'
      : input.kind === 'story' ? 'Story detected. Get its details, then check the length and add it below.'
      : 'Use a YouTube playlist, AO3, FanFiction.net, Royal Road, Wattpad, or Scribble Hub link. Other stories can be entered below.';
  }else{
    button.textContent = 'Add';
    button.disabled = !$('kind').value || !title || title.length > 120 || !Number.isFinite(hours)
      || hours < MIN_ITEM_HOURS || hours > MAX_ITEM_HOURS;
    $('addHelp').textContent = title.length > 120 ? 'Keep the title to 120 characters.' : title && !$('kind').value
      ? 'Choose a search result, or choose a media type and set the hours to add this title yourself.'
      : 'Search a title, paste a playlist or story link, or choose a media type to add your own estimate.';
  }
  renderAddPreview();
}

$('name').oninput = () => {
  cancelPendingSearch();
  syncAddButton();
  const q = $('name').value.trim();
  closeSuggestions({cancel:false});
  const input = addUrlInput(q);
  if(input){ prepareAddUrl(input); return; }
  if(q.length < 2) return;
  const seq = searchSeq;
  searchTimer = setTimeout(() => {
    searchAbort = new AbortController();
    const signal = searchAbort.signal;
    suggestionSkeleton();

    // Tier order is the priority order: a source that knows the real runtime
    // outranks one that only knows the name. Results are painted as they land,
    // so the fastest source is on screen while the slow ones are still going.
    const selectedKind = $('kind').value;
    const sources = [
      {kinds:['Game'], run:() => Promise.resolve(gameSuggestions(q))},
      {kinds:['Game'], run:() => findRawgGames(q, signal)},
      {kinds:['Show'], run:() => findShows(q, signal)},
      {kinds:['Podcast'], run:() => findPodcasts(q, signal)},
      {kinds:['Book'], run:() => findLightNovels(q, signal)},
      {kinds:['Book'], run:() => findWebFiction(q, signal)},
      {kinds:['Game', 'Movie'], run:() => findWikidata(q, signal)},
      {kinds:['Book'], run:() => findBooks(q, signal)}
    ].filter(source => !selectedKind || source.kinds.includes(selectedKind));
    const picks = [], byKey = new Map();
    let pending = sources.length, failures = 0;

    const merge = (results, tier) => {
      for(const p of results){
        if(selectedKind && p.kind !== selectedKind) continue;
        const key = `${p.kind}:${loose(p.name)}`;
        p.rank = suggestionRank(p, q);
        if(p.rank >= 60) continue;
        p.tier = tier;
        const prev = byKey.get(key);
        if(prev && prev.tier <= tier) continue;        // already covered, by an equal or better source
        if(prev) picks[picks.indexOf(prev)] = p;       // a better source answered late; upgrade in place
        else picks.push(p);
        byKey.set(key, p);
      }
    };
    const paint = () => {
      if(seq !== searchSeq) return;                    // a newer query owns the list now
      if(picks.length) return renderPicks(picks, pending, failures);
      if(pending) return;                              // nothing yet, but someone is still looking
      // A dead network and a genuine miss are different answers. Say which.
      const manual = `${selectedKind ? 'Set the hours' : 'Choose a media type and set the hours'}, then press Add.`;
      suggestionNote(failures ? `Could not reach the lookup services. ${manual}`
        : `Nothing found for "${q}". ${manual}`);
    };

    sources.forEach(({run}, tier) => {
      run().then(r => merge(r || [], tier), () => { failures++; })
           .finally(() => { pending--; paint(); });
    });
  }, 250);
};

// The one thing everybody tries first. Enter takes the highlighted row, or the
// top hit if nothing is highlighted, or the typed text with the hours beside it.
$('name').onkeydown = e => {
  const open = !$('suggestions').hidden && currentPicks.length > 0;
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    if(!open) return;
    e.preventDefault();
    setActive(activePick + (e.key === 'ArrowDown' ? 1 : -1));
  }else if(e.key === 'Enter'){
    e.preventDefault();
    if(open) choosePick(currentPicks[activePick >= 0 ? activePick : 0]);
    else if(!$('add').disabled) $('add').click();
  }else if(e.key === 'Escape' && !$('suggestions').hidden){
    e.preventDefault();
    closeSuggestions();
  }
};
$('amount').onkeydown = e => { if(e.key === 'Enter' && !$('add').disabled){ e.preventDefault(); $('add').click(); } };
$('kind').onchange = () => {
  syncAddButton();
  if($('name').value.trim().length >= 2) $('name').oninput();
  else closeSuggestions();
};
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSuggestions(); });
document.addEventListener('click', e => { if(!e.target.closest('.add')) closeSuggestions(); });
$('startDate').onchange = () => {
  // A date before today is silently pulled forward, so show the value actually in use.
  $('startDate').value = toDateValue(startDate());
  render();
};
$('startToday').onclick = () => { $('startDate').value = toDateValue(new Date()); render(); };
$('jobToday').onclick = () => { $('jobStart').value = toDateValue(new Date()); render(); };
function updateYouTubeAmount(input){
  if(input.value !== '') input.value = clampNumber(input.value, 0, ytUnit === 'week' ? 168 : 24, 0);
  $('ytAmount').value = input.value;
  render();
}
for(const input of [$('ytAmount'),$('quickYoutube')]){
  input.oninput = () => updateYouTubeAmount(input);
  input.onblur = () => { $('quickYoutube').value = $('ytAmount').value = readYouTube().amount; };
  input.onkeydown = event => { if(event.key === 'Enter') input.blur(); };
}
$('quickYoutubeUnit').onchange = () => setYtUnit($('quickYoutubeUnit').value, {convert:true});
$('ytPerDay').onclick = () => setYtUnit('day', {convert:true});
$('ytPerWeek').onclick = () => setYtUnit('week', {convert:true});
[$('ytPerDay'), $('ytPerWeek')].forEach(button => button.onkeydown = event => {
  const keyUnit = event.key === 'Home' ? 'day' : event.key === 'End' ? 'week'
    : ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)
      ? ytUnit === 'day' ? 'week' : 'day'
      : null;
  if(!keyUnit) return;
  event.preventDefault();
  setYtUnit(keyUnit, {convert:true});
  $(keyUnit === 'day' ? 'ytPerDay' : 'ytPerWeek').focus();
});
$('grassHours').oninput = () => {
  if($('grassHours').value !== '') $('grassHours').value = readGrassHours();
  render();
};
$('grassHours').onblur = () => { $('grassHours').value = readGrassHours(); };
$('jobHours').oninput = () => {
  if($('jobHours').value !== '') $('jobHours').value = clampNumber($('jobHours').value, 0, 90, 0);
  render();
};
$('jobHours').onblur = () => { $('jobHours').value = readJob().hours; };
$('jobStart').onchange = () => { $('jobStart').value = toDateValue(readJob().date); render(); };
$('bookPace').oninput = () => {
  lastSig = null;
  render();
  if($('name').value.trim().length >= 2) $('name').oninput();
};
$('bookPace').onblur = () => { $('bookPace').value = readBookPace(); renderBookPaceHint(); };
function setWebPlatformRequirement(){
  const royalRoad = webStoryPlatform($('webUrl').value.trim()) === 'royal-road';
  $('webChapters').required = royalRoad;
  $('webChaptersRequirement').textContent = royalRoad ? 'Required for Royal Road' : 'Optional';
}
let webLookupRequest = 0;
let webLookupController = null;
let webLookupUrl = '';
let webAutofill = {};
function cancelWebLookup(){
  webLookupRequest++;
  webLookupController?.abort();
  $('webLookup').disabled = false;
  $('webLookup').textContent = 'Get story details';
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

async function lookupWebNovel(){
  const inputUrl = $('webUrl').value.trim();
  if($('webLookup').disabled && webLookupUrl === inputUrl) return;
  cancelWebLookup();
  webLookupUrl = inputUrl;
  const request = ++webLookupRequest;
  let url;
  try{ url = new URL($('webUrl').value.trim()); }catch(error){ url = null; }
  if(!url || !/^https?:$/.test(url.protocol)){
    $('webLookupStatus').textContent = 'Paste a valid story URL first.';
    return;
  }
  const button = $('webLookup');
  button.disabled = true;
  button.textContent = 'Reading story…';
  $('webLookupStatus').textContent = 'Looking for the title, chapter total, and word count.';
  const ctrl = new AbortController();
  webLookupController = ctrl;
  try{
    let metadata;
    const isFic = ['ao3', 'fanfiction'].includes(webStoryPlatform(url.href));
    try{
      const html = await fetchStoryText(url.href, {Accept:'text/html,text/plain'}, ctrl.signal, 5000);
      metadata = storyMetadataFromHtml(html, url.href);
      if(isFic && (!metadata.title || !metadata.words))
        throw new Error('Story details unavailable');
    }catch(error){
      if(ctrl.signal.aborted) throw error;
      // Reader's default article extraction drops FF.net's profile header.
      // Full HTML retains the title and stats; parse it without rendering it.
      const headers = isFic ? {Accept:'text/plain', 'X-Respond-With':'html'} : {Accept:'text/plain'};
      const text = await fetchStoryText(`https://r.jina.ai/${url.href}`, headers, ctrl.signal, 20000);
      metadata = isFic ? storyMetadataFromHtml(text, url.href) : parseWebNovelMetadata(text, url.href);
    }
    if(request !== webLookupRequest) return;
    const fill = (id, value) => {
      if(!value) return;
      $(id).value = value;
      webAutofill[id] = String(value);
    };
    fill('webTitle', metadata.title);
    fill('webChapters', metadata.chapters);
    if(metadata.words){
      fill('webLength', metadata.words);
      $('webUnit').value = 'words';
    }
    const found = [
      metadata.chapters ? `${metadata.chapters.toLocaleString()} chapters` : '',
      metadata.words ? `${metadata.words.toLocaleString()} ${metadata.wordsEstimated ? 'estimated words' : 'words'}` : ''
    ].filter(Boolean).join(' and ');
    if(metadata.title && found){
      $('webLookupStatus').textContent = `Found ${metadata.title}, with ${found}.`;
    }else if(metadata.title){
      $('webLookupStatus').textContent = 'Found the title, but not a reliable chapter or word total. You can enter them by hand.';
    }else{
      $('webLookupStatus').textContent = 'That site did not expose enough information. Fill in the details by hand.';
    }
  }catch(error){
    if(request === webLookupRequest) $('webLookupStatus').textContent = error.name === 'AbortError'
      ? 'The story page took too long to answer. Fill in the details by hand.'
      : 'The story page could not be read. Fill in the details by hand.';
  }finally{
    if(request === webLookupRequest){
      webLookupController = null;
      button.disabled = false;
      button.textContent = 'Get story details';
    }
  }
}
$('webUrl').oninput = () => {
  cancelWebLookup();
  for(const [id, value] of Object.entries(webAutofill)){
    if($(id).value === value) $(id).value = '';
  }
  webAutofill = {};
  setWebPlatformRequirement();
};
$('webUrl').onchange = lookupWebNovel;
$('webUrl').onpaste = () => setTimeout(lookupWebNovel, 0);
$('webLookup').onclick = lookupWebNovel;
$('webAdd').onclick = () => {
  const title = $('webTitle').value.trim();
  const length = Number($('webLength').value);
  const chaptersText = $('webChapters').value.trim();
  const chapters = chaptersText ? Number(chaptersText) : null;
  let url;
  try{ url = new URL($('webUrl').value.trim()); }catch(e){ url = null; }
  const platform = webStoryPlatform(url?.href);
  const unit = $('webUnit').value;
  if(!title || !url || !/^https?:$/.test(url.protocol) || !Number.isInteger(length) || length <= 0
    || length > (unit === 'words' ? 500000000 : 10000000)
    || (platform === 'royal-road' && !chaptersText)
    || (chaptersText && (!Number.isInteger(chapters) || chapters < 1 || chapters > 100000))){
    $('webHelp').firstChild.textContent = platform === 'royal-road' && !chaptersText
      ? 'Royal Road stories need their total chapter count. '
      : 'Add a title, a valid story URL, its current length, and a valid chapter total if used. ';
    return;
  }
  const pages = unit === 'words' ? length / WEB_WORDS_PER_PAGE : length;
  const pagesPerHour = readBookPace();
  const book = {pages:Math.max(0.01, +pages.toFixed(2)), pagesPerHour, pinned:false,
    basis:unit === 'words' ? 'words' : 'web-pages', platform,
    asOf:toDateValue(new Date()), url:url.href};
  if(unit === 'words') book.words = Math.round(length);
  if(chapters) book.chapters = chapters;
  const hours = estimateBookHours(book.pages, pagesPerHour);
  addToQueue({name:title, hours, kind:'Book', book},{onAdded:() => {
    const note = $('estimateNote');
    note.textContent = unit === 'words'
      ? `${title} is currently ${Math.round(length).toLocaleString()} words. Using ${WEB_WORDS_PER_PAGE} words per page, that comes to ${fmtHours(hours)} at your pace.`
      : `${title} is currently ${Math.round(length).toLocaleString()} pages, or ${fmtHours(hours)} at your pace.`;
    note.hidden = false;
    cancelWebLookup();
    webAutofill = {};
    $('webLookupStatus').textContent = 'Story added. Paste another story URL to fill its details.';
    $('webTitle').value = $('webUrl').value = $('webLength').value = $('webChapters').value = '';
    if(addUrlInput($('name').value.trim())?.url.href === url.href) $('name').value = '';
    syncAddButton();
    $('webChapters').required = false;
    $('webChaptersRequirement').textContent = 'Optional';
  }});
};
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

const PLAYLIST_REFRESH_MS = 6 * 60 * 60 * 1000;
const playlistRetries = new Map();
const playlistRefreshing = new WeakSet();
const playlistFeedback = new WeakMap();
const actionFeedback = playlistFeedback;
function actionFeedbackHtml(item, index){
  return `<span class="playlist-status" data-action-status="${index}" aria-live="polite">${esc(actionFeedback.get(item) || '')}</span>`;
}
function setActionFeedback(item, message){
  actionFeedback.set(item, message);
  const status = $('queue').querySelector(`[data-action-status="${queue.indexOf(item)}"]`);
  if(status) status.textContent = message;
}
function playlistStatus(item){
  if(playlistFeedback.has(item)) return playlistFeedback.get(item);
  const checkedAt = item.youtube?.checkedAt;
  if(!checkedAt) return 'Not checked yet.';
  const minutes = Math.max(0, Math.floor((Date.now() - checkedAt) / 60000));
  const when = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    : minutes < 1440 ? `${Math.floor(minutes / 60)} hour${minutes < 120 ? '' : 's'} ago`
    : `${Math.floor(minutes / 1440)} day${minutes < 2880 ? '' : 's'} ago`;
  return `Checked ${when}.`;
}
function setPlaylistFeedback(item, message){
  playlistFeedback.set(item, message);
  const index = queue.indexOf(item);
  if(index < 0) return;
  const status = $('queue').querySelector(`[data-youtube-status="${index}"]`);
  if(status) status.textContent = message;
  const button = $('queue').querySelector(`[data-youtube-refresh="${index}"]`);
  if(button){
    button.disabled = playlistRefreshing.has(item);
    button.textContent = button.disabled ? 'Refreshing…' : 'Refresh playlist';
  }
}
let playlistRefreshPromise = null;
function refreshYoutubePlaylists({forceItem = null, onProgress = () => {}} = {}){
  if(playlistRefreshPromise){
    // Finish the current batch before a user-requested check. Explicit checks
    // bypass freshness and retry delays, while lookups remain serialized.
    return forceItem ? playlistRefreshPromise.then(() => refreshYoutubePlaylists({forceItem, onProgress}))
      : playlistRefreshPromise;
  }
  if(document.hidden) return Promise.resolve();
  playlistRefreshPromise = (async () => {
    let added = 0, removed = 0, updated = 0, changed = false, checked = false;
    const now = Date.now();
    const activeIds = new Set(queue.map(item => item.youtube?.playlistId));
    for(const id of playlistRetries.keys()) if(!activeIds.has(id)) playlistRetries.delete(id);
    const playlists = queue.filter(item => item.youtube?.durations && (forceItem ? item === forceItem
      : (!item.youtube.checkedAt || item.youtube.checkedAt > now
        || now - item.youtube.checkedAt >= PLAYLIST_REFRESH_MS)
      && (playlistRetries.get(item.youtube.playlistId) || 0) <= now));
    for(const item of playlists){
      if(document.hidden) break;
      if(!queue.includes(item)) continue;
      try{
        const durations = await readPlaylistDurations(item.youtube.playlistId, forceItem ? onProgress : () => {}, item.youtube.durations.length);
        const unavailableNote = durations.unavailableCount
          ? ` ${durations.unavailableCount} unavailable videos hidden by YouTube were skipped.` : '';
        const latest = durations.map(seconds => Math.round(seconds));
        if(!queue.includes(item)) continue;
        if(!latest.length || latest.some(seconds => !Number.isInteger(seconds) || seconds <= 0 || seconds > 604800))
          throw new Error('Invalid playlist runtimes.');
        if(!durations.videoIds && item.youtube.watchedIndices?.some((index, i) => index !== i))
          throw new Error('This source did not return video IDs, so reordered progress could not be checked safely.');
        const update = refreshedPlaylist(item.youtube.durations, item.youtube.watched, latest, {
          videoIds:item.youtube.videoIds, latestVideoIds:durations.videoIds, watchedIndices:item.youtube.watchedIndices
        });
        if(update) checkpoint(`Refreshed ${item.name}`);
        item.youtube.checkedAt = Date.now();
        stateRevision++; queueDirty = true;
        checked = true;
        playlistRetries.delete(item.youtube.playlistId);
        if(!update){
          if(durations.videoIds) item.youtube.videoIds = durations.videoIds;
          else { delete item.youtube.videoIds; delete item.youtube.watchedIndices; }
          renderQueueSummary();
          setPlaylistFeedback(item, `Checked just now: ${latest.length} videos. No changes found.${durations.videoIds ? '' : ' Video IDs unavailable; progress follows playlist order.'}${unavailableNote}`);
          if(forceItem) $('queueStatus').textContent = `${item.name}: ${latest.length} videos. No changes found.`;
          continue;
        }
        const countChange = update.durations.length - item.youtube.durations.length;
        const countNote = countChange > 0 ? `, ${countChange} added` : countChange < 0 ? `, ${-countChange} removed` : '';
        setPlaylistFeedback(item, `Checked just now: ${latest.length} videos${countNote}.${update.watchedIndices ? ' Watched entries preserved by video ID.' : ' Progress follows playlist order.'}${unavailableNote}`);
        added += Math.max(0, countChange);
        removed += Math.max(0, -countChange);
        updated++;
        if(update.hours === null) archiveItem(queue.indexOf(item));
        else{
          if(durations.videoIds) item.youtube.videoIds = durations.videoIds;
          else delete item.youtube.videoIds;
          item.youtube.durations = update.durations;
          item.youtube.watched = update.watched;
          if(update.watchedIndices) item.youtube.watchedIndices = update.watchedIndices;
          else delete item.youtube.watchedIndices;
          item.hours = adjustedHours(item, update.hours);
        }
        changed = true;
      }catch(error){
        playlistRetries.set(item.youtube.playlistId, Date.now() + 15 * 60 * 1000);
        if(queue.includes(item)){
          const message = `Could not refresh: ${error.message} Saved playlist kept. Try Refresh playlist again.`;
          setPlaylistFeedback(item, message);
          $('queueStatus').textContent = `${item.name}: ${message}`;
        }
      }
    }
    if(changed){
      commitQueueChange(null, () => {});
      const counts = [
        added ? `${added} added` : '',
        removed ? `${removed} removed` : ''
      ].filter(Boolean).join(', ');
      const summary = `${updated} playlist${updated === 1 ? '' : 's'} updated${counts ? ` · ${counts}` : ''}.`;
      saveState(summary);
      $('queueStatus').textContent = summary;
    }else if(checked) saveState();
  })().finally(() => { playlistRefreshPromise = null; });
  return playlistRefreshPromise;
}

$('youtubeDirectFileNote').hidden = !(location.protocol === 'file:');

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

$('youtubeAdd').onclick = async () => {
  let title = $('youtubeTitle').value.trim();
  const input = addUrlInput($('youtubeUrl').value.trim());
  if(input?.kind !== 'playlist'){
    $('youtubeHelp').textContent = 'Enter a valid YouTube playlist URL.';
    return;
  }
  const {url, playlistId} = input;
  const button = $('youtubeAdd');
  button.disabled = true;
  syncAddButton();
  $('youtubeTitle').disabled = $('youtubeUrl').disabled = true;
  button.textContent = 'Reading playlist…';
  try{
    if(!title){
      $('youtubeHelp').textContent = 'Reading playlist name…';
      title = await readYoutubePlaylistTitle(playlistId);
    }
    $('youtubeHelp').textContent = 'Reading playlist runtimes…';
    const durations = await readPlaylistDurations(playlistId, (done, total) => {
      $('youtubeHelp').textContent = done
        ? `Reading video ${done} of ${total}…`
        : `Found ${total} video${total === 1 ? '' : 's'}. Reading runtimes…`;
    });
    const normalizedDurations = durations.map(seconds => Math.round(seconds));
    const hours = playlistHours(normalizedDurations);
    if(hours == null || hours > MAX_ITEM_HOURS) throw new Error('The playlist runtime is outside the supported range.');
    addToQueue({name:title, hours, kind:'YouTube', youtube:{url:url.href, playlistId, durations:normalizedDurations,
        ...(durations.videoIds ? {videoIds:durations.videoIds} : {}), watched:0, checkedAt:Date.now()}},{onAdded:() => {
      $('youtubeTitle').value = $('youtubeUrl').value = '';
      if(addUrlInput($('name').value.trim())?.url.href === url.href) $('name').value = '';
      $('youtubeHelp').textContent = `${title} added: ${durations.length} video${durations.length === 1 ? '' : 's'}, ${fmtHours(hours)} total.`;
      syncAddButton();
    }});
  }catch(error){
    $('youtubeHelp').textContent = `${error.message} Check that the playlist is public or unlisted, then try again.`;
  }finally{
    button.disabled = false;
    syncAddButton();
    $('youtubeTitle').disabled = $('youtubeUrl').disabled = false;
    button.textContent = 'Add playlist';
  }
};
$('undo').onclick = () => {
  const previous = undoStack.pop();
  if(!previous) return;
  const parsed = parseStateText(previous.state);
  if(!parsed.ok){ $('queueStatus').textContent = parsed.error; return; }
  applyState(parsed);
  syncUndoStatus();
  lastSig = null; render({forceQueue:true});
  $('queueStatus').textContent = `Undid: ${previous.message}`;
  $('name').focus();
};
$('scheduleMode').onchange = () => { lastSig = null; render(); };
$('sleepStart').onchange = render;
$('sleepEnd').onchange = render;
$('paceInput').oninput = render;
function updateWeeklyPace(input){
  const pace = Math.round(clampNumber(input.value, 1, +$('paceInput').max, +$('paceInput').value));
  input.value = $('paceNumber').value = $('paceInput').value = pace;
  render();
}
$('paceNumber').onchange = () => updateWeeklyPace($('paceNumber'));
$('paceNumber').onkeydown = event => { if(event.key === 'Enter') event.currentTarget.blur(); };
$('quickPace').oninput = () => { if($('quickPace').value !== '') updateWeeklyPace($('quickPace')); };
$('quickPace').onchange = () => updateWeeklyPace($('quickPace'));
$('quickPace').onblur = () => { $('quickPace').value = readSchedule().pace; };
$('quickPace').onkeydown = event => { if(event.key === 'Enter') event.currentTarget.blur(); };
$('timelinePanel').ontoggle = () => {
  const context = computationContext(); renderBridge(context); renderScenarios(context);
};
function setQueueExpanded(expanded){
  $('queueBody').hidden = !expanded;
  $('queueToggle').closest('.queue-panel').classList.toggle('is-collapsed', !expanded);
  $('queueToggle').setAttribute('aria-expanded', String(expanded));
  if(!expanded) closeSuggestions();
  else if(queueDirty) render({animate:false});
}
$('queueToggle').onclick = () => setQueueExpanded($('queueBody').hidden);
for(const id of ['scenarioPace','scenarioDate','scenarioVariance']) $(id).addEventListener('input', () => { scenarioDirty = true; renderScenarios(); });
$('scenarioReset').onclick = () => { scenarioDirty = false; $('scenarioVariance').value = '25'; renderScenarios(); };
$('scenarioApplyPace').onclick = () => {
  if($('scenarioApplyPace').disabled) return;
  checkpoint('Applied preview pace');
  $('paceInput').value = $('paceNumber').value = $('scenarioPace').value;
  render();
};
$('scenarioPanel').ontoggle = () => renderScenarios();
$('amount').oninput = syncAddButton;
$('completedPanel').ontoggle = renderHistory;
// Commit a focused estimate after a row-action click has reached its target.
// Hiding the estimate badge during pointerdown/blur can otherwise move that
// button before pointerup and swallow the click.
const queueAction = '[data-remove], [data-finish], [data-reset-estimate], [data-game-finish]';
$('queue').addEventListener('pointerdown', event => {
  if(event.button === 0 && event.target.closest(queueAction) && document.activeElement?.matches('[data-hours]'))
    event.preventDefault();
});
$('queue').addEventListener('click', event => {
  if(event.target.closest(queueAction) && document.activeElement?.matches('[data-hours]')) document.activeElement.blur();
}, true);
$('add').onclick = () => {
  const input = addUrlInput($('name').value.trim());
  if(input){
    prepareAddUrl(input);
    if(input.kind === 'playlist' && !$('youtubeAdd').disabled) $('youtubeAdd').click();
    else if(input.kind === 'story') $('webLookup').click();
    return;
  }
  addToQueue({name:$('name').value.trim(), hours:+$('amount').value, kind:$('kind').value},
    {onAdded:() => { $('name').value = ''; syncAddButton(); }});
  closeSuggestions();
};

/* Workspace state is navigation only. Queue data keeps its original portable schema. */
let activeView = 'queue', queueFilter = '', queueQuery = '', toastTimer;
const VIEW_NAMES = {queue:'Your queue',plan:'The plan',completed:'Completed',settings:'Settings'};
const commandModifier = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl';
document.querySelectorAll('[data-command-shortcut]').forEach(key => { key.textContent = `${commandModifier} K`; });
function iconMarkup(name){ return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function notifyAction(message, editItem = null){
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  if(editItem){
    const edit = document.createElement('button');
    edit.type = 'button'; edit.textContent = 'Edit estimate';
    edit.onclick = () => { focusQueueItem(editItem); $('toast').hidden = true; };
    $('toast').append(edit);
  }
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, editItem ? 12000 : 4000);
}
function openAdd(kind = ''){
  if(activeView === 'queue') setQueueExpanded(true);
  if($('commandDialog').open) $('commandDialog').close();
  if(!$('addDialog').open) $('addDialog').showModal();
  if(kind === 'YouTube'){
    $('playlistAddPanel').open = true;
    $('youtubeUrl').focus();
  }else{
    if(kind) { $('kind').value = kind; syncAddButton(); }
    $('name').focus();
  }
}
function setView(view, {focus = false} = {}){
  activeView = Object.hasOwn(VIEW_NAMES, view) ? view : 'queue';
  document.querySelectorAll('[data-page]').forEach(node => { node.hidden = node.dataset.page !== activeView; });
  document.querySelectorAll('[data-show-views]').forEach(node => { node.hidden = !node.dataset.showViews.split(' ').includes(activeView); });
  document.querySelectorAll('[data-nav]').forEach(link => {
    if(link.dataset.nav === activeView) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  $('viewLabel').textContent = VIEW_NAMES[activeView];
  // Expensive timelines are built only when the planning view is in use.
  $('timelinePanel').open = activeView === 'plan';
  if(activeView === 'plan') $('budgetSettings').open = true;
  if(activeView === 'completed'){ $('completedPanel').open = true; renderHistory(); }
  if(activeView === 'queue') setQueueExpanded(true);
  const context = computationContext();
  if(activeView === 'plan'){ renderBridge(context); renderScenarios(context); }
  renderWorkspace(context);
  if(focus){ window.scrollTo({top:0,behavior:'instant'}); $('workspace').focus({preventScroll:true}); }
}
function readWorkspaceRoute({focus = false} = {}){
  const [view, query = ''] = location.hash.slice(1).split('?');
  if(!view || view === 'queue'){
    const params = new URLSearchParams(query);
    const media = params.get('media') || '';
    queueFilter = ['','Game','Show','Movie','Book','AudioVideo'].includes(media) ? media : '';
    queueQuery = (params.get('q') || '').slice(0,120);
    $('queueSearch').value = queueQuery;
    applyQueueFilters();
  }
  setView(view, {focus});
}
function updateFilterRoute(){
  const params = new URLSearchParams();
  if(queueFilter) params.set('media',queueFilter);
  if(queueQuery) params.set('q',queueQuery);
  const hash = '#queue' + (params.size ? '?' + params.toString() : '');
  try { history.replaceState(null,'',hash); } catch(error) { /* Filtering still works in restricted file contexts. */ }
}
function findInQueue(){
  setView('queue');
  updateFilterRoute();
  if(queue.length) $('queueSearch').focus();
  else{
    $('quickAdd').focus();
    notifyAction('Add an item to start searching your queue.');
  }
}
function applyQueueFilters(){
  $('queueTools').hidden = $('queueHead').hidden = !queue.length;
  const query = loose(queueQuery.trim());
  let visible = 0;
  const filtered = !!(queueFilter || query);
  $('queue').querySelectorAll('[data-item-index]').forEach(row => {
    const item = queue[Number(row.dataset.itemIndex)];
    if(!item) return;
    const kindMatches = !queueFilter || (queueFilter === 'AudioVideo' ? ['Podcast','YouTube'].includes(item.kind) : item.kind === queueFilter);
    row.hidden = !(kindMatches && (!query || loose(item.name).includes(query)));
    if(!row.hidden) visible++;
    const grip = row.querySelector('[data-drag-index]');
    if(grip){ grip.disabled = filtered; grip.title = filtered ? 'Clear filters to reorder the full queue' : 'Drag to reorder, or use the arrow keys'; }
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.filter === queueFilter)));
  $('noQueueMatches').hidden = !queue.length || visible > 0;
  $('queueResultCount').textContent = filtered ? `${visible} of ${queue.length} items` : 'Playback order';
  $('allCount').textContent = queue.length;
}
function renderWorkspace(context){
  const {forecast,totalQueued,plan,now} = context;
  $('quickPace').max = context.schedule.ceiling;
  if(document.activeElement !== $('quickPace')) $('quickPace').value = context.schedule.pace;
  $('quickYoutube').max = ytUnit === 'week' ? 168 : 24;
  $('quickYoutube').step = ytUnit === 'week' ? 1 : 0.5;
  if(document.activeElement !== $('quickYoutube')) $('quickYoutube').value = plan.yt.amount;
  $('quickYoutubeUnit').value = ytUnit;
  $('queueCount').textContent = queue.length;
  $('completedCount').textContent = completed.length;
  $('releaseCaption').textContent = TARGET.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
  $('countdownTitle').textContent = now >= TARGET ? `${SITE_CONFIG.gameShortName}: target reached.` : `Until ${SITE_CONFIG.gameShortName}.`;
  $('overviewHours').textContent = `${num1(totalQueued).toLocaleString()} h`;
  $('overviewItems').textContent = `${queue.length} ${queue.length === 1 ? 'item' : 'items'}`;
  $('overviewPace').textContent = `${num1(plan.pace).toLocaleString()} h`;
  $('overviewFinish').textContent = !queue.length ? 'Not started' : !Number.isFinite(forecast.finishDay) ? 'No finish yet' : addDays(now,Math.ceil(forecast.finishDay)).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  $('overviewFinishNote').textContent = !queue.length ? 'Add your first item' : forecast.stalled ? 'Adjust your pace' : $('weeks').textContent + ' at this pace';
  const coverage = forecast.capacity > 0 ? Math.max(0,Math.min(1,1-forecast.missingHours / forecast.capacity)) : 0;
  $('coverageFill').value = coverage;
  $('coverageCaption').textContent = now >= TARGET ? 'Target date reached' : forecast.capacity <= 0 ? 'Set aside time in The plan' : `${Math.round(coverage * 100)}% of the wait covered${queue.some(item => item.estimateNeeded) ? ' · provisional' : ''}`;
  $('completedCaption').textContent = completed.length ? `${completed.length} ${completed.length === 1 ? 'thing' : 'things'} finished. Room for whatever comes next.` : "Everything you've finished, all in one place.";
  if(activeView === 'plan'){
    const rowsSig = computationSignature(context);
    if(rowsSig !== forecastRowsSig){
      forecastRowsSig = rowsSig;
      $('forecastList').innerHTML = queue.length ? queue.map((item,index) => {
        const segment = forecast.segments[index];
        const finish = Number.isFinite(segment?.endDay) ? addDays(now,Math.ceil(segment.endDay)) : null;
        return `<li>${iconMarkup(KIND_ICON[item.kind] || 'book')}<div><b>${esc(item.name)}</b><small>${esc(item.kind)} · ${fmtHours(item.hours)} remaining${item.estimateNeeded ? ' · estimate needed' : ''}</small></div>${finish ? `<time datetime="${toDateValue(finish)}">${esc(fmtDate(finish))}</time>` : '<span class="note">No finish at this pace</span>'}</li>`;
      }).join('') : '<li class="note">Add your first item to see when each one will finish.</li>';
    }
  }
}
const workspaceCommands = [
  {label:'Add an item',icon:'plus',key:'N',run:() => openAdd()},
  {label:'Your queue',icon:'queue',run:() => { location.hash = 'queue'; }},
  {label:'The plan and time budget',icon:'calendar',run:() => { location.hash = 'plan'; }},
  {label:'Completed items',icon:'check-circle',run:() => { location.hash = 'completed'; }},
  {label:'Settings and release target',icon:'sliders',run:() => { location.hash = 'settings'; }},
  {label:'Find in your queue',icon:'magnifying-glass',key:'/',run:findInQueue},
  {label:'Export queue',icon:'queue',run:() => $('export').click()},
  {label:'Load a saved queue',icon:'queue',run:() => { setView('settings'); location.hash='settings'; $('importBtn').click(); }},
  {label:'Copy recommendation prompt',icon:'book',run:() => copyRecommendations()},
  {label:'Undo last change',icon:'arrow-up',key:`${commandModifier} Z`,run:() => { if(undoStack.length) $('undo').click(); else notifyAction('No changes to undo.'); }}
];
function renderCommands(){
  const query = loose($('commandSearch').value.trim());
  const matches = workspaceCommands.map((command,index) => ({command,index})).filter(({command}) => !query || loose(command.label).includes(query));
  $('commandResults').innerHTML = matches.map(({command,index}) => `<button type="button" class="command-result" data-command="${index}">${iconMarkup(command.icon)}<span>${command.label}</span>${command.key ? `<kbd>${command.key}</kbd>` : ''}</button>`).join('') || '<p class="sugg-note">No matching commands. Try “plan” or “add”.</p>';
}
function openCommands(){
  if($('addDialog').open) return;
  $('commandSearch').value = '';
  renderCommands();
  if(!$('commandDialog').open) $('commandDialog').showModal();
  $('commandSearch').focus();
}
$('queueRecommend').onclick = copyRecommendations;
$('undoDismiss').onclick = () => { dismissedUndoEntry = undoStack.at(-1); syncUndoStatus(); };
$('quickAdd').onclick = () => openAdd();
$('openCommands').onclick = $('sidebarCommands').onclick = openCommands;
$('commandSearch').oninput = renderCommands;
$('commandResults').onclick = event => {
  const button = event.target.closest('[data-command]');
  if(!button) return;
  $('commandDialog').close();
  workspaceCommands[Number(button.dataset.command)].run();
};
$('commandDialog').addEventListener('keydown',event => {
  const buttons = [...$('commandResults').querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement);
  if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){
    event.preventDefault();
    const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length-1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }else if(event.key === 'Enter' && event.target === $('commandSearch')){
    event.preventDefault(); buttons[0]?.click();
  }
});
document.querySelectorAll('[data-close-dialog]').forEach(button => { button.onclick = () => $(button.dataset.closeDialog).close(); });
for(const dialog of [$('addDialog'),$('commandDialog'),$('duplicateDialog')]){
  let backdropDown = false;
  dialog.addEventListener('pointerdown',event => { backdropDown = event.target === dialog && (event.offsetX < 0 || event.offsetY < 0 || event.offsetX > dialog.clientWidth || event.offsetY > dialog.clientHeight); });
  dialog.addEventListener('click',event => { if(backdropDown && event.target === dialog) dialog.close(); backdropDown = false; });
}
$('addDialog').addEventListener('close',() => {
  closeSuggestions();
  const item = focusAfterAddClose; focusAfterAddClose = null;
  if(item) focusQueueItem(item); else $('quickAdd').focus({preventScroll:true});
});
$('mediaFilters').onclick = event => {
  const button = event.target.closest('[data-filter]');
  if(!button) return;
  queueFilter = button.dataset.filter; applyQueueFilters(); updateFilterRoute();
};
$('queueSearch').oninput = () => { queueQuery = $('queueSearch').value; applyQueueFilters(); updateFilterRoute(); };
$('clearFilters').onclick = () => { queueFilter = queueQuery = ''; $('queueSearch').value = ''; applyQueueFilters(); updateFilterRoute(); $('queueSearch').focus(); };
$('queue').addEventListener('click',event => {
  const add = event.target.closest('[data-empty-add]');
  if(add) openAdd(add.dataset.emptyAdd);
  const next = event.target.closest('[data-next]');
  if(next){
    const index = Number(next.dataset.next), item = queue[index];
    if(!item || index === 0) return;
    checkpoint(`Moved ${item.name} to next`);
    moveQueueItem(index,0);
    noteUndo(`${item.name} is next.`);
    $('continueProgress')?.focus({preventScroll:true});
  }
});
document.addEventListener('keydown',event => {
  if(event.defaultPrevented || event.isComposing) return;
  const editing = event.target.closest('input,textarea,select,[contenteditable="true"]');
  if((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'){
    event.preventDefault(); if($('commandDialog').open) $('commandDialog').close(); else openCommands(); return;
  }
  if(editing || document.querySelector('dialog[open]') || event.altKey) return;
  if((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z'){
    if(!event.shiftKey && undoStack.length){ event.preventDefault(); $('undo').click(); } return;
  }
  if(event.metaKey || event.ctrlKey) return;
  if(event.key.toLowerCase() === 'n'){ event.preventDefault(); openAdd(); }
  else if(event.key === '/'){ event.preventDefault(); findInQueue(); }
});
window.addEventListener('hashchange',() => readWorkspaceRoute({focus:true}));

document.body.classList.add('is-revealed');
$('startDate').min = $('jobStart').min = toDateValue(new Date());
$('startDate').value = $('jobStart').value = toDateValue(new Date());
setYtUnit('day', {renderNow:false});
setReleaseTarget(DEFAULT_SITE_CONFIG);
loadState();
syncUnreadableSave();
try{
  const savedUndo = JSON.parse(localStorage.getItem(STORE_KEY + '.undo') || '[]');
  if(Array.isArray(savedUndo)) for(const entry of savedUndo.slice(-20)){
    if(typeof entry?.message === 'string' && typeof entry.state === 'string') undoStack.push(entry);
  }
  trimUndoStack();
  for(let i = undoStack.length - 1; i >= 0; i--){
    if(!parseStateText(undoStack[i].state).ok) undoStack.splice(i, 1);
  }
  syncUndoStatus();
}catch(error){ /* A damaged undo history must not prevent restoring the queue. */ }
render();
readWorkspaceRoute();
booted = true;
let countdownTimer, renderTimer, playlistTimer, playlistStartupTimer;
function startVisibleWork(){
  if(document.hidden) return;
  playlistStartupTimer = setTimeout(refreshYoutubePlaylists, 1000);
  playlistTimer = setInterval(refreshYoutubePlaylists, 60000);
  countdownTimer = setInterval(renderCountdown, 1000);
  renderTimer = setInterval(render, 30000);
}
document.addEventListener('visibilitychange', () => {
  clearTimeout(playlistStartupTimer);
  clearInterval(playlistTimer);
  clearInterval(countdownTimer);
  clearInterval(renderTimer);
  if(document.hidden){ flushSave(); return; }
  render();
  startVisibleWork();
});
window.addEventListener('pagehide', flushSave);
startVisibleWork();
