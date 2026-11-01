const assert=require('node:assert/strict');
const {runBrowserSuite}=require('./browser-fixture.cjs');

runBrowserSuite({contextOptions:{reducedMotion:'reduce'}},async({page,url})=>{
  await page.goto(url);
  await page.evaluate(()=>addToQueue({name:'Calendar fixture',kind:'Movie',hours:100}));
  for(const [time,released,days] of [
    ['2026-11-18T23:59:00-06:00',false,1],
    ['2026-11-19T00:00:00-06:00',true,0],
    ['2026-11-20T12:00:00-06:00',true,0],
    ['2026-11-01T01:59:00-05:00',false,18],
    ['2026-11-01T01:01:00-06:00',false,18]
  ]){
    await page.clock.setFixedTime(new Date(time));
    const actual=await page.evaluate(()=>{
      render({animate:false});
      return {days:computationContext().daysLeft,released:new Date()>=TARGET,
        caption:$('coverageCaption').textContent,signal:$('signal').textContent};
    });
    assert.equal(actual.days,days,time);
    assert.equal(actual.released,released,time);
    assert.equal(actual.signal==='The target date is here',released,time);
    assert.doesNotMatch(actual.caption,/NaN|undefined/);
  }
  console.log('PASS launch-day, midnight, and daylight-saving boundaries',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
