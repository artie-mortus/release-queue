const {runBrowserSuite}=require('./browser-fixture.cjs');
const assert=require('node:assert/strict');

runBrowserSuite({contextOptions:{viewport:{width:1440,height:900},reducedMotion:'reduce'}},async({url,page})=>{
  await page.goto(url);
  await page.evaluate(()=>{
    for(const kind of Object.keys(KIND_ICON)) addToQueue({name:`A ${kind} item`,kind,hours:10});
    renderCommands();
  });
  const artwork=await page.evaluate(()=>{
    const ns='http://www.w3.org/2000/svg';
    return [...document.querySelectorAll('symbol')].map(symbol=>{
      const svg=document.createElementNS(ns,'svg'),group=document.createElementNS(ns,'g');
      svg.setAttribute('width','256');svg.setAttribute('height','256');
      svg.setAttribute('viewBox',symbol.getAttribute('viewBox'));
      svg.style.cssText='position:absolute;left:-10000px;top:0';
      for(const child of symbol.children) group.append(child.cloneNode(true));
      svg.append(group);document.body.append(svg);
      const b=group.getBBox();
      const view=symbol.viewBox.baseVal;
      const result={id:symbol.id,x:(b.x-view.x)/view.width,y:(b.y-view.y)/view.height,
        right:(b.x+b.width-view.x)/view.width,bottom:(b.y+b.height-view.y)/view.height};
      svg.remove();return result;
    });
  });
  assert.deepEqual(artwork.filter(b=>b.x<-.001||b.y<-.001||b.right>1.001||b.bottom>1.001),[],
    'Artwork must fit the SVG viewBox, including the podcast microphone');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('use')]
    .map(use=>use.getAttribute('href')).filter(href=>!document.querySelector(href))),[],
    'Every rendered icon must reference a bundled symbol');
  for(const width of [1440,1280,768,390]){
    await page.setViewportSize({width,height:900});
    const rows=await page.locator('[data-item-index]').evaluateAll(rows=>rows.map(row=>{
      const icon=row.querySelector('.kind').getBoundingClientRect(),grip=row.querySelector('.drag-handle').getBoundingClientRect();
      const order=row.querySelector('.item-order').getBoundingClientRect(),title=row.children[1].getBoundingClientRect();
      return {kind:row.dataset.kind,iconY:icon.y,gripY:grip.y,iconRight:icon.right,orderRight:order.right,titleX:title.x,width:icon.width,height:icon.height};
    }));
    for(const row of rows){
      assert.equal(row.width,row.height,'Media icons stay square');
      assert.ok(row.iconRight<=row.orderRight+1,`${row.kind} icon stays inside its column at ${width}`);
      assert.ok(row.iconRight<row.titleX,`${row.kind} icon does not overlap its title at ${width}`);
      if(width>640) assert.ok(Math.abs(row.iconY-row.gripY)<10,`${row.kind} icon shares the grip line at ${width}`);
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#openCommands').click();
  const close=await page.locator('[data-close-dialog="commandDialog"]').evaluate(button=>{
    const b=button.getBoundingClientRect(),i=button.querySelector('svg').getBoundingClientRect();
    return {buttonX:b.x,buttonRight:b.right,iconX:i.x,iconRight:i.right};
  });
  assert.ok(close.iconX>=close.buttonX && close.iconRight<=close.buttonRight,
    'Search-field styling must not move the close icon out of its button');
  await page.locator('[data-close-dialog="commandDialog"]').click();
  assert.equal(await page.locator('#commandDialog').isVisible(),false);
  await page.screenshot({path:`/tmp/release-icons-${url.startsWith('file:')?'file':'http'}.png`,fullPage:true});
  console.log('PASS icons',url.startsWith('file:')?'direct file':'static HTTP');
}).catch(error=>{console.error(error);process.exitCode=1;});
