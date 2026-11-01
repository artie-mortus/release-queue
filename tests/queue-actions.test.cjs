const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({contextOptions:{reducedMotion:'reduce'}}, async ({url,page}) => {
  await page.goto(url);
  await page.evaluate(() => {
    addToQueue({name:'Playlist', hours:2, kind:'YouTube', youtube:{
      url:'https://www.youtube.com/playlist?list=PL1234567890abcdef', playlistId:'PL1234567890abcdef',
      durations:[3600,3600,3600], watched:1, videoIds:['mI4CGmvFgTk','AAMyFjcvwoo','nFENQlvy7_Y'],
      checkedAt:Date.now() - 60 * 60 * 1000
    }});
  });
  assert.match(await page.locator('#continueNext').textContent(), /Video 2 of 3/);
  assert.match(await page.locator('#continueNext a').getAttribute('href'), /v=AAMyFjcvwoo/);
  assert.match(await page.locator('[data-youtube-status="0"]').textContent(), /Checked 1 hour ago/);
  await page.locator('#continueProgress').click();
  assert.equal(await page.evaluate(() => queue[0].youtube.watched), 2);
  assert.match(await page.locator('#continueNext a').getAttribute('href'), /v=nFENQlvy7_Y/);
  assert.deepEqual(await page.evaluate(() => parseStateText(serializeState()).queue[0].youtube.videoIds), ['mI4CGmvFgTk','AAMyFjcvwoo','nFENQlvy7_Y']);
  assert.equal(await page.evaluate(() => parseStateText(serializeState().replace('videoIds=mI4CGmvFgTk,AAMyFjcvwoo,nFENQlvy7_Y', 'videoIds=bad')).ok), false);
  await page.evaluate(() => flushSave());
  await page.reload();
  assert.match(await page.locator('#continueNext a').getAttribute('href'), /v=nFENQlvy7_Y/);
  assert.match(await page.locator('[data-youtube-status="0"]').textContent(), /Checked 1 hour ago/);
  await page.evaluate(() => {
    queue = []; completed = [];
    addToQueue({name:'Show', hours:1, kind:'Show', show:{
      episodes:[{season:1,number:1,seconds:1800},{season:2,number:1,seconds:1800},{season:2,number:2,seconds:1800}], watched:1
    }});
  });
  assert.match(await page.locator('#continueNext').textContent(), /Season 2, episode 1/);
  const before = await page.evaluate(() => undoStack.length);
  await page.locator('#continueProgress').click();
  assert.equal(await page.evaluate(() => queue[0].show.watched), 2);
  assert.equal(await page.evaluate(() => undoStack.length), before + 1);
  await page.locator('[data-show-season]').selectOption('1');
  await page.locator('[data-show-season]').selectOption('2');
  assert.equal(await page.locator('[data-show-season]').inputValue(),'2');
  assert.equal(await page.locator('[data-show-episode]').inputValue(),'0',
    'A new season retains zero watched episodes after rebuilding controls');
  assert.equal(await page.evaluate(()=>queue[0].show.watched),1);
  await page.evaluate(() => {
    queue = []; addToQueue({name:'Unlisted show', hours:2, kind:'Show'});
    findShows = async () => { throw new Error('Service unavailable'); };
  });
  await page.locator('[data-show-load="0"]').click();
  await page.waitForFunction(() => document.querySelector('[data-action-status="0"]').textContent.includes('Service unavailable'));
  assert.equal(await page.locator('[data-action-status="0"]').isVisible(), true);
  assert.equal(await page.locator('[data-show-load="0"]').isEnabled(), true);
  await page.evaluate(() => { findShows = async () => []; });
  await page.locator('[data-show-load="0"]').click();
  await page.waitForFunction(() => document.querySelector('[data-action-status="0"]').textContent.includes('Choose this show'));
  await page.evaluate(() => {
    queue = []; addToQueue({name:'Book', hours:2, kind:'Book', book:{pages:200,pagesPerHour:100,pinned:false}});
  });
  await page.locator('#continueProgress').click();
  assert.equal(await page.evaluate(() => document.activeElement.matches('[data-book-progress]')), true);

  // Explicit actions retain zero-hour games and archive the last active reading progress.
  await page.evaluate(() => {
    queue=[]; completed=[]; undoStack.length=0;
    addToQueue({name:'Game',hours:50,kind:'Game'});
  });
  await page.locator('[data-game-played]').fill('65');
  await page.locator('[data-game-played]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].hours),0);
  assert.equal(await page.evaluate(()=>completed.length),0);
  await page.locator('[data-game-total]').fill('80');
  await page.locator('[data-game-total]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].hours),15);
  await page.locator('#continueProgress').click();
  assert.equal(await page.evaluate(()=>queue[0].game.played),66);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'continueProgress');
  await page.evaluate(()=>{
    queue=[];
    addToQueue({name:'Book',hours:2,kind:'Book',book:{pages:200,pagesPerHour:100,progress:20,pinned:true}});
  });
  await page.locator('[data-book-progress]').fill('200');
  await page.locator('[data-book-progress]').press('Enter');
  assert.equal(await page.evaluate(()=>completed[0].book.progress),20);
  await goToView(page,'completed');
  await page.locator('[data-restore]').click();
  assert.equal(await page.evaluate(()=>queue[0].book.progress),20);
  await goToView(page,'queue');

  // Async lookups follow item identity across reorder and never revive removed items.
  await page.evaluate(()=>{
    queue=[];completed=[];
    addToQueue({name:'Pending show',hours:2,kind:'Show'});
    addToQueue({name:'Other movie',hours:2,kind:'Movie'});
    findShows=()=>new Promise(resolve=>{window.resolveShow=resolve;});
    showProfile=async()=>({episodes:[{season:1,number:1,seconds:1800}],watched:0});
  });
  await page.locator('[data-show-load="0"]').click();
  await page.locator('[data-drag-index="0"]').press('ArrowDown');
  assert.equal(await page.locator('[data-show-load="1"]').isDisabled(),true);
  await page.evaluate(()=>resolveShow([{name:'Pending show',showId:1}]));
  await page.waitForFunction(()=>!!queue[1]?.show);
  assert.equal(await page.evaluate(()=>queue[0].name),'Other movie');
  await page.evaluate(()=>{
    queue=[];
    addToQueue({name:'Removed show',hours:2,kind:'Show'});
  });
  await page.locator('[data-show-load]').click();
  await page.locator('[data-remove]').click();
  const status=await page.locator('#queueStatus').textContent();
  await page.evaluate(()=>resolveShow([{name:'Removed show',showId:1}]));
  await page.waitForTimeout(20);
  assert.equal(await page.evaluate(()=>queue.length),0);
  assert.equal(await page.locator('#queueStatus').textContent(),status);

  const deferred=await page.evaluate(()=>{
    const RealDate=Date;
    let clock=new RealDate(2026,9,1,23,59).getTime();
    window.Date=class extends RealDate{
      constructor(...args){super(...(args.length?args:[clock]));}
      static now(){return clock;}
    };
    try{
      queue=[];completed=[];
      $('scheduleMode').value='simple';$('paceInput').value='21';$('ytAmount').value='0';
      addToQueue({name:'Daily podcast',kind:'Podcast',hours:10,
        pod:{eps:10,avgMin:60,perWeek:7,backlog:10,ongoing:true,pinned:false}});
      addToQueue({name:'Game',kind:'Game',hours:20});
      const before=queue[0].hours;
      const rows=[...$('queue').children];
      setQueueExpanded(false);
      clock+=2*60*1000;
      candidateCoverage(2); // A late search paint must not use yesterday's podcast hours.
      const previewHours=queue[0].hours;
      render({animate:false});
      const after=queue[0].hours;
      setGameProgress(1,'played',2);
      finishItem(0);
      flushSave();
      const stayedMounted=rows.every((row,i)=>row===$('queue').children[i]);
      const saved=parseStateText(localStorage.getItem(STORE_KEY));
      setQueueExpanded(true);
      return {before,after,previewHours,stayedMounted,saved:saved.ok,
        archived:saved.completed[0].completedAt,
        hours:$('queue').querySelector('.hours b').textContent,
        name:$('queue').querySelector('[data-item-index] b').textContent};
    }finally{window.Date=RealDate;}
  });
  assert.equal(deferred.before-deferred.after,1,'Midnight recalculates podcast growth');
  assert.equal(deferred.previewHours,deferred.after,'Candidate contexts synchronize date-derived items');
  assert.equal(deferred.stayedMounted,true,'Collapsed mutations defer row construction');
  assert.equal(deferred.saved,true);
  assert.equal(deferred.archived,'2026-10-02');
  assert.equal(deferred.name,'Game');
  assert.equal(deferred.hours,'18');

  await page.evaluate(()=>{
    queue=[];completed=[];
    addToQueue({name:'Edited movie',kind:'Movie',hours:4});
    addToQueue({name:'Other movie',kind:'Movie',hours:8});
  });
  await page.locator('[data-hours="0"]').fill('/2');
  await page.evaluate(()=>moveQueueItem(0,1,{focus:true}));
  assert.deepEqual(await page.evaluate(()=>queue.map(item=>[item.name,item.hours])),
    [['Other movie',8],['Edited movie',2]],'Reordering commits the focused estimate to its original item');

  console.log(`Queue actions passed: ${url.split(':')[0]}`);
}).catch(error => { console.error(error); process.exitCode = 1; });
