const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const sharp = require('sharp');
const root = path.resolve('site-review');
const exportCommit = process.env.GITHUB_SHA || null;
const url = 'https://kirktheunderstander.github.io/Portfolio-Dossier/?review=' + encodeURIComponent(exportCommit || Date.now());
const pause = ms => new Promise(r=>setTimeout(r,ms));
const report = {url,exportCommit,capturedAt:new Date().toISOString(),errors:[],failedRequests:[],viewports:[],images:[]};
async function load(page) {
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),reason:r.failure()?.errorText}));
  const response = await page.goto(url,{waitUntil:'networkidle',timeout:60000});
  assert.equal(response.status(),200);
  assert.equal(await page.locator('script[src="assets/site.js"]').count(),1,'Published version');
  await page.evaluate(()=>document.fonts.ready);
  const height = await page.evaluate(()=>document.documentElement.scrollHeight);
  for(let y=0;y<height;y+=700){await page.evaluate(y=>window.scrollTo(0,y),y);await pause(70);}
  await pause(1400);
  await page.evaluate(async()=>{await Promise.all([...document.images].filter(img=>img.getClientRects().length).map(img=>img.decode().catch(()=>{})));window.scrollTo(0,0);});
  await pause(200);
}
async function layout(page,width) {
  await page.setViewportSize({width,height:900});
  await pause(150);
  const result = await page.evaluate(()=>({
    viewport:innerWidth,document:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
    overflow:[...document.querySelectorAll('section, .container, .hero-meta, .case-title, .case-body, .results-grid, .ai-gallery, .prompt-workbench, .contact-link-value')].filter(el=>{
      const r=el.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1);
    }).map(el=>({tag:el.tagName,id:el.id,class:el.className,width:el.getBoundingClientRect().width})),
    brokenImages:[...document.images].filter(i=>i.getClientRects().length&&i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),
    fonts:{body:document.fonts.check('17px "IBM Plex Sans"'),serif:document.fonts.check('48px "Fraunces"'),mono:document.fonts.check('12px "JetBrains Mono"')}
  }));
  report.viewports.push(result);
  console.log('Layout checked: '+width+'px');
}
async function record(page,target,options={}) {
  const output=path.join(root,target);fs.mkdirSync(path.dirname(output),{recursive:true});
  await page.screenshot({path:output,animations:'disabled',...options});
  const m=await sharp(output).metadata();report.images.push({file:target,width:m.width,height:m.height});
}
async function slices(source,folder,step=1504,height=1600) {
  const m=await sharp(path.join(root,source)).metadata();fs.mkdirSync(path.join(root,folder),{recursive:true});
  let number=1;
  for(let top=0;top<m.height;top+=step){
    const name=folder+'/'+String(number++).padStart(2,'0')+'.png';const h=Math.min(height,m.height-top);
    await sharp(path.join(root,source)).extract({left:0,top,width:m.width,height:h}).png().toFile(path.join(root,name));
    report.images.push({file:name,width:m.width,height:h,top});
    if(top+h===m.height)break;
  }
}
(async()=>{
  fs.mkdirSync(root,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await context.newPage();await load(page);
    for(const width of [320,375,390,768,1024,1440])await layout(page,width);
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await pause(200);
    await record(page,'desktop-full.png',{fullPage:true});await slices('desktop-full.png','desktop');
    console.log('Desktop full page and readable slices exported');
    const workbench=page.locator('[data-prompt-tabs]');
    await workbench.scrollIntoViewIfNeeded();await pause(100);
    const panel=page.locator('#prompt-panel-1');
    const size=await panel.evaluate(el=>({height:el.clientHeight,total:el.scrollHeight}));
    for(let top=0,n=1;top<size.total;top+=size.height-80,n++){
      await panel.evaluate((el,top)=>el.scrollTop=top,top);await pause(100);
      const target='tabs/01-protocol-'+String(n).padStart(2,'0')+'.png';fs.mkdirSync(path.dirname(path.join(root,target)),{recursive:true});
      await workbench.screenshot({path:path.join(root,target),animations:'disabled'});
      report.images.push({file:target,panelScroll:Math.min(top,size.total-size.height)});
      if(top+size.height>=size.total)break;
    }
    for(const i of [2,3]){
      await page.locator('#prompt-tab-'+i).click();await pause(300);
      assert.equal(await page.locator('#prompt-tab-'+i).getAttribute('aria-selected'),'true');
      await page.locator('#prompt-panel-'+i+' img').evaluate(img=>img.decode());
      const target='tabs/0'+i+(i===2?'-alexandrino.png':'-uav.png');
      await workbench.screenshot({path:path.join(root,target),animations:'disabled'});report.images.push({file:target});
    }
    await page.locator('#prompt-panel-3 button').click();await pause(200);
    assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'),'false');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'),'true');
    await page.locator('#prompt-tab-1').click();await panel.evaluate(el=>el.scrollTop=0);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await pause(150);
    assert.equal(await page.locator('#topbar').evaluate(el=>el.classList.contains('on-dark')),true);
    await record(page,'desktop-contacts.png');
    const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const mobile=await mobileContext.newPage();await load(mobile);
    await record(mobile,'mobile-full.png',{fullPage:true});await slices('mobile-full.png','mobile',1804,1900);
    await record(mobile,'mobile-hero.png');
    await mobile.locator('#burger').click();await pause(150);
    assert.equal(await mobile.locator('#mobile-menu').getAttribute('aria-hidden'),'false');
    await record(mobile,'mobile-menu.png');
    await mobile.keyboard.press('Escape');assert.equal(await mobile.locator('#mobile-menu').getAttribute('aria-hidden'),'true');
    await mobile.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await pause(150);await record(mobile,'mobile-contacts.png');
    const firstContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    const first=await firstContext.newPage();first.on('pageerror',e=>report.errors.push(e.message));
    await first.goto(url,{waitUntil:'domcontentloaded'});await first.waitForFunction(()=>!document.documentElement.classList.contains('intro-pending')&&!document.body.classList.contains('intro-active'),{},{timeout:8000});
    assert.equal(await first.locator('.hero').evaluate(el=>getComputedStyle(el).visibility),'visible');
    assert.equal(await first.locator('#intro').evaluate(el=>getComputedStyle(el).display),'none');
    report.intro='First visit completed in real browser';
    assert.deepEqual(report.errors,[],'No runtime errors');
    fs.writeFileSync(path.join(root,'README.txt'),'Для Gemini: начните с desktop/ — это весь сайт сверху вниз в читаемых PNG, с небольшим перекрытием кадров. Затем добавьте tabs/ для всех состояний вкладок. mobile/ содержит полный сайт на ширине 390 px. Файлы desktop-full.png и mobile-full.png дают общий вид, но могут автоматически уменьшаться при загрузке. Снимки сделаны с публичного GitHub Pages, без изменения оформления. Для статичных кадров включено уменьшение анимаций. Движение и плавность интерактива оцениваются отдельно в браузере.\n');
    fs.writeFileSync(path.join(root,'render-report.json'),JSON.stringify(report,null,2));
    assert.deepEqual(report.viewports.filter(x=>x.document!==x.viewport||x.overflow.length||x.brokenImages.length),[],'Layout issues');
    console.log(JSON.stringify({images:report.images.length,errors:report.errors,failedRequests:report.failedRequests,viewports:report.viewports.map(x=>x.viewport),intro:report.intro}));
  } finally {await browser.close();}
})().catch(e=>{fs.writeFileSync(path.join(root,'render-report.json'),JSON.stringify(report,null,2));console.error(e.stack);process.exitCode=1;});
