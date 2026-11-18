(function(){
 const panel=document.createElement('section');panel.id='anatomyDescription';panel.hidden=true;panel.setAttribute('aria-labelledby','anatomyHeading');
 panel.innerHTML='<header><div><small>ANATOMY GUIDE</small><h2 id="anatomyHeading"></h2></div><button id="closeAnatomy" aria-label="Close anatomy description">×</button></header><p id="anatomyTopic"></p><div id="anatomyContent" role="status" aria-live="polite"></div><button id="retryAnatomy" hidden>Try again</button>';
 document.body.append(panel);
 const memory=new Map(),cacheKey='ct-atlas-anatomy-v1',ttl=7*86400000;
 try{const saved=JSON.parse(localStorage.getItem(cacheKey)||'[]');if(Array.isArray(saved))for(const [key,value] of saved.slice(-120))if(typeof value?.text==='string'&&typeof value?.title==='string'&&Date.now()-value.time<ttl)memory.set(key,value);}catch{}
 let current=null,controller=null,timer=null,token=0;
 function cancel(){++token;clearTimeout(timer);controller?.abort();controller=null;}
 function close(){cancel();current=null;panel.hidden=true;document.body.classList.remove('anatomy-guide-open');}
 function sourceLink(title){return 'https://en.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'));}
 function content(text){$('anatomyContent').textContent=text;}
 function display(record,topic){
  const heading=(topic.related?'Related overview: ':'Overview: ')+record.title;
  $('anatomyTopic').textContent=heading+(topic.side?' · '+topic.side+' side selected':'');
  content(record.text);$('anatomyContent').setAttribute('aria-busy','false');
  $('anatomySource').href=sourceLink(record.title);$('anatomySource').hidden=false;$('anatomyCredit').hidden=false;
 }
 async function load(annotation,topic,id){
  const saved=memory.get(topic.title);if(saved&&Date.now()-saved.time<ttl){if(id===token)display(saved,topic);return;}
  const requestController=new AbortController();controller=requestController;
  const timeout=setTimeout(()=>requestController.abort(),9000);
  try{
   const response=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(topic.title.replaceAll(' ','_')),{signal:requestController.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
   if(!response.ok)throw new Error(response.status===404?'missing':response.status===429?'limited':'network');
   const data=await response.json();
   if(data.type==='disambiguation'||typeof data.extract!=='string'||!data.extract.trim()||typeof data.title!=='string')throw new Error('missing');
   const record={title:data.title,text:data.extract.slice(0,5000),time:Date.now()};
   if(id!==token)return;
   memory.set(topic.title,record);if(memory.size>120)memory.delete(memory.keys().next().value);
   try{localStorage.setItem(cacheKey,JSON.stringify([...memory]));}catch{}
   display(record,topic);
  }catch(error){
   if(id!==token)return;
   content(error.message==='missing'?'No unambiguous description was found for this label. You can look up the term on Wikipedia.':error.message==='limited'?'Wikipedia is temporarily limiting requests. Please try again later.':'The description could not load. Check your internet connection and try again.');
   $('anatomyContent').setAttribute('aria-busy','false');$('retryAnatomy').hidden=error.message==='missing';
   $('anatomySource').href=error.message==='missing'?'https://en.wikipedia.org/w/index.php?search='+encodeURIComponent(topic.title):sourceLink(topic.title);
   $('anatomySource').textContent=error.message==='missing'?'Look up this term on Wikipedia ↗':'Wikipedia article ↗';$('anatomySource').hidden=false;
  }finally{clearTimeout(timeout);if(controller===requestController)controller=null;}
 }
 function open(annotation,force=false){
  if(!annotation)return;
  if(!force&&!panel.hidden&&current===annotation.annotation_id)return;
  cancel();current=annotation.annotation_id;panel.hidden=false;document.body.classList.add('anatomy-guide-open');$('drawer').hidden=true;
  const topic=window.AnatomyTopics.resolve(annotation.label_text);
  $('anatomyHeading').textContent=annotation.label_text;
  $('anatomyTopic').textContent=topic.related?'Related overview: '+topic.title:topic.side?topic.side+' side selected':'';
  $('anatomySource').hidden=true;$('anatomySource').textContent='Wikipedia article ↗';$('anatomyCredit').hidden=true;$('retryAnatomy').hidden=true;
  content('Loading description…');$('anatomyContent').setAttribute('aria-busy','true');
  const id=token;timer=setTimeout(()=>load(annotation,topic,id),180);
 }
 const selectedAnnotation=()=>views[index].annotations.find(a=>a.annotation_id===selected);
 $('closeAnatomy').onclick=()=>{close();$('viewer').focus({preventScroll:true});};
 $('retryAnatomy').onclick=()=>open(selectedAnnotation(),true);
 const originalSelect=select;select=function(annotation){originalSelect(annotation);open(annotation);};
 const originalRender=renderAnchors;renderAnchors=function(){originalRender();if(!panel.hidden){const a=selectedAnnotation();if(a)open(a);else close();}};
 const labelsClick=$('labels').onclick;$('labels').onclick=()=>{close();labelsClick();};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close();});
})();
