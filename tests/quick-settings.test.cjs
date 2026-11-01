const {runBrowserSuite,goToView}=require('./browser-fixture.cjs');
const assert=require('node:assert/strict');

runBrowserSuite({contextOptions:{viewport:{width:1440,height:900},reducedMotion:'reduce'}},async({url,page})=>{
  await page.goto(url);
  await page.evaluate(()=>addToQueue({name:'A long game',kind:'Game',hours:50}));
  await page.locator('#quickPace').fill('28');
  await page.locator('#quickPace').press('Enter');
  assert.equal(await page.locator('#paceNumber').inputValue(),'28');
  await page.getByLabel('YouTube time',{exact:true}).fill('1.5');
  assert.equal(await page.evaluate(()=>activeView),'queue','Editing time does not leave the queue');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'quickYoutube','Live updates preserve input focus');
  assert.equal(await page.locator('#ytAmount').inputValue(),'1.5');
  assert.equal(await page.locator('#overviewPace').textContent(),'17.5 h','YouTube is deducted from the budget');
  assert.equal(await page.evaluate(()=>currentForecast().finishDay),20);
  await page.getByLabel('YouTube time unit').selectOption('week');
  assert.equal(await page.locator('#quickYoutube').inputValue(),'10.5');
  assert.equal(await page.locator('#ytAmount').inputValue(),'10.5');
  assert.equal(await page.locator('#ytPerWeek').getAttribute('aria-checked'),'true');
  assert.equal(await page.evaluate(()=>currentForecast().finishDay),20,'Changing units preserves the forecast');
  await page.evaluate(()=>flushSave());
  await page.reload();
  assert.equal(await page.locator('#quickPace').inputValue(),'28');
  assert.equal(await page.locator('#quickYoutube').inputValue(),'10.5');
  assert.equal(await page.locator('#quickYoutubeUnit').inputValue(),'week');
  await page.getByRole('link',{name:'More time settings'}).click();
  await page.waitForFunction(()=>activeView==='plan');
  await page.locator('#ytAmount').fill('14');
  assert.equal(await page.locator('#quickYoutube').inputValue(),'14','Detailed controls update the quick editor');
  await page.locator('#ytPerDay').click();
  assert.equal(await page.locator('#quickYoutube').inputValue(),'2');
  assert.equal(await page.locator('#quickYoutubeUnit').inputValue(),'day');
  await page.locator('#paceNumber').fill('35');
  await page.locator('#paceNumber').press('Enter');
  assert.equal(await page.locator('#quickPace').inputValue(),'35');
  const saved=await page.evaluate(()=>serializeState());
  await goToView(page,'queue');
  await page.locator('#quickYoutube').fill('3');
  await page.locator('#importFile').setInputFiles({name:'queue.md',mimeType:'text/markdown',buffer:Buffer.from(saved)});
  await page.waitForFunction(()=>$('quickYoutube').value==='2');
  await page.locator('#undo').click();
  assert.equal(await page.locator('#quickYoutube').inputValue(),'3','Undo/import synchronize quick settings');
  await page.locator('#quickYoutube').fill('99');
  assert.equal(await page.locator('#quickYoutube').inputValue(),'24');
  assert.match(await page.locator('#signal').textContent(),/No time available/);
  await page.locator('#quickYoutube').fill('');
  await page.locator('#quickYoutube').press('Tab');
  assert.equal(await page.locator('#quickYoutube').inputValue(),'0');
  await page.locator('#quickPace').fill('999');
  assert.equal(await page.locator('#quickPace').inputValue(),'168');
  await goToView(page,'plan');
  await page.locator('#scheduleMode').selectOption('advanced');
  assert.equal(await page.locator('#quickPace').inputValue(),'133','Quick pace respects the advanced schedule ceiling');
  await goToView(page,'queue');
  for(const width of [320,390,768,1100,1280,1440,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
    for(const id of ['quickPace','quickYoutube','quickYoutubeUnit']){
      const bounds=await page.locator(`#${id}`).boundingBox();
      assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width,`${id} fits at ${width}`);
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#quickPace').fill('28');
  await page.locator('#quickYoutube').fill('1');
  await page.locator('#quickYoutube').press('Enter');
  await page.screenshot({path:`/tmp/release-quick-settings-${url.startsWith('file:')?'file':'http'}.png`,fullPage:true});
  console.log('PASS quick time settings',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
