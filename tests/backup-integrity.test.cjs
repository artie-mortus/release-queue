const assert = require('node:assert/strict');
const {runBrowserSuite} = require('./browser-fixture.cjs');

runBrowserSuite({},async ({page,url}) => {
  await page.goto(url);
  const intact=await page.evaluate(() => {
    addToQueue({name:'First',kind:'Movie',hours:2});
    addToQueue({name:'Second',kind:'Movie',hours:3});
    completed=[{name:'Archived',kind:'Movie',hours:1,completedAt:'2026-09-21'}];
    saveState(); flushSave();
    return localStorage.getItem(STORE_KEY);
  });
  for(const damaged of [intact.slice(0,intact.indexOf('| Second')+8),
    intact.slice(0,intact.indexOf('## Completed'))]){
    await page.locator('#importFile').setInputFiles({name:'truncated.md',mimeType:'text/markdown',buffer:Buffer.from(damaged)});
    await page.waitForFunction(() => $('saveState').textContent.includes('Could not load truncated.md'));
    assert.deepEqual(await page.evaluate(() => queue.map(item => item.name)),['First','Second']);
    assert.equal(await page.evaluate(() => completed.length),1);
    assert.equal(await page.evaluate(() => localStorage.getItem(STORE_KEY)),intact);
  }
  const damaged=intact.slice(0,intact.indexOf('| Second')+8);
  await page.evaluate(text => localStorage.setItem(STORE_KEY,text),damaged);
  await page.reload();
  assert.equal(await page.evaluate(() => queue.length),0,'A partial autosave is not silently accepted');
  assert.equal(await page.evaluate(() => localStorage.getItem(UNREADABLE_KEY)),damaged);
  await page.evaluate(() => {addToQueue({name:'New item',kind:'Movie',hours:1});flushSave();});
  assert.equal(await page.evaluate(() => localStorage.getItem(UNREADABLE_KEY)),damaged,'Recovery copy survives later edits');
  console.log('PASS backup integrity',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error => {console.error(error);process.exitCode=1;});
