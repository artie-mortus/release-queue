const assert = require('node:assert/strict');
const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');

runBrowserSuite({contextOptions:{viewport:{width:390,height:844},reducedMotion:'reduce'}},async({page,url})=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const empty=async()=>[];
    findShows=findPodcasts=findLightNovels=findWebFiction=findWikidata=findBooks=findRawgGames=empty;
    jget=async()=>({averageRuntime:60,_embedded:{episodes:[
      {season:1,number:1,runtime:60,airdate:'2026-09-20'},
      {season:1,number:2,runtime:60,airdate:'2026-10-02'},
      {season:1,number:3,runtime:60,airdate:'2026-12-01'}
    ]}});
  });
  await openAddDialog(page);
  await page.evaluate(()=>choosePick({name:'Scheduled show',kind:'Show',showId:7}));
  assert.deepEqual(await page.evaluate(()=>queue[0].show.episodes.map(e=>e.availableOn)),['2026-09-20','2026-10-02']);
  await page.evaluate(()=>addToQueue({name:'Long game',kind:'Game',hours:180}));
  const forecast=await page.evaluate(()=>currentForecast());
  assert.ok(forecast.segments[0].endDay>=10);
  assert.ok(forecast.remainingHours>0 && forecast.missingHours>0,'Content remaining at launch cannot conceal earlier waiting gaps');
  assert.match(await page.locator('#signal').textContent(),/Gaps while episodes arrive/);
  assert.ok(await page.locator('#coverageFill').evaluate(el=>el.value)<1);
  assert.match(await page.evaluate(()=>candidateCoverage(2,true)),/fills 0 hours.*Move it before/);
  await goToView(page,'plan');
  assert.equal(await page.locator('#track .episode-wait').count(),1);
  assert.equal(await page.locator('#track .seg').count(),3,'The show is split around its waiting gap');
  assert.equal(await page.locator('#track .seg').nth(0).getAttribute('title'),await page.locator('#track .seg').nth(1).getAttribute('title'),'Both parts report the whole show finish date');
  assert.equal(await page.locator('#track .seg').nth(0).getAttribute('data-tone'),await page.locator('#track .seg').nth(1).getAttribute('data-tone'),'Split parts keep the same item color');
  await page.locator('#scenarioPanel > summary').click();
  await page.waitForFunction(()=>$('scenarioTrack').querySelector('.episode-wait'));
  assert.equal(await page.locator('#scenarioTrack .episode-wait').count(),1);
  assert.match(await page.locator('#scenarioExplanation').textContent(),/waits in queue order/);
  const portable=await page.evaluate(()=>serializeState());
  await page.locator('#importFile').setInputFiles({name:'dated-show.md',mimeType:'text/markdown',buffer:Buffer.from(portable)});
  assert.equal(await page.evaluate(()=>queue[0].show.episodes[1].availableOn),'2026-10-02');
  assert.equal(await page.evaluate(()=>queue[0].catalogId),'tvmaze:7');
  await page.evaluate(()=>moveQueueItem(1,0));
  assert.equal(await page.evaluate(()=>currentForecast().waitingHours),0,'An available item earlier in the queue fills the wait');
  assert.equal(await page.locator('#coverageFill').evaluate(el=>el.value),1);

  await goToView(page,'queue');
  await openAddDialog(page);
  await page.locator('#kind').selectOption('Game');
  await page.locator('#name').fill('Long game');
  await page.locator('#amount').fill('10');
  await page.locator('#add').click();
  assert.equal(await page.locator('#duplicateDialog').isVisible(),true);
  assert.equal(await page.evaluate(()=>queue.length),2);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#name').inputValue(),'Long game','Cancel preserves the manual draft');
  await page.locator('#add').click();
  await page.locator('#duplicateExisting').click();
  await page.waitForFunction(()=>document.activeElement.matches('[data-game-total="0"]'));
  assert.equal(await page.locator('#addDialog').isVisible(),false);
  await openAddDialog(page);
  await page.locator('#add').click();
  await page.locator('#duplicateAdd').click();
  assert.equal(await page.evaluate(()=>queue.length),3);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue.length),2,'An intentional duplicate supports Undo');
  await openAddDialog(page);
  await page.evaluate(()=>renderPicks([{name:'Long game',kind:'Game',hours:180,note:'Estimate',rank:0,tier:0}],0,0));
  assert.match(await page.locator('#suggestions').textContent(),/Already in queue/);
  await page.locator('[data-close-dialog="addDialog"]').click();

  await page.evaluate(()=>{
    addToQueue({name:'Saved story',kind:'Book',hours:2,book:{pages:200,pagesPerHour:190,pinned:false,url:'https://archiveofourown.org/works/123',platform:'ao3',basis:'words',words:55000,asOf:'2026-09-22'}});
    fetchStoryText=async()=>'';
  });
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://archiveofourown.org/works/123/chapters/456?view_full_work=true');
  await page.locator('#webTitle').fill('A renamed story');
  await page.locator('#webLength').fill('55000');
  await page.locator('#webAdd').click();
  assert.equal(await page.locator('#duplicateDialog').isVisible(),true,'Story URL identity works across names and chapter URLs');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#webTitle').inputValue(),'A renamed story');
  await page.locator('[data-close-dialog="addDialog"]').click();

  await page.evaluate(()=>{
    addToQueue({name:'Saved playlist',kind:'YouTube',hours:1,youtube:{url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',playlistId:'PL1234567890abcdef',durations:[3600],watched:0,checkedAt:Date.now()}});
    window.playlistReads=0;
    readPlaylistDurations=async()=>{playlistReads++;return [3600];};
  });
  await openAddDialog(page,'playlistAddPanel');
  await page.locator('#youtubeTitle').fill('A renamed playlist');
  await page.locator('#youtubeUrl').fill('https://youtube.com/watch?v=aaaaaaaaaaa&list=PL1234567890abcdef');
  await page.locator('#youtubeAdd').click();
  await page.waitForFunction(()=>$('duplicateDialog').open);
  await page.locator('#duplicateAdd').click();
  assert.equal(await page.evaluate(()=>playlistReads),1,'Confirming uses the checked result without another network lookup');
  assert.equal(await page.evaluate(()=>queue.filter(item=>item.kind==='YouTube').length),2);
  assert.equal(await page.evaluate(()=>queue.at(-1).youtube.durations[0]),3600);

  await openAddDialog(page);
  await page.evaluate(async()=>{
    wikidataHours=async()=>({hours:2,known:false});
    await choosePick({name:'Unknown-runtime movie',kind:'Movie',qid:'Q123'});
  });
  assert.equal(await page.locator('#addDialog').isVisible(),false);
  assert.match(await page.locator('#undoMessage').textContent(),/2 hours placeholder/);
  assert.equal(await page.locator('#undoBar').isVisible(),true);
  assert.equal(await page.locator('#toast').isVisible(),false,'Additions report once, in the Undo bar');
  await page.locator('#undoBar').getByRole('button',{name:'Edit estimate'}).click();
  assert.equal(await page.locator('#undoAction').isVisible(),false,'The follow-up action is used once');
  await page.waitForFunction(()=>document.activeElement.matches('[data-hours]'));
  await page.keyboard.insertText('3');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>queue.at(-1).estimateNeeded),false);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue.at(-1).estimateNeeded),true);
  await page.evaluate(()=>{
    completed.push({name:'Old favorite',kind:'Movie',hours:2,completedAt:'2026-09-20'});
    addToQueue({name:'Old favorite',kind:'Movie',hours:2});
    flushSave();
  });
  assert.match(await page.locator('#undoMessage').textContent(),/finished a matching item before/);
  assert.equal(await page.locator('#duplicateDialog').isVisible(),false,'Completed history is a reminder, not a blocked addition');
  await page.reload();
  assert.equal(await page.evaluate(()=>queue.find(item=>item.name==='Scheduled show').show.episodes[1].availableOn),'2026-10-02');
  assert.equal(await page.evaluate(()=>queue.find(item=>item.name==='Unknown-runtime movie').catalogId),'wikidata:Q123');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS episode availability, placeholders, and duplicate choices',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
