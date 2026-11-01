const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// One browser per suite, fresh storage per protocol, cleanup on every failure.
async function runBrowserSuite({contextOptions = {}, network = null, clockDate = '2026-09-22T12:00:00-05:00'}, check){
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname === '/assets/vendor/fflate-0.8.3.js' ? 'assets/vendor/fflate-0.8.3.js'
      : pathname === '/time-bridge-core.js' ? 'time-bridge-core.js'
      : pathname === '/assets/fonts/InterVariable.woff2' ? 'assets/fonts/InterVariable.woff2' : 'index.html';
    res.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2'
      : file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(fs.readFileSync(path.join(root, file)));
  });
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless:true, args:['--no-sandbox']});
    for(const url of [`http://127.0.0.1:${server.address().port}`,`file://${root}/index.html`]){
      const context = await browser.newContext({timezoneId:'America/Chicago',...contextOptions});
      let page;
      try{
        await context.route(/^https:\/\//,route=>route.abort());
        page = await context.newPage();
        if(clockDate) await page.clock.install({time:new Date(clockDate)});
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const fixture={url,context,page,errors,root};
        if(network) await network(fixture);
        await check(fixture);
        assert.deepEqual(errors,[]);
      }catch(error){
        const directory=path.join(root,'test-results','gui');
        fs.mkdirSync(directory,{recursive:true});
        const suite=path.basename(process.argv[1],'.cjs');
        await page?.screenshot({path:path.join(directory,`${suite}-${url.startsWith('file:')?'file':'http'}-failure.png`),
          fullPage:true,timeout:3000}).catch(()=>{});
        throw error;
      }finally{await context.close();}
    }
  }finally{
    try{await browser?.close();}
    finally{if(server.listening) await new Promise(resolve=>server.close(resolve));}
  }
}

async function goToView(page, view){
  if(await page.locator('#addDialog').isVisible()) await page.locator('[data-close-dialog="addDialog"]').click();
  await page.locator(`[data-nav="${view}"]`).click();
  await page.waitForFunction(view=>activeView===view,view);
}
async function openAddDialog(page, section){
  if(!await page.locator('#addDialog').isVisible()) await page.locator('#quickAdd').click();
  if(section && !await page.locator(`#${section}`).evaluate(el=>el.open))
    await page.locator(`#${section} > summary`).click();
}
module.exports={runBrowserSuite,goToView,openAddDialog};
