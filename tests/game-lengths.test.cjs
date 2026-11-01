const {runBrowserSuite,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

const sourcePage = `Title: How long is Red Dead Redemption 2? | HowLongToBeat
URL Source: https://howlongtobeat.com/game/27100
#### HowLongToBeat
##### 79 Hours
#### Main Story
##### 51 Hours
#### Main + Sides
##### 84½ Hours
#### Completionist
##### 196 Hours`;

runBrowserSuite({network:async({context})=>{
  await context.route('https://www.wikidata.org/w/api.php?*',route=>{
    const query = new URL(route.request().url()).searchParams;
    const data = query.get('action') === 'wbsearchentities'
      ? {search:[{id:'Q27438121',label:'Red Dead Redemption 2',description:'2018 action-adventure video game'}]}
      : {entities:{Q27438121:{claims:{P2816:[
        {rank:'deprecated',mainsnak:{datavalue:{value:'123'}}},
        {rank:'normal',mainsnak:{datavalue:{value:'456'}}},
        {rank:'preferred',mainsnak:{datavalue:{value:'27100'}}}
      ]}}}};
    return route.fulfill({json:data});
  });
  await context.route('https://r.jina.ai/https://howlongtobeat.com/game/27100',route=>
    route.fulfill({contentType:'text/plain',body:sourcePage}));
}},async({url,page,context})=>{
  await page.goto(url);
  const preview=await page.evaluate(async()=>(await findWikidata('Red Dead Redemption 2'))[0]);
  assert.doesNotMatch(preview.note,/HowLongToBeat/,'Unverified local times must not claim source verification');
  assert.equal(preview.estimated,true);
  await openAddDialog(page);
  await page.evaluate(async()=>choosePick(gameSuggestions('RDR2')[0]));
  let game = await page.evaluate(()=>queue[0]);
  assert.equal(game.hours,51,'Use the main-story category from the source, not the old 50.5h guess or 79h combined total');
  assert.equal(game.runtimeBasis,'estimated','Player completion averages remain estimates');
  assert.equal(game.game.sourceUrl,'https://howlongtobeat.com/game/27100');
  assert.match(await page.locator('.estimate-context').textContent(),/HowLongToBeat.*main story/);
  assert.equal(await page.locator('[data-game-source]').getAttribute('href'),game.game.sourceUrl);
  await page.locator('[data-game-played]').fill('20.5');
  await page.locator('[data-game-played]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].hours),30.5);
  const saved=await page.evaluate(()=>parseStateText(serializeState()));
  assert.equal(saved.queue[0].game.played,20.5);
  assert.equal(saved.queue[0].game.sourceUrl,game.game.sourceUrl);
  assert.equal(saved.queue[0].game.checkedOn,game.game.checkedOn);
  await page.evaluate(()=>flushSave());
  await page.reload();
  assert.equal(await page.evaluate(()=>queue[0].hours),30.5);

  // Existing queues opt in. Manual totals stay until the user asks for a lookup.
  await page.locator('[data-game-total]').fill('80');
  await page.locator('[data-game-total]').press('Enter');
  assert.equal(await page.evaluate(()=>queue[0].hours),59.5);
  assert.equal(await page.locator('[data-game-source]').count(),0);
  await page.locator('[data-game-lookup]').click();
  await page.waitForFunction(()=>queue[0].game.total===51);
  assert.equal(await page.evaluate(()=>queue[0].game.played),20.5);
  assert.equal(await page.evaluate(()=>queue[0].hours),30.5);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>queue[0].game.total),80);

  // Failures preserve progress and personal estimates, with visible feedback.
  await context.route('https://r.jina.ai/**',route=>route.abort());
  await page.locator('[data-game-lookup]').click();
  await page.waitForFunction(()=>document.querySelector('[data-action-status]').textContent.includes('kept'));
  assert.equal(await page.evaluate(()=>queue[0].game.total),80);
  await page.evaluate(async()=>{
    queue=[];completed=[];
    await choosePick(gameSuggestions('RDR2')[0]);
  });
  game=await page.evaluate(()=>queue[0]);
  assert.equal(game.hours,50.5);
  assert.equal(game.game.sourceUrl,undefined);
  assert.match(game.runtimeSource,/Unverified local/);
  await page.evaluate(async()=>{
    queue=[];completed=[];
    await choosePick({kind:'Game',name:'Unlisted game',hours:100,note:'RAWG · 100h average playtime'});
  });
  game=await page.evaluate(()=>queue[0]);
  assert.equal(game.estimateNeeded,true,'Playtime is not completion time');
  assert.equal(game.hours,10);

  // A delayed result follows identity and preserves progress entered during lookup.
  await page.evaluate(()=>{
    queue=[];addToQueue({kind:'Game',name:'Moving game',hours:10});
    addToQueue({kind:'Movie',name:'Other item',hours:2});
    window.realGameProfile=gameMainStoryProfile;
    gameMainStoryProfile=()=>new Promise(resolve=>{window.resolveGame=resolve;});
  });
  await page.locator('[data-game-lookup]').click();
  await page.evaluate(()=>moveQueueItem(0,1));
  await page.locator('[data-game-played="1"]').fill('60');
  await page.locator('[data-game-played="1"]').press('Enter');
  await page.evaluate(()=>resolveGame({hours:51,game:{total:51,played:0},runtimeSource:'Test',runtimeBasis:'estimated'}));
  await page.waitForFunction(()=>!document.querySelector('[data-game-lookup]').disabled);
  assert.equal(await page.evaluate(()=>queue[0].name),'Other item');
  assert.equal(await page.evaluate(()=>queue[1].game.played),60);
  assert.equal(await page.evaluate(()=>queue[1].hours),0);
  assert.equal(await page.evaluate(()=>completed.length),0);

  // A delayed result cannot overwrite total edits or revive removals.
  await page.evaluate(()=>{
    queue=[];addToQueue({kind:'Game',name:'Pending',hours:10});
    gameMainStoryProfile=()=>new Promise(resolve=>{window.resolveGame=resolve;});
  });
  await page.locator('[data-game-lookup]').click();
  await page.locator('[data-game-total]').fill('40');
  await page.locator('[data-game-total]').press('Enter');
  await page.evaluate(()=>resolveGame({hours:51,game:{total:51,played:0},runtimeSource:'Test',runtimeBasis:'estimated'}));
  await page.waitForFunction(()=>!document.querySelector('[data-game-lookup]').disabled);
  assert.equal(await page.evaluate(()=>queue[0].game.total),40);
  await page.locator('[data-game-lookup]').click();
  await page.locator('[data-remove]').click();
  await page.evaluate(()=>resolveGame({hours:51,game:{total:51,played:0}}));
  assert.equal(await page.evaluate(()=>queue.length),0);
  await page.evaluate(()=>{
    gameMainStoryProfile=realGameProfile;
    addToQueue({kind:'Game',name:'Mobile game',hours:20,
      game:{total:20,played:0,sourceUrl:'https://howlongtobeat.com/game/27100',checkedOn:'2026-09-22'}});
  });
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  console.log(`Game lengths passed: ${url.split(':')[0]}`);
}).catch(error=>{console.error(error);process.exitCode=1;});
