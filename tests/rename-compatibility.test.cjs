const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({},async ({page,url})=>{
  await page.goto(url);
  // Model a pre-rename save, including progress, archive and a saved Undo entry.
  const legacy = await page.evaluate(()=>{
    queue=[{name:'Still playing',kind:'Game',hours:32,game:{total:50,played:18}}];
    completed=[{name:'Finished film',kind:'Movie',hours:2,completedAt:'2026-09-21'}];
    $('paceInput').value='35';
    return serializeState().replace(/^# .+/, '# GTA Queue')
      .replace(/<!-- queue-save:v1 -->\n/, '')
      .replace(/<!-- queue-target:v1 .* -->\n/, '');
  });
  const older = legacy.replace('Still playing','Earlier progress');
  for(const key of ['gta-queue.v1','timebridge.v1']){
    await page.evaluate(({key,legacy,older})=>{
      flushSave();
      localStorage.clear();
      localStorage.setItem(key,legacy);
      localStorage.setItem('gta-queue.v1.undo',JSON.stringify([{message:'Previous GTA session',state:older}]));
      localStorage.setItem('gta-queue.ambient-paused','true');
    },{key,legacy,older});
    await page.reload();
    assert.equal(await page.title(),'Release Queue · Grand Theft Auto VI');
    assert.equal(await page.locator('.app-brand').textContent(),'Release Queue');
    assert.deepEqual(await page.evaluate(()=>queue[0].game),{total:50,played:18});
    assert.equal(await page.evaluate(()=>queue[0].hours),32);
    assert.equal(await page.evaluate(()=>completed[0].name),'Finished film');
    assert.equal(await page.locator('#paceInput').inputValue(),'35');
    assert.equal(await page.locator('#ambientToggle').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>undoStack.length),1);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(()=>queue[0].name),'Earlier progress');
    await page.evaluate(()=>useReleaseTarget({gameName:'Future game',gameShortName:'Future game',
      releaseDate:'2030-01-02',dateLabel:'Planning date'}));
    const saved=await page.evaluate(()=>{flushSave();return serializeState();});
    assert.ok(saved.startsWith('# Release Queue\n'));
    assert.equal(await page.evaluate(()=>parseStateText(serializeState()).ok),true);
    await page.reload();
    assert.equal(await page.title(),'Release Queue · Future game');
    assert.equal(await page.evaluate(()=>queue[0].name),'Earlier progress');
    assert.equal(await page.evaluate(()=>completed[0].name),'Finished film');
    await goToView(page,'settings');
    const download=page.waitForEvent('download');
    await page.locator('#export').click();
    assert.equal((await download).suggestedFilename(),'release-queue.md');
    await page.locator('#importFile').setInputFiles({name:'gta-queue.md',mimeType:'text/markdown',buffer:Buffer.from(legacy)});
    await page.waitForFunction(()=>queue[0]?.name === 'Still playing');
    // An old file has no target metadata, so it keeps the chosen target.
    assert.equal(await page.title(),'Release Queue · Future game');
  }
  console.log(`Rename compatibility passed: ${url.startsWith('file:')?'direct file':'static HTTP'}`);
}).catch(error=>{console.error(error);process.exitCode=1;});
