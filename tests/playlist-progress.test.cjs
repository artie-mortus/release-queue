const {runBrowserSuite} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');

runBrowserSuite({contextOptions:{reducedMotion:'reduce'}}, async ({url,page}) => {
  await page.goto(url);
  await page.evaluate(() => {
    addToQueue({name:'Playlist', hours:3, kind:'YouTube', youtube:{
      url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',
      playlistId:'PL1234567890abcdef', durations:[1800, 3600, 5400], watched:0, checkedAt:Date.now()
    }});
    addToQueue({name:'Next movie', hours:2, kind:'Movie'});
    $('ytAmount').value = '0.5';
    render();
    document.getAnimations().forEach(animation => animation.finish());
    window.originalRows = [...$('queue').children];
    window.progressRequests = 0;
    const original = readPlaylistDurations;
    readPlaylistDurations = (...args) => { progressRequests++; return original(...args); };
  });
  const watched = page.locator('[data-youtube-count="0"]');
  await watched.focus();
  await page.evaluate(() => { window.watchedField = document.activeElement; });
  await watched.press('ArrowUp');
  assert.equal(await page.evaluate(() => queue[0].youtube.watched), 1);
  assert.equal(await page.evaluate(() => queue[0].hours), 2.5);
  assert.equal(await page.evaluate(() => watchedField.isConnected), true,
    'An arrow click must keep the watched field mounted, without replaying the row entrance');
  assert.equal(await page.evaluate(() => document.activeElement === watchedField), true);
  assert.equal(await page.locator('[data-hours="0"]').inputValue(), '2.5');
  assert.match(await page.locator('[data-item-index="0"] small').textContent(), /1 watched/);
  assert.equal(await page.evaluate(() => originalRows.every((row, i) => row === $('queue').children[i])), true);
  assert.deepEqual(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running')
    .map(a => a.animationName)), [], 'Progress updates must not start any fades');
  // Repeated keyboard steps must work without refocusing the field.
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => queue[0].youtube.watched), 2);
  assert.equal(await page.locator('[data-hours="0"]').inputValue(), '1.5');
  await page.keyboard.press('ArrowDown');
  assert.equal(await watched.inputValue(), '1');
  assert.equal(await page.locator('[data-hours="0"]').inputValue(), '2.5');
  // Clicking the native number spinner follows the same path.
  const box = await watched.boundingBox();
  await watched.click({position:{x:box.width - 8, y:box.height / 4}});
  assert.equal(await watched.inputValue(), '2');
  assert.equal(await page.evaluate(() => document.activeElement === watchedField), true);
  await page.keyboard.press('ArrowDown');
  // Empty, invalid, and unchanged edits must not alter progress or Undo.
  const historyLength = await page.evaluate(() => undoStack.length);
  for(const value of ['', '-1', '4', '1.5', '1']) {
    await watched.fill(value);
    await watched.press('Enter');
    assert.equal(await watched.inputValue(), '1');
    assert.equal(await page.evaluate(() => undoStack.length), historyLength);
  }
  // Custom runtime corrections still scale progress and update the forecast.
  await page.locator('[data-hours="0"]').fill('5');
  await page.locator('[data-hours="0"]').press('Enter');
  await watched.press('ArrowUp');
  assert.equal(await page.locator('[data-hours="0"]').inputValue(), '3');
  const forecast = await page.evaluate(() => {
    const snapshot = () => ({total:$('total').textContent,
      timeline:[...$('track').querySelectorAll('.seg')].map(el => ({label:el.getAttribute('aria-label'),
        left:Number(parseFloat(el.style.left).toFixed(4)), width:Number(parseFloat(el.style.width).toFixed(4))})),
      weeks:[...$('queue').querySelectorAll('.wk')].map(el => el.textContent),
      recurring:$('queue').querySelector('.item--yt .hours').textContent});
    const before = snapshot();
    render({forceQueue:true, animate:false});
    return {before, after:snapshot()};
  });
  assert.deepEqual(forecast.before, forecast.after);
  // Autosave, export, Undo, and completion retain their existing semantics.
  await page.waitForFunction(() => !savePending);
  assert.equal(await page.evaluate(() => parseStateText(localStorage.getItem(STORE_KEY)).queue[0].youtube.watched), 2);
  assert.equal(await page.evaluate(() => parseStateText(serializeState()).queue[0].hours), 3);
  await page.locator('#undo').click();
  assert.equal(await watched.inputValue(), '1');
  assert.equal(await page.locator('[data-hours="0"]').inputValue(), '5');
  await watched.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => queue.length), 1);
  assert.equal(await page.evaluate(() => completed[0].youtube.watched), 2);
  assert.equal(await page.evaluate(() => completed[0].hours), 3);
  assert.deepEqual(await page.evaluate(() => $('queue').getAnimations({subtree:true})
    .filter(a => a.playState === 'running').map(a => a.animationName)), []);
  await page.locator('#undo').click();
  assert.equal(await watched.inputValue(), '2');
  assert.equal(await page.evaluate(() => completed.length), 0);
  assert.equal(await page.evaluate(() => progressRequests), 0);

  console.log('PASS playlist progress', url.startsWith('file:') ? 'direct file' : 'static HTTP');

}).catch(error => { console.error(error); process.exitCode = 1; });
