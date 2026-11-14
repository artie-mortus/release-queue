const assert = require('node:assert/strict');
const {runBrowserSuite} = require('./browser-fixture.cjs');

runBrowserSuite({},async ({page,url,context}) => {
  await page.goto(url);
  await page.evaluate(() => {addToQueue({name:'Original',kind:'Movie',hours:2});flushSave();});
  for(const id of ['jobHours','ytAmount']){
    const parsed=await page.evaluate(id => {
      $(id).value=''; $(id).dispatchEvent(new Event('input',{bubbles:true}));
      flushSave(); return parseStateText(localStorage.getItem(STORE_KEY));
    },id);
    assert.equal(parsed.ok,true,`An empty ${id} must save its effective zero value`);
    assert.equal(Number(parsed.schedule[id === 'jobHours' ? 'jobHours' : 'ytAmount']),0);
  }
  const dates=await page.evaluate(() => {
    $('startDate').value=''; $('jobStart').value=''; render(); flushSave();
    return parseStateText(localStorage.getItem(STORE_KEY));
  });
  assert.equal(dates.ok,true,'Incomplete date edits must save the effective planning dates');
  await page.reload();
  assert.equal(await page.evaluate(() => queue[0].name),'Original');
  assert.equal(await page.evaluate(() => localStorage.getItem(UNREADABLE_KEY)),null);

  const second=await context.newPage();
  try{
    await second.clock.install({time:new Date('2026-09-22T12:00:00-05:00')});
    await second.goto(url);
    await page.evaluate(() => {
      const write=Storage.prototype.setItem;
      window.restoreStorageWrite=() => {Storage.prototype.setItem=write;};
      Storage.prototype.setItem=function(key,value){
        if(key === STORE_KEY) throw new DOMException('Full','QuotaExceededError');
        return write.call(this,key,value);
      };
      addToQueue({name:'Unsaved local',kind:'Movie',hours:1}); flushSave();
    });
    assert.match(await page.locator('#saveState').textContent(),/Could not save locally/);
    await second.evaluate(() => {addToQueue({name:'Remote edit',kind:'Movie',hours:1});flushSave();});
    await page.evaluate(() => syncSavedState());
    assert.deepEqual(await page.evaluate(() => queue.map(item => item.name)),['Original','Unsaved local'],
      'A failed write must not allow automatic replacement of unsaved local changes');
    assert.equal(await page.evaluate(() => saveConflict),true);
    assert.match(await second.evaluate(() => localStorage.getItem(STORE_KEY)),/Remote edit/);
    await page.evaluate(() => restoreStorageWrite());
    await page.locator('#keepTabSave').click();
    assert.equal(await page.evaluate(() => savePending),false);
    assert.match(await page.evaluate(() => localStorage.getItem(STORE_KEY)),/Unsaved local/);
    assert.doesNotMatch(await page.evaluate(() => localStorage.getItem(STORE_KEY)),/Remote edit/);
  }finally{await second.close();}
  console.log('PASS save normalization and failed-write conflicts',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error => {console.error(error);process.exitCode=1;});
