// Repeatable development measurement, not a runtime dependency or speed gate.
const {chromium} = require('playwright');
const {chromiumPath} = require('./browser-fixture.cjs');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const runtimeRoot = process.env.RELEASE_QUEUE_BENCH_ROOT || process.env.GTA_BENCH_ROOT || root;
const label = process.argv[2] || 'final';

(async () => {
  const browser = await chromium.launch({executablePath:chromiumPath(),
    headless:true, args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:900},
      timezoneId:'America/Chicago', reducedMotion:'reduce'});
    await context.route(/^https?:\/\//, route => route.abort());
    await context.addInitScript(() => {
      const RealDate = Date;
      const fixed = new RealDate('2026-09-22T12:00:00-05:00').getTime();
      window.Date = class extends RealDate {
        constructor(...args){ super(...(args.length ? args : [fixed])); }
        static now(){ return fixed; }
      };
      window.workCounts = {schedules:0,forecasts:0,rebuilds:0};
      Object.defineProperty(window, 'TimeBridgeCore', {configurable:true, set(core){
        const original = core.forecastQueue;
        core.forecastQueue = (...args) => { workCounts.forecasts++; return original(...args); };
        Object.defineProperty(window, 'TimeBridgeCore', {value:core,configurable:true});
      }});
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
      Object.defineProperty(Element.prototype, 'innerHTML', {...descriptor,set(value){
        if(this.id === 'queue') workCounts.rebuilds++;
        descriptor.set.call(this,value);
      }});
    });
    const page = await context.newPage();
    await page.goto(`file://${runtimeRoot}/index.html`);
    const measurements = await page.evaluate(() => {
      clearInterval(countdownTimer); clearInterval(renderTimer);
      clearInterval(playlistTimer); clearTimeout(playlistStartupTimer);
      const original = buildSchedule;
      buildSchedule = (...args) => { workCounts.schedules++; return original(...args); };
      $('startDate').value = '2026-09-22'; $('jobStart').value = '2026-10-01';
      $('scheduleMode').value = 'simple'; $('paceInput').value = '21';
      $('ytAmount').value = '1'; $('bookPace').value = '190';
      const resetCounts = () => Object.keys(workCounts).forEach(key => workCounts[key] = 0);
      const counts = () => ({...workCounts});
      const fixture = (size, episodes = false) => Array.from({length:size}, (_, i) => episodes
        ? {name:`Show ${i+1}`,kind:'Show',hours:500,show:{watched:0,episodes:Array.from({length:1000},
          (_, j) => ({season:Math.floor(j/20)+1,number:j%20+1,seconds:1800}))}}
        : {name:`Movie ${i+1}`,kind:'Movie',hours:2+(i%7)});
      queue = fixture(25); completed = []; undoStack.length = 0;
      render({forceQueue:true,animate:false});
      resetCounts();
      const candidates = Array.from({length:10}, (_, i) => ({name:`Candidate ${i+1}`,kind:'Movie',
        hours:i+1,note:'Controlled runtime',rank:i,tier:0,estimated:true}));
      renderPicks(candidates,0,0);
      const previewCounts = counts();
      closeSuggestions();
      const timings = [];
      for(const [name,size,episodes] of [['25 items',25,false],['100 items',100,false],
        ['500 items',500,false],['25 shows × 1000 episodes',25,true]]){
        queue = fixture(size,episodes); completed = []; lastSig = null;
        $('timelinePanel').open = false; $('scenarioPanel').open = false;
        for(let i=0;i<3;i++) render({forceQueue:true,animate:false});
        const sample = (action) => {
          const ms = []; resetCounts();
          for(let i=0;i<10;i++){ const start=performance.now(); action(i); ms.push(performance.now()-start); }
          const sorted=ms.slice().sort((a,b)=>a-b);
          return {medianMs:(sorted[4]+sorted[5])/2,minMs:sorted[0],maxMs:sorted[9],counts:counts()};
        };
        const forced = sample(() => render({forceQueue:true,animate:false}));
        const unchanged = sample(() => render({animate:false}));
        setQueueExpanded(false);
        const collapsed = sample(i => { queue[0].hours=2+i; lastSig=null; render({forceQueue:true,animate:false}); });
        setQueueExpanded(true);
        timings.push({name,forced,unchanged,collapsed});
      }
      queue = [{name:'A personal game',kind:'Game',hours:25}, {name:'A movie',kind:'Movie',hours:2}];
      completed=[]; lastSig=null; render({forceQueue:true,animate:false});
      return {previewCounts,timings};
    });
    const directory = path.join(root,'test-results','gui');
    fs.mkdirSync(directory,{recursive:true});
    measurements.styles={};
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(() => {setQueueExpanded(true); window.scrollTo(0,0);});
      await page.screenshot({path:path.join(directory,`simplification-${label}-${width}.png`),fullPage:true});
      await page.evaluate(() => setQueueExpanded(false));
      const height = await page.locator('.queue-panel').evaluate(node=>node.getBoundingClientRect().height);
      const controls = await page.locator('#quickAdd').evaluate(node=>node.getBoundingClientRect().height);
      measurements[`layout${width}`]={collapsedHeight:height,addControlHeight:controls};
      const styles=async()=>page.evaluate(()=>{
        const selectors=['.queue-panel','.queue-toolbar','#quickAdd','.readout','.bridge-panel',
          '.item','.item .wk','.item small','.hours','.drag-handle','.game-progress input',
          '.verdict','.verdict .label','.game-target-form','.scenario-grid',
          '.suggestion','.suggestion small','.suggestion .tail','.suggestion .candidate-coverage'];
        const properties=['color','backgroundColor','display','gridTemplateColumns','gridColumn','gridRow',
          'gap','padding','marginBottom','minHeight','height','outlineColor','outlineStyle','outlineWidth'];
        return Object.fromEntries(selectors.map(selector=>{
          const node=document.querySelector(selector);
          const computed=node&&getComputedStyle(node);
          return [selector,computed&&Object.fromEntries(properties.map(property=>[property,computed[property]]))];
        }));
      });
      const states=measurements.styles[width]={collapsed:await styles()};
      await page.evaluate(()=>{
        setQueueExpanded(true);
        openAdd(); // Suggestions render inside the add dialog.
        renderPicks([{name:'Known result',kind:'Movie',hours:2,note:'Controlled runtime',rank:0,tier:0}],0,0);
      });
      await page.mouse.move(0,0);
      await page.waitForTimeout(150);
      states.regular=await styles();
      await page.evaluate(()=>setActive(0));
      await page.waitForTimeout(150);
      states.active=await styles();
      await page.evaluate(()=>clearActive());
      await page.locator('.suggestion').hover();
      await page.waitForTimeout(150);
      states.hover=await styles();
      await page.evaluate(()=>{closeSuggestions(); $('addDialog').close();});
      await page.locator('[data-drag-index="0"]').press('Tab');
      await page.waitForTimeout(150);
      states.keyboard=await styles();
      for(const motion of ['reduce','no-preference']){
        await page.emulateMedia({reducedMotion:motion});
        await page.waitForTimeout(50);
        states[motion]=await page.locator('.neon-light').first().evaluate(node=>({
          animation:getComputedStyle(node).animationName,paused:document.body.hasAttribute('data-ambient-paused')}));
      }
      await page.emulateMedia({reducedMotion:'reduce'});
    }
    const report = {label,browser:browser.version(),clock:'2026-09-22T12:00:00-05:00',
      timezone:'America/Chicago',viewport:{width:1280,height:900},warmup:3,samples:10,
      boundaries:'Synchronous render call, including DOM writes; excludes layout/paint, save debounce and provider latency',
      inputs:{mode:'simple',pace:21,youtubeHoursPerDay:1,start:'2026-09-22',jobDate:'2026-10-01',bookPace:190},
      ...measurements};
    fs.writeFileSync(path.join(root,'test-results',`simplification-${label}.json`),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
