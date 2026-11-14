const assert = require('node:assert/strict');
const {runBrowserSuite} = require('./browser-fixture.cjs');
const html='<h2 class="title">Catalog title</h2><dl class="stats"><dt>Words:</dt><dd>10,000</dd><dt>Chapters:</dt><dd>5/5</dd></dl>';

runBrowserSuite({},async ({page,url}) => {
  await page.goto(url);
  for(const unitOnly of [false,true]){
    await page.evaluate(() => {
      $('webUrl').value='https://archiveofourown.org/works/123';
      $('webTitle').value=$('webLength').value=$('webChapters').value=''; $('webUnit').value='words';
      fetchStoryText=() => new Promise(resolve => {window.finishStory=resolve;});
      window.pendingStory=lookupWebNovel();
    });
    await page.evaluate(unitOnly => {
      $('webUnit').value='pages';
      if(!unitOnly){$('webTitle').value='My title';$('webLength').value='222';$('webChapters').value='8';}
    },unitOnly);
    await page.evaluate(async html => {finishStory(html);await pendingStory;},html);
    assert.equal(await page.locator('#webUnit').inputValue(),'pages');
    assert.equal(await page.locator('#webLength').inputValue(),unitOnly?'':'222','Length and unit edits stay paired');
    assert.equal(await page.locator('#webTitle').inputValue(),unitOnly?'Catalog title':'My title');
    assert.equal(await page.locator('#webChapters').inputValue(),unitOnly?'5':'8');
  }
  const backup=await page.evaluate(() => {
    addToQueue({name:'Imported',kind:'Movie',hours:2});flushSave();return serializeState();
  });
  const importBackup=async () => {
    await page.locator('#importFile').setInputFiles({name:'queue.md',mimeType:'text/markdown',buffer:Buffer.from(backup)});
    await page.waitForFunction(() => $('importFile').value === '' && queue.length === 1 && queue[0].name === 'Imported');
  };
  await page.evaluate(() => {
    wikidataHours=() => new Promise(resolve => {window.finishMovie=resolve;});
    window.pendingMovie=choosePick({name:'Old movie',kind:'Movie',qid:'Q123'});
  });
  await importBackup();
  await page.evaluate(async () => {finishMovie({hours:2,known:true});await pendingMovie;});
  assert.deepEqual(await page.evaluate(() => queue.map(item => item.name)),['Imported'],'Old lookup cannot modify an imported queue');
  await page.evaluate(() => {
    $('youtubeTitle').value='Old playlist';$('youtubeUrl').value='https://www.youtube.com/playlist?list=PL1234567890abcdef';
    readPlaylistDurations=() => new Promise(resolve => {window.finishPlaylist=resolve;});
    window.pendingPlaylist=$('youtubeAdd').onclick();
  });
  await importBackup();
  await page.evaluate(async () => {finishPlaylist([3600]);await pendingPlaylist;});
  assert.deepEqual(await page.evaluate(() => queue.map(item => item.name)),['Imported'],'Old playlist cannot modify an imported queue');
  assert.equal(await page.locator('#youtubeAdd').isEnabled(),true);
  await page.evaluate(() => {
    addToQueue({name:'Temporary',kind:'Movie',hours:1});
    window.pendingMovie=choosePick({name:'Old movie',kind:'Movie',qid:'Q123'});
    $('undo').click();
  });
  await page.evaluate(async () => {finishMovie({hours:2,known:true});await pendingMovie;});
  assert.deepEqual(await page.evaluate(() => queue.map(item => item.name)),['Imported'],'Old lookup cannot modify an undone queue');
  await page.evaluate(async () => {
    window.pendingMovie=choosePick({name:'Selected movie',kind:'Movie',qid:'Q123'});
    $('name').value='New search';
    finishMovie({hours:2,known:true});await pendingMovie;
  });
  assert.deepEqual(await page.evaluate(() => queue.map(item => item.name)),['Imported','Selected movie'],'New searches still allow selected additions to finish');
  assert.equal(await page.locator('#name').inputValue(),'New search');
  console.log('PASS async story drafts and additions',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error => {console.error(error);process.exitCode=1;});
