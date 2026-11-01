const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');

(async()=>{
  await runBrowserSuite({},async({url,page})=>{
    await page.goto(url);
    await page.waitForFunction(()=>booted);
    await goToView(page,'settings');
    await page.evaluate(()=>{
      const episodes=Array.from({length:15000},(_,index)=>({
        season:Math.floor(index / 1000) + 1,
        number:index % 1000 + 1,
        seconds:1800,
        availableOn:'2026-09-22'
      }));
      queue=[{name:'Large show',kind:'Show',hours:7500,show:{episodes,watched:0}}];
    });

    await page.evaluate(()=>{
      const createObjectURL=URL.createObjectURL.bind(URL);
      window.exportedBlob=null;
      URL.createObjectURL=blob=>{
        window.exportedBlob=blob;
        return createObjectURL(blob);
      };
    });
    await page.locator('#export').click();
    const exportedText=await page.evaluate(()=>window.exportedBlob.text());
    assert.ok(Buffer.byteLength(exportedText)>1_000_000,
      'Generated backup should exceed the former one-million-byte import ceiling');
    assert.ok(Buffer.byteLength(exportedText)<10 * 1024 * 1024,
      'Generated backup should remain inside the supported portable-save limit');

    await page.locator('#importFile').setInputFiles({name:'large-save.md',mimeType:'text/markdown',buffer:Buffer.from(exportedText)});
    await page.waitForFunction(()=>$('saveState').textContent.includes('Loaded 1 item'));
    assert.equal(await page.evaluate(()=>queue[0].show.episodes.length),15000,
      'Import should preserve all episode source data');

    const tooLarge=Buffer.alloc(10 * 1024 * 1024 + 1,0x61);
    await page.locator('#importFile').setInputFiles({name:'oversized.md',mimeType:'text/markdown',buffer:tooLarge});
    await page.waitForFunction(()=>$('saveState').textContent.includes('exceeds the supported 10 MiB limit'));

    await page.evaluate(()=>{
      queue=[{name:'x'.repeat(TimeBridgeCore.MAX_PORTABLE_SAVE_BYTES + 1),kind:'Movie',hours:1}];
    });
    await page.locator('#export').click();
    await page.waitForFunction(()=>$('saveState').textContent.includes('Could not export this queue'));
  });
  console.log('Portable save limits and large export/import round-trip passed on HTTP and file URLs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
