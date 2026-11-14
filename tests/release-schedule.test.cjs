const assert = require('node:assert/strict');
const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');

runBrowserSuite({contextOptions:{reducedMotion:'reduce'}},async({page,url,context}) => {
  await page.goto(url);
  assert.match(await page.locator('#releaseCaption').textContent(),/time unconfirmed/);
  await page.evaluate(()=>addToQueue({name:'Keep my queue',kind:'Movie',hours:10}));
  await goToView(page,'settings');
  await page.locator('#gamePicker > summary').click();
  await page.locator('#targetGameName').fill('Regional game');
  await page.locator('#targetGameDate').fill('2030-06-15');
  await page.locator('#targetReleaseMode').selectOption('regional');
  assert.equal(await page.locator('#targetReleaseZone').inputValue(),'America/Chicago');
  await page.locator('#targetReleaseZone').fill('America/New_York');
  assert.match(await page.locator('#releaseSchedulePreview').textContent(),/June 14, 2030/);
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2030-06-15T04:00:00.000Z');
  assert.match(await page.locator('#releaseCaption').textContent(),/June 14, 2030.*11:00.*PM/);
  const save = await page.evaluate(()=>{flushSave(); return serializeState();});
  assert.match(save,/00:00 America\/New_York, regional unlock/);
  await page.reload();
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2030-06-15T04:00:00.000Z');
  assert.equal(await page.evaluate(()=>queue[0].name),'Keep my queue');
  await page.locator('#gamePicker > summary').click();
  assert.equal(await page.locator('#targetReleaseMode').inputValue(),'regional');
  await page.locator('#targetReleaseMode').selectOption('global');
  await page.locator('#targetReleaseTime').fill('04:00');
  await page.locator('#targetReleaseZone').fill('UTC');
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>TARGET.toISOString()),'2030-06-15T04:00:00.000Z');
  assert.match(await page.locator('#targetLabel').textContent(),/Worldwide release/);
  const worldwideSave = await page.evaluate(()=>serializeState());
  const otherContext = await context.browser().newContext({timezoneId:'Asia/Tokyo'});
  try{
    await otherContext.route(/^https:\/\//,route=>route.abort());
    const otherPage = await otherContext.newPage();
    await otherPage.goto(url);
    for(const [portable,mode] of [[worldwideSave,'global'],[save,'regional']]){
      await otherPage.locator('#importFile').setInputFiles({name:'schedule.md',mimeType:'text/markdown',buffer:Buffer.from(portable)});
      await otherPage.waitForFunction(mode=>SITE_CONFIG.gameName === 'Regional game' && SITE_CONFIG.releaseSchedule.mode === mode,mode);
      assert.equal(await otherPage.evaluate(()=>TARGET.toISOString()),'2030-06-15T04:00:00.000Z');
      assert.equal(await otherPage.evaluate(()=>TARGET.getHours()),13);
    }
  }finally{ await otherContext.close(); }
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseSchedule.mode),'regional');
  await page.locator('#resetGame').click();
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseSchedule),undefined);
  await page.locator('#importFile').setInputFiles({name:'regional.md',mimeType:'text/markdown',buffer:Buffer.from(save)});
  await page.waitForFunction(()=>SITE_CONFIG.gameName === 'Regional game');
  assert.equal(await page.locator('#targetReleaseZone').inputValue(),'America/New_York');

  // Invalid and ambiguous regional times must never silently replace the target.
  await page.locator('#targetReleaseZone').fill('Mars/Olympus');
  assert.equal(await page.locator('#useGame').isDisabled(),true);
  await page.locator('#targetReleaseZone').fill('America/Chicago');
  await page.locator('#targetGameDate').fill('2026-11-01');
  await page.locator('#targetReleaseTime').fill('01:30');
  assert.equal(await page.locator('#useGame').isDisabled(),true);
  await page.locator('#targetGameDate').fill('2026-03-08');
  await page.locator('#targetReleaseTime').fill('02:30');
  assert.equal(await page.locator('#useGame').isDisabled(),true);
  await page.locator('#targetGameDate').fill('2026-09-22');
  await page.locator('#targetReleaseTime').fill('13:00');
  // The forecast follows the current time. Pin noon before checking exactly
  // one remaining hour so slower CI runners cannot consume part of it.
  await page.clock.setFixedTime(new Date('2026-09-22T17:00:00Z'));
  await page.locator('#useGame').click();
  const forecast = await page.evaluate(()=>{
    $('scheduleMode').value='simple'; $('paceInput').value=168; $('ytAmount').value=0;
    $('grassHours').value=0; render({animate:false});
    return {capacity:currentForecast().capacity,days:computationContext().daysLeft};
  });
  assert.ok(Math.abs(forecast.capacity - 1) < 0.001,JSON.stringify(forecast));
  assert.ok(Math.abs(forecast.days - 13/24) < 0.001);
  await page.evaluate(()=>{queue[0].hours=0.5; render({animate:false});});
  assert.equal(await page.locator('#buffer').textContent(),'0.5 hours');
  assert.notEqual(await page.locator('#signal').textContent(),'Right on time');
  await page.clock.setFixedTime(new Date('2026-09-22T17:59:59Z'));
  await page.evaluate(()=>render({animate:false}));
  assert.equal(await page.locator('#cd-s').textContent(),'01');
  await page.clock.setFixedTime(new Date('2026-09-22T18:00:00Z'));
  await page.evaluate(()=>renderCountdown());
  assert.equal(await page.locator('#signal').textContent(),'The target date is here');
  assert.match(await page.locator('#countdownTitle').textContent(),/target reached/);
  assert.equal(await page.evaluate(()=>currentForecast().capacity),0);

  // Switching games clears the previous game's schedule; date-only stays usable.
  await page.locator('#targetGameName').fill('Next game');
  assert.equal(await page.locator('#targetReleaseMode').inputValue(),'date');
  await page.locator('#targetGameDate').fill('2031-01-02');
  await page.locator('#useGame').click();
  assert.equal(await page.evaluate(()=>TARGET.getHours()),0);
  assert.equal(await page.evaluate(()=>SITE_CONFIG.releaseSchedule),undefined);
  for(const width of [320,390,768,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  }
  console.log('PASS regional and worldwide release schedules',url.startsWith('file:') ? 'direct file' : 'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
