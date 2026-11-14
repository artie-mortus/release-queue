const {runBrowserSuite, openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({}, async ({url, page, context}) => {
  await page.goto(url);
  await context.route('https://r.jina.ai/**', route => route.fulfill({contentType:'text/plain', body:`
URL Source: https://www.youtube.com/playlist?list=PL1234567890abcdef
3 videos
1 unavailable video is hidden
[![First](https://example.com/a.jpg) 30:00](https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PL1234567890abcdef&index=1)
[![Last](https://example.com/c.jpg) 1:00:00](https://www.youtube.com/watch?v=ccccccccccc&list=PL1234567890abcdef&index=2)
`}));
  await page.evaluate(() => {
    // The middle video was counted before it became private/deleted.
    addToQueue({name:'Unavailable video', kind:'YouTube', hours:3, youtube:{
      url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',
      playlistId:'PL1234567890abcdef', durations:[1800, 7200, 3600],
      videoIds:['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'], watched:1, checkedAt:Date.now()
    }});
    window.YT = {PlayerState:{CUED:5}, Player:class {
      constructor(mount, {events}){
        this.events = events;
        queueMicrotask(() => events.onReady());
      }
      getIframe(){ return {}; }
      getPlaylist(){ return ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']; }
      cueVideoById(id){
        this.id = id;
        queueMicrotask(() => window.playerFailure || id === 'bbbbbbbbbbb'
          ? this.events.onError({data:window.playerFailure || 100, target:this})
          : this.events.onStateChange({data:5, target:this}));
      }
      getVideoData(){ return {video_id:this.id}; }
      getDuration(){ return this.id === 'aaaaaaaaaaa' ? 1800 : 3600; }
      destroy(){}
    }};
  });
  await page.evaluate(() => refreshYoutubePlaylists({forceItem:queue[0]}));
  assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 2,
    'Unavailable videos must be removed from the available count');
  assert.equal(await page.evaluate(() => queue[0].hours), 1,
    'The unavailable video must not contribute its old two-hour runtime');
  assert.deepEqual(await page.evaluate(() => queue[0].youtube.videoIds), ['aaaaaaaaaaa', 'ccccccccccc']);
  assert.deepEqual(await page.evaluate(() => queue[0].youtube.watchedIndices), [0]);
  assert.match(await page.locator('[data-item-index="0"] small').textContent(), /2 videos · 1 watched · 1 left/);
  assert.match(await page.locator('[data-youtube-status]').textContent(), /1 unavailable video.*skipped/);
  assert.equal(await page.evaluate(() => parseStateText(serializeState()).queue[0].hours), 1);

  // File-mode fallback must also distinguish unavailable entries from an
  // incomplete or cached list. It must not count the private video's old time.
  if(url.startsWith('file:')){
    await context.route('https://r.jina.ai/**', route => route.abort());
    const result = {type:'playlist', id:'PL1234567890abcdef', videoCount:3,
      consideredCount:2, unavailableCount:1, videos:[
        {id:'aaaaaaaaaaa', considered:true, durationSeconds:1800},
        {id:'bbbbbbbbbbb', considered:false, durationSeconds:7200},
        {id:'ccccccccccc', considered:true, durationSeconds:3600}
      ]};
    await context.route('https://youtubeplaylistlength.org/api/calculate', route => route.fulfill({
      contentType:'application/json', body:JSON.stringify({success:true, results:[result]})
    }));
    await page.evaluate(() => {
      queue[0].youtube.durations = [1800, 7200, 3600];
      queue[0].youtube.videoIds = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'];
      queue[0].hours = 3;
    });
    await page.evaluate(() => refreshYoutubePlaylists({forceItem:queue[0]}));
    assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 2);
    assert.equal(await page.evaluate(() => queue[0].hours), 1);
    assert.deepEqual(await page.evaluate(() => queue[0].youtube.watchedIndices), [0]);
    for(const incomplete of [
      {...result, isTruncated:true},
      {...result, videoCount:4},
      {...result, videos:result.videos.slice(0, 2)},
      {...result, videos:result.videos.map(v => v.id === 'ccccccccccc' ? {...v, durationSeconds:0} : v)}
    ]){
      await context.route('https://youtubeplaylistlength.org/api/calculate', route => route.fulfill({
        contentType:'application/json', body:JSON.stringify({success:true, results:[incomplete]})
      }));
      await page.evaluate(() => refreshYoutubePlaylists({forceItem:queue[0]}));
      assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 2);
      assert.equal(await page.evaluate(() => queue[0].hours), 1);
      assert.match(await page.locator('[data-youtube-status]').textContent(), /Could not refresh/);
    }
    await context.route('https://youtubeplaylistlength.org/api/calculate', route => route.fulfill({
      contentType:'application/json', body:JSON.stringify({success:true, results:[result]})
    }));
  }else{
    // Embed restrictions, configuration errors and player failures are not
    // evidence that a video has become private or deleted. Keep saved data.
    for(const code of [2, 5, 101, 150, 153, 100]){
      await page.evaluate(code => { window.playerFailure = code; }, code);
      await page.evaluate(() => refreshYoutubePlaylists({forceItem:queue[0]}));
      assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 2);
      assert.equal(await page.evaluate(() => queue[0].hours), 1);
      assert.match(await page.locator('[data-youtube-status]').textContent(), /Could not refresh/);
    }
    await page.evaluate(() => { delete window.playerFailure; });
  }

  // New additions use only the available videos, too.
  await page.evaluate(() => { queue = []; renderQueue(); render(); });
  await openAddDialog(page, 'playlistAddPanel');
  await page.locator('#youtubeTitle').fill('Available videos only');
  await page.locator('#youtubeUrl').fill('https://www.youtube.com/playlist?list=PL1234567890abcdef');
  await page.locator('#youtubeAdd').click();
  await page.waitForFunction(() => queue.length === 1);
  assert.equal(await page.evaluate(() => queue[0].youtube.durations.length), 2);
  assert.equal(await page.evaluate(() => queue[0].hours), 1.5);
  assert.deepEqual(await page.evaluate(() => queue[0].youtube.videoIds), ['aaaaaaaaaaa', 'ccccccccccc']);
  assert.match(await page.locator('#youtubeHelp').textContent(), /2 videos.*1 unavailable video.*skipped/);
  console.log('PASS unavailable playlist videos', url.startsWith('file:') ? 'direct file' : 'static HTTP');
}).catch(error => { console.error(error); process.exitCode = 1; });
