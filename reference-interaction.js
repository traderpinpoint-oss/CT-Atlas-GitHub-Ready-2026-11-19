// Highlight only contiguous colored pixels already present in the source image.
const regionLayer=document.createElement('canvas');regionLayer.id='regionHighlight';regionLayer.setAttribute('aria-hidden','true');$('canvas').insertBefore(regionLayer,$('anchorLeader'));
let hoverAnnotation=null,regionSource=null,regionPixels=null;
const regionNames=/^(Left Ventricle|Right Ventricle|Left Atrium|Right Atrium|Inferior Vena Cava|Superior Vena Cava|Descending Thoracic Aorta|Ascending Aorta|Aortic Arch|Main Pulmonary Artery|[LR] Pulmonary Artery|[LR] (Superior|Inferior) Pulmonary Vein)$/;
function clearRegion(){regionLayer.width=viewWidth;regionLayer.height=viewHeight;}
function cardiacSourceRegion(a){
 clearRegion();if(activeSeries.id!=='cardiac'||!a||!regionNames.test(a.label_text)||!displayedImage)return;
 const p=anchorPositions(a)[0];if(!p)return;
 if(regionSource!==views[index].id){
  const c=document.createElement('canvas');c.width=viewWidth;c.height=viewHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(displayedImage,0,0);
  const data=ctx.getImageData(0,0,viewWidth,viewHeight).data,raw=new Uint8Array(viewWidth*viewHeight),core=new Uint8Array(raw.length);
  for(let y=4;y<visibleHeight-4;y++)for(let x=380;x<1200;x++){const i=y*viewWidth+x,k=i*4,r=data[k],g=data[k+1],b=data[k+2];if(Math.max(r,g,b)<65)continue;raw[i]=g>r+12&&b>r+8?1:g>r+8&&g>b+8?2:r>g+10&&b>g+4?3:0;}
  // A solid five-pixel neighborhood excludes thin leaders and isolated pins.
  for(let y=4;y<visibleHeight-4;y++)for(let x=382;x<1198;x++){const i=y*viewWidth+x,k=raw[i];if(!k)continue;let solid=true;for(let dy=-2;dy<=2&&solid;dy++)for(let dx=-2;dx<=2;dx++)if(raw[i+dy*viewWidth+dx]!==k){solid=false;break;}if(solid)core[i]=k;}
  regionSource=views[index].id;regionPixels={raw,core};
 }
 const {raw,core}=regionPixels,candidates=[];
 for(let dy=-10;dy<=10;dy++)for(let dx=-10;dx<=10;dx++){const x=Math.round(p.x)+dx,y=Math.round(p.y)+dy,i=y*viewWidth+x,d=dx*dx+dy*dy;if(x>=380&&x<1200&&y>=4&&y<visibleHeight-4&&core[i])candidates.push({i,d});}
 candidates.sort((a,b)=>a.d-b.d);
 // The colored pin can be nearest; skip its tiny component before finding the region.
 const seen=new Uint8Array(core.length);let queue=[],kind=0;
 for(const {i:seed} of candidates){
  if(seen[seed])continue;queue=[seed];kind=core[seed];seen[seed]=1;
  for(let j=0;j<queue.length;j++){const i=queue[j];for(const n of [i-1,i+1,i-viewWidth,i+viewWidth])if(!seen[n]&&core[n]===kind){seen[n]=1;queue.push(n);}}
  if(queue.length>=120)break;
 }
 if(queue.length<120)return;
 const out=regionLayer.getContext('2d').createImageData(viewWidth,viewHeight),color=kind===1?[23,239,194]:kind===2?[111,248,149]:[244,113,208];
 for(const i of queue)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const n=i+dy*viewWidth+dx;if(raw[n]!==kind)continue;const k=n*4;out.data[k]=color[0];out.data[k+1]=color[1];out.data[k+2]=color[2];out.data[k+3]=70;}
 regionLayer.getContext('2d').putImageData(out,0,0);
}
// The new colored series use the label's hue for the corresponding region.
// Trace only a substantial connected fill near its recorded endpoint: never
// create a segmentation from grayscale anatomy or spread along a thin leader.
let coloredSource=null,coloredPixels=null;
const coloredRegions=new Map();
function sourceRegion(a){
 if(activeSeries.id==='cardiac'){cardiacSourceRegion(a);return;}
 clearRegion();if(!a||!displayedImage)return;
 const key=activeSeries.id+':'+views[index].id;
 if(coloredSource!==key){
  const c=document.createElement('canvas');c.width=viewWidth;c.height=viewHeight;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(displayedImage,0,0);
  coloredPixels=ctx.getImageData(0,0,viewWidth,viewHeight).data;
  coloredSource=key;coloredRegions.clear();
 }
 const cacheKey=a.annotation_id||a.label_text;
 if(coloredRegions.has(cacheKey)){const saved=coloredRegions.get(cacheKey);if(saved)regionLayer.getContext('2d').putImageData(saved,0,0);return;}
 const hex=/^#([0-9a-f]{6})$/i.exec(a.pin_color||'');
 if(!hex)return;
 const color=[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16));
 const mean=(color[0]+color[1]+color[2])/3,vector=color.map(n=>n-mean),length=Math.hypot(...vector);
 if(length<20)return;
 const bounds=typeof scanBounds==='function'?scanBounds():{left:380,right:1200,top:0,bottom:visibleHeight};
 const left=Math.max(3,Math.floor(bounds.left)),right=Math.min(viewWidth-3,Math.ceil(bounds.right));
 const top=Math.max(3,Math.floor(bounds.top)),bottom=Math.min(visibleHeight-3,Math.ceil(bounds.bottom));
 const raw=new Uint8Array(viewWidth*viewHeight),core=new Uint8Array(raw.length),data=coloredPixels;
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const i=y*viewWidth+x,k=i*4,r=data[k],g=data[k+1],b=data[k+2];
  if(Math.max(r,g,b)<25||Math.max(r,g,b)-Math.min(r,g,b)<12)continue;
  const m=(r+g+b)/3,dr=r-m,dg=g-m,db=b-m,n=Math.hypot(dr,dg,db);
  if((dr*vector[0]+dg*vector[1]+db*vector[2])/(n*length)>.94)raw[i]=1;
 }
 for(let y=top+2;y<bottom-2;y++)for(let x=left+2;x<right-2;x++){
  const i=y*viewWidth+x;if(!raw[i])continue;let solid=true;
  for(let dy=-2;dy<=2&&solid;dy++)for(let dx=-2;dx<=2;dx++)if(!raw[i+dy*viewWidth+dx]){solid=false;break;}
  if(solid)core[i]=1;
 }
 const seen=new Uint8Array(raw.length),accepted=[];
 for(const p of anchorPositions(a)){
  const seeds=[];
  for(let dy=-18;dy<=18;dy++)for(let dx=-18;dx<=18;dx++){
   const x=Math.round(p.x)+dx,y=Math.round(p.y)+dy,i=y*viewWidth+x,d=dx*dx+dy*dy;
   if(d<=324&&x>=left&&x<right&&y>=top&&y<bottom&&core[i])seeds.push({i,d});
  }
  seeds.sort((a,b)=>a.d-b.d);
  for(const {i:seed} of seeds){
   if(seen[seed])continue;const queue=[seed];seen[seed]=1;
   // Cross short interruptions made by a leader passing over a filled region.
   // Each jump still needs a solid endpoint and at most two off-color pixels.
   for(let j=0;j<queue.length;j++)for(const step of [-1,1,-viewWidth,viewWidth]){
    let missing=0;
    for(let distance=1;distance<=7;distance++){
     const n=queue[j]+step*distance;
     if(n<0||n>=raw.length||(!raw[n]&&++missing>2))break;
     if(core[n]&&!seen[n]){seen[n]=1;queue.push(n);}
    }
   }
   if(queue.length>=40){for(const n of queue)accepted.push(n);break;}
  }
 }
 if(!accepted.length){coloredRegions.set(cacheKey,null);return;}
 const out=regionLayer.getContext('2d').createImageData(viewWidth,viewHeight);
 for(const i of accepted)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const n=i+dy*viewWidth+dx;if(!raw[n])continue;const k=n*4;
  out.data[k]=color[0];out.data[k+1]=color[1];out.data[k+2]=color[2];out.data[k+3]=85;
 }
 if(coloredRegions.size>=12)coloredRegions.delete(coloredRegions.keys().next().value);
 coloredRegions.set(cacheKey,out);regionLayer.getContext('2d').putImageData(out,0,0);
}
function previewAnnotation(a){
 if(activeSeries.id==="chest-coronal")return;
 if(selected) a=null;
 hoverAnnotation=a;sourceRegion(a||views[index].annotations.find(a=>a.annotation_id===selected));
 for(const el of $('hotspots').children)el.classList.toggle('reference-hover',!!a&&el.title===a.label_text);
 for(const el of $('anchorPoints').children)el.classList.toggle('reference-hover',!!a&&el.title===a.label_text);
}
function bindPreview(container){for(const el of container.children){const name=el.title;const a=views[index].annotations.find(a=>a.label_text===name);if(!a)continue;el.onpointerenter=()=>previewAnnotation(a);el.onpointerleave=()=>previewAnnotation(null);el.onfocus=()=>previewAnnotation(a);el.onblur=()=>previewAnnotation(null);}}
const originalHotspots=renderHotspots;renderHotspots=function(){originalHotspots();bindPreview($('hotspots'));};
const originalAnchors=renderAnchors;renderAnchors=function(){originalAnchors();bindPreview($('anchorPoints'));hoverAnnotation=null;sourceRegion(views[index].annotations.find(a=>a.annotation_id===selected));};
const originalShow=show;show=async function(n){hoverAnnotation=null;clearRegion();await originalShow(n);};
