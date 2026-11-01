const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const claim = (date, rank='normal', precision=11) => ({rank,mainsnak:{datavalue:{value:{
  time:`+${date}T00:00:00Z`,precision,calendarmodel:'http://www.wikidata.org/entity/Q1985727',before:0,after:0
}}}});
runBrowserSuite({contextOptions:{viewport:{width:1280,height:900},reducedMotion:'reduce'}, network:async ({page}) => {
  await page.route('**/*',route=>{
    const request=route.request().url();
    if(request.startsWith('file:') || request.startsWith('http://127.0.0.1')) return route.continue();
    if(request.includes('wikidata.org/w/api.php')){
      const params=new URL(request).searchParams;
      if(params.get('search') === 'Offline') return route.abort();
      const data=params.get('action') === 'wbsearchentities'
        ? {search:[{id:'Q123',label:'Next Game',description:'upcoming video game'},
          {id:'Q124',label:'Unannounced Game',description:'upcoming video game'},
          {id:'Q125',label:'Soundtrack',description:'soundtrack album'}]}
        : {entities:{[params.get('ids')]:{claims:{P577:params.get('ids') === 'Q124'
          ? [claim('2030-01-01','preferred',9)] : [claim('2028-01-01','deprecated'),claim('2029-01-01'),
            claim('2030-06-15','preferred'),claim('2030-06-18','preferred')]}}}};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    }
    return route.abort();
  });
}}, async ({url,page}) => {
  await page.goto(url);
  await page.evaluate(()=>addToQueue({name:'Keep this item', hours:50, kind:'Game'}));
  const before=await page.evaluate(()=>({queue:queue,missing:currentForecast().missingHours}));
  await goToView(page,'settings');
  assert.equal(await page.locator('#gamePicker').isVisible(),true);
  await page.locator('#gamePicker > summary').click();
  await page.locator('#gameSearch').fill('Next');
  await page.locator('#gameSearchButton').click();
  await page.locator('.game-result').first().waitFor();
  assert.equal(await page.locator('.game-result').count(),2);
  await page.locator('.game-result').first().click();
  await page.waitForFunction(()=>$('targetGameDate').value === '2030-06-15');
  assert.equal(await page.locator('#gameDatesField').isVisible(),true);
  assert.equal(await page.locator('#gameDates option').count(),2);
  await page.locator('#gameDates').selectOption('2030-06-18');
  await page.locator('#useGame').click();
  assert.equal(await page.title(),'Release Queue · Next Game');
  assert.equal(await page.locator('#brandName').textContent(),'Next Game');
  assert.match(await page.locator('#cdText').textContent(),/until Next Game/);
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseDate),'2030-06-18');
  assert.deepEqual(await page.evaluate(()=>queue),before.queue);
  assert.ok(await page.evaluate(()=>currentForecast().missingHours) > before.missing);
  await page.locator('#undo').click();
  assert.equal(await page.title(),'Release Queue · Grand Theft Auto VI');
  assert.deepEqual(await page.evaluate(()=>queue),before.queue);
  await page.locator('#targetGameName').fill('Manual Game');
  await page.locator('#targetGameDate').fill('2031-01-02');
  await page.locator('#useGame').click();
  const save=await page.evaluate(()=>{flushSave();return serializeState();});
  assert.equal(await page.evaluate(()=>parseStateText(serializeState()).target.gameName),'Manual Game');
  await page.reload();
  assert.equal(await page.title(),'Release Queue · Manual Game');
  assert.deepEqual(await page.evaluate(()=>queue),before.queue);
  await page.locator('#gamePicker > summary').click();
  await page.locator('#resetGame').click();
  assert.equal(await page.title(),'Release Queue · Grand Theft Auto VI');
  await page.locator('#importFile').setInputFiles({name:'queue.md',mimeType:'text/markdown',buffer:Buffer.from(save)});
  await page.waitForFunction(()=>document.title === 'Release Queue · Manual Game');
  const unchanged=await page.evaluate(()=>serializeState().split('Saved ')[0]);
  const invalid=save.replace(/<!-- queue-target:v1 [^\s]+ -->/,'<!-- queue-target:v1 %bad -->');
  await page.locator('#importFile').setInputFiles({name:'bad.md',mimeType:'text/markdown',buffer:Buffer.from(invalid)});
  await page.waitForFunction(()=>$('saveState').textContent.includes('Could not load'));
  assert.equal(await page.evaluate(()=>serializeState().split('Saved ')[0]),unchanged);
  await page.locator('#gameSearch').fill('Unannounced');
  await page.locator('#gameSearchButton').click();
  await page.locator('.game-result').nth(1).click();
  await page.waitForFunction(()=>$('gameSearchStatus').textContent.includes('needs a release date'));
  assert.equal(await page.locator('#targetGameDate').inputValue(),'');
  assert.equal(await page.locator('#useGame').isDisabled(),true);
  await page.locator('#targetGameDate').fill('2032-03-04');
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>SITE_CONFIG.dateLabel),'Your planned release date');
  await page.locator('#gameSearch').fill('Offline');
  await page.locator('#gameSearchButton').click();
  await page.waitForFunction(()=>$('gameSearchStatus').textContent.includes('unavailable'));
  assert.equal(await page.locator('#useGame').isEnabled(),true);
  // A stale response must not replace a user's newer manual draft.
  await page.evaluate(async()=>{
    const previous=jget;
    let release;
    jget=()=>new Promise(resolve=>{release=resolve;});
    const pending=pickReleaseGame({id:'Q999',label:'Stale Game'});
    $('targetGameName').value='New manual game';
    $('targetGameName').dispatchEvent(new Event('input'));
    $('targetGameDate').value='2033-05-06';
    $('targetGameDate').dispatchEvent(new Event('input'));
    release({entities:{Q999:{claims:{P577:[]}}}});
    await pending; jget=previous;
  });
  assert.equal(await page.locator('#targetGameName').inputValue(),'New manual game');
  assert.equal(await page.locator('#targetGameDate').inputValue(),'2033-05-06');
  for(const width of [320,390,768,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }

  console.log(`Game picker passed: ${url.startsWith('file:') ? 'direct file' : 'static HTTP'}`);
}).catch(error=>{console.error(error);process.exitCode=1;});
