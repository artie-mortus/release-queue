const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const {chromiumPath} = require('./browser-fixture.cjs');

test('deployed HTML versions scripts and styles by their actual contents',async()=>{
  const root=path.resolve(__dirname,'..');
  execFileSync(process.execPath,['scripts/prepare-site.mjs'],{cwd:root});
  const dist=path.join(root,'_site');
  const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
  const assets=['styles.css','time-bridge-core.js','lookups.js','app.js'];
  for(const file of assets){
    const bytes=fs.readFileSync(path.join(root,file));
    const version=createHash('sha256').update(bytes).digest('hex').slice(0,12);
    assert.ok(html.includes(`"${file}?v=${version}"`),`${file} must get a content version`);
    assert.deepEqual(fs.readFileSync(path.join(dist,file)),bytes);
  }
  assert.deepEqual(fs.readdirSync(dist).sort(),['index.html',...assets,'assets'].sort());
  const browser=await chromium.launch({executablePath:chromiumPath(),headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.route(/^https:\/\//,route=>route.abort());
    await page.goto(`file://${dist}/index.html`);
    assert.equal(await page.evaluate(()=>booted),true,'Versioned scripts load directly from disk');
    assert.equal(await page.locator('#track').evaluate(el=>getComputedStyle(el).height),'44px','Versioned stylesheet loads');
  }finally{await browser.close();}
});
