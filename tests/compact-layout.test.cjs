const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({contextOptions:{viewport:{width:390,height:900},reducedMotion:'reduce'}},async ({url,page})=>{
  await page.goto(url);
  await page.evaluate(()=>addToQueue({name:'Personal game',hours:25,kind:'Game'}));
  assert.equal(await page.locator('#track .seg').count(),0,'Timeline stays lazy outside the plan');
  const next=await page.locator('#continueNext').boundingBox();
  assert.ok(next.y<700,'The next action should appear in the initial phone viewport');
  await page.locator('#queueToggle').click();
  assert.equal(await page.locator('#queueBody').isVisible(),false);
  await page.locator('#quickAdd').click();
  assert.equal(await page.locator('#queueBody').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'name');
  await page.keyboard.press('Escape');
  await goToView(page,'plan');
  await page.waitForFunction(()=>$('track').querySelector('.seg'));
  await goToView(page,'queue');
  await page.evaluate(()=>addToQueue({name:'A movie',hours:2,kind:'Movie'}));
  assert.equal(await page.locator('#track .seg').count(),1,'Hidden timeline defers rebuilding');
  await goToView(page,'plan');
  await page.waitForFunction(()=>$('track').querySelectorAll('.seg').length===2);
  await page.locator('#paceNumber').fill('35');
  await page.locator('#paceNumber').press('Enter');
  assert.equal(await page.locator('#paceInput').inputValue(),'35');
  await page.locator('#paceInput').fill('42');
  assert.equal(await page.locator('#paceNumber').inputValue(),'42');
  await page.locator('#paceNumber').fill('999');
  await page.locator('#paceNumber').press('Enter');
  assert.equal(await page.locator('#paceNumber').inputValue(),'168');
  await page.locator('#scheduleMode').selectOption('advanced');
  assert.equal(await page.locator('#paceNumber').inputValue(),'133');
  await page.locator('#paceNumber').fill('');
  await page.locator('#paceNumber').press('Enter');
  assert.equal(await page.locator('#paceNumber').inputValue(),'133');
  await page.evaluate(()=>flushSave());
  await page.reload();
  assert.equal(await page.evaluate(()=>activeView),'plan');
  assert.equal(await page.locator('#paceNumber').inputValue(),'133');
  assert.equal(await page.evaluate(()=>queue.length),2);
  await goToView(page,'queue');
  await page.evaluate(()=>{
    for(let i=0;i<25;i++) queue.push({name:`Movie ${i}`,kind:'Movie',hours:2});
    render({forceQueue:true});window.scrollTo(0,1000);
  });
  const add=await page.locator('#quickAdd').boundingBox();
  assert.ok(add.y>=0&&add.y<100,'Add stays in the sticky top bar');
  for(const width of [320,390,768,1280,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  console.log('PASS compact workspace',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
