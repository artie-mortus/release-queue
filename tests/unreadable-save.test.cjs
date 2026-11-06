const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

// An autosave that fails validation must survive the next edit, and the edits
// that used to produce one must now load again.
const unreadable = `# Release Queue

<!-- queue-save:v1 -->

## Schedule

- Schedule mode: simple
- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-22
- Job hours: 0
- Job starts: 2026-09-22
- YouTube per: day
- YouTube amount: 0

## Queue

| Item | Kind | Hours | Detail | Metadata |
| --- | --- | --- | --- | --- |
| Precious item | Movie | 2 | | ${encodeURIComponent('{"runtimeScale":null}')} |
`;

(async () => {
  await runBrowserSuite({}, async ({url, page}) => {
    await page.addInitScript(text => {
      if(sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('gta-queue.v1', text);
    }, unreadable);
    await page.goto(url);
    await page.waitForFunction(() => booted);
    assert.match(await page.locator('#saveState').textContent(), /could not be read\. Invalid estimate details for Precious item\. A copy is kept in Settings\./);
    assert.equal(await page.locator('#storageNotice').isVisible(), true);
    assert.equal(await page.evaluate(() => queue.length), 0);

    await page.evaluate(() => addToQueue({name:'New thing', kind:'Movie', hours:1}));
    await page.evaluate(() => flushSave());
    assert.equal(await page.evaluate(() => localStorage.getItem('gta-queue.v1.unreadable')), unreadable,
      'The unreadable save is kept after the next autosave');

    await page.reload();
    await page.waitForFunction(() => booted);
    await goToView(page, 'settings');
    assert.equal(await page.locator('#unreadableSave').isVisible(), true, 'The kept copy is offered on later visits');
    const download = page.waitForEvent('download');
    await page.locator('#downloadUnreadable').click();
    const file = await download;
    assert.equal(file.suggestedFilename(), 'release-queue-unreadable.md');
    assert.equal(require('node:fs').readFileSync(await file.path(), 'utf8'), unreadable);

    await page.locator('#discardUnreadable').click();
    assert.equal(await page.locator('#unreadableSave').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('gta-queue.v1.unreadable')), null);
  });

  await runBrowserSuite({}, async ({url, page}) => {
    await page.addInitScript(text => {
      if(sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('gta-queue.v1', text);
      // Leave no room for a second copy, so keeping the unreadable save fails.
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value){
        if(key.endsWith('.unreadable')) throw new DOMException('Full', 'QuotaExceededError');
        return setItem.call(this, key, value);
      };
    }, unreadable);
    await page.goto(url);
    await page.waitForFunction(() => booted);
    assert.match(await page.locator('#saveState').textContent(), /Autosave is paused/);
    await page.evaluate(() => { addToQueue({name:'New thing', kind:'Movie', hours:1}); flushSave(); });
    assert.equal(await page.evaluate(() => localStorage.getItem('gta-queue.v1')), unreadable,
      'Without a kept copy, autosave must not overwrite the unreadable save');
    assert.match(await page.locator('#saveState').textContent(), /could not be saved locally/);
    await goToView(page, 'settings');
    const download = page.waitForEvent('download');
    await page.locator('#downloadUnreadable').click();
    assert.equal(require('node:fs').readFileSync(await (await download).path(), 'utf8'), unreadable);
  });

  await runBrowserSuite({clockDate:'2026-11-21T12:00:00-06:00'}, async ({url, page}) => {
    await page.goto(url);
    await page.waitForFunction(() => booted);
    // A podcast with nothing left to scale once projected growth ends at release.
    await page.evaluate(() => addToQueue({name:'Short podcast', kind:'Podcast', hours:2,
      pod:{eps:1, avgMin:2, perWeek:0, ongoing:false, pinned:false, backlog:0}}));
    await page.locator('[data-hours="0"]').fill('5');
    await page.locator('[data-hours="0"]').press('Tab');
    await page.evaluate(() => flushSave());
    await page.reload();
    await page.waitForFunction(() => booted);
    assert.deepEqual(await page.evaluate(() => [queue.length, queue[0]?.hours, queue[0]?.pod.pinned]), [1, 5, true]);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });

// Item notes pluralize season and episode counts.
runBrowserSuite({}, async ({url, page}) => {
  await page.goto(url);
  await page.waitForFunction(() => booted);
  const note = seasons => page.evaluate(n => itemNote({kind:'Show', show:{watched:1,
    episodes:Array.from({length:n * 2}, (_, i) => ({season:Math.floor(i / 2) + 1, number:i % 2 + 1, seconds:1800}))}}), seasons);
  assert.match(await note(1), /^Show · 1 season · 1 watched · 1 episode left$/);
  assert.match(await note(2), /^Show · 2 seasons · 1 watched · 3 episodes left$/);
}).catch(error => { console.error(error); process.exitCode = 1; });
