import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
// Run against a local server: CT_ATLAS_URL=http://127.0.0.1:8767/ node scripts/check-mobile.mjs
// Requires Node 22+ and Chromium/Chrome/Edge; set BROWSER_PATH if not auto-detected.
// Optional CT_ATLAS_BASELINE_URL compares desktop geometry against main.
const baseUrl=(process.env.CT_ATLAS_URL||'http://127.0.0.1:8767/').replace(/\/?$/, '/');
const baselineUrl=process.env.CT_ATLAS_BASELINE_URL;
const output=fs.mkdtempSync(path.join(os.tmpdir(),'ct-mobile-screenshots-'));
const browserPath=process.env.BROWSER_PATH||[
 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Google/Chrome/Application/chrome.exe',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'
].find(p=>fs.existsSync(p));
if(!browserPath)throw Error('Set BROWSER_PATH to a Chromium-based browser executable.');
if(typeof WebSocket==='undefined')throw Error('This browser test requires Node 22 or newer.');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ct-browser-'));
const browser=spawn(browserPath,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+directory,'about:blank'],{stdio:'ignore',windowsHide:true});
const portFile=path.join(directory,'DevToolsActivePort');
for(let i=0;i<100&&!fs.existsSync(portFile);i++) await new Promise(r=>setTimeout(r,100));
const [port,route]=fs.readFileSync(portFile,'utf8').trim().split(/\s+/);
const socket=new WebSocket('ws://127.0.0.1:'+port+route);
await once(socket,'open');
let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
async function send(method,params={},sessionId){const n=++id;const response=new Promise(r=>pending.set(n,r));socket.send(JSON.stringify({id:n,method,params,sessionId}));const m=await response;if(m.error)throw Error(JSON.stringify(m.error));return m.result}
const timeout=setTimeout(()=>{browser.kill();process.exit(1)},240000);
try {
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const call=(method,params)=>send(method,params,sessionId);
 async function run(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 async function viewport(width,height,mobile=true){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await call('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});await new Promise(r=>setTimeout(r,150));}
 async function navigate(url){await call('Page.navigate',{url});for(let n=0;n<160;n++){if(await run("typeof displayedImage!=='undefined' && !!displayedImage && document.getElementById('loading').hidden"))return;await new Promise(r=>setTimeout(r,100));}throw Error('Viewer failed to load');}
 async function screenshot(name){fs.writeFileSync(path.join(output,name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 function assert(condition,message){if(!condition)throw Error(message);}
 const metrics=`(()=>{const r=$('viewer').getBoundingClientRect(),c=$('canvas').getBoundingClientRect(),b=scanBounds();return {w:r.width,h:r.height,left:c.left,top:c.top,cw:c.width,ch:c.height,sx:c.width/viewWidth,sy:c.height/viewHeight,scanWidth:(b.right-b.left)*c.width/viewWidth,overflow:document.documentElement.scrollWidth>innerWidth,loaded:!!displayedImage,source:$('frame').src};})()`;
 await viewport(1440,900,false);
 await navigate((baselineUrl||baseUrl)+'viewer.html?series=head');
 const baseline=await run(`(async()=>{const out={};for(const s of series){await switchSeries(s.id);await show(Math.floor(views.length/2));out[s.id]=${metrics};}return out;})()`);
 await viewport(390,844);
 await run("switchSeries('head').then(()=>show(25))");
 const before=await run(metrics);await screenshot('phone-before');
 await navigate(baseUrl+'viewer.html?series=head');
 await run('show(25)');await screenshot('phone-after');
 const after=await run(metrics);if(baselineUrl)assert(after.scanWidth>before.scanWidth*1.7,'Scan did not grow enough');
 console.log('Phone head scan width (baseline -> current):',before.scanWidth.toFixed(1),'->',after.scanWidth.toFixed(1));
 const sizes=[[320,568],[390,844],[844,390],[768,1024],[1024,768],[1440,900]];
 for(const [width,height] of sizes){
  await viewport(width,height,width<=1040);
  const results=await run(`(async()=>{const out={};for(const s of series){await switchSeries(s.id);await show(Math.floor(views.length/2));out[s.id]=${metrics};}return out;})()`);
  assert(Object.keys(results).length===15,'Missing series test results');
  for(const [id,m] of Object.entries(results)){
   assert(!m.overflow,'Overflow '+width+' '+id);assert(m.loaded&&m.h>100,'No usable image '+id);
   assert(Math.abs(m.sx-m.sy)<.0001,'Distorted image '+id+' '+JSON.stringify(m));
   if(width===1440){const b=baseline[id];for(const key of ['w','h','left','top','cw','ch'])assert(Math.abs(m[key]-b[key])<.1,'Desktop geometry changed '+id+' '+key);}
  }
  console.log('PASS',width+'x'+height,Object.keys(results).length,'series, uniform scaling, no page overflow');
  await run("switchSeries('head').then(()=>show(25))");await screenshot('viewport-'+width+'x'+height);
 }
 await viewport(390,844);await run("switchSeries('head').then(()=>show(25))");
 const center=await run("(()=>{const r=$('viewer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 async function touch(type,points){await call('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i,radiusX:2,radiusY:2}))});await new Promise(r=>setTimeout(r,40));}
 const x=center.x,y=center.y;
 await touch('touchStart',[[x-40,y],[x+40,y]]);
 await touch('touchMove',[[x-70,y],[x+70,y]]);
 await touch('touchMove',[[x-85,y],[x+85,y]]);
 await touch('touchEnd',[]);
 const z=await run('zoom');assert(z>1.9&&z<2.3,'Pinch failed '+z);assert(await run('index')===25,'Pinch changed slice');
 const oldPan=await run('panX');await touch('touchStart',[[x,y]]);await touch('touchMove',[[x+35,y+15]]);await touch('touchEnd',[]);
 assert(Math.abs((await run('panX'))-oldPan)>20,'Touch pan failed');
 await run("$('mobileFit').click()");assert(await run('zoom===1&&panX===0&&panY===0'),'Fit reset failed');
 await touch('touchStart',[[x,y]]);await touch('touchMove',[[x,y-65]]);await touch('touchEnd',[]);await new Promise(r=>setTimeout(r,400));
 assert(await run('index')===26,'Slice swipe failed');
 await run("$('previousView').click()");await new Promise(r=>setTimeout(r,300));assert(await run('index')===25,'Previous button failed');
 await run("$('mobileSlice').value=10;$('mobileSlice').dispatchEvent(new Event('input'))");await new Promise(r=>setTimeout(r,300));assert(await run('index')===9,'Slider failed');
 await run("$('mobileOverview').click()");assert(await run('mobileOverview&&zoom===1'),'Overview failed');await screenshot('phone-overview');
 await run("$('mobileOverview').click();setContrastMode(true)");
 const oldContrast=await run('contrast');await touch('touchStart',[[60,y]]);await touch('touchMove',[[20,y+20]]);await touch('touchEnd',[]);assert(await run('contrast')!==oldContrast,'Touch contrast failed');
 await run("(async()=>{setContrastMode(false);$('resetContrast').click();await show(0)})()");assert(await run("$('previousView').disabled"),'First view boundary');
 await run('show(views.length-1)');assert(await run("$('nextView').disabled"),'Last view boundary');
 await run("(async()=>{await switchSeries('head');await show(25);$('labels').click()})()");
 assert(await run("getComputedStyle($('drawer')).display!=='none'"),'Labels drawer inaccessible');await screenshot('phone-labels');
 await run("(async()=>{$('closeLabels').click();document.documentElement.requestFullscreen=()=>Promise.reject(new Error('test fallback'));await $('mobileFullscreen').onclick()})()");
 assert(await run("document.body.classList.contains('mobile-immersive')"),'Fullscreen fallback missing');
 await screenshot('phone-fullscreen-fallback');
 await run("$('mobileFullscreen').onclick()");assert(await run("!document.body.classList.contains('mobile-immersive')"),'Fullscreen exit failed');
 await run("(async()=>{delete document.documentElement.requestFullscreen;await $('mobileFullscreen').onclick()})()");
 assert(await run('!!document.fullscreenElement'),'Native fullscreen failed');
 await run("$('mobileFullscreen').onclick()");assert(await run('!document.fullscreenElement'),'Native fullscreen exit failed');
 await run("resetMobileFit();show(25)");
 await touch('touchStart',[[x-35,y],[x+35,y]]);await touch('touchMove',[[x-50,y],[x+50,y]]);await touch('touchCancel',[]);
 assert(await run('touchPoints.size===0&&touchGesture===null'),'Cancelled gesture leaked state');
 await viewport(844,390);assert(await run('zoom===1&&panX===0&&panY===0'),'Rotation did not refit');
 await viewport(1440,900,false);await run("switchSeries('head').then(()=>show(25))");
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await new Promise(r=>setTimeout(r,300));
 assert(await run('index')===26,'Desktop keyboard regression');
 const mouseCenter=await run("(()=>{const r=$('viewer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await call('Input.dispatchMouseEvent',{type:'mouseWheel',...mouseCenter,deltaX:0,deltaY:100});await new Promise(r=>setTimeout(r,300));assert(await run('index')===27,'Desktop wheel regression');
 console.log('PASS gestures, cancellation, rotation, slice controls, labels, contrast, native/fallback fullscreen, desktop keyboard/wheel');
 console.log('Screenshots:',output);
}finally{clearTimeout(timeout);await send('Browser.close').catch(()=>{});browser.kill();}
