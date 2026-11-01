const {runBrowserSuite,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({contextOptions:{viewport:{width:1280, height:900}}}, async ({url,page,context}) => {
  let releaseFonts;
  const fontGate = new Promise(resolve => { releaseFonts = resolve; });
  await context.route(/^https:\/\//, async route => {
    const request = new URL(route.request().url());
    if(request.hostname === 'fonts.googleapis.com') {
      await fontGate;
      return route.fulfill({contentType:'text/css', body:':root{--test-font-css:loaded}'});
    }
    return route.abort();
  });
  try {
    // Fonts are bundled; blocked remote requests must not affect initialization.
    await page.goto(url, {waitUntil:'domcontentloaded', timeout:5000});
    assert.equal(await page.evaluate(() => booted), true);
    assert.equal(await page.evaluate(() => {
      const original = renderQueue;
      let count = 0;
      renderQueue = (...args) => { count++; return original(...args); };
      try { addToQueue({name:'First', hours:20, kind:'Game'}); return count; }
      finally { renderQueue = original; }
    }), 1);
    releaseFonts();
    assert.equal(await page.locator('link[href*="fonts.googleapis.com"]').count(),0);
    assert.equal(await page.evaluate(async()=>{await document.fonts.ready;return document.fonts.check('14px Inter');}),true);
    assert.equal(await page.evaluate(async () => {
      const original = renderQueue;
      let count = 0;
      renderQueue = (...args) => { count++; return original(...args); };
      try { await choosePick({name:'Unknown book', kind:'Book', hours:null}); return count; }
      finally { renderQueue = original; }
    }), 1);
    await page.locator('[data-drag-index="1"]').press('ArrowUp');
    assert.equal(await page.evaluate(() => queue[0].name), 'Unknown book');
    assert.equal(await page.locator('[data-item-index="0"] b').first().textContent(), 'Unknown book');
    assert.equal(await page.locator('[data-drag-index="0"]').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-hours="0"]').fill('4');
    // Blurring an hours input must not swallow the following remove click.
    await page.locator('[data-remove="0"]').click();
    assert.equal(await page.evaluate(() => queue.length), 1);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => queue[0].hours), 4);
    await page.locator('[data-hours="0"]').fill('/2');
    await page.locator('[data-hours="0"]').press('Enter');
    await page.locator('[data-hours="0"]').fill('/2');
    await page.locator('[data-hours="0"]').press('Enter');
    assert.equal(await page.evaluate(() => queue[0].hours), 1);

    const storage = await page.evaluate(() => {
      queue = Array.from({length:10}, (_, i) => ({name:`Show ${i}`, kind:'Show', hours:250,
        show:{watched:0, episodes:Array.from({length:500}, (_, j) => ({season:Math.floor(j/25)+1, number:j%25+1, seconds:1800}))}}));
      completed = []; undoStack.length = 0;
      for(let i=0; i<20; i++) {
        checkpoint('Progress ' + i);
        queue[0].show.watched = i+1;
        queue[0].hours = showRemainingHours(queue[0].show);
      }
      saveState(); flushSave();
      return {queue:parseStateText(localStorage.getItem(STORE_KEY)).queue.length,
        watched:parseStateText(localStorage.getItem(STORE_KEY)).queue[0].show.watched,
        history:JSON.parse(localStorage.getItem(STORE_KEY + '.undo')).length,
        chars:localStorage.getItem(STORE_KEY + '.undo').length, message:$('saveState').textContent};
    });
    assert.equal(storage.queue, 10);
    assert.equal(storage.watched, 20);
    assert.ok(storage.history > 0 && storage.history < 20);
    assert.ok(storage.chars <= 500000);
    assert.match(storage.message, /Saved locally/);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => queue[0].show.watched), 19);

    const quota = await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      let currentAttempts = 0;
      Storage.prototype.setItem = function(key, value) {
        if(key === STORE_KEY && ++currentAttempts === 1) throw new DOMException('Full', 'QuotaExceededError');
        if(key === STORE_KEY + '.undo' && value.length > 2000) throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      try {
        saveState(); flushSave();
        return {currentAttempts, saved:parseStateText(localStorage.getItem(STORE_KEY)).ok,
          history:JSON.parse(localStorage.getItem(STORE_KEY + '.undo')).length, message:$('saveState').textContent};
      } finally { Storage.prototype.setItem = original; }
    });
    assert.equal(quota.currentAttempts, 2);
    assert.equal(quota.saved, true);
    assert.equal(quota.history, 0);
    assert.match(quota.message, /Saved locally/);
    assert.match(await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if(key === STORE_KEY + '.undo') throw new DOMException('Blocked', 'SecurityError');
        return original.call(this, key, value);
      };
      try { saveState(); flushSave(); return $('saveState').textContent; }
      finally { Storage.prototype.setItem = original; }
    }), /Saved locally.*Undo history could not be saved/);

    // Hiding flushes pending edits immediately, without waiting for debounce.
    assert.equal(await page.evaluate(() => {
      addToQueue({name:'Last edit before hiding', hours:2, kind:'Movie'});
      Object.defineProperty(document, 'hidden', {configurable:true, value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      const saved = parseStateText(localStorage.getItem(STORE_KEY)).queue.at(-1).name;
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      return saved;
    }), 'Last edit before hiding');
    await page.evaluate(() => {
      window.originalCountdown = renderCountdown;
      window.countdownCalls = 0;
      renderCountdown = () => { countdownCalls++; originalCountdown(); };
      Object.defineProperty(document, 'hidden', {configurable:true, value:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => countdownCalls), 0);
    assert.ok(await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      renderCountdown = originalCountdown;
      return countdownCalls;
    }) > 0);

    await page.evaluate(() => {
      queue = [{name:'Playlist', kind:'YouTube', hours:0.5, youtube:{
        url:'https://www.youtube.com/playlist?list=PL1234567890abcdef', playlistId:'PL1234567890abcdef',
        durations:[1800,1800], watched:1, checkedAt:Date.now()}}];
      completed = []; undoStack.length = 0; saveState(); flushSave();
    });
    await page.reload({waitUntil:'domcontentloaded'});
    const refresh = await page.evaluate(async () => {
      const original = readPlaylistDurations;
      let calls = 0;
      readPlaylistDurations = async () => { calls++; return [1800,1800]; };
      try {
        await refreshYoutubePlaylists();
        const freshCalls = calls;
        queue[0].youtube.checkedAt = Date.now() - PLAYLIST_REFRESH_MS - 1;
        await refreshYoutubePlaylists();
        flushSave();
        const unchangedCalls = calls;
        const savedCheck = parseStateText(localStorage.getItem(STORE_KEY)).queue[0].youtube.checkedAt;
        await refreshYoutubePlaylists();
        const repeatedCalls = calls;
        delete queue[0].youtube.checkedAt; // A legacy save should fetch once.
        readPlaylistDurations = async () => { calls++; return [1800,1800,3600]; };
        await refreshYoutubePlaylists();
        const grown = {watched:queue[0].youtube.watched, hours:queue[0].hours};
        queue[0].youtube.checkedAt = Date.now() - PLAYLIST_REFRESH_MS - 1;
        readPlaylistDurations = async () => { calls++; return [1800,1200]; };
        await refreshYoutubePlaylists();
        const reconciled = {durations:queue[0].youtube.durations.slice(),
          watched:queue[0].youtube.watched, hours:queue[0].hours,
          status:$('queueStatus').textContent};
        queue[0].youtube.checkedAt = Date.now() - PLAYLIST_REFRESH_MS - 1;
        const beforeFailure = JSON.stringify(queue[0]);
        readPlaylistDurations = async () => { calls++; throw new Error('Offline'); };
        await refreshYoutubePlaylists();
        const failedCalls = calls;
        await refreshYoutubePlaylists();
        const unchangedAfterFailure = beforeFailure === JSON.stringify(queue[0]);
        Object.defineProperty(document, 'hidden', {configurable:true, value:true});
        playlistRetries.clear();
        await refreshYoutubePlaylists();
        delete document.hidden;
        return {freshCalls, unchangedCalls, repeatedCalls, savedCheck, grown, reconciled,
          failedCalls, finalCalls:calls, unchangedAfterFailure};
      } finally { readPlaylistDurations = original; }
    });
    assert.equal(refresh.freshCalls, 0);
    assert.equal(refresh.unchangedCalls, 1);
    assert.equal(refresh.repeatedCalls, 1);
    assert.ok(refresh.savedCheck > await page.evaluate(() => Date.now()) - 10000);
    assert.deepEqual(refresh.grown, {watched:1, hours:1.5});
    assert.deepEqual(refresh.reconciled.durations, [1800,1200]);
    assert.equal(refresh.reconciled.watched, 1);
    assert.equal(refresh.reconciled.hours, 0.3);
    assert.match(refresh.reconciled.status, /1 playlist updated.*1 removed/);
    assert.equal(refresh.failedCalls, refresh.finalCalls);
    assert.equal(refresh.unchangedAfterFailure, true);

    const network = await page.evaluate(async () => {
      const original = window.fetch;
      const calls = [];
      providerStates.clear();
      window.fetch = async url => {
        calls.push({url, at:performance.now()});
        const attempts = calls.filter(call => call.url === url).length;
        if(url.includes('retry') && attempts === 1)
          return new Response('{}', {status:429, headers:{'Retry-After':'1'}});
        if(url.includes('failure') && attempts === 1) return new Response('{}', {status:503});
        if(url.includes('graphql-error') && attempts === 1) return new Response('{"errors":[{"message":"Try later"}]}');
        return new Response('{"ok":true}');
      };
      try {
        const cached = 'https://www.wikidata.org/cache-test';
        await jget(cached); await jget(cached);
        const failed = 'https://www.wikidata.org/failure-test';
        await jget(failed).catch(() => {}); await jget(failed);
        const gql = 'https://www.wikidata.org/graphql-error';
        await jpost(gql, {query:'test'}).catch(() => {}); await jpost(gql, {query:'test'});
        const retry = 'https://retry.example/retry';
        await jget(retry).catch(() => {}); await jget(retry);
        const open = 'https://openlibrary.org/pace-test';
        await jget(open + '?first');
        const ctrl = new AbortController();
        const cancelled = jget(open + '?cancelled', ctrl.signal).catch(error => error.name);
        const next = jget(open + '?next');
        ctrl.abort();
        const independentStart = performance.now();
        await jget('https://other.example/independent');
        const independentMs = performance.now() - independentStart;
        const cancelledName = await cancelled;
        await next;
        const already = new AbortController(); already.abort();
        await jget(open + '?already-aborted', already.signal).catch(() => {});
        const anilist = 'https://graphql.anilist.co/pace-test';
        await jpost(anilist, {query:'one'}); await jpost(anilist, {query:'two'});
        const matching = prefix => calls.filter(call => call.url.startsWith(prefix));
        return {cachedCalls:matching(cached).length, failureCalls:matching(failed).length,
          graphQLErrorCalls:matching(gql).length, retryGap:matching(retry)[1].at - matching(retry)[0].at,
          openGap:matching(open)[1].at - matching(open)[0].at, openCalls:matching(open).length,
          anilistGap:matching(anilist)[1].at - matching(anilist)[0].at, cancelledName, independentMs};
      } finally { window.fetch = original; }
    });
    assert.equal(network.cachedCalls, 1);
    assert.equal(network.failureCalls, 2);
    assert.equal(network.graphQLErrorCalls, 2);
    assert.ok(network.retryGap >= 950);
    assert.ok(network.openGap >= 950);
    assert.equal(network.openCalls, 2);
    assert.ok(network.anilistGap >= 2050);
    assert.equal(network.cancelledName, 'AbortError');
    assert.ok(network.independentMs < 500);

    assert.deepEqual(await page.evaluate(async()=>{
      const parent=new AbortController();
      let listeners=0,requests=0;
      const add=parent.signal.addEventListener.bind(parent.signal);
      const remove=parent.signal.removeEventListener.bind(parent.signal);
      parent.signal.addEventListener=(...args)=>{listeners++;return add(...args);};
      parent.signal.removeEventListener=(...args)=>{listeners--;return remove(...args);};
      const cancelled=withRequestTimeout(1000,parent.signal,async()=>{
        requests++;
        // A provider may ignore cancellation. Its late result must still fail.
        await new Promise(resolve=>setTimeout(resolve,10));
        return 'stale';
      }).catch(error=>error.name);
      parent.abort();
      const cancelledName=await cancelled;
      const before=requests;
      const already=await withRequestTimeout(10,parent.signal,()=>{requests++;}).catch(error=>error.name);
      const timed=await withRequestTimeout(5,null,signal=>new Promise((resolve,reject)=>{
        signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError')),{once:true});
      }), 'Source timed out.').catch(error=>error.message);
      const failed=await withRequestTimeout(50,null,()=>Promise.reject(new Error('Source failed.'))).catch(error=>error.message);
      return {cancelledName,already,listeners,noAlreadyRequest:before===requests,timed,failed};
    }), {cancelledName:'AbortError',already:'AbortError',listeners:0,noAlreadyRequest:true,
      timed:'Source timed out.',failed:'Source failed.'});

    assert.deepEqual(await page.evaluate(() => {
      const original = Date.now;
      let now = original();
      Date.now = () => now;
      try {
        const cache = createQueryCache(2, 1000);
        cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
        const evicted = cache.get('b') === undefined;
        now += 1001;
        return {evicted, expired:cache.get('a') === undefined && cache.get('c') === undefined};
      } finally { Date.now = original; }
    }), {evicted:true, expired:true});

    // Chromium's opaque iframe requests can bypass Playwright routing. Put
    // fixture scripts directly in the sandbox so these checks stay offline.
    // The real frame, callback, postMessage validation, and cleanup still run.
    await page.evaluate(() => {
      window.podcastRequests = [];
      const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
      Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {...descriptor, set(value) {
        if(this.title === 'Podcast lookup') {
          const match = value.match(/script\.src = (".*");/);
          const request = new URL(JSON.parse(match[1]));
          podcastRequests.push(request.searchParams.get('term'));
          const body = request.searchParams.get('term') === 'slowpod' ? ''
            : `${request.searchParams.get('callback')}(${JSON.stringify({results:[{
              collectionId:123, collectionName:'Cachedpod', artistName:'Test', trackCount:2
            }]})})`;
          value = value.replace(match[0], 'script.src = ' + JSON.stringify('data:text/javascript,' + encodeURIComponent(body)) + ';');
        }
        descriptor.set.call(this, value);
      }});
    });
    await page.evaluate(() => {
      window.podAbort = new AbortController();
      window.podResult = findPodcasts('slowpod', window.podAbort.signal).catch(error => error.name);
    });
    await page.locator('iframe[title="Podcast lookup"]').waitFor({state:'attached'});
    assert.equal(await page.evaluate(async () => { podAbort.abort(); return await podResult; }), 'AbortError');
    assert.equal(await page.locator('iframe[title="Podcast lookup"]').count(), 0);
    const podcastHits = await page.evaluate(async () => {
      const first = await findPodcasts('cachedpod');
      const second = await findPodcasts('cachedpod');
      return {first, second};
    });
    assert.equal(podcastHits.first.length + podcastHits.second.length, 2);
    assert.equal(await page.evaluate(() => podcastRequests.filter(query => query === 'cachedpod').length), 1);

    // A stale fetch that ignores cancellation must not replace newer results.
    await page.evaluate(() => {
      window.originalFetch = window.fetch;
      window.fetch = async url => {
        const q = new URL(url).searchParams.get('q');
        const response = () => new Response(JSON.stringify([{show:{id:1, name:q, premiered:'2020-01-01'}}]));
        if(q === 'Older') return new Promise(resolve => { window.releaseOlder = () => resolve(response()); });
        return response();
      };
    });
    await openAddDialog(page);
    await page.locator('#kind').selectOption('Show');
    await page.locator('#name').fill('Older');
    await page.waitForFunction(() => typeof window.releaseOlder === 'function');
    await page.locator('#name').fill('Newer');
    await page.waitForFunction(() => currentPicks.some(pick => pick.matchText === 'Newer'));
    await page.evaluate(async () => { releaseOlder(); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(await page.evaluate(() => currentPicks.some(pick => pick.matchText === 'Older')), false);
    await page.evaluate(() => { closeSuggestions(); window.fetch = originalFetch; });
    await page.evaluate(() => {
      window.fetch = (url, {signal}) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
      });
    });
    await page.locator('#kind').selectOption('');
    await page.locator('#name').fill('Hades');
    await page.waitForFunction(() => currentPicks.some(pick => pick.name === 'Hades')
      && $('suggestions').textContent.includes('Still checking'));
    await page.evaluate(() => { closeSuggestions(); window.fetch = originalFetch; });

    console.log('PASS optimization checks', url.startsWith('file:') ? 'direct file' : 'static HTTP');
  } finally { releaseFonts();  }
}).catch(error => { console.error(error); process.exitCode = 1; });
