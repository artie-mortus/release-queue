const {runBrowserSuite,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const searchPage = fs.readFileSync(path.join(__dirname,'fixtures/game-search-reader.md'),'utf8');
const detailPage = `Title: How long is Dispatch? | HowLongToBeat
URL Source: https://howlongtobeat.com/game/160618
#### Main Story
##### 8½ Hours`;

runBrowserSuite({network:async({context})=>{
  await context.route('https://www.wikidata.org/w/api.php?*',route=>
    route.fulfill({json:{search:[],entities:{Q123:{claims:{}},Q456:{claims:{P2816:[{mainsnak:{datavalue:{value:'160618'}}}]}}}}}));
  await context.route('https://r.jina.ai/https://howlongtobeat.com/**',route=>{
    const url=route.request().url();
    // The forced direct engine can return prose without the category headings.
    const detail = route.request().headers()['x-engine'] === 'direct'
      ? detailPage.replace('#### Main Story\n##### 8½ Hours','**Dispatch** is about **8½ Hours** in length.') : detailPage;
    return route.fulfill({contentType:'text/plain',body:url.includes('/game/') ? detail : searchPage});
  });
}},async({url,page,context})=>{
  await page.goto(url);
  await openAddDialog(page);
  // Click the actual suggestion. Missing catalog metadata must not force manual hours.
  await page.evaluate(()=>renderPicks([{kind:'Game',name:'Dispatch',hours:null,rank:0,tier:0,note:'Game'}],0,0));
  await page.locator('[data-pick="0"]').click();
  await page.waitForFunction(()=>queue.length===1);
  let game=await page.evaluate(()=>queue[0]);
  assert.equal(game.hours,8.5,'Selecting a game without a Wikidata source ID should fill its main-story hours');
  assert.equal(game.estimateNeeded,false);
  assert.equal(game.game.sourceUrl,'https://howlongtobeat.com/game/160618');
  // An existing entity without a source ID needs the same fallback.
  await page.evaluate(async()=>{queue=[];await choosePick({kind:'Game',name:'Dispatch',qid:'Q123'});});
  assert.equal(await page.evaluate(()=>queue[0].hours),8.5);
  // Known source IDs also need the reader's complete category headings.
  await page.evaluate(async()=>{queue=[];await choosePick({kind:'Game',name:'Dispatch',qid:'Q456'});});
  assert.equal(await page.evaluate(()=>queue[0].hours),8.5);
  // A catalog outage must still allow the independent source lookup.
  await context.route('https://www.wikidata.org/w/api.php?*',route=>route.abort());
  await page.evaluate(async()=>{queue=[];await choosePick({kind:'Game',name:'Dispatch'});});
  assert.equal(await page.evaluate(()=>queue[0].hours),8.5);
  // Reject ambiguous exact titles and related games rather than guessing.
  for(const body of [searchPage.replace('## [Dispatch]', '## [Dispatch Remastered]'),
    searchPage+'\n## [Dispatch](https://howlongtobeat.com/game/999999 "Dispatch")']){
    await context.route('https://r.jina.ai/https://howlongtobeat.com/?*',route=>route.fulfill({contentType:'text/plain',body}));
    await page.evaluate(async()=>{queue=[];await choosePick({kind:'Game',name:'Dispatch',qid:'Q123'});});
    game=await page.evaluate(()=>queue[0]);
    assert.equal(game.estimateNeeded,true);
    assert.equal(game.game.sourceUrl,undefined);
  }
  console.log(`Game search fallback passed: ${url.split(':')[0]}`);
}).catch(error=>{console.error(error);process.exitCode=1;});
