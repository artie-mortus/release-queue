const {runBrowserSuite,goToView,openAddDialog} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
runBrowserSuite({contextOptions:{viewport:{width:390, height:844}}, network:async ({context}) => {
  await context.route(/^https:\/\//, async route => {
    const target = route.request().url();
    if(target === 'https://archiveofourown.org/works/123') {
      return route.fulfill({contentType:'text/html', headers:{'Access-Control-Allow-Origin':'*'}, body:`<title>Home - Again - Writer - Fandom | Archive of Our Own</title><h2 class="title">Home - Again</h2><dl class="stats"><dt>Words:</dt><dd>55,000</dd><dt>Chapters:</dt><dd>4/10</dd></dl><p>Chapter 99</p>`});
    }
    if(target === 'https://r.jina.ai/https://m.fanfiction.net/s/456/2/Another-Story') {
      // Reader's default article extraction omits FF.net's profile metadata.
      const fullPage = route.request().headers()['x-respond-with'] === 'html';
      return route.fulfill({contentType:'text/plain', headers:{'Access-Control-Allow-Origin':'*'}, body:fullPage
        ? '<html><head><title>Another Story Chapter 2: Home, a sample fanfic | FanFiction</title></head><body><div id="profile_top"><b class="xcontrast_txt">Another Story</b><span class="xgray">Rated: Fiction T - Chapters: 5 - Words: 110,000</span></div><div id="storytext">Chapter 99. Words: 999,999</div></body></html>'
        : 'Title: Another Story Chapter 2: Home, a sample fanfic\nMarkdown Content:\nStory text without the profile header.'});
    }
    return route.abort();
  });
}}, async ({url,page,context}) => {
  await page.goto(url);
  await openAddDialog(page,'storyAddPanel');
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://archiveofourown.org/works/123');
  await page.locator('#webUrl').press('Tab');
  await page.waitForFunction(() => document.querySelector('#webLookupStatus').textContent.startsWith('Found Home'));
  assert.equal(await page.locator('#webTitle').inputValue(), 'Home - Again');
  assert.equal(await page.locator('#webLength').inputValue(), '55000');
  assert.equal(await page.locator('#webChapters').inputValue(), '4');
  await page.locator('#webAdd').click();
  assert.match(await page.locator('#queue').innerText(), /AO3/);
  await page.locator('[data-book-progress]').fill('2');
  await page.locator('[data-book-progress]').press('Enter');
  assert.equal(await page.evaluate(() => queue[0].book.progress), 2);
  assert.equal(await page.evaluate(() => queue[0].hours), 0.5);
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://m.fanfiction.net/s/456/2/Another-Story');
  await page.locator('#webUrl').press('Tab');
  await page.waitForFunction(() => document.querySelector('#webLookupStatus').textContent.startsWith('Found Another'), null, {timeout:3000});
  // Switching away from a fetched story must not leave its details behind.
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://archiveofourown.org/works/789');
  assert.equal(await page.locator('#webTitle').inputValue(), '');
  assert.equal(await page.locator('#webLength').inputValue(), '');
  assert.equal(await page.locator('#webChapters').inputValue(), '');
  await page.locator('#webUrl').press('Tab');
  await page.waitForFunction(() => document.querySelector('#webLookupStatus').textContent.includes('could not be read'));
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://m.fanfiction.net/s/456/2/Another-Story');
  await page.locator('#webUrl').press('Tab');
  await page.waitForFunction(() => document.querySelector('#webLookupStatus').textContent.startsWith('Found Another') && document.querySelector('#webTitle').value === 'Another Story');
  await page.locator('#webAdd').click();
  assert.match(await page.locator('#queue').innerText(), /FanFiction.net/);
  const beforeReload = await page.evaluate(() => {
    saveState();
    const parsed = parseStateText(serializeState());
    if(!parsed.ok) throw Error(parsed.error);
    return parsed.queue;
  });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => queue), beforeReload);
  // Blocked lookup still allows a short work to be entered and saved.
  await openAddDialog(page,'storyAddPanel');
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://archiveofourown.org/works/789');
  await page.locator('#webUrl').press('Tab');
  await page.waitForFunction(() => document.querySelector('#webLookupStatus').textContent.includes('could not be read'));
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webTitle').fill('A drabble');
  await page.locator('#webLength').fill('100');
  await page.locator('#webChapters').fill('1');
  await page.locator('#webAdd').click();
  assert.equal(await page.evaluate(() => parseStateText(serializeState()).queue[2].book.words), 100);
  // A stalled direct request must leave time for Reader to retrieve stats.
  const timeoutFallback = await page.evaluate(async () => {
    const originalFetch = window.fetch;
    let directCalls = 0;
    window.fetch = (url, options) => {
      if(url === 'https://m.fanfiction.net/s/456/2/Another-Story'){
        directCalls++;
        return new Promise((resolve, reject) => options.signal.addEventListener('abort',
          () => reject(new DOMException('Timed out', 'AbortError')), {once:true}));
      }
      return originalFetch(url, options);
    };
    try{
      document.querySelector('#webUrl').value = 'https://m.fanfiction.net/s/456/2/Another-Story';
      const pending = lookupWebNovel();
      await lookupWebNovel(); // paste + blur must share the in-flight lookup
      await pending;
      return {directCalls, title:document.querySelector('#webTitle').value,
        words:document.querySelector('#webLength').value, chapters:document.querySelector('#webChapters').value};
    }finally{ window.fetch = originalFetch; }
  });
  assert.deepEqual(timeoutFallback, {directCalls:1, title:'Another Story', words:'110000', chapters:'5'});
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webUrl').fill('https://www.royalroad.com/fiction/123/example');
  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webTitle').fill('Manual Royal Road');
  await page.locator('#webLength').fill('55000');
  await page.locator('#webChapters').fill('');
  assert.equal(await page.locator('#webChapters').evaluate(node=>node.required),true);
  assert.equal(await page.locator('#webChaptersRequirement').textContent(),'Required for Royal Road');
  const before=await page.evaluate(()=>queue.length);
  await page.locator('#webAdd').click();
  assert.equal(await page.evaluate(()=>queue.length),before);
  assert.match(await page.locator('#webHelp').textContent(),/need their total chapter count/);
  await page.locator('#webChapters').fill('4');
  await page.locator('#webAdd').click();
  assert.equal(await page.evaluate(()=>queue.at(-1).book.chapters),4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await openAddDialog(page,'storyAddPanel');
  await page.locator('#webTitle').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/release-queue-fanfiction.png', animations:'disabled'});

  console.log('Fanfiction browser checks passed for static HTTP and file URLs.');
}).catch(error => {console.error(error); process.exitCode = 1;});
