const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
runBrowserSuite({contextOptions:{viewport:{width:1280,height:900}}}, async ({url,page,context}) => {
  await page.goto(url);
  assert.equal(await page.locator('#queueToggle').textContent(),'Your queue');
  assert.equal(await page.locator('#youtubeHours').count(),0,'Playlist runtimes are read from videos');
  const downloadPromise=page.waitForEvent('download');
  await goToView(page,'settings');
  await page.locator('#export').click();
  await goToView(page,'queue');
  assert.equal((await downloadPromise).suggestedFilename(),'release-queue.md');
  assert.equal(await page.locator('#scheduleMode').inputValue(),'simple');
  await page.evaluate(()=>addToQueue({name:'Test book', hours:2, kind:'Book', book:{pages:384,pagesPerHour:190,pinned:false}}));
  await page.locator('[data-book-progress]').fill('100');
  await page.locator('[data-book-progress]').press('Enter');
  await page.locator('input[data-hours]').fill('4');
  await page.locator('input[data-hours]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].book.progress),100);
  assert.equal(await page.evaluate(()=>queue[0].hours),4);
  await page.locator('[data-book-progress]').fill('200');
  await page.locator('[data-book-progress]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].hours),2.7);
  await page.locator('[data-reset-estimate]').click();
  assert.equal(await page.evaluate(()=>queue[0].book.progress),200);
  assert.equal(await page.evaluate(()=>queue[0].hours),1);
  await page.locator('[data-book-progress]').fill('384');
  await page.locator('[data-book-progress]').press('Enter');
  assert.equal(await page.evaluate(()=>queue.length),0);
  assert.equal(await page.evaluate(()=>completed.length),1);
  await page.waitForTimeout(500);
  await page.reload();
  assert.equal(await page.evaluate(()=>completed.length),1);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue[0].book.progress),200);
  assert.equal(await page.evaluate(()=>completed.length),0);
  await page.locator('[data-remove]').click();
  assert.equal(await page.evaluate(()=>queue.length),0);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue.length),1);
  await goToView(page,'plan');
  await page.locator('#ytAmount').fill('3');
  await page.locator('#ytAmount').press('Tab');
  assert.equal(await page.locator('#signal').textContent(),'No time available');
  await page.locator('#scheduleMode').selectOption('advanced');
  assert.equal(await page.locator('#jobSettings').isVisible(),true);
  await page.locator('#jobHours').fill('40');
  await page.locator('#jobHours').press('Tab');
  await page.locator('#ytAmount').fill('0');
  await page.locator('#ytAmount').press('Tab');
  const reduced=await page.evaluate(()=>buildSchedule().paceAfter);
  await page.locator('#scheduleMode').selectOption('simple');
  assert.equal(await page.evaluate(()=>buildSchedule().paceAfter),21);
  assert.ok(reduced<21);
  await page.evaluate(()=>{queue[0].estimateNeeded=true;lastSig=null;renderQueue();render();});
  assert.equal(await page.locator('.estimate-badge').textContent(),'Estimate needed');
  assert.match(await page.locator('#estimateSummary').textContent(),/placeholder time/);
  const exported=await page.evaluate(()=>serializeState());
  assert.equal(await page.evaluate(text=>parseStateText(text).ok,exported),true);
  await goToView(page,'queue');
  await page.locator('[data-finish]').click();
  await goToView(page,'completed');
  await page.locator('[data-restore]').click();
  await goToView(page,'queue');
  assert.equal(await page.evaluate(()=>queue.length),1);
  // Full-file import and Undo must restore both the queue and its settings.
  const replacement=exported.replace('Test book','Imported book').replace('Hours per week: 21','Hours per week: 30');
  await page.locator('#importFile').setInputFiles({name:'replacement.md',mimeType:'text/markdown',buffer:Buffer.from(replacement)});
  await page.waitForFunction(()=>queue[0]?.name === 'Imported book');
  assert.equal(await page.evaluate(()=>queue[0].name),'Imported book');
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue[0].name),'Test book');
  assert.equal(await page.locator('#paceInput').inputValue(),'21');
  await page.screenshot({path:'/tmp/release-queue-desktop.png',fullPage:true,animations:'disabled'});
  for(const width of [320,390,768]) {
    await page.setViewportSize({width,height:844});
    await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>{
      const r=el.getBoundingClientRect();return r.width>0 && (r.right>innerWidth+1 || r.left < -1) && getComputedStyle(el).position!=='absolute' && !el.closest('.media-filters');
    }).map(el=>({tag:el.tagName,cls:el.className,id:el.id})));
    assert.deepEqual(overflow,[],`overflow at ${width}: ${JSON.stringify(overflow)}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/release-queue-mobile.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>{queue=[];completed=[];lastSig=null;renderQueue();render();});
  await page.evaluate(()=>choosePick({name:'Unknown length book',kind:'Book',hours:null}));
  assert.equal(await page.evaluate(()=>queue[0].estimateNeeded),true);
  await page.locator('input[data-hours]').fill('3');
  await page.locator('input[data-hours]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].estimateNeeded),false);
  await page.locator('[data-remove]').click();
  await page.evaluate(()=>addToQueue({name:'Playlist', hours:3, kind:'YouTube', youtube:{url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',playlistId:'PL1234567890abcdef',durations:[1800,3600,7200],watched:1}}));
  await page.locator('input[data-hours]').fill('1.5');
  await page.locator('input[data-hours]').press('Enter');
  await page.locator('[data-youtube-count]').fill('2');
  await page.locator('[data-youtube-count]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].hours),1);
  assert.equal(await page.evaluate(()=>parseStateText(serializeState()).queue[0].youtube.watched),2);
  await page.locator('[data-youtube-count]').fill('3');
  await page.locator('[data-youtube-count]').press('Enter');
  assert.equal(await page.evaluate(()=>queue.length),0);
  assert.equal(await page.evaluate(()=>completed[0].youtube.watched),2);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue[0].hours),1);
  await page.locator('[data-remove]').click();
  await page.evaluate(()=>addToQueue({name:'Show', hours:1.5, kind:'Show', show:{episodes:[{season:1,number:1,seconds:1800},{season:1,number:2,seconds:3600}],watched:0}}));
  await page.locator('input[data-hours]').fill('3');
  await page.locator('input[data-hours]').press('Enter');
  await page.locator('[data-show-episode]').selectOption('1');
  assert.equal(await page.evaluate(()=>queue[0].hours),2);
  await page.locator('[data-show-episode]').selectOption('2');
  assert.equal(await page.evaluate(()=>queue.length),0);
  assert.equal(await page.evaluate(()=>parseStateText(serializeState()).ok),true);
  await page.evaluate(()=>addToQueue({name:'Game', hours:50, kind:'Game'}));
  await page.locator('[data-game-finish]').click();
  assert.equal(await page.evaluate(()=>completed[0].name),'Game');
  // URL-only additions use the playlist title, even from a video URL.
  const playlistId = 'PL1234567890abcdef';
  const playlistUrl = `https://www.youtube.com/watch?v=abcdefghijk&list=${playlistId}`;
  const playlistTitle = 'Learn <JavaScript> & "build"';
  let titleRequests = 0, titleResponse = {title:playlistTitle}, titleStatus = 200;
  await context.route('https://www.youtube.com/oembed?**', route => {
    titleRequests++;
    const request = new URL(route.request().url());
    assert.equal(request.searchParams.get('url'), `https://www.youtube.com/playlist?list=${playlistId}`);
    return route.fulfill({status:titleStatus, contentType:'application/json', body:JSON.stringify(titleResponse)});
  });
  await page.evaluate(() => {
    window.originalPlaylistDurations = readPlaylistDurations;
    window.playlistDurationCalls = 0;
    readPlaylistDurations = async () => { playlistDurationCalls++; return [600, 1200]; };
  });
  await openAddDialog(page,'playlistAddPanel');
  await page.locator('#youtubeUrl').fill(playlistUrl);
  await page.locator('#youtubeAdd').click();
  await page.waitForFunction(() => !$('youtubeAdd').disabled);
  assert.equal(await page.evaluate(() => queue.at(-1).name), playlistTitle);
  assert.equal(await page.locator('.item-title').last().textContent(), playlistTitle);
  assert.equal(await page.evaluate(() => parseStateText(serializeState()).queue.at(-1).name), playlistTitle);
  assert.equal(await page.evaluate(() => queue.at(-1).hours), 0.5);
  assert.equal(titleRequests, 1);
  await page.evaluate(() => { saveState(); flushSave(); });
  assert.equal(await page.evaluate(() => parseStateText(localStorage.getItem(STORE_KEY)).queue.at(-1).name), playlistTitle);

  // Failed or malformed metadata leaves the URL and queue intact for retry.
  for(const response of [{status:404, body:{}}, {status:200, body:{title:'  '}}, {status:200, body:{title:42}}]) {
    titleStatus = response.status; titleResponse = response.body;
    await openAddDialog(page,'playlistAddPanel');
    await page.locator('#youtubeUrl').fill(playlistUrl);
    await page.locator('#youtubeAdd').click();
    await page.waitForFunction(() => !$('youtubeAdd').disabled);
    assert.match(await page.locator('#youtubeHelp').textContent(), /Enter a name/);
    assert.equal(await page.locator('#youtubeUrl').inputValue(), playlistUrl);
    assert.equal(await page.locator('#youtubeTitle').isEnabled(), true);
    assert.equal(await page.evaluate(() => queue.length), 1);
    assert.equal(await page.evaluate(() => playlistDurationCalls), 1);
  }
  // A supplied name bypasses metadata and works after a failed lookup.
  await openAddDialog(page,'playlistAddPanel');
  await page.locator('#youtubeTitle').fill('My own name');
  await page.locator('#youtubeAdd').click();
  await page.waitForFunction(() => !$('youtubeAdd').disabled);
  assert.equal(await page.locator('#duplicateDialog').isVisible(),true);
  await page.locator('#duplicateAdd').click();
  assert.equal(await page.evaluate(() => queue.at(-1).name), 'My own name');
  assert.equal(titleRequests, 4);
  assert.equal(await page.locator('#youtubeUrl').inputValue(), '');
  assert.equal(await page.locator('#youtubeTitle').inputValue(), '');
  await openAddDialog(page,'playlistAddPanel');
  await page.locator('#youtubeUrl').fill('https://example.com/playlist?list=' + playlistId);
  await page.locator('#youtubeAdd').click();
  assert.match(await page.locator('#youtubeHelp').textContent(), /valid YouTube playlist URL/);
  assert.equal(titleRequests, 4);
  await page.evaluate(() => { readPlaylistDurations = originalPlaylistDurations; });
  await page.evaluate(async () => {
    const originalLoader = loadYoutubePlayerApi;
    const fakeYT = {PlayerState:{CUED:5}};
    fakeYT.Player = class {
      constructor(mount, config){
        this.events = config.events;
        this.id = config.playerVars.list;
        this.frame = document.createElement('iframe');
        mount.replaceWith(this.frame);
        setTimeout(() => { if(this.frame.isConnected) this.events.onReady(); }, 0);
      }
      getIframe(){ return this.frame; }
      getPlaylist(){ return [this.id]; }
      cueVideoById(id){ setTimeout(() => {
        if(this.frame.isConnected) this.events.onStateChange({data:fakeYT.PlayerState.CUED});
      }, 0); }
      getVideoData(){ return {video_id:this.id}; }
      getDuration(){ return this.id === 'first' ? 120 : 240; }
      destroy(){ this.frame.remove(); }
    };
    loadYoutubePlayerApi = () => Promise.resolve(fakeYT);
    try{
      const results = await Promise.race([
        Promise.all([
          readYoutubePlaylistDurations('first', () => {}),
          readYoutubePlaylistDurations('second', () => {})
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Concurrent playlist lookups stalled')), 500))
      ]);
      if(JSON.stringify(results) !== JSON.stringify([[120], [240]]))
        throw new Error('Concurrent playlist lookups returned the wrong durations');
    }finally{
      loadYoutubePlayerApi = originalLoader;
    }
  });

  console.log('PASS',url.startsWith('file:')?'direct file':'static HTTP');

}).catch(e=>{console.error(e);process.exitCode=1;});
