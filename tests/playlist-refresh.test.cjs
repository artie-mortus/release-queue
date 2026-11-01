const {runBrowserSuite} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

runBrowserSuite({contextOptions:{reducedMotion:'reduce'}}, async ({url,page,context,root}) => {
  await page.goto(url);
  assert.equal(await page.locator('#youtubeDirectFileNote').evaluate(node=>node.hidden),!url.startsWith('file:'));
  assert.match(await page.locator('#youtubeDirectFileNote').textContent(),/Jina Reader.*YouTube Playlist Length/);
  await page.evaluate(() => {
    window.originalReadPlaylistDurations = readPlaylistDurations;
    addToQueue({name:'Growing playlist', hours:12, kind:'YouTube', youtube:{
      url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',
      playlistId:'PL1234567890abcdef', durations:Array(22).fill(3600), watched:10, checkedAt:Date.now()
    }});
    window.lookupCalls = 0;
    readPlaylistDurations = async (id, progress) => {
      lookupCalls++;
      progress(23, 23);
      return Array(23).fill(3600);
    };
  });
  // An automatic check preserves the six-hour cache. The user must still
  // be able to request today's newly added 23rd video immediately.
  await page.evaluate(() => refreshYoutubePlaylists());
  assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 22);
  assert.equal(await page.locator('[data-youtube-refresh="0"]').count(), 1,
    'A cached 22-video playlist needs a Refresh playlist control to fetch the 23rd video');
  await page.locator('[data-youtube-refresh="0"]').click();
  await page.waitForFunction(() => queue[0].youtube.durations.length === 23);
  assert.equal(await page.evaluate(() => queue[0].youtube.watched), 10);
  assert.equal(await page.evaluate(() => queue[0].hours), 13);
  assert.equal(await page.evaluate(() => lookupCalls), 1);
  assert.match(await page.locator('[data-item-index="0"] small').textContent(), /23 videos/);
  assert.match(await page.locator('#queueStatus').textContent(), /1 added/);
  await page.evaluate(() => flushSave());
  assert.equal(await page.evaluate(() => parseStateText(localStorage.getItem(STORE_KEY)).queue[0].youtube.durations.length), 23);
  assert.equal(await page.evaluate(() => parseStateText(serializeState()).queue[0].youtube.watched), 10);
  // An error must be visible and leave the saved count/progress intact.
  await page.evaluate(() => {
    readPlaylistDurations = async () => { throw new Error('Playlist service unavailable'); };
  });
  await page.locator('[data-youtube-refresh="0"]').click();
  await page.waitForFunction(() => $('queueStatus').textContent.includes('Playlist service unavailable'));
  assert.equal(await page.locator('[data-youtube-refresh="0"]').isEnabled(), true);
  assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 23);
  assert.equal(await page.evaluate(() => queue[0].youtube.watched), 10);
  // Explicit refresh retries immediately even after a failed check.
  await page.evaluate(() => { readPlaylistDurations = async () => Array(24).fill(3600); });
  await page.locator('[data-youtube-refresh="0"]').click();
  await page.waitForFunction(() => queue[0].youtube.durations.length === 24);
  assert.equal(await page.evaluate(() => queue[0].hours), 14);
  if(url.startsWith('file:')){
    const readerText = fs.readFileSync(path.join(root, 'tests/fixtures/youtube-playlist-reader.md'), 'utf8');
    let readerCalls = 0, calculatorCalls = 0;
    await context.route('https://r.jina.ai/**', async route => {
      readerCalls++;
      assert.equal(route.request().headers()['x-no-cache'], 'true');
      await route.fulfill({contentType:'text/plain', body:readerText});
    });
    await context.route('https://youtubeplaylistlength.org/api/calculate', async route => {
      calculatorCalls++;
      await route.abort();
    });
    await page.evaluate(() => {
      queue = [];
      readPlaylistDurations = originalReadPlaylistDurations;
      addToQueue({name:'Guess The Character', hours:2, kind:'YouTube', youtube:{
        url:'https://www.youtube.com/playlist?list=PLGqzdL6u7B1sk7VV8umu2W7YVB5hL6vNT',
        playlistId:'PLGqzdL6u7B1sk7VV8umu2W7YVB5hL6vNT',durations:Array(22).fill(3600),watched:20,checkedAt:Date.now()
      }});
    });
    await page.locator('[data-youtube-refresh="0"]').click();
    await page.waitForFunction(() => queue[0].youtube.durations.length === 23);
    assert.equal(await page.evaluate(() => queue[0].youtube.watched),20);
    assert.equal(await page.evaluate(() => queue[0].youtube.durations[22]),3101);
    assert.equal(readerCalls,1);
    assert.equal(calculatorCalls,0,'A complete current page must bypass the stale calculator');
    // A truncated reader page must never silently replace the queue.
    await context.route('https://r.jina.ai/**', route => route.fulfill({contentType:'text/plain',body:readerText.replaceAll('23 videos','24 videos')}));
    await context.route('https://youtubeplaylistlength.org/api/calculate', route => route.fulfill({
      contentType:'application/json',body:JSON.stringify({success:true,results:[{
        type:'playlist',id:'PLGqzdL6u7B1sk7VV8umu2W7YVB5hL6vNT',videoCount:24,consideredCount:24,unavailableCount:0,
        videos:Array.from({length:24},() => ({considered:true,durationSeconds:3600}))
      }]})
    }));
    await page.locator('[data-youtube-refresh="0"]').click();
    await page.waitForFunction(() => queue[0].youtube.durations.length === 24);
    assert.equal(await page.evaluate(() => queue[0].youtube.watched),20);
    await context.route('https://youtubeplaylistlength.org/api/calculate', route => route.fulfill({
      contentType:'application/json',body:JSON.stringify({success:true,results:[{
        type:'playlist',id:'PLGqzdL6u7B1sk7VV8umu2W7YVB5hL6vNT',videoCount:22,consideredCount:22,unavailableCount:0,
        videos:Array.from({length:22},() => ({considered:true,durationSeconds:3600}))
      }]})
    }));
    await page.locator('[data-youtube-refresh="0"]').click();
    await page.waitForFunction(() => $('queue').querySelector('[data-youtube-status]').textContent.includes('fewer than the saved 24'));
    assert.equal(await page.evaluate(() => queue[0].youtube.durations.length),24,'An older fallback must not shrink the current playlist');
    assert.equal(await page.evaluate(() => queue[0].youtube.watched),20);
    // YouTube explicitly counts two hidden entries alongside 28 playable videos.
    const hiddenPage = fs.readFileSync(path.join(root, 'tests/fixtures/youtube-playlist-hidden.md'), 'utf8');
    await context.route('https://r.jina.ai/**', route => route.fulfill({contentType:'text/plain',body:hiddenPage}));
    await page.locator('[data-youtube-refresh="0"]').click();
    await page.waitForFunction(() => queue[0].youtube.durations.length === 28);
    assert.equal(await page.evaluate(() => queue[0].youtube.watched),20);
    assert.equal(await page.evaluate(() => queue[0].youtube.videoIds.length),28);
    assert.match(await page.locator('[data-youtube-status]').textContent(), /2 unavailable videos.*skipped/);
  }

  console.log('PASS playlist 22-to-23 refresh', url.startsWith('file:') ? 'direct file' : 'static HTTP');

}).catch(error => { console.error(error); process.exitCode = 1; });
