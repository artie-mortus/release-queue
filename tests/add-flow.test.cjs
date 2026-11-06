const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

runBrowserSuite({contextOptions:{reducedMotion:'reduce', viewport:{width:390,height:844}}}, async ({url,page}) => {
  await page.goto(url);
  await page.evaluate(() => {
    window.catalogCalls = 0;
    const empty = async () => { catalogCalls++; return []; };
    findShows = findPodcasts = findLightNovels = findWebFiction = findWikidata = findBooks = empty;
  });
  await openAddDialog(page);
  await page.locator('#name').fill('Unlisted personal title');
  await page.waitForFunction(() => $('suggestions').textContent.includes('Nothing found'));
  assert.match(await page.locator('#suggestions').textContent(), /Choose a media type and set the hours/);
  assert.match(await page.locator('#addHelp').textContent(), /choose a media type/);
  assert.equal(await page.locator('#add').isEnabled(), false);
  await page.locator('#kind').selectOption('Show');
  await page.locator('#amount').fill('7.5');
  await page.locator('#add').click();
  assert.deepEqual(await page.evaluate(() => ({name:queue[0].name, kind:queue[0].kind, hours:queue[0].hours})),
    {name:'Unlisted personal title',kind:'Show',hours:7.5});
  await openAddDialog(page);
  await page.locator('#name').fill('Dune: Part Two');
  assert.equal(await page.locator('#add').isEnabled(), true, 'A colon in a title must not route it as a URL');

  await page.evaluate(() => {
    catalogCalls = 0;
    readYoutubePlaylistTitle = async () => 'Personal playlist';
    readPlaylistDurations = async () => Object.assign([600,1200], {videoIds:['abcdefghijk','lmnopqrstuv']});
  });
  await openAddDialog(page);
  await page.locator('#name').fill('https://youtube.com/playlist?list=PL1234567890abcdef');
  assert.equal(await page.locator('#youtubeUrl').isVisible(), true);
  assert.equal(await page.locator('#add').textContent(), 'Add playlist');
  await page.locator('#name').press('Enter');
  await page.waitForFunction(() => queue.length === 2);
  assert.equal(await page.evaluate(() => queue[1].youtube.durations.length), 2);
  assert.deepEqual(await page.evaluate(() => queue[1].youtube.videoIds), ['abcdefghijk','lmnopqrstuv']);
  assert.equal(await page.locator('#name').inputValue(), '');
  assert.equal(await page.evaluate(() => catalogCalls), 0, 'URLs must bypass title providers');

  await page.evaluate(() => {
    fetchStoryText = async () => '<title>Personal story | Archive of Our Own</title><h2 class="title">Personal story</h2><dl class="stats"><dt>Words:</dt><dd>55,000</dd><dt>Chapters:</dt><dd>4/4</dd></dl>';
  });
  await openAddDialog(page);
  await page.locator('#name').fill('https://archiveofourown.org/works/123');
  assert.equal(await page.locator('#webUrl').isVisible(), true);
  await page.locator('#name').press('Enter');
  await page.waitForFunction(() => $('webTitle').value === 'Personal story');
  assert.equal(await page.locator('#webLength').inputValue(), '55000');
  await page.locator('#webAdd').click();
  assert.equal(await page.evaluate(() => queue[2].book.words), 55000);
  assert.equal(await page.locator('#name').inputValue(), '');
  assert.equal(await page.evaluate(() => catalogCalls), 0);
  await openAddDialog(page);
  await page.locator('#name').fill('https://example.com/unknown');
  assert.equal(await page.locator('#add').isEnabled(), false);
  assert.match(await page.locator('#addHelp').textContent(), /Other stories can be entered below/);
  assert.equal(await page.locator('#suggestions').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  console.log(`${url.startsWith('file:') ? 'file' : 'http'}: manual entry and playlist/story routing passed`);
}).catch(error => { console.error(error); process.exitCode = 1; });
