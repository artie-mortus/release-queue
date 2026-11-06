const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../time-bridge-core.js');

const portableSave = (rows, completed = '', mode = 'simple') => `# GTA Queue
## Schedule
- Schedule mode: ${mode}
- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-22
- Job hours: 40
- Job starts: 2026-09-22
- YouTube per: day
- YouTube amount: 0
## Queue
| Item | Kind | Hours | Detail | Metadata |
| --- | --- | --- | --- | --- |
${rows}
## Completed
| Item | Kind | Hours | Detail | Metadata |
| --- | --- | --- | --- | --- |
${completed}`;
const metadataCell = value => encodeURIComponent(JSON.stringify(value));

test('Touch grass deducts weekly time before and after a future job begins', () => {
  const plan = core.calculateSchedule({fullPace:28, ceiling:112, ytPerWeek:3.5,
    grassHours:3.5, startOff:2, jobHours:56, jobOff:9});
  assert.equal(plan.pace,21);
  assert.equal(plan.paceAfter,7);
  assert.equal(plan.hoursByDay(9),21);
  assert.equal(plan.dayForHour(28),16);
  const stopped = core.calculateSchedule({fullPace:7, ceiling:112, grassHours:7});
  assert.equal(stopped.dayForHour(1),Infinity);
  assert.equal(stopped.hoursByDay(30),0);
  assert.equal(stopped.recurringStalls,true);
  const laterStop = core.calculateSchedule({fullPace:28, ceiling:112,
    grassHours:14, jobHours:56, jobOff:7});
  assert.equal(laterStop.dayForHour(14),7);
  assert.equal(laterStop.dayForHour(15),Infinity);
});

test('Touch grass saves round-trip and older saves default to zero', () => {
  const legacy = portableSave('| Movie | Movie | 2 | | |');
  assert.equal(core.parseStateText(legacy).schedule.grassHours,0);
  const saved = legacy.replace('- YouTube amount: 0','- YouTube amount: 0\n- Touch grass hours: 3.5');
  const parsed = core.parseStateText(saved);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.schedule.grassHours,3.5);
  const encoded = core.serializeState({appName:'Release Queue',
    target:{gameName:'Example',gameShortName:'Example',releaseDate:'2026-11-19',dateLabel:'Planning date'},
    savedAt:new Date(),schedule:parsed.schedule,queue:parsed.queue,completed:[]});
  assert.equal(core.parseStateText(encoded).schedule.grassHours,3.5);
  for(const invalid of ['-1','169','Infinity','nope','']){
    assert.equal(core.parseStateText(saved.replace('Touch grass hours: 3.5',`Touch grass hours: ${invalid}`)).ok,false);
  }
});

test('shared dates preserve calendar validation, local midnight, and target year bounds', () => {
  for(const value of ['2026-02-30','2026-13-01','2026-00-01','2026-01-00','0099-01-01','bad']){
    assert.equal(core.parseDateValue(value),null);
    assert.equal(core.parseDateValue(value,{local:true}),null);
  }
  const local=core.parseDateValue('2024-02-29',{local:true});
  assert.deepEqual([local.getFullYear(),local.getMonth(),local.getDate(),local.getHours()],[2024,1,29,0]);
  assert.equal(core.parseDateValue('0100-01-01').getUTCFullYear(),100);
  assert.equal(core.parseDateValue('1899-12-31',{minYear:1900}),null);
  assert.equal(core.parseDateValue('1900-01-01',{minYear:1900}).getUTCFullYear(),1900);
});

test('playlist URL validation is shared across portable and add-form inputs', () => {
  for(const host of ['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be']){
    const url=`https://${host}/watch?v=aaaaaaaaaaa&list=PL1234567890abcdef`;
    const parsed=core.parsePlaylistUrl(url);
    assert.equal(parsed.playlistId,'PL1234567890abcdef');
    assert.equal(core.parseYouTubeCell(`url=${encodeURIComponent(url)}`).url,parsed.url.href);
  }
  for(const url of ['http://youtube.com/playlist?list=PL1234567890abcdef',
    'https://youtube.com.evil.example/playlist?list=PL1234567890abcdef',
    'https://youtube.com/playlist?list=short','https://youtube.com/watch?v=aaaaaaaaaaa','bad']){
    assert.equal(core.parsePlaylistUrl(url),null);
  }
});

test('portable serializer uses an explicit snapshot and round-trips every media detail', () => {
  const target={gameName:'Example game',gameShortName:'Example',releaseDate:'2026-11-19',dateLabel:'Planning date',sourceUrl:''};
  const schedule={scheduleMode:'simple',sleepStart:'2',sleepEnd:'7',pace:'21',startDate:'2026-09-22',
    jobHours:'40',jobDate:'2026-09-22',ytUnit:'day',ytAmount:'0',bookPagesPerHour:190};
  const queue=[
    {name:'Title | with a pipe',kind:'Movie',hours:2,estimateNeeded:true},
    {name:'Zero game',kind:'Game',hours:0,game:{total:5,played:8}},
    {name:'Show',kind:'Show',hours:1,show:{episodes:[{season:1,number:1,seconds:3600}],watched:0}},
    {name:'Podcast',kind:'Podcast',hours:10,pod:{eps:10,avgMin:60,perWeek:1,ongoing:true,pinned:true}},
    {name:'Book',kind:'Book',hours:2,book:{pages:384,pagesPerHour:190,pinned:false,progress:50},runtimeScale:2},
    {name:'Story',kind:'Book',hours:4,book:{pages:400,pagesPerHour:190,basis:'words',words:110000,
      platform:'web',asOf:'2026-09-22',url:'https://example.com/story',chapters:40,progress:5,pinned:false}},
    {name:'Playlist',kind:'YouTube',hours:1,youtube:{url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',
      durations:[3600,3600],watched:1,videoIds:['aaaaaaaaaaa','bbbbbbbbbbb'],watchedIndices:[1],checkedAt:12345}}
  ];
  const completed=queue.map(item=>({...item,completedAt:'2026-09-22'}));
  const snapshot={appName:'Example game Queue',target,savedAt:new Date(2026,8,22,12),schedule,queue,completed};
  const before=structuredClone(snapshot);
  const text=core.serializeState(snapshot);
  const parsed=core.parseStateText(text);
  assert.equal(parsed.ok,true);
  assert.deepEqual(snapshot,before,'Encoding must not change progress or estimates');
  assert.deepEqual(parsed.target,target);
  assert.deepEqual(parsed.queue.map(item=>item.name),queue.map(item=>item.name));
  assert.equal(parsed.completed.length,queue.length);
  assert.equal(parsed.queue[1].hours,0);
  assert.equal(parsed.queue[4].runtimeScale,2);
  assert.deepEqual(parsed.queue[6].youtube.watchedIndices,[1]);
  assert.equal(core.serializeState({...snapshot,queue:parsed.queue,completed:parsed.completed}),text);
  assert.equal(core.parseStateText(text.replaceAll('\n','\r\n')).ok,true);
  for(const section of ['Queue','Completed']){
    const broken=text.replace(`## ${section}\n\n| Item`, `## ${section}\n\n| Broken | YouTube | 1 | url=invalid | |\n| Item`);
    assert.equal(core.parseStateText(broken).ok,false,`Reject malformed ${section} atomically`);
  }
});

test('portable saves larger than the former import cap round-trip below the supported maximum', () => {
  const target={gameName:'Example game',gameShortName:'Example',releaseDate:'2026-11-19',dateLabel:'Planning date',sourceUrl:''};
  const schedule={scheduleMode:'simple',sleepStart:'2',sleepEnd:'7',pace:'21',startDate:'2026-09-22',
    jobHours:'40',jobDate:'2026-09-22',ytUnit:'day',ytAmount:'0',bookPagesPerHour:190};
  const episodes=Array.from({length:15000},(_,index)=>({season:Math.floor(index / 1000) + 1,
    number:index % 1000 + 1,seconds:1800,availableOn:'2026-09-22'}));
  const text=core.serializeState({appName:'Example Queue',target,savedAt:new Date(2026,8,22,12),schedule,
    queue:[{name:'Large show',kind:'Show',hours:7500,show:{episodes,watched:0}}],completed:[]});
  assert.ok(Buffer.byteLength(text)>1_000_000);
  assert.ok(Buffer.byteLength(text)<core.MAX_PORTABLE_SAVE_BYTES);
  assert.equal(core.parseStateText(text).ok,true);
});

test('append summaries match full forecasts for available additions after waits and stalls', () => {
  const queues=[[],[{hours:0}],[{hours:2}],[{hours:20},{hours:100}],
    [{hours:4,show:{watched:0,episodes:[{season:1,number:1,seconds:3600,availableOn:'2026-09-27'},
      {season:1,number:2,seconds:3600,availableOn:'2026-10-04'}]}},{hours:3}],
    [{hours:1,show:{watched:1,episodes:[{season:1,number:1,seconds:3600,availableOn:'2026-09-23'},
      {season:1,number:2,seconds:3600,availableOn:'2026-11-30'}]}}]];
  const fields=['totalHours','capacity','finishDay','missingHours','remainingHours','gapDays','stalled'];
  for(const fullPace of [0,7,21]) for(const startOff of [0,5]) for(const job of [{},{jobHours:84,jobOff:10}]){
    const plan=core.calculateSchedule({fullPace,ceiling:168,startOff,...job});
    for(const days of [0,7,28,100]) for(const items of queues) for(const hours of [0.1,1,100]){
      const before=core.forecastQueue(items,plan,days,{today:'2026-09-22'});
      const expected=core.forecastQueue([...items,{hours}],plan,days,{today:'2026-09-22'});
      const actual=core.previewAppend(before,plan,days,hours);
      for(const key of fields){
        assert.ok(actual[key]===expected[key] || typeof actual[key]==='number'
          && Math.abs(actual[key]-expected[key])<1e-7, `Append summary disagrees for ${key}`);
      }
      if('waitingHours' in before) assert.equal(actual.waitingHours,expected.waitingHours);
    }
  }
});

test('undated append previews preserve exact capacity at a budget stall', () => {
  const plan = core.calculateSchedule({fullPace:11, ceiling:133, ytPerWeek:7, jobHours:90, jobOff:21});
  const items = [{hours:10.2}];
  for(const days of [7,21,58]){
    const baselines = [core.forecastQueue(items,plan,days), core.forecastTotals(10.2,plan,days)];
    for(const before of baselines) for(const hours of [1.8,1.8000000001]){
      const expected = core.forecastQueue([...items,{hours}],plan,days);
      const actual = core.previewAppend(before,plan,days,hours);
      assert.equal(expected.finishDay, hours === 1.8 ? 21 : Infinity);
      for(const key of Object.keys(actual)) assert.equal(actual[key],expected[key],key);
    }
  }
});

test('totals-only previews match full forecasts at schedule boundaries', () => {
  for(const inputs of [
    {fullPace:21,ceiling:168},
    {fullPace:21,ceiling:168,startOff:7},
    {fullPace:21,ceiling:56,jobHours:28,jobOff:14},
    {fullPace:21,ceiling:21,jobHours:21,jobOff:14},
    {fullPace:21,ceiling:168,ytPerWeek:21}
  ]){
    const plan = core.calculateSchedule(inputs);
    for(const items of [[],[{hours:0}],[{hours:7},{hours:14}],[{hours:100}]]){
      for(const day of [0,7,14,28,90]){
        const before = core.forecastQueue(items,plan,day);
        for(const hours of [0,0.1,7,21,100]){
          const after = core.forecastQueue([...items,{hours}],plan,day);
          const preview = core.forecastTotals(before.totalHours+hours,plan,day,before.capacity);
          for(const key of Object.keys(preview)) assert.equal(preview[key],after[key],key);
        }
      }
    }
  }
});

test('coverage uses actual pace for gaps, timeline endpoints, and launch position', () => {
  const plan = core.calculateSchedule({fullPace:21, ceiling:168, ytPerWeek:7});
  const items = [{hours:50}, {hours:10}];
  const result = core.forecastQueue(items, plan, 42);
  assert.equal(result.capacity, 84);
  assert.equal(result.missingHours, 24);
  assert.equal(result.gapDays, 12);
  assert.deepEqual(result.segments, [{startDay:0,endDay:25}, {startDay:25,endDay:30}]);
  assert.equal(result.position, null);
  const covered = core.forecastQueue([...items, {hours:30}], plan, 42);
  assert.equal(covered.missingHours, 0);
  assert.equal(covered.remainingHours, 6);
  assert.deepEqual(covered.position, {index:2,remainingHours:6,itemsAfter:0});
});

test('coverage accounts for delayed starts, job changes, and stalled schedules', () => {
  const plan = core.calculateSchedule({fullPace:28, ceiling:56, startOff:7, jobHours:28, jobOff:14});
  const result = core.forecastQueue([{hours:14}], plan, 28);
  assert.equal(result.capacity, 56);
  assert.equal(result.missingHours, 42);
  assert.equal(result.finishDay, 10.5);
  const stalled = core.forecastQueue([{hours:14}], core.calculateSchedule({fullPace:7, ceiling:168, ytPerWeek:7}), 28);
  assert.equal(stalled.capacity, 0);
  assert.equal(stalled.stalled, true);
});

test('TV availability delays consumption and exposes gaps even with content left at launch', () => {
  const plan = core.calculateSchedule({fullPace:21,ceiling:168});
  const show = {name:'Scheduled show',kind:'Show',hours:6,show:{watched:0,episodes:[
    {season:1,number:1,seconds:3600,availableOn:'2026-10-01'},
    {season:1,number:2,seconds:3600,availableOn:'2026-10-11'}
  ]}};
  const result = core.forecastQueue([show,{hours:9}],plan,11,{today:'2026-10-01'});
  assert.equal(result.finishDay,14);
  assert.equal(result.remainingHours,9);
  assert.equal(result.missingHours,27);
  assert.equal(result.waitingHours,27);
  assert.equal(result.gapDays,9);
  assert.deepEqual(result.position,{index:1,remainingHours:9,itemsAfter:0});
  assert.deepEqual(result.waits,[{startDay:1,endDay:10}]);
  const waiting = core.forecastQueue([show],plan,5,{today:'2026-10-01'});
  assert.equal(waiting.remainingHours,3);
  assert.equal(waiting.missingHours,12);
  assert.deepEqual(waiting.position,{index:0,remainingHours:3,itemsAfter:0});
  const watched = core.forecastQueue([{...show,hours:3,show:{...show.show,watched:1}}],plan,11,{today:'2026-10-01'});
  assert.equal(watched.finishDay,11);
  assert.equal(watched.waitingHours,30);
  assert.equal(watched.remainingHours,0);
});

test('TV waits share schedule boundaries, corrections, stalls, and calendar dates', () => {
  const item={hours:4,show:{watched:0,episodes:[{season:1,number:1,seconds:3600,availableOn:'2026-11-02'}]}};
  const plan=core.calculateSchedule({fullPace:28,ceiling:56,jobHours:28,jobOff:3});
  const result=core.forecastQueue([item],plan,10,{today:'2026-10-31'});
  assert.equal(result.segments[0].startDay,2);
  assert.equal(result.finishDay,3);
  assert.equal(result.waitingHours,8);
  const stalled=core.forecastQueue([item],core.calculateSchedule({fullPace:7,ceiling:7,jobHours:7,jobOff:1}),10,{today:'2026-10-01'});
  assert.equal(stalled.finishDay,Infinity);
  assert.equal(stalled.remainingHours,4);
  assert.equal(stalled.missingHours,1);
  assert.equal(stalled.stalled,true);
  assert.equal(Number.isNaN(stalled.gapDays),false);
});

test('airdates survive portable saves, reject invalid dates, and accept legacy episodes', () => {
  const show={episodes:[{season:1,number:1,seconds:3600,availableOn:'2026-11-02'}],watched:0};
  const text=portableSave(`| TV | Show | 1 | show=${metadataCell(show)} | |`);
  const parsed=core.parseStateText(text);
  assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.queue[0].show,show);
  assert.equal(core.parseStateText(text.replace('2026-11-02','2026-02-30')).ok,false);
  const legacy=structuredClone(show); delete legacy.episodes[0].availableOn;
  assert.ok(core.parseShowCell(`show=${metadataCell(legacy)}`));
});

test('duplicate matches use source identity, normalized titles, and media kind', () => {
  const same=core.queueItemsMatch;
  assert.equal(same({kind:'Game',name:'Pokémon: Red'},{kind:'Game',name:'Pokemon red'}),true);
  assert.equal(same({kind:'Movie',name:'Dune'},{kind:'Book',name:'Dune'}),false);
  assert.equal(same({kind:'Show',name:'One name',catalogId:'tvmaze:1'},{kind:'Show',name:'Another',catalogId:'tvmaze:1'}),true);
  assert.equal(same({kind:'Show',name:'Same',catalogId:'tvmaze:1'},{kind:'Show',name:'Same',catalogId:'tvmaze:2'}),false);
  assert.equal(same({kind:'YouTube',name:'One',youtube:{playlistId:'PL1234567890abcdef'}},
    {kind:'YouTube',name:'Two',youtube:{playlistId:'PL1234567890abcdef'}}),true);
  assert.equal(same({kind:'Book',name:'One',book:{url:'https://archiveofourown.org/works/123?view_full_work=true'}},
    {kind:'Book',name:'Two',book:{url:'https://archiveofourown.org/works/123/chapters/456#workskin'}}),true);
  assert.equal(same({kind:'Book',name:'One',book:{url:'https://m.fanfiction.net/s/123/2/title'}},
    {kind:'Book',name:'Two',book:{url:'https://www.fanfiction.net/s/123/1/title'}}),true);
  const metadata=metadataCell({catalogId:'tvmaze:1'});
  assert.equal(core.parseStateText(portableSave(`| TV | Show | 1 | | ${metadata} |`)).queue[0].catalogId,'tvmaze:1');
  assert.equal(core.parseStateText(portableSave(`| TV | Show | 1 | | ${metadataCell({catalogId:42})} |`)).ok,false);
});

test('playlist IDs preserve watched entries across insertions, reorders, and duplicate occurrences', () => {
  const a='aaaaaaaaaaa', b='bbbbbbbbbbb', c='ccccccccccc', x='xxxxxxxxxxx';
  const inserted = core.refreshedPlaylist([3600,7200], 1, [1800,3600,7200], {
    videoIds:[a,b], latestVideoIds:[x,a,b]
  });
  assert.deepEqual(inserted.watchedIndices, [1]);
  assert.equal(inserted.hours, 2.5);
  assert.equal(core.nextPlaylistIndex(inserted), 0);
  const reordered = core.refreshedPlaylist([3600,3600], 1, [3600,3600], {videoIds:[a,b],latestVideoIds:[b,a]});
  assert.deepEqual(reordered.watchedIndices, [1]);
  const duplicate = core.refreshedPlaylist([3600,3600,3600], 1, [3600,3600,3600], {videoIds:[a,a,b],latestVideoIds:[a,b,a]});
  assert.deepEqual(duplicate.watchedIndices, [0]);
  const continued = core.refreshedPlaylist(inserted.durations, inserted.watched, [7200,1800,3600,900], {
    videoIds:[x,a,b], latestVideoIds:[b,x,a,c], watchedIndices:inserted.watchedIndices
  });
  assert.deepEqual(continued.watchedIndices, [2]);
  assert.equal(continued.hours, 2.8);
});

test('playlist identity handles removals and does not guess noncontiguous progress without IDs', () => {
  const a='aaaaaaaaaaa', b='bbbbbbbbbbb', c='ccccccccccc';
  const removed = core.refreshedPlaylist([3600,3600,3600], 2, [3600,3600], {videoIds:[a,b,c],latestVideoIds:[b,c]});
  assert.deepEqual(removed.watchedIndices, [0]);
  assert.equal(removed.hours, 1);
  const complete = core.refreshedPlaylist([3600,3600], 1, [3600], {videoIds:[a,b],latestVideoIds:[a]});
  assert.equal(complete.hours, null);
  assert.equal(core.refreshedPlaylist([3600,3600], 1, [3600,3600,3600], {watchedIndices:[1]}), null);
});

test('portable saves validate noncontiguous playlist progress and runtime provenance', () => {
  const detail='url=https%3A%2F%2Fwww.youtube.com%2Fplaylist%3Flist%3DPL1234567890abcdef;videos=3600,7200;watched=1;videoIds=aaaaaaaaaaa,bbbbbbbbbbb;watchedIndices=1';
  const metadata={runtimeScale:0.5,runtimeSource:'Saved video runtimes',runtimeBasis:'measured'};
  const text=portableSave(`| Playlist | YouTube | 0.5 | ${detail} | ${metadataCell(metadata)} |`);
  const parsed=core.parseStateText(text);
  assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.queue[0].youtube.watchedIndices,[1]);
  assert.equal(parsed.queue[0].runtimeScale,0.5);
  assert.equal(parsed.queue[0].runtimeSource,metadata.runtimeSource);
  for(const bad of ['0,0','2','-1','bad','']) assert.equal(core.parseStateText(text.replace('watchedIndices=1',`watchedIndices=${bad}`)).ok,false);
  assert.equal(core.parseStateText(text.replace('videoIds=aaaaaaaaaaa,bbbbbbbbbbb;','')).ok,false);
});

test('save-file headings do not hide queue items with the same names', () => {
  const names = ['Item', '(empty)', '---'];
  const rows = names.map(name => `| ${name} | Book | 2 | | |`).join('\n');
  const parsed = core.parseStateText(portableSave(rows));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.queue.map(item => item.name), names);
});

test('portable saves retain estimates, progress, completed history, and schedule mode', () => {
  const book = '| Book | Book | 4 | pages=384;pph=190;pin=0;done=100 | '
    + metadataCell({runtimeScale:4/1.5, estimateNeeded:false}) + ' |';
  const movie = '| Movie | Movie | 2 | | '
    + metadataCell({completedAt:'2026-09-22', estimateNeeded:true}) + ' |';
  const parsed = core.parseStateText(portableSave(book, movie));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.queue[0].book.progress, 100);
  assert.equal(parsed.queue[0].hours, 4);
  assert.equal(parsed.queue[0].runtimeScale, 4/1.5);
  assert.equal(parsed.completed[0].name, 'Movie');
  assert.equal(parsed.completed[0].completedAt, '2026-09-22');
  assert.equal(parsed.completed[0].estimateNeeded, true);
  assert.equal(parsed.schedule.scheduleMode, 'simple');
  assert.equal(core.parseStateText(portableSave(book).replace('- Schedule mode: simple\n','')).schedule.scheduleMode,'advanced');
});

test('invalid archive or estimate metadata rejects the whole save', () => {
  for(const metadata of [{runtimeScale:-1}, {runtimeScale:1000001}, {estimateNeeded:'yes'}, {completedAt:'2026-02-30'}, null]) {
    assert.equal(core.parseStateText(portableSave(`| Movie | Movie | 2 | | ${metadataCell(metadata)} |`)).ok,false);
  }
  assert.equal(core.parseStateText(portableSave('', '| Broken | Book | 2 | pages=bad |')).ok,false);
  assert.equal(core.parseStateText(portableSave('', '| Movie | Movie | 2 | |')).ok,false);
  assert.equal(core.parseStateText(portableSave('', '', 'unknown')).ok,false);
});

test('word-based reading progress without chapter totals survives an archive round trip', () => {
  const row = '| Story | Book | 2 | pages=400;pph=190;pin=0;basis=words;platform=web;asof=2026-09-22;url=https%3A%2F%2Fexample.com%2Fstory;words=110000;done=10000 | '
    + metadataCell({completedAt:'2026-09-22'}) + ' |';
  const result = core.parseStateText(portableSave('',row));
  assert.equal(result.ok,true);
  assert.equal(result.completed[0].book.progress,10000);
  assert.equal(result.completed[0].book.words,110000);
});

test('custom remaining estimates scale progress without changing source metadata', () => {
  const item = {runtimeScale:0.5,youtube:{durations:[1800,3600,7200],watched:1}};
  assert.equal(core.adjustedHours(item,core.calculatedHours(item)),1.5);
  item.youtube.watched=2;
  assert.equal(core.adjustedHours(item,core.calculatedHours(item)),1);
  delete item.runtimeScale;
  assert.equal(core.adjustedHours(item,core.calculatedHours(item)),2);

});

test('media synchronization keeps pinned runtimes, calibrated pace, and podcast rounding rules', () => {
  const book={kind:'Book',hours:2,book:{pages:384,pagesPerHour:190,progress:0,pinned:false}};
  assert.equal(core.syncItemHours(book,100),true);
  assert.equal(book.hours,4);
  assert.equal(core.syncItemHours(book,100),false);
  book.runtimeScale=2;
  assert.equal(core.syncItemHours(book,190),true);
  assert.equal(book.book.pagesPerHour,100,'Corrections retain their calibrated pace');
  assert.equal(book.hours,8);
  book.book.pinned=true;
  assert.equal(core.syncItemHours(book,190),false);
  const pod={kind:'Podcast',hours:9,runtimeScale:2,pod:{backlog:1.04,pinned:false}};
  core.syncItemHours(pod,190,0.02);
  assert.equal(pod.hours,2.2,'Round podcast source hours before applying a correction');
  pod.pod.backlog=0.5;
  assert.equal(core.syncItemHours(pod,190,0),false,'Sub-hour legacy podcast totals stay as saved');
  const invalid={kind:'Game',hours:1,game:{total:NaN,played:0}};
  core.syncItemHours(invalid,190);
  assert.equal(invalid.hours,null,'Invalid is distinct from zero remaining');
});

test('game hours can exceed an estimate and resume when the total increases', () => {
  assert.equal(core.remainingGameHours({total:50.5, played:20}), 30.5);
  assert.equal(core.remainingGameHours({total:50, played:50}), 0);
  assert.equal(core.remainingGameHours({total:50, played:65.5}), 0);
  assert.equal(core.remainingGameHours({total:80, played:65.5}), 14.5);
  assert.equal(core.remainingGameHours({total:0.3, played:0.2}), 0.1);
  for(const game of [{total:0, played:0}, {total:50, played:-1},
    {total:Infinity, played:0}, {total:50, played:NaN}, {total:50, played:100001}]){
    assert.equal(core.remainingGameHours(game), null);
  }
});

test('game completion lookup reads only the matching main-story estimate', () => {
  const page = (time, name = 'Example Game', id = '123') => `Title: How long is ${name}? | HowLongToBeat
URL Source: https://howlongtobeat.com/game/${id}
#### HowLongToBeat
##### 79 Hours
#### Main Story
##### ${time}
#### Main + Sides
##### 84½ Hours
#### Completionist
##### 196 Hours`;
  const parse = text => core.parseGameMainStory(text, '123', ['Example Game']);
  assert.equal(parse(page('51 Hours')), 51);
  assert.equal(parse(page('8½ Hours')), 8.5);
  assert.equal(parse(page('1¼ Hours')), 1.3);
  assert.equal(parse(page('45 Mins')), 0.8);
  assert.equal(parse(page('1 Hour 30 Minutes')), 1.5);
  for(const time of ['--', '0 Hours', '50–60 Hours', '100001 Hours', 'Infinity Hours', '30']){
    assert.equal(parse(page(time)), null, time);
  }
  assert.equal(parse(page('50 Hours', 'Example Game Remastered')), null);
  assert.equal(parse(page('50 Hours', 'Example Game', '456')), null);
  assert.equal(parse(page('50 Hours').replace('Main Story', 'Single-Player')), null);
  assert.equal(core.parseGameMainStory(page('50 Hours', 'Alias'), '123', ['Example Game','Alias']), 50);
});

test('verified game sources survive progress and portable saves', () => {
  const game = {total:51,played:20,sourceUrl:'https://howlongtobeat.com/game/27100',checkedOn:'2026-11-01'};
  const detail = value => `game=${encodeURIComponent(JSON.stringify(value))}`;
  assert.deepEqual(core.parseGameCell(detail(game)), game);
  assert.equal(core.gameProgress(game,'played',21).sourceUrl, game.sourceUrl);
  for(const change of [{sourceUrl:'https://evil.example/game/27100'}, {checkedOn:'2026-02-30'}, {sourceUrl:undefined}]){
    assert.equal(core.parseGameCell(detail({...game,...change})), null);
  }
  const parsed = core.parseStateText(portableSave(`| Game | Game | 31 | ${detail(game)} | |`));
  assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.queue[0].game,game);
});

test('game saves preserve played hours including zero remaining and reject malformed details', () => {
  const game = {total:50, played:65};
  const detail = `game=${encodeURIComponent(JSON.stringify(game))}`;
  const saved = `# GTA Queue\n\n## Schedule\n
- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1
\n## Queue\n
| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| Example | Game | 0 | ${detail} |
`;
  const result = core.parseStateText(saved);
  assert.equal(result.ok, true);
  assert.deepEqual(result.queue[0], {name:'Example', kind:'Game', hours:0, game});
  assert.equal(core.parseStateText(saved.replace(detail, 'game=bad')).ok, false);
  assert.equal(core.parseStateText(saved.replace(detail, '')).ok, false);
  const legacy = core.parseStateText(saved.replace('| 0 |', '| 50 |').replace(detail, ''));
  assert.equal(legacy.ok, true);
  assert.equal(legacy.queue[0].hours, 50);
});

test('game progress validates edits while retaining zero remaining hours', () => {
  const played = core.gameProgress({total:50,played:0},'played','65');
  assert.equal(core.remainingGameHours(played),0);
  const total = core.gameProgress(played,'total','80');
  assert.equal(core.remainingGameHours(total),15);
  assert.equal(total.played,65);
  for(const value of ['', '-1', 'invalid', '100001']) assert.equal(core.gameProgress(total,'played',value),null);
});

test('show progress survives export and import with remaining episode runtimes', () => {
  const show = {episodes:[{season:1, number:1, seconds:1800},
    {season:1, number:2, seconds:3600}, {season:2, number:1, seconds:2700}], watched:2, season:2};
  const encode = value => `show=${encodeURIComponent(JSON.stringify(value))}`;
  assert.deepEqual(core.parseShowCell(encode(show)), show);
  const saved = `# GTA Queue\n\n## Schedule\n
- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1
\n## Queue\n
| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| Example | Show | 3 | ${encode(show)} |
`;
  const result = core.parseStateText(saved);
  assert.equal(result.ok, true);
  assert.equal(result.queue[0].hours, 0.8);
  assert.deepEqual(result.queue[0].show, show);
  assert.equal(core.parseStateText(saved.replace(encode(show), encode({...show, pinned:true}))).queue[0].hours, 3);
  for(const watched of [-1, 1.5, 3]) assert.equal(core.parseShowCell(encode({...show, watched})), null);
  assert.equal(core.parseShowCell(encode({...show, episodes:[...show.episodes].reverse()})), null);
  assert.equal(core.parseShowCell(encode({...show, season:99})), null);
  assert.equal(core.parseShowCell('show=invalid'), null);
  assert.equal(core.parseStateText(saved.replace(encode(show), '')).ok, true);
});

test('show progress subtracts earlier seasons and signals completion without mutating the archive source', () => {
  const show = {episodes:[{season:1,number:1,seconds:1800},{season:2,number:1,seconds:3600}],watched:0,pinned:true};
  const advanced = core.showProgress(show,2,0);
  assert.equal(advanced.watched,1);
  assert.equal(advanced.pinned,undefined);
  assert.equal(core.remainingPlaylistHours(advanced.episodes.map(e=>e.seconds),advanced.watched),1);
  const finished = core.showProgress(advanced,2,1);
  assert.equal(core.remainingPlaylistHours(finished.episodes.map(e=>e.seconds),finished.watched),null);
  assert.equal(advanced.watched,1);
  assert.equal(show.watched,0);
});

test('schedule walks across a job boundary at the reduced pace', () => {
  const plan = core.calculateSchedule({
    fullPace:21, ceiling:112, ytPerWeek:0, startOff:0, jobHours:56, jobOff:7
  });
  assert.equal(plan.dayForHour(21), 7);
  assert.equal(plan.dayForHour(31.5), 14);
  assert.equal(plan.paceAfter, 10.5);
  assert.equal(plan.hoursByDay(7), 21);
  assert.equal(plan.hoursByDay(14), 31.5);
});

test('launch-day position follows delayed starts, job changes, and item boundaries', () => {
  const plan = core.calculateSchedule({
    fullPace:21, ceiling:112, startOff:3, jobHours:56, jobOff:10
  });
  const queue = [{name:'First', hours:14}, {name:'Second', hours:14}, {name:'Third', hours:7}];
  assert.equal(plan.hoursByDay(3), 0);
  assert.equal(plan.hoursByDay(10), 21);
  assert.equal(plan.hoursByDay(17), 31.5);
  assert.deepEqual(core.queuePositionAtHours(queue, plan.hoursByDay(2)),
    {index:0, remainingHours:14, itemsAfter:2});
  assert.deepEqual(core.queuePositionAtHours(queue, 14),
    {index:1, remainingHours:14, itemsAfter:1});
  assert.deepEqual(core.queuePositionAtHours(queue, plan.hoursByDay(17)),
    {index:2, remainingHours:3.5, itemsAfter:0});
  assert.equal(core.queuePositionAtHours(queue, 35), null);
  assert.deepEqual(core.queuePositionAtHours([{hours:0}, ...queue], 0),
    {index:1, remainingHours:14, itemsAfter:2});
});

test('schedule handles delayed starts and combined stalls', () => {
  const delayed = core.calculateSchedule({fullPace:14, ceiling:112, startOff:5});
  assert.equal(delayed.dayForHour(14), 12);

  const stalled = core.calculateSchedule({
    fullPace:21, ceiling:112, ytPerWeek:11, startOff:0, jobHours:56, jobOff:7
  });
  assert.equal(stalled.dayForHour(10), 7);
  assert.equal(stalled.dayForHour(10.1), Infinity);
  assert.equal(stalled.stalls, true);
});

test('media relevance handles aliases, accents, acronyms, and small typos', () => {
  assert.equal(core.relevance('Red Dead Redemption 2', 'rdr2', ['RDR2']), 0);
  assert.equal(core.relevance('Pokemon', 'Pokémon'), 0);
  assert.equal(core.relevance('七人の侍', '七人の侍'), 0);
  assert.ok(core.relevance("Baldur's Gate 3", 'balders gate 3') < 40);
  assert.ok(core.relevance('Portal', 'portal') < core.relevance('The Seventh Portal', 'portal'));
  assert.ok(core.relevance('Red Dead Radio', 'red dead redemption 2') >= 60);
  assert.ok(core.relevance('The Left Hand of Darkness Ursula K. Le Guin', 'le guin') < 60);
  assert.ok(core.relevance('It', 'item') >= 60);
  assert.ok(core.relevance('Up', 'update') >= 60);
  assert.ok(core.relevance('A', 'avatar') >= 60);
});

test('suggestion ranking never substitutes provider position for text relevance', () => {
  assert.equal(core.suggestionRank({name:'Portal', matchScore:0, sourceRank:8}, 'portal'), 0);
  assert.ok(core.suggestionRank({name:'Completely Wrong', matchScore:118, sourceRank:0}, 'portal') >= 60);
});

test('book estimates follow the Percy Jackson calibration', () => {
  assert.equal(core.DEFAULT_BOOK_PAGES_PER_HOUR, 190);
  assert.equal(core.estimateBookHours(384), 2);
  assert.equal(core.estimateBookHours(480), 2.5);
  assert.equal(core.estimateBookHours(0), null);
  assert.equal(core.clampNumber(null, 20, 1000, core.DEFAULT_BOOK_PAGES_PER_HOUR), 190);
  assert.equal(core.remainingReadingHours(384, 190, 100, 384), 1.5);
  assert.equal(core.remainingReadingHours(1000, 200, 3, 10), 3.5);
  assert.equal(core.remainingReadingHours(384, 190, 384, 384), null);
});

test('YouTube playlist durations are derived from every video', () => {
  assert.equal(core.playlistHours([1800, 900]), 0.8);
  assert.equal(core.playlistHours([18727, 11682, 9200]), 11);
  assert.equal(core.playlistHours([]), null);
  assert.equal(core.playlistHours([120, 0]), null);
  assert.equal(core.playlistHours([120, Number.NaN]), null);
  assert.equal(core.remainingPlaylistHours([1800, 900, 3600], 1), 1.3);
  assert.equal(core.remainingPlaylistHours([1800, 900, 3600], 2), 1);
  assert.equal(core.remainingPlaylistHours([1800, 900, 3600], 3), null);
});

test('playlist refresh reconciles changed videos without resetting watched progress', () => {
  assert.deepEqual(core.refreshedPlaylist([1800, 900], 1, [1800, 900, 3600]), {
    durations:[1800, 900, 3600], watched:1, hours:1.3
  });
  assert.deepEqual(core.refreshedPlaylist([1800, 900, 3600], 1, [1800, 1200]), {
    durations:[1800, 1200], watched:1, hours:0.3
  });
  assert.deepEqual(core.refreshedPlaylist([1800, 900], 1, [900, 1800]), {
    durations:[900, 1800], watched:1, hours:0.5
  });
  assert.deepEqual(core.refreshedPlaylist([1800, 900, 3600], 2, [1200]), {
    durations:[1200], watched:0, hours:0.3
  });
  assert.equal(core.refreshedPlaylist([1800, 900], 1, [1800, 900]), null);
});

test('playlist freshness survives portable saves and accepts legacy entries', () => {
  const detail = 'url=' + encodeURIComponent('https://www.youtube.com/playlist?list=PL1234567890abcdef')
    + ';videos=1800,900;watched=1';
  const saved = value => portableSave(`| Playlist | YouTube | 0.3 | ${value} | |`);
  const checkedAt = Date.UTC(2026, 8, 22);
  assert.equal(core.parseStateText(saved(detail)).queue[0].youtube.checkedAt, undefined);
  assert.equal(core.parseStateText(saved(detail + ';checked=' + checkedAt)).queue[0].youtube.checkedAt, checkedAt);
  for(const value of ['', 'NaN', '-1', '1.5', '9007199254740992']){
    assert.equal(core.parseStateText(saved(detail + ';checked=' + value)).ok, false);
  }
});

test('queue hour edits accept numbers and division shortcuts', () => {
  assert.equal(core.resolveItemHoursEdit(50.5, '/2'), 25.25);
  assert.equal(core.resolveItemHoursEdit(10, '/ 4'), 2.5);
  assert.equal(core.resolveItemHoursEdit(10, '7.5'), 7.5);
  assert.equal(core.resolveItemHoursEdit(10, '/0'), null);
  assert.equal(core.resolveItemHoursEdit(10, '/nope'), null);
  assert.equal(core.resolveItemHoursEdit(0.1, '/2'), null);
});

test('web novel metadata extracts a clean title and explicit chapter total', () => {
  const metadata = core.parseWebNovelMetadata(`Title: Mother of Learning | Royal Road

Chapters: 106
Words: 806,300
Markdown Content:\n# Mother of Learning`, 'https://www.royalroad.com/fiction/21220/mother-of-learning');
  assert.deepEqual(metadata, {
    title:'Mother of Learning', chapters:106, words:806300, wordsEstimated:false
  });
});

test('web novel metadata can count unique chapter links', () => {
  const metadata = core.parseWebNovelMetadata(`# Pale Lights
[Chapter 1](https://example.com/story/chapter-1)
[Chapter 2](https://example.com/story/chapter-2)
[Again](https://example.com/story/chapter-2)`, 'https://example.com/story');
  assert.deepEqual(metadata, {
    title:'Pale Lights', chapters:2, words:null, wordsEstimated:false
  });
});

test('Royal Road page totals produce a labeled word estimate', () => {
  const metadata = core.parseWebNovelMetadata(`Title: Mother of Learning
Pages  :
*   2,932
109 Chapters`, 'https://www.royalroad.com/fiction/21220/mother-of-learning');
  assert.deepEqual(metadata, {
    title:'Mother of Learning', chapters:109, words:806300, wordsEstimated:true
  });
});

test('fanfiction platforms recognize desktop and mobile hosts without accepting lookalikes', () => {
  for(const [url, platform] of [
    ['https://archiveofourown.org/works/123/chapters/456', 'ao3'],
    ['https://www.fanfiction.net/s/123/1/Story', 'fanfiction'],
    ['https://m.fanfiction.net/s/123/2/', 'fanfiction'],
    ['https://notarchiveofourown.org/works/123', 'web'],
    ['https://fanfiction.net.example.com/s/123', 'web'],
    ['not a URL', 'web']
  ]) assert.equal(core.webStoryPlatform(url), platform);
});

test('AO3 metadata uses published chapters and cleans page title metadata', () => {
  for(const total of ['10', '?', '3']){
    assert.deepEqual(core.parseWebNovelMetadata(`Title: Home Again - Chapter 2 - Writer - Example Fandom | Archive of Our Own
Words: 12,345 Chapters: [3/${total}](https://archiveofourown.org/works/123/chapters/456)
Chapter 99 is mentioned in the story.`, 'https://archiveofourown.org/works/123'),
    {title:'Home Again', chapters:3, words:12345, wordsEstimated:false});
  }
});

test('direct fic metadata preserves punctuation in the actual story heading', () => {
  assert.equal(core.parseWebNovelMetadata(`Title: Home - Again - Writer - Fandom | Archive of Our Own
Story Title: Home - Again
Words: 100 Chapters: 1/1`, 'https://archiveofourown.org/works/123').title, 'Home - Again');
});

test('FanFiction.net metadata strips chapter titles and handles one-shots', () => {
  assert.deepEqual(core.parseWebNovelMetadata(`Title: Home Again Chapter 2: Arrival, a sample fanfic | FanFiction
Rated: Fiction T - English - Chapters: 12 - Words: 54,321 - Reviews: 90
Chapter 80`, 'https://m.fanfiction.net/s/123/2/Home-Again'),
  {title:'Home Again', chapters:12, words:54321, wordsEstimated:false});
  assert.deepEqual(core.parseWebNovelMetadata(`Title: Home Again, a sample fanfic | FanFiction
Rated: Fiction K - Words: 100 - Status: Complete`, 'https://www.fanfiction.net/s/123/1/Home-Again'),
  {title:'Home Again', chapters:1, words:100, wordsEstimated:false});
});

test('fic challenge and login pages are not offered as story titles', () => {
  for(const url of ['https://archiveofourown.org/works/123', 'https://www.fanfiction.net/s/123/1']){
    assert.deepEqual(core.parseWebNovelMetadata('Title: Just a moment...\nPlease sign in.', url),
      {title:'', chapters:null, words:null, wordsEstimated:false});
  }
});

test('fanfiction exports preserve short works, platform, source, and reading progress', () => {
  for(const [platform, url] of [['ao3', 'https://archiveofourown.org/works/123'],
    ['fanfiction', 'https://m.fanfiction.net/s/123/1/Story']]){
    const detail = `pages=0.36;pph=190;pin=0;basis=words;words=100;platform=${platform};asof=2026-09-23;url=${encodeURIComponent(url)};chapters=2;done=1`;
    const parsed = core.parseStateText(portableSave(`| A tiny fic | Book | 0.1 | ${detail} | |`));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.queue[0].book, {pages:0.36, pagesPerHour:190, pinned:false,
      basis:'words', words:100, platform, asOf:'2026-09-23', url, chapters:2, progress:1});
  }
});

test('legacy save headings remain readable', () => {
  for(const heading of ['GTA Queue', 'Time Bridge']){
    assert.equal(core.parseStateText(portableSave('| Test | Game | 2 | | |').replace('# GTA Queue', `# ${heading}`)).ok, true);
  }
});

test('renamed sites share a save format while unrelated Markdown is rejected', () => {
  const save = portableSave('| Test | Game | 2 | | |').replace('# GTA Queue', '# Another Queue\n\n<!-- queue-save:v1 -->');
  const parsed = core.parseStateText(save);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.queue[0].name, 'Test');
  assert.equal(core.parseStateText(save.replace('<!-- queue-save:v1 -->', '')).ok, false);
  assert.equal(core.parseStateText(save.replace('queue-save:v1', 'queue-save:v2')).ok, false);
  assert.equal(core.parseStateText(save.replace('- Hours per week: 21', '- Hours per week: 999')).ok, false);
  assert.equal(core.parseStateText(save.replace('## Schedule', '## Notes')).ok, false);
});

test('podcast catalog estimates discount promos represented in the fetched sample', () => {
  assert.equal(core.adjustPodcastCatalogCount(100, 100, 8, 0), 8);
  assert.equal(core.adjustPodcastCatalogCount(1000, 200, 180, 0), 900);
  assert.equal(core.adjustPodcastCatalogCount(12, 12, 10, 2), 10);
});

test('book results match titles and authors and keep useful metadata', () => {
  const docs = [
    {title:'The Lightning Thief', author_name:['Rick Riordan'], first_publish_year:2005,
      number_of_pages_median:384, cover_i:7239831},
    {title:'Percy Jackson and the Lightning Thief', author_name:['Robert Venditti', 'Rick Riordan'],
      editions:{docs:[{number_of_pages:128}]}},
    {title:'Unrelated Cookbook', author_name:['Someone Else'], number_of_pages_median:200}
  ];
  const byTitle = core.prepareBookSuggestions(docs, 'lightning thief');
  assert.equal(byTitle.length, 2);
  assert.equal(byTitle[0].pages, 384);
  assert.equal(byTitle[0].authors[0], 'Rick Riordan');
  assert.equal(byTitle[0].cover_i, 7239831);
  assert.equal(core.prepareBookSuggestions(docs, 'rick riordan').length, 2);
  assert.equal(core.prepareBookSuggestions(docs, 'percy jackson lightning thief')[0].title,
    'The Lightning Thief');
});

test('light novel results use the best-known title and a transparent volume estimate', () => {
  const media = [
    {title:{romaji:'Mushoku Tensei: Dasoku-hen', english:'Mushoku Tensei: Redundant Reincarnation'},
      synonyms:[], volumes:4},
    {title:{romaji:'Mushoku Tensei: Isekai Ittara Honki Dasu',
      english:'Mushoku Tensei: Jobless Reincarnation'}, synonyms:['Jobless Reincarnation'], volumes:26}
  ];
  const results = core.prepareLightNovelSuggestions(media, 'Jobless Reincarnation');
  assert.equal(results[0].name, 'Mushoku Tensei: Jobless Reincarnation');
  assert.equal(results[0].pages, 6500);
  assert.equal(core.estimateBookHours(results[0].pages), 34);
  assert.equal(core.estimateLightNovelPages(null), null);
});

test('state parser rejects unrelated files without producing replacement state', () => {
  const result = core.parseStateText('# Notes\n\n| thing | Game | 10 |');
  assert.equal(result.ok, false);
  assert.equal(result.queue, undefined);

  const headingsOnly = core.parseStateText('# GTA Queue\n\n## Schedule\n\n## Queue');
  assert.equal(headingsOnly.ok, false);
});

test('state parser validates rows before returning state', () => {
  const valid = `# Time Bridge

## Schedule

- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1
- Book pages per hour: 220

## Queue

| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| Portal 2 | Game | 8.5 | |
`;
  const result = core.parseStateText(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.queue, [{name:'Portal 2', kind:'Game', hours:8.5}]);

  const invalid = valid.replace('| Portal 2 | Game | 8.5 |', '| Portal 2 | Game | nope |');
  assert.equal(core.parseStateText(invalid).ok, false);

  const invalidDate = valid.replace('2026-09-04', '2026-99-99');
  assert.equal(core.parseStateText(invalidDate).ok, false);

  const unrelatedTable = valid.replace('| Portal 2 | Game | 8.5 | |', '| (empty) | | | |')
    + '\n## Notes\n\n| Secret | Game | 99 |\n';
  assert.deepEqual(core.parseStateText(unrelatedTable).queue, []);
});

test('state parser preserves calibrated book details', () => {
  const text = `# GTA Queue

## Schedule

- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1
- Book pages per hour: 220

## Queue

| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| The Lightning Thief | Book | 2 | pages=384;pph=190;pin=0 |
`;
  const result = core.parseStateText(text);
  assert.equal(result.ok, true);
  assert.equal(result.schedule.bookPagesPerHour, '220');
  assert.deepEqual(result.queue[0].book, {pages:384, pagesPerHour:190, pinned:false});
  assert.equal(core.parseStateText(text.replace('pph=190', 'pph=nope')).ok, false);
  assert.equal(core.parseStateText(text.replace('Book pages per hour: 220', 'Book pages per hour: 0')).ok, false);
});

test('state parser preserves light novel volume-based estimates', () => {
  const text = `# GTA Queue

## Schedule

- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1
- Book pages per hour: 190

## Queue

| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| Mushoku Tensei | Book | 34 | pages=6500;pph=190;pin=0;basis=volumes;vol=26 |
`;
  const result = core.parseStateText(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.queue[0].book,
    {pages:6500, pagesPerHour:190, pinned:false, basis:'volumes', volumes:26});
  assert.equal(core.parseStateText(text.replace('vol=26', 'vol=nope')).ok, false);
});

test('state parser preserves dated web-novel word counts', () => {
  const text = `# GTA Queue

## Schedule

- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1
- Book pages per hour: 190

## Queue

| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| A Practical Guide to Evil | Book | 35.9 | pages=9090.91;pph=190;pin=0;basis=words;words=2500000;platform=web;asof=2026-09-14;url=https%3A%2F%2Fpracticalguidetoevil.wordpress.com%2F;chapters=100;done=25 |
`;
  const result = core.parseStateText(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.queue[0].book, {pages:9090.91, pagesPerHour:190, pinned:false,
    basis:'words', platform:'web', asOf:'2026-09-14',
    url:'https://practicalguidetoevil.wordpress.com/', words:2500000,
    chapters:100, progress:25});
  assert.equal(core.parseStateText(text.replace('asof=2026-09-14', 'asof=2026-99-99')).ok, false);
  assert.equal(core.parseStateText(text.replace('https%3A%2F%2F', 'javascript%3A')).ok, false);
  assert.equal(core.parseStateText(text.replace('done=25', 'done=100')).ok, false);
});

test('state parser preserves YouTube playlists and rejects non-playlist URLs', () => {
  const text = `# GTA Queue

## Schedule

- Fall asleep: 2
- Wake up: 7
- Hours per week: 21
- Start on: 2026-09-04
- Job hours: 0
- Job starts: 2026-09-04
- YouTube per: day
- YouTube amount: 1

## Queue

| Item | Kind | Hours | Detail |
| --- | --- | --- | --- |
| Long essays | YouTube | 0.5 | url=https%3A%2F%2Fwww.youtube.com%2Fplaylist%3Flist%3DPL1234567890abcdef;videos=1800,900;watched=1 |
`;
  const result = core.parseStateText(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.queue[0], {name:'Long essays', kind:'YouTube', hours:0.5,
    youtube:{url:'https://www.youtube.com/playlist?list=PL1234567890abcdef',
      playlistId:'PL1234567890abcdef', durations:[1800, 900], watched:1}});
  assert.equal(core.parseStateText(text.replace('playlist%3Flist%3DPL1234567890abcdef', 'watch%3Fv%3Dabc')).ok, false);
  assert.equal(core.parseStateText(text.replace('watched=1', 'watched=2')).ok, false);
});

test('portable saves restore a validated release target and still accept legacy saves', () => {
  const target = {gameName:'Next Game', gameShortName:'Next Game', releaseDate:'2030-06-15',
    dateLabel:'Wikidata release date', sourceUrl:'https://www.wikidata.org/wiki/Q123'};
  const save = portableSave('| My queue | Game | 10 | | |');
  const marked = value => save + `\n<!-- queue-target:v1 ${encodeURIComponent(JSON.stringify(value))} -->`;
  assert.deepEqual(core.parseStateText(marked(target)).target, target);
  assert.equal(core.parseStateText(save).ok, true);
  assert.equal(core.parseStateText(save).target, undefined);
  for(const invalid of [{...target,releaseDate:'2030-02-30'}, {...target,gameName:'Bad\nTitle'},
    {...target,sourceUrl:'javascript:alert(1)'}, {...target,sourceUrl:'https://www.wikidata.org.evil.test/wiki/Q123'}]){
    assert.equal(core.parseStateText(marked(invalid)).ok, false);
  }
  assert.equal(core.parseStateText(save + '\n<!-- queue-target:v1 %broken -->').ok, false);
});

// Every state the app can hold must load again. One rejected row makes the
// whole autosave unreadable, so the serializer guards what the loader rejects.
const roundTrip = queue => core.parseStateText(core.serializeState({appName:'Release Queue',
  target:{gameName:'Grand Theft Auto VI',gameShortName:'GTA VI',releaseDate:'2026-11-19',dateLabel:'Official',sourceUrl:''},
  savedAt:new Date('2026-11-05T12:00:00Z'), queue, completed:[],
  schedule:{scheduleMode:'simple',sleepStart:'2',sleepEnd:'7',pace:'21',startDate:'2026-11-05',jobHours:'0',
    jobDate:'2026-11-05',ytUnit:'day',ytAmount:'0',grassHours:0,bookPagesPerHour:190}}));

test('saves drop non-finite runtime scales instead of writing an unreadable null', () => {
  const parsed = roundTrip([{name:'Short podcast',kind:'Podcast',hours:5,runtimeScale:Infinity,
    pod:{eps:1,avgMin:2,perWeek:0,ongoing:false,pinned:true,backlog:0}}]);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.queue[0].runtimeScale, undefined);
  assert.equal(parsed.queue[0].hours, 5);
});

test('saves keep a title with a line break on one row', () => {
  const parsed = roundTrip([{name:'Line one\nline two | piped',kind:'Movie',hours:2}]);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.queue[0].name, 'Line one line two | piped');
});

test('an empty queue writes a full-width placeholder row', () => {
  const text = core.serializeState({appName:'Release Queue',
    target:{gameName:'G',gameShortName:'G',releaseDate:'2026-11-19',dateLabel:'D',sourceUrl:''},
    savedAt:new Date(), queue:[], completed:[], schedule:{}});
  const queueRow = text.split('## Queue')[1].split('\n').find(line => line.includes('(empty)'));
  assert.equal(queueRow.split('|').length - 2, 5);
});

test('catalog episode lists are normalized to what the save loader accepts', () => {
  const episodes = core.normalizeShowEpisodes([
    {season:1,number:2,seconds:1800},
    {season:1,number:1,seconds:1800,availableOn:'2026-02-30'},
    {season:1,number:2,seconds:2400},
    {season:1,number:0,seconds:600},
    {season:2,number:1,seconds:200000},
    {season:null,number:3,seconds:1800},
    {season:2,number:2,seconds:0}
  ]);
  assert.deepEqual(episodes, [
    {season:1,number:1,seconds:1800},
    {season:1,number:2,seconds:1800},
    {season:2,number:1,seconds:86400}
  ]);
  const parsed = roundTrip([{name:'Show',kind:'Show',hours:24.5,show:{episodes,watched:0}}]);
  assert.equal(parsed.ok, true, parsed.error);
});
