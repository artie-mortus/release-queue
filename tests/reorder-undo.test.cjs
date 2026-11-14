const assert = require('node:assert/strict');
const {runBrowserSuite} = require('./browser-fixture.cjs');
const names=page => page.evaluate(() => queue.map(item => item.name));

runBrowserSuite({contextOptions:{reducedMotion:'reduce'}},async ({page,url}) => {
  await page.goto(url);
  await page.evaluate(() => ['A','B','C'].forEach(name => addToQueue({name,kind:'Movie',hours:2})));
  await page.locator('[data-drag-index="0"]').press('ArrowDown');
  assert.deepEqual(await names(page),['B','A','C']);
  await page.locator('#undo').click();
  assert.deepEqual(await names(page),['A','B','C'],'Undo restores order without removing the last addition');
  const before=await page.evaluate(() => undoStack.length);
  await page.locator('[data-next="2"]').click();
  assert.equal(await page.evaluate(() => undoStack.length),before+1,'Move to next creates one checkpoint');
  await page.locator('#undo').click();
  assert.deepEqual(await names(page),['A','B','C']);
  await page.locator('[data-drag-index="0"]').click();
  assert.equal(await page.evaluate(() => undoStack.length),before,'A click without movement does not create Undo');
  // Drive two moves through the real pointer handlers; the whole drag is one Undo.
  await page.evaluate(() => {
    const handle=$('queue').querySelector('[data-drag-index="0"]');
    handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:7,pointerType:'mouse'}));
    for(const index of [1,2]){
      const box=$('queue').querySelector(`[data-item-index="${index}"]`).getBoundingClientRect();
      document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:7,
        clientX:box.left+box.width/2,clientY:box.bottom-2}));
    }
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7}));
  });
  assert.deepEqual(await names(page),['B','C','A']);
  assert.equal(await page.evaluate(() => undoStack.length),before+1,'A multi-row drag creates one checkpoint');
  await page.locator('#undo').click();
  assert.deepEqual(await names(page),['A','B','C']);
  await page.evaluate(() => addToQueue({name:'Book',kind:'Book',hours:2,
    book:{pages:200,pagesPerHour:190,pinned:false,progress:50}}));
  const readingUndo=await page.evaluate(() => undoStack.length);
  await page.locator('[data-book-progress]').fill('');
  await page.locator('[data-book-progress]').press('Enter');
  assert.equal(await page.evaluate(() => queue[3].book.progress),50,'Blank input retains reading progress');
  assert.equal(await page.locator('[data-book-progress]').inputValue(),'50');
  assert.equal(await page.evaluate(() => undoStack.length),readingUndo);
  await page.locator('[data-book-progress]').fill('0');
  await page.locator('[data-book-progress]').press('Enter');
  assert.equal(await page.evaluate(() => queue[3].book.progress),0,'An explicit zero still resets progress');
  console.log('PASS reorder Undo and blank reading progress',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error => {console.error(error);process.exitCode=1;});
