const {runBrowserSuite} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

// Two tabs share one autosave. A tab must never silently replace a save that
// another tab wrote after it last read or wrote one.
const names = page => page.evaluate(() => queue.map(item => item.name));
const saved = page => page.evaluate(() => localStorage.getItem('gta-queue.v1'));

runBrowserSuite({}, async ({url, context, page: first}) => {
  await first.goto(url);
  await first.waitForFunction(() => booted);
  await first.evaluate(() => { addToQueue({name:'Original', kind:'Movie', hours:2}); flushSave(); });

  const second = await context.newPage();
  const errors = [];
  second.on('pageerror', error => errors.push(error.message));
  await second.clock.install({time:new Date('2026-09-22T12:00:00-05:00')});
  await second.goto(url);
  await second.waitForFunction(() => booted);
  assert.deepEqual(await names(second), ['Original']);

  // A tab with nothing unsaved follows the other tab's save without writing back.
  await first.evaluate(() => { addToQueue({name:'From first', kind:'Movie', hours:1}); flushSave(); });
  await second.evaluate(() => window.dispatchEvent(new Event('focus')));
  await second.waitForFunction(() => queue.some(item => item.name === 'From first'));
  const followed = await saved(first);
  await second.waitForTimeout(800);
  assert.equal(await saved(first), followed, 'Following another tab does not trigger a save back');
  assert.equal(await second.locator('#storageNotice').isVisible(), false);

  // Both tabs change the queue. The later write is refused and explained.
  await second.evaluate(() => addToQueue({name:'From second', kind:'Movie', hours:1}));
  await first.evaluate(() => { addToQueue({name:'Also first', kind:'Movie', hours:1}); flushSave(); });
  await second.evaluate(() => flushSave());
  await second.locator('#storageNotice').waitFor();
  assert.match(await saved(first), /Also first/);
  assert.doesNotMatch(await saved(first), /From second/, 'The stale tab did not overwrite the newer save');
  assert.match(await second.locator('#storageNoticeText').textContent(), /another tab/i);
  assert.equal(await second.locator('#loadNewerSave').isVisible(), true);
  assert.equal(await second.locator('#keepTabSave').isVisible(), true);

  // Later edits in the stale tab stay unsaved until the user chooses.
  await second.evaluate(() => { addToQueue({name:'Second again', kind:'Movie', hours:1}); flushSave(); });
  assert.doesNotMatch(await saved(first), /Second again/);

  // Keeping this tab's version replaces the save on purpose. The first tab has
  // an unsaved edit by then, so it becomes the stale one.
  await first.evaluate(() => addToQueue({name:'Lost edit', kind:'Movie', hours:1}));
  await second.locator('#keepTabSave').click();
  await second.waitForFunction(() => /Second again/.test(localStorage.getItem('gta-queue.v1')));
  assert.doesNotMatch(await saved(first), /Also first/);
  assert.equal(await second.locator('#storageNotice').isVisible(), false);

  // The first tab can load the newer save instead, dropping its own edit.
  await first.evaluate(() => flushSave());
  await first.locator('#loadNewerSave').waitFor();
  await first.locator('#loadNewerSave').click();
  assert.deepEqual(await names(first), ['Original', 'From first', 'From second', 'Second again']);
  assert.equal(await first.locator('#storageNotice').isVisible(), false);
  await first.evaluate(() => { addToQueue({name:'After reload', kind:'Movie', hours:1}); flushSave(); });
  assert.match(await saved(first), /After reload/, 'Saving resumes after loading the newer save');

  // A re-save with identical content, such as a day change in both tabs, is not a conflict.
  await second.evaluate(() => window.dispatchEvent(new Event('focus')));
  await second.waitForFunction(() => queue.some(item => item.name === 'After reload'));
  await second.evaluate(() => saveState());
  await first.evaluate(() => { saveState(); flushSave(); });
  await second.evaluate(() => flushSave());
  assert.equal(await second.locator('#storageNotice').isVisible(), false);

  await second.close();
  assert.deepEqual(errors, []);
  console.log(`PASS two-tab saves ${url.startsWith('file:') ? 'direct file' : 'static HTTP'}`);
}).catch(error => { console.error(error); process.exitCode = 1; });
