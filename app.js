const $=id=>document.getElementById(id);
let mapZoom=1;
let mapBox={x:0,y:0,w:1000,h:640};
let panStart=null;
function applyMapBox(){
  mapBox.x=Math.max(0,Math.min(1000-mapBox.w,mapBox.x));
  mapBox.y=Math.max(0,Math.min(640-mapBox.h,mapBox.y));
  $('landscape').setAttribute('viewBox',`${mapBox.x} ${mapBox.y} ${mapBox.w} ${mapBox.h}`);
  $('zoom-level').textContent=`${mapZoom.toFixed(mapZoom===1?0:1)}×`;
  $('zoom-in').disabled=mapZoom>=32;
  $('zoom-out').disabled=mapZoom<=1;
  drawIgnition();
}
function zoomMap(factor,anchor={x:mapBox.x+mapBox.w/2,y:mapBox.y+mapBox.h/2}){
  if(start||panStart)return;
  const next=Math.max(1,Math.min(32,mapZoom*factor));
  const ratio=mapZoom/next;
  mapBox={x:anchor.x-(anchor.x-mapBox.x)*ratio,y:anchor.y-(anchor.y-mapBox.y)*ratio,w:1000/next,h:640/next};
  mapZoom=next;applyMapBox();
}
function resetMapView(){panStart=null;mapZoom=1;mapBox={x:0,y:0,w:1000,h:640};applyMapBox();}
const base=new Date();base.setMinutes(0,0,0);base.setHours(0);base.setDate(base.getDate()-10);
const fmt=d=>d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',timeZoneName:'short'});
const time=h=>new Date(+base+h*3600000);
function data(h){const cycle=Math.sin((h%24-7)/24*Math.PI*2),day=Math.sin(h/39);const wind=+(9+4*cycle+3*day).toFixed(1),rh=Math.round(51-19*cycle+7*day),moist=+(9.5-3*cycle+day).toFixed(1);return{wind,rh,moist,temp:Math.round(67+13*cycle+5*day),flame:+(.7+wind*.12+(12-moist)*.12).toFixed(1),rate:Math.round(3+wind*1.2+(12-moist)*1.8),danger:wind>13&&rh<40?'High':rh>63?'Low':'Moderate'};}
let view='conditions',mode=null,area=null,ignition=null,result=null,timer=null,animation=null,start=null;
const metrics=a=>a.map(([label,value,unit])=>`<div class="metric"><small>${label}</small><strong>${value}</strong><em>${unit}</em></div>`).join('');
function render(){const h=+$('hour').value,d=data(h);$('time-label').textContent=fmt(time(h));$('burn-time').textContent=fmt(time(h));$('time-kind').textContent=h<240?'HISTORICAL ESTIMATE':'FORECAST';$('danger-value').textContent=d.danger;$('danger-description').textContent={Low:'Lower relative potential in this synthetic scenario.',Moderate:'Fine fuels and wind influence potential fire activity.',High:'Elevated relative potential in this synthetic scenario.'}[d.danger];$('metrics').innerHTML=metrics([['Wind speed',d.wind,'mph · SW'],['Relative humidity',d.rh,'%'],['Fine dead fuel moisture',d.moist,'%'],['Temperature',d.temp,'°F'],['Potential flame length',d.flame,'ft'],['Potential spread rate',d.rate,'ft/min']]);const values=Array.from({length:25},(_,i)=>data(h+i).wind),points=values.map((v,i)=>`${i*320/24},${75-v*3.2}`).join(' ');$('chart').innerHTML=`<path d="M0 75H320M0 40H320" stroke="#e8eddf" fill="none"/><polygon points="0,80 ${points} 320,80" fill="#eef2e3"/><polyline points="${points}" fill="none" stroke="#82986b" stroke-width="2"/>`;const names={danger:'Fire danger potential',flame:'Potential flame length · ft',spread:'Potential spread rate · ft/min',moisture:'Fine dead fuel moisture · %',wind:'Wind speed · mph',humidity:'Relative humidity · %'};$('map-mode').textContent=names[$('layer').value];$('legend-title').textContent=names[$('layer').value];$('heat').style.opacity=.25+d.wind/50;$('heat').style.transform=`translate(${Math.sin(h/24)*20}px,${Math.cos(h/36)*15}px)`;const cool=['moisture','humidity'].includes($('layer').value);$('heat').style.filter=cool?'hue-rotate(70deg)':'';document.querySelector('.gradient').style.filter=cool?'hue-rotate(70deg)':'';document.querySelector('.legend-labels').innerHTML=$('layer').value==='danger'?'<span>Low</span><span>Moderate</span><span>High</span>':'<span>Lower</span><span>Relative scale</span><span>Higher</span>';}
function setView(v){view=v;$('conditions-panel').hidden=v!=='conditions';$('planner-panel').hidden=v!=='planner';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('conditions-tab').classList.toggle('selected',v==='conditions');$('scenario-tab').classList.toggle('selected',v==='planner');if(v==='conditions')setMode(null);}
function setMode(m){mode=m;$('map-instruction').hidden=!m;$('map-instruction').textContent=m==='draw'?'Drag to draw a burn area':'Click inside the burn area to place ignition';$('draw').classList.toggle('selected',m==='draw');$('place').classList.toggle('selected',m==='place');$('map').style.cursor=m?'crosshair':'grab';}
function point(e){const svg=$('landscape'),p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const local=p.matrixTransform(svg.getScreenCTM().inverse());return{x:Math.max(0,Math.min(1000,local.x)),y:Math.max(0,Math.min(640,local.y))};}
function drawArea(){if(!area)return;$('selection').innerHTML=`<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" rx="0" fill="#f8f6dc" fill-opacity=".25" stroke="#49694b" stroke-width="2" stroke-dasharray="6 3"/>`;}
function drawIgnition(){
  if(!ignition)return;
  const scale=$('landscape').getScreenCTM()?.a||1;
  $('ignition').innerHTML=`<circle cx="${ignition.x}" cy="${ignition.y}" r="${7/scale}" fill="#fff8e8" stroke="#b76132" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle cx="${ignition.x}" cy="${ignition.y}" r="${2.5/scale}" fill="#c66732"/>`;
}
function spreadSettings(footprint,wind,duration){
  const weatherFactor=Math.max(.65,Math.min(1.35,wind/12));
  return {radius:Math.min(footprint.w,footprint.h)*Math.min(.85,.38*(duration/2)*weatherFactor),playbackMs:6000+duration*1000};
}
function clearResult(){cancelAnimationFrame(animation);$('spread').innerHTML='';$('results').hidden=true;result=null;}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('conditions-tab').onclick=()=>setView('conditions');$('scenario-tab').onclick=$('open-planner').onclick=()=>setView('planner');$('draw').onclick=()=>{clearResult();setMode('draw');};$('place').onclick=()=>{if(!area){$('status').textContent='Draw your burn area first.';return;}setMode('place');};
$('landscape').addEventListener('pointerdown',e=>{if(mode==='draw'){start=point(e);$('landscape').setPointerCapture(e.pointerId);clearResult();ignition=null;$('ignition').innerHTML='';$('ignition-status').textContent='Choose a point inside your area';}else if(mode==='place'){const p=point(e);if(p.x<area.x||p.x>area.x+area.w||p.y<area.y||p.y>area.y+area.h){$('status').textContent='Place ignition inside the selected rectangle.';return;}clearResult();ignition=p;drawIgnition();e.preventDefault();$('ignition-status').textContent='Ignition point placed';$('status').textContent='Ready. Set the start time and run your scenario.';setMode(null);}});
$('landscape').addEventListener('pointermove',e=>{if(!start)return;const p=point(e);area={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};drawArea();});
$('landscape').addEventListener('pointerup',()=>{if(!start)return;start=null;if(!area||area.w<25/mapZoom||area.h<25/mapZoom){area=null;$('selection').innerHTML='';$('status').textContent='Draw a larger rectangle (at least 25 screen-scaled map units on each side).';return;}$('area-status').textContent='Burn footprint selected';$('status').textContent='Now place an ignition point inside the area.';setMode('place');});
$('run').onclick=()=>{if(!area||!ignition){$('status').textContent='Select both a burn area and ignition point before running.';return;}clearResult();const h=+$('hour').value,d=data(h),duration=+$('duration').value;result={type:'illustrative-demo-not-a-fire-model',start:time(h).toISOString(),durationHours:duration,syntheticConditions:d,area:{...area,coordinateSystem:'schematic SVG units; not geographic'},ignition:{...ignition},demonstrationSpread:spreadSettings(area,d.wind,duration),assumptions:'Area-relative wind-oriented ellipses clipped to a rectangle. Playback is scaled to the selected footprint, not a physically calibrated spread rate.'};$('status').textContent='Animating illustrative fire progression…';const settings=spreadSettings(area,d.wind,duration),t0=performance.now();function frame(now){const progress=Math.min(1,(now-t0)/settings.playbackMs),r=settings.radius*progress;$('status').textContent=`Illustrative progression: ${Math.round(progress*duration*60)} of ${duration*60} simulated minutes`;let shapes='';for(let i=4;i>=1;i--){const s=i/4;shapes+=`<ellipse cx="${ignition.x+r*.35*s}" cy="${ignition.y-r*.23*s}" rx="${r*s}" ry="${r*.52*s}" transform="rotate(-32 ${ignition.x+r*.35*s} ${ignition.y-r*.23*s})" fill="${['','#efc85e','#e7a444','#d98039','#c86030'][i]}" fill-opacity=".25" stroke="#bb6e32" stroke-opacity=".6" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;}$('spread').innerHTML=`<defs><clipPath id="burn-clip"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}"/></clipPath></defs><g clip-path="url(#burn-clip)">${shapes}</g>`;if(progress<1)animation=requestAnimationFrame(frame);else{$('results').hidden=false;$('result-metrics').innerHTML=metrics([['Scenario duration',duration,'hours'],['Wind input',d.wind,'mph'],['Potential flame length',d.flame,'ft · synthetic'],['Potential spread rate',d.rate,'ft/min · synthetic']]);$('status').textContent='Demonstration complete. Shaded contours illustrate elapsed progression; they are not predicted perimeters.';}}animation=requestAnimationFrame(frame);};
$('hour').oninput=()=>{clearResult();render();};$('layer').onchange=render;$('duration').onchange=clearResult;$('play').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('play').textContent='▶ Play timeline';}else{$('play').textContent='Ⅱ Pause timeline';clearResult();timer=setInterval(()=>{$('hour').value=(+$('hour').value+1)%408;render();},250);}};
$('reset-map').onclick=()=>{clearResult();area=null;ignition=null;$('selection').innerHTML='';$('ignition').innerHTML='';$('area-status').textContent='Draw a rectangle on the map';$('ignition-status').textContent='Choose a point inside your area';$('status').textContent='Define an area and ignition point to begin.';setMode(null);};$('download').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='prairie-fire-demo-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('about').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();$('past-date').textContent=time(0).toLocaleDateString('en-US',{month:'short',day:'numeric'});$('future-date').textContent=time(407).toLocaleDateString('en-US',{month:'short',day:'numeric'});render();

// Navigation changes the SVG viewBox; planner coordinates stay in source map units.
$('zoom-in').onclick=()=>zoomMap(1.5);
$('zoom-out').onclick=()=>zoomMap(1/1.5);
$('zoom-state').onclick=resetMapView;
$('map').style.cursor='grab';
$('landscape').addEventListener('wheel',e=>{e.preventDefault();zoomMap(e.deltaY<0?1.2:1/1.2,point(e));},{passive:false});
$('landscape').addEventListener('pointerdown',e=>{
  if(mode||e.button!==0||e.defaultPrevented)return;
  panStart={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,box:{...mapBox},scale:$('landscape').getScreenCTM().a};
  $('landscape').setPointerCapture(e.pointerId);$('map').style.cursor='grabbing';
});
$('landscape').addEventListener('pointermove',e=>{
  if(!panStart||panStart.id!==e.pointerId)return;
  mapBox={...panStart.box,x:panStart.box.x-(e.clientX-panStart.clientX)/panStart.scale,y:panStart.box.y-(e.clientY-panStart.clientY)/panStart.scale};applyMapBox();
});
function endMapGesture(e){if(panStart&&panStart.id===e.pointerId){panStart=null;$('map').style.cursor=mode?'crosshair':'grab';}}
$('landscape').addEventListener('pointerup',endMapGesture);
$('landscape').addEventListener('pointercancel',e=>{start=null;endMapGesture(e);});
$('landscape').addEventListener('lostpointercapture',endMapGesture);
$('landscape').addEventListener('keydown',e=>{
  if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();
  if(e.key==='+'||e.key==='=')zoomMap(1.5);
  else if(e.key==='-')zoomMap(1/1.5);
  else if(e.key==='Home')resetMapView();
  else if(e.key.startsWith('Arrow')&&!start){const step=mapBox.w*.12;if(e.key==='ArrowLeft')mapBox.x-=step;if(e.key==='ArrowRight')mapBox.x+=step;if(e.key==='ArrowUp')mapBox.y-=step;if(e.key==='ArrowDown')mapBox.y+=step;applyMapBox();}
});
$('reset-map').addEventListener('click',resetMapView);
applyMapBox();

new ResizeObserver(()=>drawIgnition()).observe($('landscape'));
