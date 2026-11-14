const assert = require('node:assert/strict');
const {runBrowserSuite} = require('./browser-fixture.cjs');

runBrowserSuite({},async ({page,url}) => {
  await page.goto(url);
  await page.evaluate(() => {
    useReleaseTarget({gameName:'Example',gameShortName:'Example',releaseDate:'2026-12-01',dateLabel:'Planning date'});
    addToQueue({name:'Weekly show',kind:'Podcast',hours:20,
      pod:{eps:10,avgMin:60,perWeek:1,ongoing:true,pinned:false,backlog:10}});
    flushSave();
  });
  assert.equal(await page.evaluate(() => queue[0].hours),20);
  await page.clock.setFixedTime(new Date('2026-09-29T12:00:00-05:00'));
  await page.evaluate(() => render({animate:false}));
  assert.equal(await page.evaluate(() => queue[0].hours),20,'New episodes remain in the projected backlog as time passes');
  assert.equal(await page.evaluate(() => queue[0].pod.asOf),'2026-09-22');
  await page.evaluate(() => flushSave());
  const backup=await page.evaluate(() => serializeState());
  await page.reload();
  assert.equal(await page.evaluate(() => queue[0].hours),20);
  await page.locator('#importFile').setInputFiles({name:'podcast.md',mimeType:'text/markdown',buffer:Buffer.from(backup)});
  await page.waitForFunction(() => queue[0]?.pod.asOf === '2026-09-22');
  assert.equal(await page.evaluate(() => queue[0].hours),20);
  await page.evaluate(() => useReleaseTarget({...currentReleaseTarget(),releaseDate:'2026-12-08'}));
  assert.equal(await page.evaluate(() => queue[0].hours),21,'Changing targets uses the original feed date');
  await page.evaluate(() => { setRemainingEstimate(queue[0],10); flushSave(); });
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00-05:00'));
  await page.evaluate(() => render({animate:false}));
  assert.equal(await page.evaluate(() => queue[0].hours),10,'Runtime corrections remain stable');
  const legacy=backup.replace(/;asof=2026-09-22/g,'');
  await page.locator('#importFile').setInputFiles({name:'legacy.md',mimeType:'text/markdown',buffer:Buffer.from(legacy)});
  await page.waitForFunction(() => queue[0]?.pod.asOf === '2026-10-06');
  const migrated=await page.evaluate(() => { flushSave(); return queue[0].hours; });
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00-05:00'));
  await page.reload();
  assert.equal(await page.evaluate(() => queue[0].hours),migrated,'Legacy snapshots are anchored once and persisted');
  console.log('PASS podcast snapshot stability',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error => {console.error(error);process.exitCode=1;});
