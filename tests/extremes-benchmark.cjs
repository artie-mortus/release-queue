// Development investigation only. Uses the optional browser-test dependencies.
// Run with the same Playwright/Chromium setup as the other browser suites.
const {runBrowserSuite} = require('./browser-fixture.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const core = require('../time-bridge-core.js');

// Exercise the same append-summary implementation used by the application.
function appendSummary(before, plan, days, hours){
  return core.previewAppend(before, plan, days, hours);
}

function checkAppendExperiment(){
  let comparisons = 0;
  const queues = [[], [{hours:0}], [{hours:2}], [{hours:20},{hours:100}],
    [{hours:4,show:{watched:0,episodes:[{seconds:3600,availableOn:'2026-09-27'},{seconds:3600,availableOn:'2026-10-04'}]}},{hours:3}],
    [{hours:1,show:{watched:1,episodes:[{seconds:3600,availableOn:'2026-09-23'},{seconds:3600,availableOn:'2026-11-30'}]}}],
    [{hours:0,show:{watched:0,episodes:[{seconds:3600,availableOn:'2026-10-04'}]}}]];
  for(const fullPace of [0,1,7,21,168]) for(const startOff of [0,5])
    for(const job of [{},{jobHours:84,jobOff:10},{jobHours:168,jobOff:10}]){
      const plan=core.calculateSchedule({fullPace,ceiling:168,startOff,...job});
      for(const days of [0,7,28,100]) for(const items of queues) for(const hours of [0.1,1,100]){
        const before=core.forecastQueue(items,plan,days,{today:'2026-09-22'});
        const expected=core.forecastQueue([...items,{hours}],plan,days,{today:'2026-09-22'});
        const actual=appendSummary(before,plan,days,hours);
        for(const key of Object.keys(actual)) assert.ok(actual[key] === expected[key]
          || typeof actual[key] === 'number' && Math.abs(actual[key]-expected[key]) < 1e-7,
        `Append experiment disagrees for ${key}: ${JSON.stringify({fullPace,startOff,job,days,items,hours,actual,expected})}`);
        comparisons++;
      }
    }
  return comparisons;
}

const report={clock:'2026-09-22T12:00:00-05:00',timezone:'America/Chicago',
  viewport:{width:1280,height:900},samples:5,warmup:1,
  timing:'Synchronous calls. Layout is measured separately by offsetHeight after forced render. No paint, provider latency, or CPU throttling.',
  appendExperiment:{comparisons:checkAppendExperiment(),scope:'Immediately available positive-hour items appended to a fixed queue; totals only.'},protocols:[]};

runBrowserSuite({clockDate:null,contextOptions:{viewport:report.viewport,reducedMotion:'reduce'},
  network:async({context})=>context.addInitScript(()=>{
    const RealDate=Date;
    const fixed=new RealDate('2026-09-22T12:00:00-05:00').getTime();
    window.Date=class extends RealDate{
      constructor(...args){super(...(args.length?args:[fixed]));}
      static now(){return fixed;}
    };
  })},async({page,url})=>{
  await page.goto(url);
  await page.waitForFunction(()=>booted);
  const results=await page.evaluate(async()=>{
    clearInterval(countdownTimer); clearInterval(renderTimer);
    clearInterval(playlistTimer); clearTimeout(playlistStartupTimer); clearTimeout(saveTimer);
    $('startDate').value='2026-09-22'; $('scheduleMode').value='simple';
    $('paceInput').value='21'; $('ytAmount').value='1'; $('bookPace').value='190';
    const writes={};
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(value){
      if(['queue','forecastList','scenarioTrack','track','continueNext'].includes(this.id))
        writes[this.id]=(writes[this.id]||0)+1;
      descriptor.set.call(this,value);
    }});
    const profiled={};
    for(const name of ['computationContext','forecastItems','renderQueue','applyQueueFilters','renderWorkspace','renderScenarios','serializeState']){
      const original=window[name];
      window[name]=function(...args){
        const start=performance.now();
        try{return original.apply(this,args);}
        finally{const entry=profiled[name]||={calls:0,inclusiveMs:0};entry.calls++;entry.inclusiveMs+=performance.now()-start;}
      };
    }
    const measure=action=>{
      action();
      for(const key of Object.keys(writes)) delete writes[key];
      for(const key of Object.keys(profiled)) delete profiled[key];
      const samples=[];
      for(let i=0;i<5;i++){
        const start=performance.now();action();samples.push(performance.now()-start);
      }
      const sorted=samples.slice().sort((a,b)=>a-b);
      return {medianMs:sorted[2],minMs:sorted[0],maxMs:sorted[4],samples,
        writes:{...writes},profile:structuredClone(profiled)};
    };
    const fixtures=[
      {name:'100 movies',size:100}, {name:'1000 movies',size:1000},
      {name:'5000 movies',size:5000},
      {name:'25 shows x 1000 undated episodes',size:25,episodes:1000},
      {name:'25 shows x 1000 dated episodes',size:25,episodes:1000,dated:true}
    ];
    const output=[];
    for(const fixture of fixtures){
      setView('queue'); setQueueExpanded(true); queueQuery=queueFilter='';
      for(const id of ['forecastList','track','scenarioTrack']) $(id).innerHTML='';
      completed=[];undoStack.length=0;
      queue=Array.from({length:fixture.size},(_,i)=>fixture.episodes
        ? {name:`Show ${i+1}`,kind:'Show',hours:fixture.episodes/2,show:{watched:0,
          episodes:Array.from({length:fixture.episodes},(_,j)=>({season:Math.floor(j/20)+1,number:j%20+1,seconds:1800,
            ...(fixture.dated?{availableOn:toDateValue(addDays(new Date(2026,8,22),Math.floor(j/10)))}:{})}))}}
        : {name:`Movie ${i+1}`,kind:'Movie',hours:2+i%7});
      stateRevision++;lastSig=null;render({forceQueue:true,animate:false});
      const forced=measure(()=>render({forceQueue:true,animate:false}));
      const layout=measure(()=>{render({forceQueue:true,animate:false});void $('queue').offsetHeight;});
      const unchanged=measure(()=>render({animate:false}));
      const nodes=document.querySelectorAll('*').length;
      const candidates=Array.from({length:10},(_,i)=>({name:`Candidate ${i+1}`,kind:'Movie',hours:i+1,rank:i,tier:0,note:'Synthetic runtime',estimated:true}));
      const picks=measure(()=>renderPicks(candidates,0,0));closeSuggestions();
      const context=computationContext();
      const fullAppend=measure(()=>{for(let i=1;i<=10;i++)forecastItems([...queue,{hours:i}],context.plan,context.daysLeft,context.now,{timeline:false});});
      let appendChecksum=0;
      const summaryAppend=measure(()=>{
        let checksum=0;
        for(let run=0;run<1000;run++)for(let i=1;i<=10;i++){
          const result=TimeBridgeCore.previewAppend(context.forecast,context.plan,context.daysLeft,i);
          checksum+=result.remainingHours + result.missingHours;
        }
        appendChecksum=checksum;
      });
      summaryAppend.batchRepetitions=1000;
      summaryAppend.perTenCandidatesMs=summaryAppend.medianMs/1000;
      summaryAppend.checksum=appendChecksum;
      const serialize=measure(()=>serializeState());
      const snapshot=serializeState();
      const snapshotBytes=new Blob([snapshot]).size;
      const parsedJsonBytes=new Blob([JSON.stringify(parseStateText(snapshot))]).size;
      const parse=measure(()=>{const result=parseStateText(snapshot);if(!result.ok)throw Error(result.error);});
      const checkpointTiming=measure(()=>{undoStack.length=0;checkpoint('Extreme workload');});
      const retainedUndo=undoStack.length;
      const preserveEdit=measure(()=>commitQueueChange(null,()=>{queue[0].hours+=0.1;},{preserveQueue:true,animate:false}));
      // Work-volume experiment only, not a working paginator. Forecast the full
      // queue, then measure the DOM cost of showing its first 100 rows.
      const boundedRows=measure(()=>{
        const items=queue;queue=items.slice(0,100);
        try{renderQueue({animate:false,context});void $('queue').offsetHeight;}
        finally{queue=items;}
      });
      setQueueExpanded(false);
      const collapsed=measure(()=>{stateRevision++;render({forceQueue:true,animate:false});});
      setView('plan');$('scenarioPanel').open=false;
      const planUnchanged=measure(()=>render({animate:false}));
      const planMarkup=$('forecastList').innerHTML;
      // Compare the cached no-change render with a forced forecast-row rebuild.
      const planRowsRebuilt=measure(()=>{
        const cachedSig=forecastRowsSig;forecastRowsSig=null;
        try{render({animate:false});}finally{forecastRowsSig=cachedSig;}
      });
      if($('forecastList').innerHTML!==planMarkup)throw Error('Plan-row rebuild changed markup');
      $('scenarioPanel').open=true;scenarioDirty=false;
      const scenario=measure(()=>renderScenarios());
      const storage=measure(()=>{savePending=true;flushSave();});
      const storageStatus=$('saveState').textContent;
      let importStatus=null;
      if(snapshotBytes>1000000){
        const transfer=new DataTransfer();
        transfer.items.add(new File([snapshot],'extreme-queue.md',{type:'text/markdown'}));
        $('importFile').files=transfer.files;
        const revisionBeforeImport=stateRevision;
        await $('importFile').onchange();
        importStatus=$('saveState').textContent;
        if(stateRevision<=revisionBeforeImport || queue.length!==fixture.size)
          throw Error(`Generated backup did not restore ${fixture.size} queue items: ${importStatus}`);
      }
      clearTimeout(saveTimer);savePending=false;
      output.push({fixture,nodes,snapshotChars:snapshot.length,snapshotBytes,parsedJsonBytes,retainedUndo,storageStatus,importStatus,
        forced,layout,unchanged,picks,fullAppend,summaryAppend,serialize,parse,checkpointTiming,preserveEdit,
        boundedRows,collapsed,planUnchanged,planRowsRebuilt,scenario,storage});
    }
    return {userAgent:navigator.userAgent,fixtures:output};
  });
  const protocol=url.startsWith('file:')?'file':'http';
  report.protocols.push({protocol,...results});
  console.log(JSON.stringify({protocol,fixtures:results.fixtures.map(f=>({name:f.fixture.name,nodes:f.nodes,chars:f.snapshotChars,
    undo:f.retainedUndo,forced:f.forced.medianMs,layout:f.layout.medianMs,unchanged:f.unchanged.medianMs,
    picks:f.picks.medianMs,append:f.fullAppend.medianMs,fastAppend:f.summaryAppend.perTenCandidatesMs,
    plan:f.planUnchanged.medianMs,rebuiltPlanRows:f.planRowsRebuilt.medianMs,boundedRows:f.boundedRows.medianMs,
    scenario:f.scenario.medianMs,checkpoint:f.checkpointTiming.medianMs,
    storage:f.storage.medianMs,storageStatus:f.storageStatus,importStatus:f.importStatus}))}));
}).then(()=>{
  const output=path.resolve(__dirname,'../test-results/extremes-benchmark.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Append experiment matched ${report.appendExperiment.comparisons} forecasts. Report: ${output}`);
}).catch(error=>{console.error(error);process.exitCode=1;});
