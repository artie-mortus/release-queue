const assert = require('node:assert/strict');
const {runBrowserSuite} = require('./browser-fixture.cjs');

runBrowserSuite({},async ({page,url}) => {
  await page.goto(url);
  const result=await page.evaluate(async () => {
    useReleaseTarget({gameName:'Starfield',gameShortName:'Starfield',releaseDate:'2023-09-06',dateLabel:'Planning date',
      releaseContext:{platform:'pc',market:'',automatic:true}});
    let option=publishedReleaseSchedule('Starfield',{platform:'pc',market:''});
    findReleaseSchedules=async () => [structuredClone(option)];
    await lookupReleaseTime({commit:true});
    addToQueue({name:'Keep this Undo',kind:'Movie',hours:2});
    const before=undoStack.map(entry => entry.message);
    for(let n=1;n<=21;n++){
      option.evidence.checkedAt=new Date(Date.UTC(2026,8,22,12,n)).toISOString();
      await lookupReleaseTime({commit:true});
    }
    const after=undoStack.map(entry => entry.message);
    const checkedAt=SITE_CONFIG.releaseEvidence.checkedAt;
    flushSave();
    const savedCheckedAt=parseStateText(localStorage.getItem(STORE_KEY)).target.releaseEvidence.checkedAt;
    option.instant='2023-09-07T00:00:00.000Z';
    await lookupReleaseTime({commit:true});
    return {before,after,checkedAt,savedCheckedAt,finalUndo:undoStack.map(entry => entry.message),instant:TARGET.toISOString()};
  });
  assert.deepEqual(result.after,result.before,'Evidence refreshes must retain meaningful Undo history');
  assert.equal(result.checkedAt,result.savedCheckedAt,'Fresh evidence is still saved');
  assert.equal(result.checkedAt,'2026-09-22T12:21:00.000Z');
  assert.deepEqual(result.finalUndo,[...result.before,'Updated release time'],'Changed release instants remain undoable');
  assert.equal(result.instant,'2023-09-07T00:00:00.000Z');
  await page.evaluate(() => $('undo').click());
  assert.equal(await page.evaluate(() => TARGET.toISOString()),'2023-09-06T00:00:00.000Z');
  assert.equal(await page.evaluate(() => queue[0].name),'Keep this Undo');
  console.log('PASS release refresh Undo preservation',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error => {console.error(error);process.exitCode=1;});
