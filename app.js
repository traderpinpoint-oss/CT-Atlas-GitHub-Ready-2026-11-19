'use strict';
const $=id=>document.getElementById(id);
const series=[{id:'abdomen',name:'CT Abdomen/pelvis · Axial',views:window.CT_VIEWS,width:400,level:40,masks:window.WINDOW_MASKS,cursors:window.CURSOR_PATCHES,marks:window.MARK_CLEANUP},...window.HEAD_SERIES,...(window.CARDIAC_SERIES||[]),...(window.CHEST_SERIES||[]),...(window.MULTIPLANAR_SERIES||[])];
let activeSeries=series[0],views=activeSeries.views,viewWidth=1906,viewHeight=836,visibleHeight=650;
const seriesPositions=new Map();
function scanBounds(){return activeSeries.scanBounds|| (activeSeries.id==='abdomen'?{left:540,right:1250,top:75,bottom:625}:activeSeries.id==='cardiac'?{left:360,right:1200,top:0,bottom:visibleHeight}:{left:420,right:1110,top:5,bottom:visibleHeight})}
function sourceWindow(){const v=views[index];return {width:v?.windowWidth||activeSeries.width,level:v?.windowLevel??activeSeries.level}}
const regions = new Map();
function planeOrder(study) {
 if (study.id.includes('coronal')) return 1;
 if (study.id.includes('sagittal')) return 2;
 return 0;
}
for (const study of series) {
 const region = study.id.split('-')[0];
 if (!regions.has(region)) regions.set(region, []);
 regions.get(region).push(study);
}
for (const studies of regions.values()) studies.sort((a, b) => planeOrder(a) - planeOrder(b));
function showRegionViews(study) {
 const region = study.id.split('-')[0];
 $('regionSelect').value = region;
 const options = regions.get(region).map(item => new Option(item.name.split('·').pop().trim(), item.id));
 $('seriesSelect').replaceChildren(...options);
 $('seriesSelect').value = study.id;
}
$('regionSelect').onchange = event => switchSeries(regions.get(event.target.value)[0].id);
async function switchSeries(id){
 const next=series.find(s=>s.id===id);if(!next)return;
 if(typeof resetMobileInteraction==='function')resetMobileInteraction();
 seriesPositions.set(activeSeries.id,index);++request;activeSeries=next;views=next.views;
 $('viewer').setAttribute('data-study',id);
 const details=$('anchorDetails'), footer=$('seriesTitle').parentElement;
 if(footer && details.parentElement) {
  const parent=id==='chest-coronal'?footer:$('viewer');
  if(details.parentElement!==parent)parent.append(details);
 }
 cache.clear();windowCache.clear();displayedImage=null;displayedInk=null;selected=null;cancelPlacement();
 window.WINDOW_MASKS=next.masks;window.CURSOR_PATCHES=next.cursors;window.MARK_CLEANUP=next.marks||[];
 const params=new URLSearchParams(location.search),requested=params.get('series')===id?Number(params.get('slice')):0;
 index=target=seriesPositions.get(id)??Math.max(0,views.findIndex(v=>v.sequence===requested));zoom=1;panX=panY=0;$('fit').textContent='Fit';$('search').value='';
 showRegionViews(next);$('seriesTitle').textContent=next.name;document.title=next.name;
 contrast=40000/next.width;brightness=(40-next.level)/4;applyContrast();await show(index);fit();
}
$('seriesSelect').onchange=e=>switchSeries(e.target.value);
let index=0,target=0,request=0,zoom=1,panX=0,panY=0,selected=null,toastTimer,drag=null;
const cache=new Map();
let displayedImage=null;
let displayedInk=null;
const windowCache=new Map();
async function inflateBytes(encoded){
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}
function loadWindowInk(i){
 if(!windowCache.has(i)){
  const patch=window.WINDOW_MASKS[i];
  const bytes=Uint8Array.from(atob(patch.inkDeflate),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  windowCache.set(i,Promise.all([new Response(stream).arrayBuffer(),patch.runsDeflate&&!patch.runs?inflateBytes(patch.runsDeflate):null]).then(([ink,mask])=>{
   if(mask){const data=new DataView(mask.buffer,mask.byteOffset,mask.byteLength);patch.runs=[];for(let k=0;k<mask.length;k+=6)patch.runs.push([data.getUint16(k,true),data.getUint16(k+2,true),data.getUint16(k+4,true)]);}
   return new Uint8Array(ink);
  }).catch(e=>{windowCache.delete(i);throw e}));
 }
 return windowCache.get(i);
}
const selectedByView=new Map();
const customAnchors=new Map();
const anchorStorageKey='ct-demo-anchor-placements-v1';
let placing=false,placementPoint={x:895,y:350};
try{const saved=JSON.parse(localStorage.getItem(anchorStorageKey)||'[]');if(Array.isArray(saved))for(const entry of saved){if(entry&&typeof entry.id==='string'&&entry.point&&Number.isFinite(entry.point.x)&&Number.isFinite(entry.point.y)&&series.some(s=>s.views.some(v=>v.annotations.some(a=>a.annotation_id===entry.id))))customAnchors.set(entry.id,entry.point)}}catch{}
function validScanPoint(p){const b=scanBounds();return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom}
function saveAnchors(){try{localStorage.setItem(anchorStorageKey,JSON.stringify(Array.from(customAnchors,([id,point])=>({id,point}))));return true}catch{return false}}
function cancelPlacement(){placing=false;$('placementSurface').hidden=true;}
function updatePlacementCursor(){$('placementCursor').style.left=placementPoint.x/viewWidth*100+'%';$('placementCursor').style.top=placementPoint.y/viewHeight*100+'%'}
function beginPlacement(){
 const a=views[index].annotations.find(a=>a.annotation_id===selected);if(!a)return;
 setContrastMode(false);$('drawer').hidden=true;placing=true;drag=null;
 placementPoint={...(anchorPosition(a)||{x:895,y:350})};$('placementSurface').hidden=false;updatePlacementCursor();
 $('placementSurface').focus({preventScroll:true});$('placeAnchor').textContent='Cancel placement';
 $('anchorEvidence').textContent='Click its point on the scan, or use arrow keys and Enter.';
}
function commitPlacement(point){
 if(!placing||!selected)return;
 if(!validScanPoint(point)){toast('Choose a point inside the CT image.');return}
 customAnchors.set(selected,{x:Math.round(point.x*100)/100,y:Math.round(point.y*100)/100});
 const saved=saveAnchors();cancelPlacement();renderLabels();renderAnchors();$('placeAnchor').focus();
 toast(saved?'Your point is saved in this browser.':'Point set for this session; browser storage is unavailable.');
}
$('placeAnchor').onclick=()=>{if(placing){cancelPlacement();renderAnchors()}else beginPlacement()};
$('restoreAnchor').onclick=()=>{customAnchors.delete(selected);const saved=saveAnchors();cancelPlacement();renderLabels();renderAnchors();if(!saved)toast('Placement removed for this session; browser storage is unavailable.')};
$('placementSurface').onclick=e=>{const r=$('canvas').getBoundingClientRect();commitPlacement({x:(e.clientX-r.left)/r.width*viewWidth,y:(e.clientY-r.top)/r.height*viewHeight})};
$('placementSurface').onkeydown=e=>{
 e.stopPropagation();const step=e.shiftKey?10:1;
 if(e.key==='Escape'){e.preventDefault();cancelPlacement();renderAnchors();$('placeAnchor').focus();return}
 if(e.key==='Enter'||e.key===' '){e.preventDefault();commitPlacement(placementPoint);return}
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
 e.preventDefault();placementPoint.x=Math.max(scanBounds().left,Math.min(scanBounds().right,placementPoint.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)));
 placementPoint.y=Math.max(scanBounds().top,Math.min(scanBounds().bottom,placementPoint.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)));updatePlacementCursor();
};
let contrastMode=false,contrast=100,brightness=0;
const windowPresets=[{name:'Soft tissue',width:400,level:40},{name:'Liver',width:150,level:70},{name:'Lung',width:1500,level:-600},{name:'Bone',width:2000,level:400},{name:'Brain',width:80,level:40},{name:'Angio',width:600,level:150}];
function windowSettings(){return {width:40000/contrast,level:40-brightness*4}}
function updateWindowReadout(){
 if(typeof updateMobileControls==='function')updateMobileControls();
 const {width,level}=windowSettings();$('sliceReadout').textContent=activeSeries.id==='cardiac'?views[index].counter:`${index+1} / ${views.length}`;$('sliceReadout').title=activeSeries.recoveredViews?`Recovered view ${index+1} of ${views.length}. Recorded counter: ${views[index].source_counter}. ${views[index].source_status==='verified'?'':'Brief or ambiguous source capture.'}`:activeSeries.id==='cardiac'?`${index+1} of ${views.length} recovered views; original recorded counter`:'';
 $('wlReadout').textContent=`W ${Math.round(width)} · L ${Math.round(level)}`;
 $('windowWidth').value=Math.round(width);$('windowLevel').value=Math.round(level);
 const active=windowPresets.findIndex(p=>Math.abs(p.width-width)<.001&&Math.abs(p.level-level)<.001);
 $('presetName').textContent=active<0?'Custom':windowPresets[active].name;
 windowPresets.forEach((p,i)=>$('preset'+i).setAttribute('aria-pressed',String(i===active)));
}
function applyContrast(){
 contrast=Math.max(10,Math.min(500,contrast));brightness=Math.max(-250,Math.min(250,brightness));
 $('contrastRange').value=contrast;$('brightnessRange').value=brightness;
 $('contrastValue').textContent=Math.round(contrast)+'%';$('brightnessValue').textContent=(brightness>0?'+':'')+Math.round(brightness);
 // Approximate remapping of already-windowed pixels, using a 400/40 reference.
 // This cannot recreate HU values or detail clipped out of the source image.
 const {width,level}=windowSettings(),slope=sourceWindow().width/width,intercept=.5+(sourceWindow().level-level)/width-slope*.5;
 for(const id of ['windowRed','windowGreen','windowBlue']){const channel=$(id);channel.setAttribute('slope',slope);channel.setAttribute('intercept',intercept)}
 $('adjustedFrame').style.filter='url(#displayWindow)';
 $('adjustedFrame').hidden=Math.abs(width-sourceWindow().width)<.001&&Math.abs(level-sourceWindow().level)<.001;
 $('fixedAnnotations').hidden=$('adjustedFrame').hidden;
 if(displayedImage)renderFixedAnnotations(displayedImage);
 $('markCleanup').style.filter='url(#displayWindow)';
 updateWindowReadout();
}
function selectWindowPreset(i){
 const p=windowPresets[i];if(!p)return;
 contrast=40000/p.width;brightness=(40-p.level)/4;applyContrast();
 $('windowPresets').open=false;$('presetTrigger').focus();
}
windowPresets.forEach((p,i)=>$('preset'+i).onclick=()=>selectWindowPreset(i));
document.addEventListener('pointerdown',e=>{if(!$('windowPresets').contains(e.target))$('windowPresets').open=false});
function setContrastMode(active){if(active){cancelPlacement();renderAnchors()}contrastMode=active;drag=null;$('contrastPanel').hidden=!active;$('contrastTool').setAttribute('aria-pressed',active);$('canvas').style.cursor=active?'crosshair':'grab';}
$('contrastTool').onclick=()=>setContrastMode(!contrastMode);
$('closeContrast').onclick=()=>{setContrastMode(false);$('contrastTool').focus()};
$('contrastRange').oninput=e=>{contrast=Number(e.target.value);applyContrast()};
$('brightnessRange').oninput=e=>{brightness=Number(e.target.value);applyContrast()};
function setWindowValues(width,level){
 if(!Number.isFinite(width)||!Number.isFinite(level)){updateWindowReadout();return}
 width=Math.max(80,Math.min(4000,width));level=Math.max(-960,Math.min(1040,level));
 contrast=40000/width;brightness=(40-level)/4;applyContrast();
}
$('windowWidth').onchange=e=>{if(!e.target.value.trim()){updateWindowReadout();return}setWindowValues(Number(e.target.value),windowSettings().level)};
$('windowLevel').onchange=e=>{if(!e.target.value.trim()){updateWindowReadout();return}setWindowValues(windowSettings().width,Number(e.target.value))};
$('windowWidth').oninput=e=>{const n=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(n)&&n>=80&&n<=4000)setWindowValues(n,windowSettings().level)};
$('windowLevel').oninput=e=>{const n=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(n)&&n>=-960&&n<=1040)setWindowValues(windowSettings().width,n)};
$('resetContrast').onclick=()=>{contrast=40000/activeSeries.width;brightness=(40-activeSeries.level)/4;applyContrast()};
applyContrast();
function renderFixedAnnotations(im,ink=displayedInk){
 displayedImage=im;
 displayedInk=ink;
 const patch=window.WINDOW_MASKS[index];
 if(!patch||patch.slice_id!==views[index].id)throw new Error('Window mask does not match the slice');
 const ctx=$('fixedAnnotations').getContext('2d');
 ctx.clearRect(0,0,viewWidth,viewHeight);ctx.save();ctx.beginPath();
 // Clip geometry comes from the same source frame. Copy original pixels
 // without reading/re-encoding the image or inventing missing anatomy.
 for(const [x,y,width] of patch.runs)ctx.rect(x,y,width,1);
 ctx.clip();ctx.drawImage(im,0,0,viewWidth,viewHeight);ctx.restore();
 if(activeSeries.id!=='abdomen'){
  for(const a of views[index].annotations){const col=a.pin_color.match(/\w\w/g).map(h=>parseInt(h,16));if(Math.max(...col)-Math.min(...col)>25)continue;
   for(const p of anchorPositions(a)){const d=a.label_dot;if(!d)continue;const dx=p.x-d.x,dy=p.y-d.y,len=Math.hypot(dx,dy),nx=-dy/len*1.2,ny=dx/len*1.2;
    ctx.save();ctx.beginPath();ctx.moveTo(d.x+nx,d.y+ny);ctx.lineTo(p.x+nx,p.y+ny);ctx.lineTo(p.x-nx,p.y-ny);ctx.lineTo(d.x-nx,d.y-ny);ctx.closePath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.clip();ctx.drawImage(im,0,0,viewWidth,viewHeight);ctx.restore();}
  }
 }
 const {width,level}=windowSettings(),slope=sourceWindow().width/width,offset=.5+(sourceWindow().level-level)/width-slope*.5;
 for(let i=0;i<ink.length;i+=7){
  const x=ink[i]+ink[i+1]*256,y=ink[i+2]+ink[i+3]*256,color=ink[i+4],alpha=ink[i+5]/255,gray=ink[i+6];
  const tone=Math.max(0,Math.min(255,(gray/255*slope+offset)*255));
  const rgb=patch.palette[color].map(c=>Math.round(alpha*c+(1-alpha)*tone));
  ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(x,y,1,1);
 }
 const edge = cardiacEdgeViews[views[index].id];
 if (edge) coverOutsideCardiacField(ctx, views[index], edge);
}
function renderMarkCleanup(){
 const svg=$('markCleanup'),patch=window.MARK_CLEANUP?.[index];svg.replaceChildren();
 if(!patch||patch.slice_id!==views[index].id||!patch.regions.length)return;
 const ns='http://www.w3.org/2000/svg',make=(name,attrs={})=>{const el=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el};
 const defs=make('defs'),clip=make('clipPath',{id:'unconnectedMarkMask',clipPathUnits:'userSpaceOnUse'});
 for(const b of patch.regions)clip.append(make('rect',{x:b.x,y:b.y,width:b.width,height:b.height,rx:3}));
 const filter=make('filter',{id:'softenUnconnectedMarks',filterUnits:'userSpaceOnUse',x:0,y:0,width:viewWidth,height:viewHeight,'color-interpolation-filters':'sRGB'});
 filter.append(make('feColorMatrix',{type:'saturate',values:0}),make('feGaussianBlur',{stdDeviation:3}));defs.append(clip,filter);
 const group=make('g',{'clip-path':'url(#unconnectedMarkMask)'});
 group.append(make('image',{href:views[index].image,width:viewWidth,height:viewHeight,preserveAspectRatio:'none',filter:'url(#softenUnconnectedMarks)'}));
 svg.append(defs,group);
}
function renderCursorCleanup(){
 const patch=window.CURSOR_PATCHES[index];
 if(!patch||patch.slice_id!==views[index].id)throw new Error('Cursor overlay does not match the view');
 let svg=$('cursorCleanup');const ns='http://www.w3.org/2000/svg';
 if(!svg){svg=document.createElementNS(ns,'svg');svg.id='cursorCleanup';svg.setAttribute('aria-hidden','true');$('canvas').insertBefore(svg,$('hotspots'));}
 const b=patch.bounds;svg.setAttribute('viewBox',`0 0 ${b.width} ${b.height}`);svg.setAttribute('preserveAspectRatio','none');
 Object.assign(svg.style,{left:b.x/viewWidth*100+'%',top:b.y/viewHeight*100+'%',width:b.width/viewWidth*100+'%',height:b.height/viewHeight*100+'%'});
 const defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath'),shape=document.createElementNS(ns,'path');clip.id='cursorShape';
 shape.setAttribute('d',patch.runs.map(([x,y,w])=>`M${x} ${y}h${w}v1h${-w}z`).join(''));clip.append(shape);defs.append(clip);
 const group=document.createElementNS(ns,'g');group.setAttribute('clip-path','url(#cursorShape)');const bg=document.createElementNS(ns,'rect');bg.setAttribute('width',b.width);bg.setAttribute('height',b.height);bg.setAttribute('fill','#000');group.append(bg);
 for(const line of patch.lines){const stroke=document.createElementNS(ns,'path');const y=x=>line.slope*x+line.intercept-b.y;stroke.setAttribute('d',`M0 ${y(b.x)}L${b.width} ${y(b.x+b.width)}`);stroke.setAttribute('stroke',line.color);stroke.setAttribute('stroke-width','1.05');stroke.setAttribute('fill','none');group.append(stroke);}
 svg.replaceChildren(defs,group);
 if(typeof renderRecordedMargins==="function" && views[index].id.startsWith("MP_"))renderRecordedMargins(svg,views[index]);
}
// The last cardiac frames contain recorded labels beyond the shrinking scan field.
const cardiacEdgeViews = {
 CARDIAC_AX_156: {label: 'LV Apex', clear: [845, 89, 708, 39]},
 CARDIAC_AX_157: {label: 'Right Ventricle', clear: [0, 128, 785, 40]},
 CARDIAC_AX_158: {label: 'Middle Cardiac Vein', clear: [0, 216, 740, 45]}
};
for (const view of window.CARDIAC_SERIES[0].views) {
 const correction = cardiacEdgeViews[view.id];
 if (correction) view.annotations = view.annotations.filter(a => a.label_text !== correction.label);
}

function coverOutsideCardiacField(ctx, view, correction) {
 ctx.save();
 ctx.fillStyle = '#000';
 ctx.fillRect(...correction.clear);
 if (view.id === 'CARDIAC_AX_156') {
  // The recorded cyan fill extends past this slice's measured circular rim.
  ctx.beginPath();
  ctx.rect(730, 95, 105, 51);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(730, 95, 105, 51);
  ctx.moveTo(930.7, 371.3);
  ctx.arc(661.7, 371.3, 269, 0, 2 * Math.PI);
  ctx.fill('evenodd');
 }
 ctx.restore();
}

async function loadFrame(view) {
 const image = new Image();
 image.src = view.image;
 await image.decode();
 const correction = cardiacEdgeViews[view.id];
 if (!correction) return image;
 const canvas = document.createElement('canvas');
 canvas.width = image.naturalWidth;
 canvas.height = image.naturalHeight;
 const ctx = canvas.getContext('2d');
 ctx.drawImage(image, 0, 0);
 coverOutsideCardiacField(ctx, view, correction);
 image.src = canvas.toDataURL('image/png');
 await image.decode();
 return image;
}

function load(i) {
 if (!cache.has(i)) {
  const pending = loadFrame(views[i]).catch(error => {
   if (cache.get(i) === pending) cache.delete(i);
   throw error;
  });
  cache.set(i, pending);
 }
 return cache.get(i);
}
const headDisplayOffsets={S1_AX_005:[8,7],S1_AX_012:[-4,25],S1_AX_016:[24,25],S1_AX_021:[16,-6]};
function fit(){
 if(typeof fitMobileView==='function' && fitMobileView())return;
 if(activeSeries.id!=='abdomen'){
  const r=$('viewer').getBoundingClientRect(),stageWidth=activeSeries.stageWidth||(activeSeries.id==='cardiac'?1553:1562),stageHeight=activeSeries.stageHeight||(activeSeries.id==='cardiac'?691:660);
  const scale=Math.min(r.width/stageWidth,r.height/stageHeight);
  const [dx,dy]=headDisplayOffsets[views[index]?.id]||[0,0];
  const top=Math.max(0,-dy),right=Math.max(0,viewWidth-stageWidth+dx);
  const bottom=Math.max(viewHeight-visibleHeight,viewHeight-stageHeight+dy),left=Math.max(0,-dx);
  Object.assign($('canvas').style,{
   width:viewWidth*scale+'px',height:viewHeight*scale+'px',
   left:((r.width-stageWidth*scale)/2+dx*scale)+'px',
   top:((r.height-stageHeight*scale)/2+dy*scale)+'px',
   clipPath:`inset(${top/viewHeight*100}% ${right/viewWidth*100}% ${bottom/viewHeight*100}% ${left/viewWidth*100}%)`,
   transformOrigin:`${(stageWidth/2-dx)*scale}px ${(stageHeight/2-dy)*scale}px`,
   transform:`translate(${panX}px,${panY}px) scale(${zoom})`
  });return;
 }

 const r=$('viewer').getBoundingClientRect();
 const scale=Math.min(r.width/viewWidth,r.height/visibleHeight),w=viewWidth*scale,h=viewHeight*scale;
 // Keep original image coordinates for anchors, clipping only the recorded UI below row 650.
 Object.assign($('canvas').style,{width:w+'px',height:h+'px',left:(r.width-w)/2+'px',top:(r.height-visibleHeight*scale)/2+'px',clipPath:`inset(0 0 ${(viewHeight-visibleHeight)/viewHeight*100}% 0)`,transformOrigin:`50% ${visibleHeight/viewHeight*50}%`,transform:`translate(${panX}px,${panY}px) scale(${zoom})`});
}
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500)}
async function show(n){cancelPlacement();target=Math.max(0,Math.min(views.length-1,n));const chosen=target,token=++request;$('loading').hidden=false;try{const [im,ink]=await Promise.all([load(chosen),loadWindowInk(chosen)]);if(token!==request)return;index=chosen;const v=views[index];viewWidth=v.width||1906;viewHeight=v.height||836;visibleHeight=v.visibleHeight||650;
 $('fixedAnnotations').width=viewWidth;$('fixedAnnotations').height=viewHeight;
 for(const id of ['anchorLeader','markCleanup'])$(id).setAttribute('viewBox',`0 0 ${viewWidth} ${viewHeight}`);
 const b=scanBounds();$('adjustedFrame').style.clipPath=`inset(${b.top/viewHeight*100}% ${(viewWidth-b.right)/viewWidth*100}% ${(viewHeight-b.bottom)/viewHeight*100}% ${b.left/viewWidth*100}%)`;fit();$('frame').src=im.src;$('adjustedFrame').src=im.src;renderFixedAnnotations(im,ink);$('frame').alt=`Reference view ${index+1}, recorded counter ${v.counter}; ${activeSeries.name}`;$('viewer').setAttribute('aria-label',`${activeSeries.name}, slice ${activeSeries.id==='cardiac'?views[index].sequence:index+1} of ${activeSeries.id==='cardiac'?160:views.length}. Scroll or use arrow keys to browse.`);$('labelCount').textContent=v.annotations.length;selected=activeSeries.id==='chest-coronal'?null:selectedByView.get(v.id)||null;updateWindowReadout();renderLabels();renderHotspots();renderAnchors();renderCursorCleanup();renderMarkCleanup();if(activeSeries.id==='cardiac')applyContrast();for(let j=Math.max(0,index-2);j<=Math.min(views.length-1,index+3);j++){load(j).catch(()=>{});loadWindowInk(j).catch(()=>{})};for(const k of cache.keys())if(Math.abs(k-index)>12){cache.delete(k);windowCache.delete(k)};}catch(e){if(token===request){toast('This frame could not load. Please try again.')}}finally{if(token===request)$('loading').hidden=true}}
function anchorPositions(a){const custom=customAnchors.get(a.annotation_id);return custom?[custom]:a.points?.length?a.points:anchorPosition(a)?[anchorPosition(a)]:[]}
function anchorPosition(a){
 const p=customAnchors.get(a.annotation_id)||a.pin_full_frame_pixels||(window.RECOVERED_ANCHORS||{})[a.annotation_id]?.point;
 return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=viewWidth&&p.y>=0&&p.y<=viewHeight?p:null;
}
function select(a){
 cancelPlacement();selected=a.annotation_id;selectedByView.set(views[index].id,selected);
 renderHotspots();renderLabels();renderAnchors();
}
function clearAnchor(){cancelPlacement();selected=null;selectedByView.delete(views[index].id);renderHotspots();renderLabels();renderAnchors()}
$('clearAnchor').onclick=clearAnchor;
function renderAnchors(){
 $('anchorPoints').replaceChildren();$('anchorLeader').replaceChildren();$('pin').hidden=true;
 const chosen=views[index].annotations.find(a=>a.annotation_id===selected);
 $('anchorDetails').hidden=!chosen;
 for(const a of views[index].annotations){
  for(const p of anchorPositions(a)){
  const button=document.createElement('button');button.className='anchorPoint'+(a===chosen?' selected':'')+(!a.pin_full_frame_pixels&&!customAnchors.has(a.annotation_id)?' estimated':'');
  button.title=a.label_text;button.setAttribute('aria-label',`Anchor ${a.label_text}`);button.setAttribute('aria-pressed',String(a===chosen));
  button.style.left=p.x/viewWidth*100+'%';button.style.top=p.y/viewHeight*100+'%';button.style.color=a.pin_color||'#91a3b5';
  button.onclick=()=>{select(a);const replacement=Array.from($('anchorPoints').children).find(el=>el.title===a.label_text);if(replacement)replacement.focus({preventScroll:true})};
  $('anchorPoints').append(button);}
 }
 if(!chosen)return;
 const p=anchorPosition(chosen),b=chosen.label_box_pixels;
 $('anchorName').textContent=chosen.label_text||'Uncertain label';
 const custom=customAnchors.has(chosen.annotation_id),recovered=!chosen.pin_full_frame_pixels&&(window.RECOVERED_ANCHORS||{})[chosen.annotation_id];
 $('anchorStatus').textContent=(custom?'YOUR POINT':p?(recovered?'TRACED POINT':'ANCHORED'):'PLACE POINT')+' · VIEW '+(activeSeries.id==='cardiac'?views[index].sequence:index+1);
 $('placeAnchor').textContent=p?'Adjust point':'Place point';$('restoreAnchor').hidden=!custom;
 $('anchorEvidence').textContent=custom?'Your placement · Saved per view':p?(recovered?'Estimated from the visible leader line · Check placement':(chosen.points?'Visible leader endpoint'+(chosen.points.length>1?'s':'')+' · '+chosen.points.length+' point'+(chosen.points.length>1?'s':''):'Recorded point · Click another point to select it')):'Select Place point, then click its location on the scan.';
 if(activeSeries.id==='cardiac'&&chosen.confidence==='low'&&!custom){$('anchorStatus').textContent='UNCERTAIN POINT · VIEW '+views[index].sequence;$('anchorEvidence').textContent='Traced from the visible leader; overlapping source colors obscure the exact pin. You can adjust this point.';}
 if(!p)return;
 $('pin').hidden=false;$('pin').style.left=p.x/viewWidth*100+'%';$('pin').style.top=p.y/viewHeight*100+'%';
 if(b){for(const endpoint of anchorPositions(chosen)){
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',endpoint.x);line.setAttribute('y1',endpoint.y);
  const dot=chosen.label_dot;line.setAttribute('x2',dot?dot.x+(dot.x<endpoint.x?29:-29):(b.x+b.width/2<p.x?b.x+b.width+5:b.x-5));line.setAttribute('y2',dot?dot.y:b.y+b.height/2);
  line.setAttribute('stroke',chosen.pin_color||'#91a3b5');line.setAttribute('stroke-width','2');line.setAttribute('vector-effect','non-scaling-stroke');
  $('anchorLeader').append(line);}
 }
}
function renderHotspots(){$('hotspots').replaceChildren();for(const a of views[index].annotations){const b=a.label_box_pixels;if(!b)continue;const el=document.createElement('button');el.className='hotspot'+(selected===a.annotation_id?' selected':'');el.title=a.label_text;el.setAttribute('aria-label',`Inspect ${a.label_text}`);Object.assign(el.style,{left:(b.x-3)/viewWidth*100+'%',top:(b.y-5)/viewHeight*100+'%',width:(b.width+9)/viewWidth*100+'%',height:(b.height+10)/viewHeight*100+'%'});if (a.label_dot) {
  const x = Math.min(b.x-3, a.label_dot.x-8), right = Math.max(b.x+b.width+6, a.label_dot.x+8);
  el.style.left=x/viewWidth*100+'%'; el.style.width=(right-x)/viewWidth*100+'%';
 }if(activeSeries.id==='chest-coronal' && a.label_dot){
 const left=a.label_dot.x<viewWidth/2, edge=a.label_dot.x+(left?8:-8);
 const neighbors=views[index].annotations.filter(other=>other!==a && other.label_dot && (other.label_dot.x<viewWidth/2)===left);
 const y=a.label_dot.y, half=Math.min(15,...neighbors.map(other=>Math.abs(other.label_dot.y-y)/2));
 Object.assign(el.style,{left:(left?0:edge)/viewWidth*100+'%',width:(left?edge:viewWidth-edge)/viewWidth*100+'%',top:(y-half)/viewHeight*100+'%',height:2*half/viewHeight*100+'%'});
 }el.onclick=()=>select(a);$('hotspots').append(el)}}
function renderLabels(){const q=$('search').value.toLowerCase();$('labelList').replaceChildren();const matches=views[index].annotations.filter(a=>(a.label_text||'').toLowerCase().includes(q));for(const a of matches){const b=document.createElement('button');b.className='labelrow'+(selected===a.annotation_id?' selected':'');b.setAttribute('aria-pressed',String(selected===a.annotation_id));const dot=document.createElement('i');dot.style.background=a.pin_color||'#91a3b5';const t=document.createElement('span');t.textContent=a.label_text||'Uncertain label';const status=document.createElement('small');status.textContent=customAnchors.has(a.annotation_id)?'your point':a.pin_full_frame_pixels?'anchor':anchorPosition(a)?'traced':'place point';b.append(dot,t,status);b.onclick=()=>select(a);$('labelList').append(b)}if(!matches.length)$('labelList').textContent='No matching labels in this view.'}
function move(n){show(n)}
$('labels').onclick=()=>{$('drawer').hidden=!$('drawer').hidden;if(!$('drawer').hidden)$('search').focus()};$('closeLabels').onclick=()=>{$('drawer').hidden=true;$('labels').focus()};$('search').oninput=renderLabels;
$('about').onclick=()=>$('info').showModal();$('closeInfo').onclick=$('startExploring').onclick=()=>$('info').close();
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('Fullscreen is unavailable in this preview. Open the demo in a browser tab.')}};
$('fit').onclick=()=>{zoom=1;panX=panY=0;fit()};function changeZoom(d){zoom=Math.max(1,Math.min(typeof mobileZoomLimit==='function'?mobileZoomLimit():3,zoom+d));if(zoom===1)panX=panY=0;$('fit').textContent=zoom===1?'Fit':Math.round(zoom*100)+'%';fit()}
$('zoomIn').onclick=()=>changeZoom(.25);$('zoomOut').onclick=()=>changeZoom(-.25);$('fit').addEventListener('click',()=>$('fit').textContent='Fit');
let lastWheel=0;$('viewer').addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey){changeZoom(e.deltaY<0?.1:-.1);return}if(performance.now()-lastWheel<75)return;lastWheel=performance.now();move(target+(e.deltaY>0?1:-1))},{passive:false});
$('viewer').addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(e.button!==0||e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,px:panX,py:panY,contrast,brightness,adjust:contrastMode};$('viewer').setPointerCapture(e.pointerId);$('canvas').classList.add('dragging')});
$('viewer').addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;if(!drag)return;if(drag.adjust){contrast=drag.contrast+(e.clientX-drag.x)*.6;brightness=drag.brightness-(e.clientY-drag.y)*.3;applyContrast();return}if(zoom===1)return;panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;fit()});
$('viewer').addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;if(drag&&!drag.adjust&&zoom===1&&Math.abs(e.clientY-drag.y)>30)move(target+(e.clientY<drag.y?1:-1));drag=null;$('canvas').classList.remove('dragging')});$('viewer').addEventListener('pointercancel',e=>{if(e.pointerType==='touch')return;drag=null;$('canvas').classList.remove('dragging')});
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||$('info').open)return;if(e.code==='Escape'){if($('windowPresets').open){$('windowPresets').open=false;$('presetTrigger').focus();return}$('drawer').hidden=true;setContrastMode(false);clearAnchor();return}if(e.target.closest('button')&&(e.code==='Space'||e.code==='Enter'))return;if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.code))e.preventDefault();if(e.code==='ArrowRight'||e.code==='ArrowDown')move(target+1);if(e.code==='ArrowLeft'||e.code==='ArrowUp')move(target-1);if(e.code==='Home')move(0);if(e.code==='End')move(views.length-1)});
new ResizeObserver(fit).observe($('viewer'));fit();switchSeries(new URLSearchParams(location.search).get('series')||'abdomen');

