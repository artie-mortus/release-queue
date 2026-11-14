const assert = require('node:assert/strict');
const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');
const standard = '9P3H4968GRSM', deluxe = '9NNZSNHLR63L', underlying = '9NL3WWNZLZZN';
const release = market => ({US:'2026-11-19T05:00:00Z',GB:'2026-11-19T00:00:00Z',NZ:'2026-11-18T11:00:00Z'}[market]);
function product(id,title,market,instant,platform='Windows.Xbox'){
  return {ProductId:id,ProductType:'Game',Properties:{},LocalizedProperties:[{ProductTitle:title,Markets:[market]}],
    DisplaySkuAvailabilities:[{Sku:{SkuType:'full',Properties:{IsPreOrder:true}},Availabilities:[{
      Markets:[market],Actions:['Purchase'],Properties:{PreOrderReleaseDate:instant},
      Conditions:{StartDate:'2026-06-25T04:00:00Z',ClientConditions:{AllowedPlatforms:[{PlatformName:platform}]}}
    }]}]};
}
runBrowserSuite({contextOptions:{reducedMotion:'reduce'},network:async({page})=>{
  await page.route('https://displaycatalog.mp.microsoft.com/**',async route=>{
    const url = new URL(route.request().url()), market = url.searchParams.get('market');
    const name = url.searchParams.get('query') || 'Grand Theft Auto VI';
    const data = url.pathname.endsWith('autosuggest') ? {Results:[{ProductFamilyName:'Games',Products:[
      {ProductId:deluxe,Title:name + ': Ultimate Edition',Type:'Game'},
      {ProductId:standard,Title:name,Type:'Game'}, {ProductId:underlying,Title:name,Type:'Game'}]}]}
      : {Products:[product(standard,'Grand Theft Auto VI',market,release(market)),
        product(underlying,'Grand Theft Auto VI',market,'9998-12-30T00:00:00Z')]};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
}},async({page,url})=>{
  await page.goto(url);
  assert.deepEqual(await page.evaluate(()=>[
    detectReleaseMarket('America/Chicago',['en-GB']),detectReleaseMarket('Europe/London',['en-US']),
    detectReleaseMarket('Europe/Warsaw',['en-US']),detectReleaseMarket('Asia/Tokyo',['en-US']),
    detectReleaseMarket('Etc/UTC',['en-NZ']),detectReleaseMarket('Etc/UTC',['en'])]),['US','GB','PL','JP','NZ','']);
  await page.waitForFunction(()=>SITE_CONFIG.releaseEvidence?.provider === 'xbox');
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2026-11-19T05:00:00.000Z');
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseContext.market),'US');
  assert.match(await page.locator('#releaseCaption').textContent(),/November 18, 2026.*11:00.*PM/);
  assert.match(await page.locator('#targetLabel').textContent(),/Xbox.*United States/);
  await page.evaluate(()=>{addToQueue({name:'Keep my queue',kind:'Movie',hours:20});flushSave();});
  await goToView(page,'settings');
  await page.locator('#gamePicker > summary').click();
  assert.equal(await page.locator('#autoReleaseTime').isChecked(),true);
  assert.match(await page.locator('#releaseLookupStatus').textContent(),/local-midnight wording/);
  assert.match(await page.locator('#releaseTimeSource').getAttribute('href'),new RegExp(standard));

  await page.locator('#targetReleaseMarket').selectOption('NZ');
  await page.waitForFunction(()=>gameDraftEvidence && $('targetGameDate').value === '2026-11-18' && !autoReleaseController);
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2026-11-18T11:00:00.000Z');
  const save = await page.evaluate(()=>{flushSave();return serializeState();});
  assert.equal(await page.evaluate(()=>parseStateText(serializeState()).target.releaseContext.market),'NZ');
  assert.equal(await page.evaluate(()=>queue[0].name),'Keep my queue');
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseContext.market),'US');
  await page.locator('#importFile').setInputFiles({name:'release.md',mimeType:'text/markdown',buffer:Buffer.from(save)});
  await page.waitForFunction(()=>SITE_CONFIG.releaseContext.market === 'NZ');
  await page.reload();
  await page.locator('#gamePicker > summary').click();
  await page.waitForFunction(()=>!autoReleaseController);
  assert.equal(await page.locator('#targetReleaseMarket').inputValue(),'NZ');
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2026-11-18T11:00:00.000Z');

  // A failed refresh retains a previously saved release timestamp and source.
  await page.evaluate(()=>{const original=jget;jget=()=>Promise.reject(new Error('Offline'));window.restoreReleaseFetch=()=>{jget=original;};});
  await page.locator('#lookupReleaseTime').click();
  await page.waitForFunction(()=>$('releaseLookupStatus').textContent.includes('Keeping the saved schedule'));
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2026-11-18T11:00:00.000Z');
  await page.evaluate(()=>restoreReleaseFetch());

  // PC/Steam never borrows the Xbox console timestamp.
  await page.locator('#targetReleasePlatform').selectOption('pc');
  await page.waitForFunction(()=>$('releaseLookupStatus').textContent.includes('unconfirmed'));
  assert.equal(await page.locator('#targetReleaseMode').inputValue(),'date');
  assert.equal(await page.locator('#releaseTimeSource').isVisible(),false);
  await page.locator('#targetGameName').fill('Starfield');
  await page.locator('#lookupReleaseTime').click();
  await page.waitForFunction(()=>gameDraftEvidence?.provider === 'publisher');
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2023-09-06T00:00:00.000Z');
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseContext.platform),'pc');
  assert.match(await page.locator('#releaseTimeSource').getAttribute('href'),/bethesda\.net/);

  // PlayStation uses its own verified market listing; no blocked Sony fetch.
  await page.locator('#targetReleasePlatform').selectOption('ps5');
  await page.locator('#targetReleaseMarket').selectOption('US');
  await page.locator('#targetGameName').fill('Grand Theft Auto VI');
  await page.locator('#lookupReleaseTime').click();
  await page.waitForFunction(()=>gameDraftEvidence?.provider === 'playstation');
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2026-11-19T05:00:00.000Z');
  assert.match(await page.locator('#targetLabel').textContent(),/PlayStation 5/);

  // Cancelling a lookup by typing must reject even a provider's late response.
  await page.evaluate(async()=>{
    const original=findReleaseSchedules;
    let finish;
    findReleaseSchedules=()=>new Promise(resolve=>{finish=resolve;});
    const pending=lookupReleaseTime();
    $('targetGameName').value='My manual plan'; $('targetGameName').dispatchEvent(new Event('input'));
    finish([{instant:'2035-01-01T04:00:00Z',mode:'regional',evidence:{provider:'xbox'}}]);
    await pending; findReleaseSchedules=original;
  });
  assert.equal(await page.locator('#targetGameName').inputValue(),'My manual plan');
  assert.equal(await page.locator('#targetReleaseMode').inputValue(),'date');
  assert.equal(await page.evaluate(()=>gameDraftEvidence),null);
  // Selecting a game looks up its time even if the day-only source is offline.
  await page.evaluate(async()=>{
    $('targetReleasePlatform').value='xbox'; $('targetReleaseMarket').value='US'; $('autoReleaseTime').checked=true;
    const original=jget;
    jget=(url,...args)=>url.includes('wikidata.org') ? Promise.reject(new Error('Offline')) : original(url,...args);
    try{await pickReleaseGame({id:'Q23648408',label:'Grand Theft Auto VI'});}finally{jget=original;}
  });
  assert.equal(await page.evaluate(()=>gameDraftEvidence?.provider),'xbox');
  assert.equal(await page.locator('#useGame').isEnabled(),true);
  assert.match(await page.locator('#gameSearchStatus').textContent(),/Release schedule found/);
  for(const width of [320,390,768,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  }
  console.log('PASS automatic release lookup, markets, platform isolation and saved evidence',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
