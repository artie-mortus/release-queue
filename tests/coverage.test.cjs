const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({contextOptions:{viewport:{width:1280,height:900}, reducedMotion:'reduce'}}, async ({url,page}) => {
  await page.goto(url);
  assert.deepEqual(await page.evaluate(() => {
    const mismatches = [];
    const now = new Date(2026,8,22,12);
    for(const inputs of [
      {fullPace:21,ceiling:168}, {fullPace:21,ceiling:168,startOff:7},
      {fullPace:21,ceiling:56,jobHours:28,jobOff:14},
      {fullPace:21,ceiling:21,jobHours:21,jobOff:14},
      {fullPace:11,ceiling:133,ytPerWeek:7,jobHours:90,jobOff:21},
      {fullPace:21,ceiling:168,ytPerWeek:21}
    ]){
      const plan=calculateSchedule(inputs);
      for(const items of [[],[{hours:0}],[{hours:7},{hours:14}],[{hours:100}],[{hours:10.2}]]){
        for(const hours of [0,0.1,7,21,100,1.8,1.8000000001]){
          const before=forecastQueue(items,plan,28), after=forecastQueue([...items,{hours}],plan,28);
          const expected=hours < MIN_ITEM_HOURS ? 'Coverage preview available after runtime lookup.'
            : before.stalled || before.capacity<=0 ? 'No queue time available. Adjust your time budget first.'
            : after.stalled ? 'This addition would have no projected finish at this pace.'
            : before.missingHours>0.05 && after.missingHours<=0.05 ? 'Estimated: gets your queue to release.'
            : after.missingHours>0.05 ? `Estimated: fills ${fmtHours(num1(Math.min(hours,before.missingHours)))} of the gap; ${fmtHours(num1(after.missingHours))} still needed.`
            : `Estimated: ${isFinite(after.finishDay-before.finishDay) ? `adds about ${num1(after.finishDay-before.finishDay)} days; ` : ''}${fmtHours(num1(after.remainingHours))} left at release.`;
          const actual=candidateCoverage(hours,true,{now,plan,forecast:before,daysLeft:28});
          if(actual!==expected) mismatches.push({inputs,items,hours,expected,actual});
        }
      }
    }
    return mismatches;
  }),[]);
  await page.evaluate(() => {
    $('paceInput').value='21'; $('ytAmount').value='1';
    addToQueue({name:'A 50-hour game', hours:50, kind:'Game'});
  });
  const expected = await page.evaluate(() => ({
    missing:currentForecast().missingHours, finish:currentForecast().finishDay,
    actualDate:SITE_CONFIG.releaseDate, state:parseStateText(serializeState())
  }));
  assert.equal(expected.finish,25);
  assert.match(await page.locator('#coverageNote').textContent(),new RegExp(`${expected.missing} hours`));
  await goToView(page,'plan');
  assert.match(await page.locator('#track .seg').getAttribute('title'),/Projected finish/);
  assert.equal(await page.locator('#track .seg--yt').count(),0,'Recurring YouTube must not be a sequential calendar segment');
  const segmentEnd = await page.evaluate(() => {
    const segment=$('track').firstElementChild;
    const axisDays=Math.max(dayNumber(TARGET)-dayNumber(new Date()),25,1)*1.04;
    return Number.parseFloat(segment.style.width)*axisDays/100;
  });
  assert.ok(Math.abs(segmentEnd-25)<0.001,'Timeline endpoint must use the reduced pace');
  await page.locator('#scenarioPanel > summary').click();
  await page.locator('#scenarioPace').fill('28');
  const alternateDate=await page.evaluate(()=>toDateValue(addDays(TARGET,14)));
  await page.locator('#scenarioDate').fill(alternateDate);
  assert.equal(await page.locator('#scenarioResult > div').count(),3);
  assert.match(await page.locator('#scenarioExplanation').textContent(),/not probabilities/);
  assert.equal(await page.locator('#paceInput').inputValue(),'21');
  assert.equal(await page.evaluate(()=>toDateValue(TARGET)),expected.actualDate);
  assert.deepEqual(await page.evaluate(()=>parseStateText(serializeState())),expected.state,'Preview must not mutate portable saves');
  await page.locator('#scenarioApplyPace').click();
  assert.equal(await page.locator('#paceInput').inputValue(),'28');
  await page.locator('#undo').click();
  assert.equal(await page.locator('#paceInput').inputValue(),'21');
  await page.locator('#scenarioDate').fill('');
  assert.equal(await page.locator('#scenarioApplyPace').isDisabled(),true);
  assert.match(await page.locator('#scenarioResult').textContent(),/Choose a future date/);
  await page.locator('#scenarioReset').click();
  assert.equal(await page.locator('#scenarioDate').inputValue(),expected.actualDate);
  assert.equal(await page.locator('#scenarioPace').inputValue(),'21');
  await page.locator('#scenarioPace').fill('28.5');
  assert.equal(await page.locator('#scenarioApplyPace').isDisabled(),true);
  await page.locator('#scenarioReset').click();
  await page.locator('#scenarioPanel > summary').click();
  await page.locator('#timelinePanel > summary').click();
  await page.locator('#quickAdd').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'name');
  await page.locator('#kind').selectOption('Movie');
  await openAddDialog(page);
  await page.locator('#name').fill('Manual candidate');
  await page.locator('#amount').fill('2');
  assert.match(await page.locator('#addPreview').textContent(),/fills 2 hours of the gap/);
  await page.evaluate(()=>renderPicks([{name:'Candidate',kind:'Game',hours:100,estimated:true,note:'Approximate runtime',rank:0,tier:0}],0,0));
  assert.match(await page.locator('.candidate-coverage').textContent(),/gets your queue to release/);
  await page.evaluate(()=>closeSuggestions());

  await goToView(page,'queue');
  // Insert a new video before watched entries and preserve a custom runtime correction.
  await page.evaluate(() => {
    queue=[]; completed=[]; undoStack.splice(0); $('ytAmount').value='0';
    addToQueue({name:'Playlist', hours:2, kind:'YouTube', youtube:{
      url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',playlistId:'PL1234567890abcdef',
      durations:[3600,7200],watched:1,videoIds:['aaaaaaaaaaa','bbbbbbbbbbb'],checkedAt:Date.now()
    }});
  });
  await page.locator('[data-hours]').fill('1');
  await page.locator('[data-hours]').press('Enter');
  await page.evaluate(() => {
    readPlaylistDurations=async()=>Object.assign([1800,3600,7200],{videoIds:['xxxxxxxxxxx','aaaaaaaaaaa','bbbbbbbbbbb']});
  });
  await page.locator('[data-youtube-refresh]').click();
  await page.waitForFunction(()=>queue[0].youtube.durations.length===3);
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.watchedIndices),[1]);
  assert.equal(await page.evaluate(()=>queue[0].runtimeScale),0.5);
  assert.equal(await page.evaluate(()=>queue[0].hours),1.3);
  assert.match(await page.locator('#continueNext a').getAttribute('href'),/v=xxxxxxxxxxx/);
  const refreshed=await page.evaluate(()=>serializeState());
  assert.equal(await page.evaluate(()=>parseStateText(serializeState()).ok),true);
  await page.evaluate(()=>flushSave());
  await page.reload();
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.watchedIndices),[1]);
  assert.match(await page.locator('#continueNext a').getAttribute('href'),/v=xxxxxxxxxxx/);
  await page.evaluate(()=>{readPlaylistDurations=async()=>[1800,3600,7200];});
  await page.locator('[data-youtube-refresh]').click();
  await page.waitForFunction(()=>$('queueStatus').textContent.includes('could not be checked safely'));
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.videoIds),['xxxxxxxxxxx','aaaaaaaaaaa','bbbbbbbbbbb']);
  await page.locator('#continueProgress').click();
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.watchedIndices),[0,1]);
  assert.equal(await page.evaluate(()=>queue[0].hours),1);
  await page.locator('#undo').click();
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.watchedIndices),[1]);
  await page.locator('#undo').click();
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.videoIds),['aaaaaaaaaaa','bbbbbbbbbbb']);
  assert.equal(await page.evaluate(()=>queue[0].runtimeScale),0.5);
  // If removal leaves only watched videos, archive the last valid state.
  await page.evaluate(()=>{readPlaylistDurations=async()=>Object.assign([3600],{videoIds:['aaaaaaaaaaa']});});
  await page.locator('[data-youtube-refresh]').click();
  await page.waitForFunction(()=>queue.length===0);
  assert.equal(await page.evaluate(()=>completed.length),1);
  assert.equal(await page.evaluate(()=>parseStateText(serializeState()).ok),true);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue.length),1);
  // Import restores identity progress as well as hours and corrections.
  await page.locator('#importFile').setInputFiles({name:'coverage.md',mimeType:'text/markdown',buffer:Buffer.from(refreshed)});
  await page.waitForFunction(()=>queue[0].youtube.durations.length===3);
  assert.deepEqual(await page.evaluate(()=>queue[0].youtube.watchedIndices),[1]);
  assert.equal(await page.evaluate(()=>queue[0].runtimeScale),0.5);

  await goToView(page,'plan');
  // Inspect short, medium, and phone layouts with the preview expanded.
  await page.evaluate(() => {
    queue=[];completed=[];undoStack.splice(0);$('paceInput').value='21';
    addToQueue({name:'Red Dead Redemption 2', hours:50.5, kind:'Game', ...({runtimeSource:'Approximate main-story runtime',runtimeBasis:'estimated'} || {})});
    addToQueue({name:'A book to fill the wait', hours:4, kind:'Book', book:{pages:760,pagesPerHour:190,pinned:false}});
    $('timelinePanel').open=$('scenarioPanel').open=true;
    scenarioDirty=false;renderScenarios();
    $('scenarioPace').value='28';scenarioDirty=true;renderScenarios();
  });
  assert.equal(await page.locator('#scenarioResult > div').count(),3);
  assert.equal(await page.locator('#scenarioTrack .seg').count(),2);
  for(const width of [320,390,768,1280,1920]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>window.scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if([390,1280].includes(width)) await page.screenshot({path:`/tmp/release-coverage-${width}.png`,fullPage:true,animations:'disabled'});
  }
  await goToView(page,'queue');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => {
    $('timelinePanel').open=false;
    for(let i=0;i<30;i++) queue.push({name:`Extra item ${i+1}`,kind:'Movie',hours:2});
    render({forceQueue:true,animate:false});
    window.scrollTo(0,$('queue').getBoundingClientRect().top+scrollY+1000);
  });
  const addTop=await page.locator('#quickAdd').evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(addTop>=0 && addTop<100,'Add action should stay reachable while scrolling a long queue');
  await page.locator('#quickAdd').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'name');

  console.log('PASS coverage, scenarios, playlist identity, and portable progress',url.startsWith('file:')?'direct file':'static HTTP');

}).catch(error=>{console.error(error);process.exitCode=1;});
