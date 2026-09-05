import {COLORS,DEFAULT_SETTINGS,newStrip,newProject,validateProject,validatePatch,integer,pixelAddress,pixelChannels,totals,serializeProject,demoPosition} from './modules/model.js';
import {fitStraightStrip,probeIndices} from './modules/lines.js';
import {detectPixel} from './modules/detection.js';
import {exportResolume} from './modules/resolume.js';
import {Camera,delay} from './modules/camera.js';
import {Bridge} from './modules/bridge-client.js?v=20260905';
import {EditHistory,transformCoordinates} from './modules/editing.js';

const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const icons={camera:'M14 4l1.5 3H20v12H4V7h4.5L10 4z M15.5 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',folder:'M3 7V5h6l2 2h10v12H3z',help:'M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',download:'M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5',sliders:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',plug:'M8 3v5 M16 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4',power:'M12 2v10 M6 5a9 9 0 1 0 12 0',plus:'M12 5v14 M5 12h14',crosshair:'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M12 12h.01',maximize:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',scan:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 12h10 M12 7v10',play:'m8 4 12 8-12 8z',pause:'M8 5v14 M16 5v14',stop:'M6 6h12v12H6z',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z m-4 9 3 3 5-6',activity:'M2 12h5l3-8 4 16 3-8h5',sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',trash:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',image:'M3 3h18v18H3z m0 13 5-5 5 5 3-3 5 5 M15 8h.01',undo:'M9 7 4 12l5 5 M5 12h9a6 6 0 0 1 6 6',redo:'m15 7 5 5-5 5 m4-5h-9a6 6 0 0 0-6 6',transform:'M4 8V4h4 M20 8V4h-4 M4 16v4h4 M20 16v4h-4 M8 12h8 M12 8v8'};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.plus}"/></svg>`;}
$$('[data-icon]').forEach(el=>el.outerHTML=icon(el.dataset.icon));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let project=newProject(), storageAvailable=true;
try {const raw=localStorage.getItem('stripr.project.v1');if(raw)project=validateProject(JSON.parse(raw));} catch{storageAvailable=false;}
let selected={strip:project.strips[0].id,index:0},selection=new Set(),advanced=false,view='map',labels=false,placing=false,bridge=null,camera=new Camera($('cameraVideo')),photoURL=null,busy=false,scanning=false,paused=false,scanAbort=null,scanDone=0,scanTotal=0,editId=null,scanElapsed=0,scanStarted=0,sessionConfigured=false,photoRatio=16/9;
let storeTimer,toastTimer,confirmResolve;
const history=new EditHistory(100),selectionKey=(strip,index)=>`${strip}\u0000${index}`;
selection.add(selectionKey(selected.strip,selected.index));
function notify(message,error=false){$('notificationText').textContent=message;$('notification').hidden=false;$('notification').classList.toggle('error',error);clearTimeout(toastTimer);if(!error)toastTimer=setTimeout(()=>$('notification').hidden=true,6000);}
$('dismissNotification').onclick=()=>$('notification').hidden=true;
function save(){clearTimeout(storeTimer);storeTimer=setTimeout(()=>{try{localStorage.setItem('stripr.project.v1',serializeProject(project));storageAvailable=true;$('saved').textContent='Saved on this device';}catch{storageAvailable=false;$('saved').textContent='Export JSON to save';}},180);}
function snapshot(){return serializeProject(project);}
function recordChange(before,label){const changed=history.record(before,snapshot(),label);if(changed)save();return changed;}
function restoreHistory(direction){if(scanning||busy)return;const entry=history[direction](snapshot());if(!entry)return;project=validateProject(JSON.parse(entry.state));sessionConfigured=false;placing=false;scanDone=scanTotal=0;ensureSelection();updateSettingsInputs();save();render();notify(`${direction==='undo'?'Undid':'Redid'} ${entry.label}.`);}
function undo(){restoreHistory('undo');}function redo(){restoreHistory('redo');}
function selectionEntries(mappedOnly=true){const entries=[];for(const strip of project.strips)strip.points.forEach((point,index)=>{if(selection.has(selectionKey(strip.id,index))&&(!mappedOnly||point))entries.push({strip,index,point});});return entries;}
function ensureSelection(){const strip=currentStrip();selected.strip=strip.id;selected.index=Math.max(0,Math.min(strip.count-1,selected.index));const valid=new Set();for(const s of project.strips)for(let i=0;i<s.count;i++){const key=selectionKey(s.id,i);if(selection.has(key))valid.add(key);}selection=valid;if(!selection.size)selection.add(selectionKey(selected.strip,selected.index));}
function selectOnly(strip,index,renderNow=true){selected={strip,index};selection=new Set([selectionKey(strip,index)]);if(renderNow)render();}
function setMappedSelection(entries,primary=entries[0]){if(!entries.length)return;selection=new Set(entries.map(({strip,index})=>selectionKey(typeof strip==='string'?strip:strip.id,index)));selected={strip:typeof primary.strip==='string'?primary.strip:primary.strip.id,index:primary.index};render();}
function applyPointTransform(options,label='transform'){const entries=selectionEntries();if(!entries.length)return notify('Select at least one mapped LED.',true);const before=snapshot();try{const points=transformCoordinates(entries.map(e=>e.point),options);entries.forEach((entry,i)=>entry.strip.points[entry.index]=points[i]);recordChange(before,label);render();}catch(e){notify(e.message,true);}}
function confirmAction(title,text){$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmDialog').showModal();return new Promise(resolve=>confirmResolve=resolve);}
function finishConfirm(value){$('confirmDialog').close();confirmResolve?.(value);confirmResolve=null;}
$('confirmCancel').onclick=()=>finishConfirm(false);$('confirmAccept').onclick=()=>finishConfirm(true);$('confirmDialog').addEventListener('cancel',e=>{e.preventDefault();finishConfirm(false);});
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function currentStrip(){return project.strips.find(s=>s.id===selected.strip)||project.strips[0];}
function updateSettingsInputs(){$('smartLines').checked=project.settings.smartLines;$$('[data-setting]').forEach(el=>el.value=project.settings[el.dataset.setting]);$('brightness').value=project.settings.brightness;$('brightnessValue').textContent=Math.round(project.settings.brightness/255*100)+'%';}
function patchChanged(before=null,label='change strip setup'){sessionConfigured=false;if(before)recordChange(before,label);else save();render();}
function render(){
  ensureSelection();const t=totals(project),s=currentStrip();
  $('projectName').value=project.name;$('saved').textContent=storageAvailable?'Saved on this device':'Export JSON to save';
  $('quickQuantity').value=project.strips.length;$('quickCount').value=project.strips.every(strip=>strip.count===project.strips[0].count)?project.strips[0].count:'';$('quickCount').placeholder='Mixed';
  $('stripCount').textContent=project.strips.length;$('totalPixels').textContent=t.total.toLocaleString();$('mappedCount').textContent=t.mapped.toLocaleString();$('mappedOf').textContent='/ '+t.total.toLocaleString();$('detectedCount').textContent=t.mapped.toLocaleString();$('missingCount').textContent=(t.total-t.mapped).toLocaleString();
  $('inferredCount').textContent=project.strips.reduce((n,s)=>n+s.points.filter(p=>p?.source==='interpolated').length,0);
  $('lowCount').textContent=project.strips.reduce((n,s)=>n+s.points.filter(p=>p&&p.confidence<.6).length,0);
  $('stripList').innerHTML=project.strips.map(s=>`<div class="strip-row ${s.id===selected.strip?'selected':''}"><span class="swatch" style="background:${s.color}"></span><button class="strip-select" data-select="${esc(s.id)}" aria-pressed="${s.id===selected.strip}"><span><strong>${esc(s.name)}</strong><small>${s.count} ${s.type.toUpperCase()} LEDs · ${s.points.filter(Boolean).length} mapped${advanced?` · U${s.universe}:${s.channel}`:''}</small></span></button><button class="icon-button strip-edit" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.name)}" ${busy||scanning?'disabled':''}>···</button></div>`).join('');
  $('stripList').querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectOnly(b.dataset.select,0));
  $('stripList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openStrips(b.dataset.edit));
  $('inspectStrip').innerHTML=project.strips.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');$('inspectStrip').value=selected.strip;
  $('stripLegend').innerHTML=project.strips.map(s=>`<div class="legend-row"><span class="legend-swatch" style="background:${s.color}"></span><span>${esc(s.name)}</span><span>${s.points.filter(Boolean).length} / ${s.count}</span></div>`).join('');
  const selectionSize=selectionEntries().length;$('selectionCount').textContent=`${selectionSize||1} selected`;$('selectionCount').classList.toggle('active',selectionSize>1);$('clearSelection').disabled=selectionSize<2;$('undoButton').disabled=!history.canUndo||busy||scanning;$('redoButton').disabled=!history.canRedo||busy||scanning;$('undoButton').title=history.canUndo?`Undo ${history.undoLabel} (Ctrl+Z)`:'Nothing to undo';$('redoButton').title=history.canRedo?`Redo ${history.redoLabel} (Ctrl+Shift+Z)`:'Nothing to redo';
  renderInspector();renderMap();renderControls();
}
function renderInspector(){const s=currentStrip(),p=s.points[selected.index],entries=selectionEntries(),multiple=entries.length>1,addresses=pixelChannels(s,selected.index),groups=[];for(const a of addresses){const last=groups.at(-1);if(last?.universe===a.universe&&last.end+1===a.channel)last.end=a.channel;else groups.push({universe:a.universe,start:a.channel,end:a.channel});}const patch=groups.map(g=>`U${g.universe} · CH ${g.start}${g.end===g.start?'':`–${g.end}`}`).join(' / '),format=s.order.toUpperCase()+(s.type==='rgba'?'A':'');$('singlePixelEditor').hidden=multiple;$('transformPanel').hidden=!multiple;$('transformCount').textContent=`${entries.length} LEDs selected`;$('inspectPixel').max=s.count;$('inspectPixel').value=selected.index+1;$('pixelState').textContent=p?`${p.source==='manual'?'Manually placed':p.source==='demo'?'Demo coordinate':p.source==='interpolated'?'Inferred from straight strip':'Detected'} · ${Math.round(p.confidence*100)}% confidence`:'Not mapped';$('pixelX').value=p?p.x.toFixed(4):'';$('pixelY').value=p?p.y.toFixed(4):'';$('pixelAddress').textContent=multiple?`${entries.length} mapped LEDs selected · active ${s.name} ${selected.index+1}`:`${patch} · ${format}`;$('previousPixel').disabled=selected.index===0;$('nextPixel').disabled=selected.index===s.count-1;$('clearPixel').disabled=!entries.length||scanning||busy;$('identifyPixel').disabled=(!bridge&&!project.demo)||scanning||busy;$('applyTransform').disabled=!multiple||scanning||busy;}
function fitStage(){const vp=$('viewport'),stage=$('mapStage'),ratio=camera.active?$('cameraVideo').videoWidth/$('cameraVideo').videoHeight:photoURL?photoRatio:project.settings.width/project.settings.height;const w=Math.min(vp.clientWidth-48,(vp.clientHeight-72)*ratio);stage.style.width=w+'px';stage.style.height=w/ratio+'px';stage.style.aspectRatio=String(ratio);}
new ResizeObserver(fitStage).observe($('viewport'));
function renderMap(){
  const t=totals(project),hasSource=camera.active||photoURL||project.demo;
  const showImage=view==='camera';$('cameraVideo').hidden=!camera.active||!showImage;$('referencePhoto').hidden=!photoURL||!showImage;
  $('emptyState').hidden=hasSource||t.mapped>0;$('sourceBadge').hidden=!hasSource;
  $('sourceBadge').textContent=project.demo?'DEMO · SIMULATED PIXELS':camera.active?'LIVE CAMERA':'REFERENCE PHOTO';
  $('canvasHint').hidden=!hasSource&&!t.mapped;$('canvasHint').textContent=placing?`Tap to place ${currentStrip().name} · LED ${selected.index+1}`:selectionEntries().length>1?'Drag a selected LED to move the group':'Shift/Ctrl-click or marquee to select · drag to move';
  $('mapStage').classList.toggle('placing',placing);$('placePixel').classList.toggle('primary',placing);
  const svg=$('mapSvg');svg.setAttribute('viewBox','0 0 1000 562.5');
  const fragments=[];
  for(const s of project.strips){
    let segment=[];
    const flush=()=>{if(segment.length>1)fragments.push(`<polyline points="${segment.join(' ')}" fill="none" stroke="${s.color}" stroke-width="1.2" opacity=".34" vector-effect="non-scaling-stroke"/>`);segment=[];};
    s.points.forEach(p=>{if(p)segment.push(`${p.x*1000},${p.y*562.5}`);else flush();});flush();
    s.points.forEach((p,i)=>{if(!p)return;const x=p.x*1000,y=p.y*562.5,primary=s.id===selected.strip&&i===selected.index,sel=selection.has(selectionKey(s.id,i));
      if(sel)fragments.push(`<circle cx="${x}" cy="${y}" r="${primary?12:9}" fill="${s.color}" fill-opacity=".08" stroke="${s.color}" stroke-width="${primary?1.8:1.1}" vector-effect="non-scaling-stroke"/>`);
      fragments.push(`<circle cx="${x}" cy="${y}" r="${primary?5:3.2}" fill="${s.color}" opacity="${sel?1:s.id===selected.strip?.85:.65}" ${p.confidence<.6?'stroke="#fff" stroke-dasharray="2 2"':''}/><circle cx="${x}" cy="${y}" r="10" fill="transparent" data-strip="${esc(s.id)}" data-index="${i}"/>`);
      if(labels||primary)fragments.push(`<text x="${x+11}" y="${y-10}" fill="${s.color}" font-size="12" font-family="monospace" stroke="#111214" stroke-width="3" paint-order="stroke" pointer-events="none">${i+1}</text>`);
    });
  }
  if(marquee?.moved){const x=Math.min(marquee.start.x,marquee.end.x)*1000,y=Math.min(marquee.start.y,marquee.end.y)*562.5,w=Math.abs(marquee.end.x-marquee.start.x)*1000,h=Math.abs(marquee.end.y-marquee.start.y)*562.5;fragments.push(`<rect class="marquee" x="${x}" y="${y}" width="${w}" height="${h}"/>`);}
  svg.innerHTML=fragments.join('');
  $('mapState').textContent=scanning?(paused?'Scan paused':'Scanning pixels'):project.demo?'Demo setup':t.mapped?`${t.mapped.toLocaleString()} coordinates mapped`:camera.active?'Camera ready':photoURL?'Manual mapping ready':'Waiting for a source';
  $('mapIndicator').className='dot '+(scanning||camera.active?'green':project.demo?'amber':'');$('canvasDimensions').textContent=`${project.settings.width} × ${project.settings.height}`;fitStage();
}
function renderControls(){
  const locked=scanning||busy;
  for(const id of ['addStrips','cameraButton','startCameraEmpty','cameraSelect','photoButton','connectButton','bridgeUrl','bridgeToken','openProject','projectName','demoButton','helpDemo','brightness','savePixel','placePixel','pixelX','pixelY','simpleMode','advancedMode','quickQuantity','quickCount','applyQuick','smartLines','selectStrip','selectAll','transformX','transformY','transformScale','transformRotation','applyTransform'])$(id).disabled=locked;
  $$('[data-setting]').forEach(el=>el.disabled=locked);
  $('helpDemo').disabled=locked;
  $('scanButton').disabled=locked||(!project.demo&&(!camera.active||!bridge));$('scanButton').hidden=scanning;$('pauseButton').hidden=!scanning;$('stopButton').hidden=!scanning;
  $('pauseButton').innerHTML=icon(paused?'play':'pause')+(paused?'Resume':'Pause');
  $('connectButton').innerHTML=icon('plug')+(bridge?'Disconnect':'Connect');$('cameraButton').innerHTML=icon('camera')+(camera.active?'Stop camera':'Enable camera');
  $('cameraStatus').textContent=camera.active?'LIVE':photoURL?'PHOTO':'OFF';$('cameraStatus').className='status '+(camera.active?'online':'');
  $('bridgeStatus').textContent=bridge?'CONNECTED':project.demo?'DEMO':'OFFLINE';$('bridgeStatus').className='status '+(bridge?'online':project.demo?'demo':'');
  $('blackoutButton').disabled=!bridge&&!scanning;$('exportTop').disabled=locked;$('exportXml').disabled=locked;$('exportJson').disabled=locked;
  $('resetSettings').disabled=locked;
  $('undoButton').disabled=locked||!history.canUndo;$('redoButton').disabled=locked||!history.canRedo;$('placePixel').disabled=locked||selectionEntries().length>1;$('clearSelection').disabled=locked||selectionEntries().length<2;
  if(!scanning){const t=totals(project);$('scanButton').innerHTML=icon('play')+(t.mapped?'Scan again':'Start scan');if(!scanTotal){$('scanTitle').textContent=project.demo?'Explore the scan workflow':camera.active&&bridge?'Ready to scan':'Ready when you are';$('scanDescription').textContent=project.demo?'Run a simulated scan or inspect the demo coordinates.':camera.active&&bridge?`${t.total} LEDs · keep your camera fixed during the scan.`:'Connect a camera and controller to start scanning.';}}
}
function selectPixel(strip,index){selectOnly(strip,index);}
$('inspectStrip').onchange=()=>selectPixel($('inspectStrip').value,0);
$('inspectPixel').onchange=()=>{try{selectOnly(selected.strip,integer($('inspectPixel').value,1,currentStrip().count,'LED number')-1);}catch(e){notify(e.message,true);renderInspector();}};
$('previousPixel').onclick=()=>selectPixel(selected.strip,Math.max(0,selected.index-1));$('nextPixel').onclick=()=>selectPixel(selected.strip,Math.min(currentStrip().count-1,selected.index+1));
$('nextMissing').onclick=()=>{const flat=project.strips.flatMap(s=>s.points.map((p,index)=>({p,strip:s.id,index}))),start=flat.findIndex(p=>p.strip===selected.strip&&p.index===selected.index);for(let j=1;j<=flat.length;j++){const p=flat[(start+j)%flat.length];if(!p.p){selectPixel(p.strip,p.index);return;}}notify('Every pixel has a coordinate.');};
$('savePixel').onclick=()=>{const x=Number($('pixelX').value),y=Number($('pixelY').value);if($('pixelX').value===''||$('pixelY').value===''||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)return notify('Enter X and Y coordinates between 0 and 1.',true);const before=snapshot();currentStrip().points[selected.index]={x,y,confidence:1,source:'manual'};recordChange(before,'edit LED coordinates');render();};
$('clearPixel').onclick=()=>{const entries=selectionEntries();if(!entries.length)return;const before=snapshot();entries.forEach(({strip,index})=>strip.points[index]=null);recordChange(before,`clear ${entries.length} LED${entries.length===1?'':'s'}`);selection=new Set([selectionKey(selected.strip,selected.index)]);render();};
$('placePixel').onclick=()=>{placing=!placing;renderMap();};
$('applyTransform').onclick=()=>{const dx=Number($('transformX').value),dy=Number($('transformY').value),scale=Number($('transformScale').value)/100,rotation=Number($('transformRotation').value);applyPointTransform({dx,dy,scale,rotation},`transform ${selectionEntries().length} LEDs`);for(const id of ['transformX','transformY','transformRotation'])$(id).value=0;$('transformScale').value=100;};
$('selectStrip').onclick=()=>{const entries=currentStrip().points.flatMap((point,index)=>point?[{strip:currentStrip(),index}]:[]);if(entries.length)setMappedSelection(entries,entries.find(e=>e.index===selected.index)||entries[0]);else notify('This strip has no mapped LEDs yet.');};
$('selectAll').onclick=()=>{const entries=project.strips.flatMap(strip=>strip.points.flatMap((point,index)=>point?[{strip,index}]:[]));if(entries.length)setMappedSelection(entries,entries.find(e=>e.strip.id===selected.strip&&e.index===selected.index)||entries[0]);else notify('Map at least one LED first.');};
$('clearSelection').onclick=()=>selectOnly(selected.strip,selected.index);
$('undoButton').onclick=undo;$('redoButton').onclick=redo;
let drag=null,marquee=null;
function pointerCoordinate(e){const r=$('mapSvg').getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),confidence:1,source:'manual'};}
$('mapSvg').addEventListener('pointerdown',e=>{
  if(scanning||busy)return;
  if(placing){const before=snapshot();currentStrip().points[selected.index]=pointerCoordinate(e);placing=false;recordChange(before,'place LED');render();return;}
  const target=e.target.closest('[data-strip]'),svg=$('mapSvg'),start=pointerCoordinate(e);svg.setPointerCapture(e.pointerId);
  if(!target){marquee={id:e.pointerId,start,end:start,moved:false,additive:e.shiftKey||e.ctrlKey||e.metaKey};svg.classList.add('selecting');return;}
  const strip=target.dataset.strip,index=Number(target.dataset.index),key=selectionKey(strip,index);
  if(e.shiftKey){const s=project.strips.find(s=>s.id===strip);if(selected.strip===strip){const from=Math.min(selected.index,index),to=Math.max(selected.index,index),entries=[];for(let i=from;i<=to;i++)if(s.points[i])entries.push({strip:s,index:i});if(entries.length)setMappedSelection(entries,{strip:s,index});}else selectOnly(strip,index);return;}
  if(e.ctrlKey||e.metaKey){if(selection.has(key)&&selection.size>1){selection.delete(key);if(selected.strip===strip&&selected.index===index){const next=selectionEntries(false)[0];selected={strip:next.strip.id,index:next.index};}}else{selection.add(key);selected={strip,index};}render();return;}
  if(!selection.has(key))selectOnly(strip,index,false);selected={strip,index};const entries=selectionEntries();drag={id:e.pointerId,x:e.clientX,y:e.clientY,start,entries,points:entries.map(entry=>({...entry.point})),before:snapshot(),moved:false};renderInspector();renderMap();
});
$('mapSvg').addEventListener('pointermove',e=>{if(drag&&e.pointerId===drag.id){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)drag.moved=true;if(drag.moved){const at=pointerCoordinate(e),points=transformCoordinates(drag.points,{dx:at.x-drag.start.x,dy:at.y-drag.start.y});drag.entries.forEach((entry,i)=>entry.strip.points[entry.index]=points[i]);renderInspector();renderMap();}}else if(marquee&&e.pointerId===marquee.id){marquee.end=pointerCoordinate(e);marquee.moved=Math.hypot(e.clientX-($('mapSvg').getBoundingClientRect().left+marquee.start.x*$('mapSvg').clientWidth),e.clientY-($('mapSvg').getBoundingClientRect().top+marquee.start.y*$('mapSvg').clientHeight))>4;renderMap();}});
function endPointer(e){if(drag&&e.pointerId===drag.id){if(drag.moved)recordChange(drag.before,`move ${drag.entries.length} LED${drag.entries.length===1?'':'s'}`);drag=null;render();}else if(marquee&&e.pointerId===marquee.id){const box=marquee,entries=project.strips.flatMap(strip=>strip.points.flatMap((point,index)=>point&&point.x>=Math.min(box.start.x,box.end.x)&&point.x<=Math.max(box.start.x,box.end.x)&&point.y>=Math.min(box.start.y,box.end.y)&&point.y<=Math.max(box.start.y,box.end.y)?[{strip,index}]:[]));if(box.moved&&entries.length){if(box.additive)entries.forEach(({strip,index})=>selection.add(selectionKey(strip.id,index)));else selection=new Set(entries.map(({strip,index})=>selectionKey(strip.id,index)));selected={strip:entries[0].strip.id,index:entries[0].index};}marquee=null;$('mapSvg').classList.remove('selecting');render();}}
$('mapSvg').addEventListener('pointerup',endPointer);$('mapSvg').addEventListener('pointercancel',endPointer);
function setView(value){view=value;$('mapView').setAttribute('aria-pressed',view==='map');$('cameraView').setAttribute('aria-pressed',view==='camera');renderMap();}
$('mapView').onclick=()=>setView('map');$('cameraView').onclick=()=>{if(!camera.active&&!photoURL&&!project.demo)notify('Enable a camera or load a reference photo first.');setView('camera');};
$('labelsButton').onclick=()=>{labels=!labels;$('labelsButton').setAttribute('aria-pressed',labels);renderMap();};
// Expand without depending on Fullscreen API support (not universal on iPhone).
$('fitButton').setAttribute('aria-label','Expand or restore map');$('fitButton').title='Expand / restore map';
$('fitButton').onclick=()=>{const panel=$('viewport').parentElement;panel.classList.toggle('expanded');$('fitButton').setAttribute('aria-pressed',panel.classList.contains('expanded'));fitStage();};
document.addEventListener('keydown',e=>{const typing=e.target.matches?.('input,select,textarea,[contenteditable="true"]'),modifier=e.ctrlKey||e.metaKey;if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if(modifier&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}if(typing||document.querySelector('dialog[open]'))return;if(modifier&&e.key.toLowerCase()==='a'){e.preventDefault();$('selectAll').click();return;}if(e.key==='Escape'){placing=false;document.querySelector('.expanded')?.classList.remove('expanded');if(selectionEntries().length>1)selectOnly(selected.strip,selected.index);else renderMap();return;}if((e.key==='Delete'||e.key==='Backspace')&&selectionEntries().length){e.preventDefault();$('clearPixel').click();return;}const amount=e.shiftKey?.01:.001,offset={ArrowLeft:{dx:-amount},ArrowRight:{dx:amount},ArrowUp:{dy:-amount},ArrowDown:{dy:amount}}[e.key];if(offset&&selectionEntries().length){e.preventDefault();applyPointTransform(offset,`nudge ${selectionEntries().length} LED${selectionEntries().length===1?'':'s'}`);}});
function setMode(value){advanced=value;$('simpleMode').setAttribute('aria-pressed',!value);$('advancedMode').setAttribute('aria-pressed',value);$('advancedSettings').hidden=!value;render();}
$('simpleMode').onclick=()=>setMode(false);$('advancedMode').onclick=()=>setMode(true);
$$('[data-setting]').forEach(el=>el.onchange=()=>{const before=snapshot(),key=el.dataset.setting,value=key==='color'?el.value:Number(el.value),candidate={...project,settings:{...project.settings,[key]:value}};try{project.settings=validateProject(candidate).settings;updateSettingsInputs();recordChange(before,`change ${key} setting`);renderMap();renderControls();}catch(e){notify(e.message,true);updateSettingsInputs();}});
$('smartLines').onchange=()=>{const before=snapshot();project.settings.smartLines=$('smartLines').checked;recordChange(before,'change straight-strip detection');render();};
$('resetSettings').onclick=()=>{const before=snapshot();project.settings={...DEFAULT_SETTINGS,width:project.settings.width,height:project.settings.height};updateSettingsInputs();recordChange(before,'reset scan settings');render();};
let brightnessBefore=null;$('brightness').onpointerdown=$('brightness').onfocus=()=>{brightnessBefore??=snapshot();};$('brightness').oninput=()=>{project.settings.brightness=Number($('brightness').value);$('brightnessValue').textContent=Math.round(project.settings.brightness/255*100)+'%';save();};$('brightness').onchange=()=>{recordChange(brightnessBefore||snapshot(),'change LED brightness');brightnessBefore=null;render();};
$('projectName').onchange=()=>{const before=snapshot();project.name=$('projectName').value.trim()||'Untitled setup';$('projectName').value=project.name;recordChange(before,'rename project');render();};
function openStrips(id){editId=id||null;const s=id?project.strips.find(s=>s.id===id):null;const next=Math.max(...project.strips.flatMap(s=>pixelChannels(s,s.count-1).map(a=>a.universe)))+1;$('stripDialogTitle').textContent=s?'Edit strip':'Add strips';$('bulkHint').textContent=s?'Adjust this strip’s name, length, type, or controller patch.':'Same LED count and patch format? Add them all in one go.';$('quantityLabel').hidden=!!s;$('stripQuantity').value=1;$('stripLeds').value=s?.count||60;$('stripName').value=s?.name||'Strip';$('stripType').value=s?.type||'rgb';$('stripUniverse').value=s?.universe??Math.min(255,next);$('stripChannel').value=s?.channel||1;$('stripUniversePolicy').value=s?.universePolicy||'led';$('stripOrder').value=s?.order||'rgb';$('removeStrip').hidden=!s||project.strips.length===1;$('saveStrips').textContent=s?'Save strip':'Add strips';$('stripError').textContent='';$('stripDialog').showModal();}
$('addStrips').onclick=()=>openStrips();
$('stripForm').onsubmit=async e=>{e.preventDefault();const before=snapshot(),editing=Boolean(editId);try{const quantity=integer($('stripQuantity').value,1,128,'Number of strips'),count=integer($('stripLeds').value,1,4096,'LED count'),universe=integer($('stripUniverse').value,0,255,'Universe'),channel=integer($('stripChannel').value,1,512,'Start address'),name=$('stripName').value.trim(),type=$('stripType').value,universePolicy=$('stripUniversePolicy').value,order=$('stripOrder').value;if(!name)throw new Error('Enter a strip name.');let strips=project.strips.map(s=>({...s,points:[...s.points]}));if(editId){const s=strips.find(s=>s.id===editId);if(s.count>count&&s.points.slice(count).some(Boolean)&&!await confirmAction('Shorten this strip?','Coordinates beyond the new LED count will be removed. Export JSON first if you need a backup.'))return;s.points=Array.from({length:count},(_,i)=>s.points[i]||null);Object.assign(s,{count,name,type,universe,channel,universePolicy,order});}else{let u=universe;for(let i=0;i<quantity;i++){const s=newStrip(strips.length,count,u);Object.assign(s,{name:quantity===1?name:`${name} ${String(i+1).padStart(2,'0')}`,type,channel,universePolicy,order});strips.push(s);u=Math.max(...pixelChannels(s,count-1).map(a=>a.universe))+1;}}validatePatch(strips);project.strips=strips;$('stripDialog').close();patchChanged(before,editing?'edit strip':'add strips');}catch(e){$('stripError').textContent=e.message;}};
$('removeStrip').onclick=async()=>{const s=project.strips.find(s=>s.id===editId);if(!s||project.strips.length===1)return;if(!await confirmAction('Delete strip?',`${s.name} and all its coordinates will be removed.`))return;const before=snapshot();project.strips=project.strips.filter(s=>s.id!==editId);selected={strip:project.strips[0].id,index:0};selection=new Set([selectionKey(selected.strip,0)]);$('stripDialog').close();patchChanged(before,'delete strip');};
async function enableCamera(deviceId){if(scanning||busy)return;if(camera.active&&!deviceId){camera.stop();render();return;}if(project.demo){if(!await confirmAction('Use your real camera?','This clears the simulated coordinates and keeps the strip definitions.'))return;const before=snapshot();project.demo=false;project.strips.forEach(s=>s.points.fill(null));recordChange(before,'leave demo map');selectOnly(project.strips[0].id,0,false);}busy=true;renderControls();try{releasePhoto();const devices=await camera.start(deviceId);$('cameraSelect').innerHTML='<option value="">Rear camera / default</option>'+devices.map(d=>`<option value="${esc(d.deviceId)}">${esc(d.label||'Camera')}</option>`).join('');$('cameraSelect').value=camera.stream.getVideoTracks()[0].getSettings().deviceId||'';camera.stream.getVideoTracks()[0].addEventListener('ended',()=>{scanAbort?.abort();render();notify('Camera disconnected. Your coordinates have been saved.',true);});setView('camera');scanTotal=0;notify('Camera ready. Keep it fixed throughout the scan.');save();}catch(e){notify(e.message,true);}finally{busy=false;render();}}
$('cameraButton').onclick=()=>enableCamera();$('startCameraEmpty').onclick=()=>enableCamera();$('cameraSelect').onchange=()=>enableCamera($('cameraSelect').value||undefined);
function releasePhoto(){if(photoURL){URL.revokeObjectURL(photoURL);photoURL=null;}$('referencePhoto').removeAttribute('src');}
$('photoButton').onclick=()=>$('photoFile').click();
$('photoFile').onchange=async()=>{if(scanning||busy)return;const file=$('photoFile').files[0];$('photoFile').value='';if(!file)return;if(file.size>25*1024*1024)return notify('Choose a photo smaller than 25 MB.',true);if(totals(project).mapped&&!await confirmAction('Change the reference photo?','Existing coordinates are kept. Make sure this photo uses the same framing.'))return;const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{camera.stop();releasePhoto();photoURL=url;photoRatio=img.naturalWidth/img.naturalHeight;$('referencePhoto').src=url;if(project.demo){const before=snapshot();project.strips.forEach(s=>s.points.fill(null));project.demo=false;recordChange(before,'leave demo map');selectOnly(project.strips[0].id,0,false);}setView('camera');scanTotal=0;render();save();notify('Photo loaded. Choose an LED, then Place on map. Photos are not stored after closing this page.');};img.onerror=()=>{URL.revokeObjectURL(url);notify('That image could not be opened.',true);};img.src=url;};
async function connectBridge(silent=false){if(busy||scanning)return;busy=true;renderControls();try{if(bridge){await bridge.blackout();bridge=null;sessionConfigured=false;if(!silent)notify('Controller disconnected.');}else{const candidate=new Bridge($('bridgeUrl').value.trim(),$('bridgeToken').value.trim());const health=await candidate.health();await candidate.configure(project.strips);bridge=candidate;sessionConfigured=true;if(project.demo){const before=snapshot();project.demo=false;project.strips.forEach(s=>s.points.fill(null));recordChange(before,'leave demo map');selectOnly(project.strips[0].id,0,false);}if(!silent)notify(`Connected to ${health.name||'StripR app'}${health.adapter==='demo'?' — server is in simulation mode; no hardware output':''}.`);save();scanTotal=0;}}catch(e){if(!silent)notify(e.message,true);}finally{busy=false;render();}}
$('connectButton').onclick=()=>connectBridge();
$('blackoutButton').onclick=async()=>{scanAbort?.abort();try{if(bridge)await bridge.blackout();notify('Blackout sent.');}catch(e){notify(e.message,true);}};
$('identifyPixel').onclick=async()=>{if(busy||scanning)return;if(project.demo){notify(`${currentStrip().name} · LED ${selected.index+1} selected in demo.`);return;}busy=true;render();try{if(!sessionConfigured){await bridge.configure(project.strips);sessionConfigured=true;}await bridge.pixel(selected.strip,selected.index,[100,100,100]);await delay(900);}catch(e){notify(e.message,true);}finally{try{await bridge?.blackout();}catch(e){notify('Blackout failed. The reference bridge’s watchdog will clear the output. '+e.message,true);}busy=false;render();}};
async function loadDemo(){if(busy||scanning)return;if(totals(project).mapped&&!await confirmAction('Load the demo setup?','This replaces your current coordinates. Export the JSON project first if you want to keep it.'))return;try{await bridge?.blackout();}catch(e){notify(e.message,true);return;}const before=snapshot();bridge=null;camera.stop();releasePhoto();project={version:1,name:'Studio waves · demo',demo:true,settings:{...DEFAULT_SETTINGS},strips:Array.from({length:3},(_,i)=>{const s=newStrip(i,48,i);s.name=['Upper wave','Straight rail','Lower wave'][i];s.points=Array.from({length:s.count},(_,j)=>({...demoPosition(i,j,s.count),confidence:1,source:'demo'}));return s;})};selected={strip:project.strips[0].id,index:0};selection=new Set([selectionKey(selected.strip,0)]);scanTotal=0;updateSettingsInputs();setView('map');$('helpDialog').close();recordChange(before,'load demo map');render();notify('Demo loaded. These are simulated coordinates. Try Scan again to explore the workflow.');}
$('demoButton').onclick=loadDemo;$('helpDemo').onclick=loadDemo;
function syntheticFrames(stripIndex,index,count){const width=640,height=360,data=new Uint8ClampedArray(width*height*4),dark=new Uint8ClampedArray(data.length),p=demoPosition(stripIndex,index,count),cx=Math.round(p.x*(width-1)),cy=Math.round(p.y*(height-1));for(let y=cy-3;y<=cy+3;y++)for(let x=cx-3;x<=cx+3;x++){if(x<0||y<0||x>=width||y>=height)continue;const v=Math.round(210*Math.exp(-((x-cx)**2+(y-cy)**2)/6));data.set([v,v,v,255],(y*width+x)*4);}return{width,height,dark,light:data};}
let resolveScanChoice;
function chooseScan(t){$('scanChoiceText').textContent=`${t.mapped} of ${t.total} pixels are already mapped.`;$('scanMissing').hidden=t.mapped===t.total;$('scanChoiceDialog').showModal();return new Promise(resolve=>resolveScanChoice=resolve);}
function finishScanChoice(value){$('scanChoiceDialog').close();resolveScanChoice?.(value);resolveScanChoice=null;}
$('scanMissing').onclick=()=>finishScanChoice('missing');$('scanAll').onclick=()=>finishScanChoice('all');$('scanCancel').onclick=()=>finishScanChoice('cancel');$('scanChoiceDialog').addEventListener('cancel',e=>{e.preventDefault();finishScanChoice('cancel');});
function showProgress(){const percent=scanTotal?Math.round(scanDone/scanTotal*100):0;$('scanProgress').value=percent;$('scanPercent').innerHTML=percent+'<span>%</span>';$('scanTitle').textContent=paused?'Scan paused':`Scanning · ${currentStrip().name}`;const elapsed=(performance.now()-scanStarted)/1000,remaining=scanDone?Math.ceil(elapsed/scanDone*(scanTotal-scanDone)):null;$('scanDescription').textContent=`${scanDone} / ${scanTotal} LEDs checked${remaining!==null?` · ~${remaining}s remaining`:''}`;}
async function scan(){if(scanning||busy)return;try{validateProject(project);}catch(e){notify(e.message,true);return;}
  const t=totals(project);let onlyMissing=false;if(t.mapped){const action=await chooseScan(t);if(action==='cancel')return;onlyMissing=action==='missing';}
  if(!project.demo&&(!camera.active||!bridge))return notify('Connect the camera and LED controller first.',true);
  const scanBefore=snapshot();
  scanning=true;paused=false;placing=false;scanAbort=new AbortController();const signal=scanAbort.signal;const controller=bridge;scanDone=0;scanStarted=performance.now();
  const queue=project.strips.flatMap((s,si)=>Array.from({length:s.count},(_,index)=>({s,si,index}))).filter(({s,index})=>!onlyMissing||!s.points[index]);scanTotal=queue.length;
  let wakeLock=null,failed=null;
  render();
  try{
    if(!project.demo){await controller.configure(project.strips);sessionConfigured=true;}
    if(signal.aborted)throw new DOMException('Stopped','AbortError');
    if(!onlyMissing)project.strips.forEach(s=>s.points.fill(null));
    try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
    const accelerated=new Set(), scanQueue=[];let cameraShape=null;
    for(const [si,s] of project.strips.entries()){
      const eligible=project.settings.smartLines&&s.count>=12&&!onlyMissing;
      const indices=eligible?[...probeIndices(s.count),...Array.from({length:s.count},(_,i)=>i).filter(i=>!probeIndices(s.count).includes(i))]:Array.from({length:s.count},(_,i)=>i);
      indices.filter(index=>!onlyMissing||!s.points[index]).forEach(index=>scanQueue.push({s,si,index,eligible}));
    }
    for(const {s,si,index,eligible} of scanQueue){
      if(accelerated.has(s.id))continue;
      while(paused){if(!project.demo)await controller.blackout();await delay(250,signal);}
      if(signal.aborted)throw new DOMException('Stopped','AbortError');
      selected={strip:s.id,index};selection=new Set([selectionKey(s.id,index)]);let point;
      if(project.demo){await delay(Math.min(project.settings.delay,70),signal);const f=syntheticFrames(si,index,s.count);point=detectPixel(f.dark,f.light,f.width,f.height,project.settings);if(point)point.source='demo';}
      else{
        await controller.blackout();await delay(project.settings.darkDelay,signal);const dark=await camera.capture(project.settings.samples,signal);
        const shape=`${dark.width}x${dark.height}`;if(cameraShape&&cameraShape!==shape)throw new Error('Camera orientation changed. Restore the original framing before continuing.');cameraShape=shape;
        const color=project.settings.color.match(/[0-9a-f]{2}/gi).map(v=>Math.round(parseInt(v,16)*project.settings.brightness/255));
        await controller.pixel(s.id,index,color,signal);await delay(project.settings.delay,signal);const light=await camera.capture(project.settings.samples,signal);await controller.blackout();
        if(dark.width!==light.width||dark.height!==light.height)throw new Error('Camera orientation changed. Keep the camera still and restart the scan.');
        point=detectPixel(dark.data,light.data,light.width,light.height,project.settings);
      }
      s.points[index]=point;scanDone++;
      if(eligible&&index===s.count-1){
        const fitted=fitStraightStrip(s.points,s.count,project.settings.lineTolerance);
        if(fitted){s.points=fitted.points;accelerated.add(s.id);scanDone+=s.count-probeIndices(s.count).length;}
      }
      save();render();showProgress();
    }
  }catch(e){failed=e;if(e.name!=='AbortError')notify(e.message,true);}
  finally{
    try{await controller?.blackout();}catch(e){notify('Could not confirm blackout. The reference bridge clears LEDs after 10 seconds without commands. '+e.message,true);}
    try{await wakeLock?.release();}catch{}
    scanElapsed=Math.round((performance.now()-scanStarted)/1000);scanning=false;paused=false;scanAbort=null;recordChange(scanBefore,onlyMissing?'scan missing LEDs':'scan LEDs');render();
    const result=totals(project),complete=scanDone===scanTotal;
    $('scanTitle').textContent=complete?'Scan complete':failed?.name==='AbortError'?'Scan stopped':'Scan interrupted';
    $('scanDescription').textContent=`${result.mapped} of ${result.total} pixels mapped · ${scanElapsed}s${result.total-result.mapped?` · ${result.total-result.mapped} need review`:''}`;
    $('scanNote').textContent=complete?'Review the coordinates, correct any reflections, then export your map.':'Completed coordinates are saved. Scan again to map the remaining LEDs.';
    if(complete)notify(`Scan complete. ${result.mapped} pixels mapped${result.total-result.mapped?`, ${result.total-result.mapped} need review`:''}.`);
  }
}
$('scanButton').onclick=scan;$('stopButton').onclick=()=>scanAbort?.abort();$('pauseButton').onclick=()=>{paused=!paused;$('scanNote').textContent=paused?'Pausing after the current pixel; its coordinates will be kept.':'Scanning resumed. Keep the camera fixed.';renderControls();showProgress();};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&scanning){scanAbort?.abort();notify('Scan stopped because the page was hidden. Return and continue with the saved coordinates.');}});
function download(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const filename=()=>project.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'stripr-map';
function openExport(){const t=totals(project);$('exportSummary').textContent=`${project.strips.length} strips · ${t.mapped.toLocaleString()} / ${t.total.toLocaleString()} pixels mapped`;$('exportWarning').hidden=t.mapped===t.total&&!project.demo;$('exportWarning').textContent=(project.demo?'This is a simulated demo map. ':'')+(t.mapped<t.total?`${t.total-t.mapped} pixels are unmapped. JSON keeps their empty slots; Resolume skips them and preserves the patch.`:'');updateSettingsInputs();$('downloadXml').disabled=!t.mapped;$('exportDialog').showModal();}
$('exportTop').onclick=openExport;$('exportXml').onclick=openExport;
function downloadJSON(){try{download(serializeProject(project),filename()+'.json','application/json');notify('JSON project exported.');}catch(e){notify(e.message,true);}}
$('exportJson').onclick=downloadJSON;$('downloadJson').onclick=downloadJSON;$('downloadXml').onclick=()=>{try{download(exportResolume(project),filename()+'.xml','application/xml');notify('Resolume preset exported. Open it in Advanced Output and select your controller.');}catch(e){notify(e.message,true);}};
$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=async()=>{if(scanning||busy)return;const file=$('projectFile').files[0];$('projectFile').value='';if(!file)return;try{if(file.size>8*1024*1024)throw new Error('Choose a JSON project smaller than 8 MB.');const next=validateProject(JSON.parse(await file.text()));if(!await confirmAction('Open this project?','This replaces the current setup. Export its JSON first if you want a backup.'))return;const before=snapshot();await bridge?.blackout();bridge=null;project=next;camera.stop();releasePhoto();selected={strip:project.strips[0].id,index:0};selection=new Set([selectionKey(selected.strip,0)]);scanDone=scanTotal=0;sessionConfigured=false;updateSettingsInputs();recordChange(before,'open project');render();notify('Project opened. Reconnect your camera with the same framing to continue scanning.');}catch(e){notify(e.message,true);}};
$('helpButton').onclick=()=>$('helpDialog').showModal();$('bridgeHelp').onclick=()=>$('helpDialog').showModal();
window.addEventListener('pagehide',()=>{scanAbort?.abort();camera.stop();try{localStorage.setItem('stripr.project.v1',serializeProject(project));}catch{}if(bridge)fetch(bridge.url+'/api/blackout',{method:'POST',headers:{'Content-Type':'application/json',...(bridge.token?{'Authorization':`Bearer ${bridge.token}`}:{})},body:'{}',keepalive:true,targetAddressSpace:'local'}).catch(()=>{});});
updateSettingsInputs();render();

$('applyQuick').onclick=async()=>{try{
  const quantity=integer($('quickQuantity').value,1,128,'Strip count'),count=integer($('quickCount').value,1,4096,'LED count');
  let universe=0;const strips=Array.from({length:quantity},(_,i)=>{const s=newStrip(i,count,universe);universe=pixelAddress(s,count-1).universe+1;return s;});validatePatch(strips);
  if(totals(project).mapped&&!await confirmAction('Replace strip setup?',`Create ${quantity} strips with ${count} LEDs each? Current coordinates will be cleared. Export JSON first to keep a backup.`))return;
  const before=snapshot();project.strips=strips;selected={strip:strips[0].id,index:0};selection=new Set([selectionKey(selected.strip,0)]);scanTotal=0;patchChanged(before,'replace strip setup');notify(`${quantity} strips × ${count} LEDs ready. Advanced mode lets you change their patch.`);
}catch(e){notify(e.message,true);}};

// An executable-served app talks to its embedded bridge on the same origin.
if(/^https?:$/.test(location.protocol)&&!location.hostname.endsWith('github.io')){$('bridgeUrl').value=location.origin;connectBridge(true);}
