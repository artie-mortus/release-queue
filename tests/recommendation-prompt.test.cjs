const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({contextOptions:{viewport:{width:390,height:900},reducedMotion:'reduce'}}, async ({url,page}) => {
  await page.clock.install({time:new Date('2026-10-06T12:00:00')});
  await page.goto(url);
  await page.evaluate(()=>{
    setReleaseTarget({...SITE_CONFIG,gameName:'Next Game',gameShortName:'Next Game',releaseDate:'2026-10-20'});
    $('scheduleMode').value='simple';$('paceInput').value='28';
    $('startDate').value='2026-10-06';$('ytAmount').value='1';ytUnit='day';
    addToQueue({name:'A game',kind:'Game',hours:10,game:{total:10,played:2}});
    addToQueue({name:'A movie <with> | punctuation',kind:'Movie',hours:4});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}});
  });
  const before=await page.evaluate(()=>({queue:structuredClone(queue),undo:undoStack.length}));
  await goToView(page,'settings');
  await page.getByRole('button',{name:'Copy recommendation prompt',exact:true}).press('Enter');
  await page.waitForFunction(()=>$('promptCopyStatus').textContent.includes('copied'));
  const text=await page.evaluate(()=>window.copiedPrompt);
  assert.ok(text.startsWith('Add recommendations on top of the queue.\n\nCurrent queue'));
  assert.match(text,/1\. A game \| Game \| 8 hours remaining/);
  assert.match(text,/2\. A movie <with> \| punctuation \| Movie \| 4 hours remaining/);
  assert.match(text,/Time still needed: 30 hours/);
  assert.match(text,/Next Game releases on 2026-10-20/);
  assert.match(text,/Available queue time before release: 42 hours/);
  assert.match(text,/Recurring YouTube: 1 hour per day/);
  assert.deepEqual(await page.evaluate(()=>({queue:structuredClone(queue),undo:undoStack.length})),before);
  assert.equal(await page.locator('#promptCopyManual').isVisible(),false);
  assert.equal(await page.locator('#copyPrompt').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'copyPrompt');

  await page.evaluate(()=>{
    moveQueueItem(1,0);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
    document.execCommand=command=>{
      if(command!=='copy') throw new Error('Unexpected command');
      window.copiedPrompt=document.activeElement.value;
      return true;
    };
  });
  await goToView(page,'settings');
  await page.locator('#copyPrompt').click();
  assert.match(await page.evaluate(()=>window.copiedPrompt),/1\. A movie <with> \| punctuation/);
  assert.equal(await page.locator('#promptCopyManual').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'copyPrompt');

  await goToView(page,'queue');
  await page.locator('[data-hours="0"]').fill('6');
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied');}}});
    document.execCommand=()=>false;
  });
  await page.locator('#queueRecommend').click();
  await page.waitForFunction(()=>activeView==='settings');
  assert.match(page.url(),/#settings$/);
  await page.locator('#promptCopyText').waitFor();
  // Let navigation settle before checking the selected manual-copy fallback.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.match(await page.locator('#promptCopyText').inputValue(),/Time still needed: 28 hours/);
  assert.match(await page.locator('#promptCopyText').inputValue(),/6 hours remaining/);
  assert.deepEqual(await page.evaluate(()=>({id:document.activeElement.id,
    selected:$('promptCopyText').selectionEnd-$('promptCopyText').selectionStart,
    length:$('promptCopyText').value.length})),
    {id:'promptCopyText',selected:(await page.locator('#promptCopyText').inputValue()).length,
      length:(await page.locator('#promptCopyText').inputValue()).length});
  assert.match(await page.locator('#promptCopyStatus').textContent(),/Select and copy/);
  assert.equal(await page.locator('#copyPrompt').isEnabled(),true);
  const manualField = await page.locator('#promptCopyText').boundingBox();
  assert.ok(manualField.y >= 0 && manualField.y < 900,'The manual-copy field stays in view after navigation');
  await page.goBack();
  await page.waitForFunction(()=>activeView==='queue');

  // The queue-page button copies directly instead of steering to Settings.
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}});
  });
  await page.evaluate(()=>document.execCommand=()=>{throw new Error('Unexpected command');});
  await page.locator('#queueRecommend').click();
  await page.waitForFunction(()=>!$('toast').hidden && $('toast').textContent.includes('Recommendation prompt copied'));
  assert.equal(await page.evaluate(()=>activeView),'queue');
  assert.match(await page.evaluate(()=>window.copiedPrompt),/Time still needed: 28 hours/);
  assert.equal(await page.locator('#queueRecommend').isEnabled(),true);
  await goToView(page,'settings');

  const edgeCases=await page.evaluate(()=>{
    queue=[];
    const empty=recommendationPrompt();
    addToQueue({name:'Large queue',kind:'Movie',hours:100});
    const full=recommendationPrompt();
    $('ytAmount').value='24';
    const stalled=recommendationPrompt();
    setReleaseTarget({...SITE_CONFIG,releaseDate:'2026-10-01'});
    const released=recommendationPrompt();
    return {empty,full,stalled,released};
  });
  assert.match(edgeCases.empty,/The queue is empty/);
  assert.match(edgeCases.empty,/Time still needed: 42 hours/);
  assert.match(edgeCases.full,/Time still needed: 0 hours/);
  assert.match(edgeCases.stalled,/No queue time is available/);
  assert.match(edgeCases.released,/release date has passed/);
  for(const width of [320,390,768,1280,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(width<=390) assert.ok(await page.locator('#copyPrompt').evaluate(button=>button.getBoundingClientRect().height)>=44);
  }
  console.log(`Recommendation prompt passed: ${url.split(':')[0]}`);
}).catch(error=>{console.error(error);process.exitCode=1;});
