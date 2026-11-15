const assert = require('node:assert/strict');
const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');

runBrowserSuite({clockDate:'2026-11-15T02:09:00-06:00',contextOptions:{viewport:{width:390,height:850},reducedMotion:'reduce'}},async({page,url})=>{
  await page.goto(url);
  await goToView(page,'plan');
  await page.evaluate(()=>{
    setReleaseTarget({...DEFAULT_SITE_CONFIG,releaseDate:'2026-11-19',releaseSchedule:{mode:'global',time:'06:00',timeZone:'UTC'}});
    $('scheduleMode').value='advanced'; $('paceInput').value=77;
    $('ytAmount').value=7; $('jobHours').value=40; $('jobStart').value='2026-11-15';
    $('startDate').value='2026-11-15';
    addToQueue({name:'Mother of Learning',kind:'Book',hours:60});
    render({animate:false});
  });
  assert.equal(await page.locator('#leadNote').isVisible(),false,'Today must not be described as a delayed start');
  assert.equal(await page.locator('#jobTimeline').isVisible(),true);
  assert.match(await page.locator('#jobTimeline').textContent(),/40 h\/wk/);
  assert.match(await page.locator('#jobTimeline').textContent(),/Nov 15, 2026/);
  assert.match(await page.locator('#jobTimeline').textContent(),/queue pace.*h\/wk/i);
  const expectedPace=await page.evaluate(()=>num1(buildSchedule().paceAfter));
  assert.match(await page.locator('#jobTimeline').textContent(),new RegExp(`Queue pace: ${expectedPace} h/wk`));
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:850});
    for(const date of ['2026-11-15','2026-11-19','2026-12-30']){
      await page.evaluate(date=>{$('jobStart').value=date;render({animate:false});},date);
      const band=page.locator('#jobTimeline .job-band');
      if(date==='2026-12-30'){
        assert.equal(await band.count(),0);
        assert.match(await page.locator('#jobTimeline').textContent(),/after this timeline/);
      }else{
        const bounds=await band.boundingBox();
        const lane=await page.locator('#jobTimeline .job-lane').boundingBox();
        const marker=await page.locator('.marker--job').evaluate(el=>{
          const r=el.getBoundingClientRect();return r.left+parseFloat(getComputedStyle(el,'::before').left);
        });
        assert.ok(bounds.width>0,'Work must occupy a visible span');
        assert.ok(Math.abs(bounds.x-marker)<1,'Job span and start marker share the same date');
        assert.ok(Math.abs(bounds.x+bounds.width-lane.x-lane.width)<1,'Job continues to the end of the calendar');
      }
      const geometry=await page.evaluate(()=>{
        const bounds=$('track').getBoundingClientRect();
        return [...$('markers').querySelectorAll('.flag')].map(flag=>{
          const r=flag.getBoundingClientRect();return {left:r.left,right:r.right,min:bounds.left,max:bounds.right};
        });
      });
      for(const r of geometry) assert.ok(r.left>=r.min-1&&r.right<=r.max+1,JSON.stringify({width,date,r}));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
  }
  await page.evaluate(()=>{$('jobStart').value='2026-11-15';$('startDate').value='2026-11-17';render({animate:false});});
  const jobOffset=await page.locator('.job-band').evaluate(el=>parseFloat(el.style.left));
  assert.ok(jobOffset<1,'A delayed queue must not move the actual job start');
  assert.match(await page.locator('#leadNote').textContent(),/2 days of runway/);
  await page.evaluate(()=>{$('startDate').value='2026-11-16';render({animate:false});});
  assert.match(await page.locator('#leadNote').textContent(),/1 day of runway/);
  await page.evaluate(()=>{
    setReleaseTarget({...DEFAULT_SITE_CONFIG});
    $('startDate').value='2026-11-15';render({animate:false});
  });
  assert.equal(await page.locator('#leadNote').isVisible(),false,'Date-only plans also start today');
  await page.evaluate(()=>{$('jobHours').value=0;render({animate:false});});
  assert.equal(await page.locator('#jobTimeline').isVisible(),false);
  await page.evaluate(()=>{$('jobHours').value=40;$('scheduleMode').value='simple';render({animate:false});});
  assert.equal(await page.locator('#jobTimeline').isVisible(),false);
  console.log('PASS mobile job plan and same-day start',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
