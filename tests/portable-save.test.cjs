const {runBrowserSuite,goToView} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const {zipSync,strToU8} = require('../assets/vendor/fflate-0.8.3.js');

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

    const smallBackup=await page.evaluate(()=>TimeBridgeCore.serializeState({
      appName:APP_NAME, target:currentReleaseTarget(), savedAt:new Date(),
      queue:[{name:'Zipped queue',kind:'Movie',hours:2}], completed:[],schedule:TimeBridgeCore.parseStateText(serializeState()).schedule
    }));
    await page.evaluate(()=>{ queue=[{name:'Before ZIP',kind:'Movie',hours:1}]; render({forceQueue:true}); });
    for(const level of [0,6]){
      const archive=zipSync({'backup/release-queue.md':strToU8(smallBackup),'notes.txt':strToU8('Extra file')},{level});
      await page.locator('#importFile').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer:Buffer.from(archive)});
      await page.waitForFunction(()=>$('saveState').textContent.includes('Loaded 1 item from backup.zip'));
      assert.equal(await page.evaluate(()=>queue[0].name),'Zipped queue');
      await page.evaluate(()=>$('undo').click());
      assert.equal(await page.evaluate(()=>queue[0].name),'Before ZIP','ZIP imports support Undo');
    }
    const before=await page.evaluate(()=>serializeState().split('Saved ')[0] + JSON.stringify({queue,completed}));
    const badArchives=[
      [Buffer.from('invalid archive'),'could not be read'],
      [zipSync({'notes.txt':strToU8('No backup')}),'exactly one Markdown'],
      [zipSync({'a.md':strToU8(smallBackup),'b.md':strToU8(smallBackup)}),'exactly one Markdown'],
      [zipSync({'queue.md':new Uint8Array(10 * 1024 * 1024 + 1)}),'extracted backup exceeds'],
      [zipSync({'queue.md':strToU8('Unrelated Markdown')}),'Could not load']
    ];
    for(const [archive,message] of badArchives){
      await page.locator('#importFile').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from(archive)});
      await page.waitForFunction(message=>$('saveState').textContent.includes(message),message);
      assert.equal(await page.evaluate(()=>serializeState().split('Saved ')[0] + JSON.stringify({queue,completed})),before,
        'Rejected ZIP imports preserve the current queue');
      assert.equal(await page.locator('#importFile').inputValue(),'','Same file can be selected again');
    }

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
