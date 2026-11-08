const ns='http://www.w3.org/2000/svg';
const format=value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const shortTime=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const shortDate=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric'}).format(new Date(value));
const element=(tag,attrs={},text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;};
export function chartSeries(rows,key){
  return rows.map(row=>({time:Date.parse(row.valid_time_utc),value:row[key]===null||row[key]===undefined||row[key]===''?null:Number(row[key])}))
    .filter(row=>Number.isFinite(row.time)).sort((a,b)=>a.time-b.time).map(row=>({...row,value:Number.isFinite(row.value)?row.value:null}));
}
export function nearestPoint(points,target){return points.reduce((best,p,i)=>Math.abs(p.time-target)<Math.abs(points[best].time-target)?i:best,0);}
export function windDirection(degrees,speed){
  if(speed!==null&&speed!==undefined&&Number(speed)<=1e-6)return {calm:true};
  if(degrees===null||degrees===undefined||degrees===''||!Number.isFinite(Number(degrees)))return null;
  const angle=((Number(degrees)%360)+360)%360;
  const names=['North','Northeast','East','Southeast','South','Southwest','West','Northwest'];
  return {calm:false,rotation:(angle+180)%360,from:names[Math.round(angle/45)%8]};
}
export function hourlyCharts(rows,fields){
  const grid=document.createElement('div');grid.className='hourly-chart-grid';
  for(const [key,label] of fields){
    const card=document.createElement('figure');card.className='hourly-chart';
    const heading=document.createElement('figcaption');heading.textContent=label;card.append(heading);
    const points=chartSeries(rows,key),valid=points.filter(p=>p.value!==null);
    const windRows=key==='wind_mph'?new Map(rows.map(row=>[Date.parse(row.valid_time_utc),row])):null;
    const windAt=p=>windRows?windDirection(windRows.get(p.time)?.wind_from_degrees,p.value):null;
    if(!valid.length){const empty=document.createElement('p');empty.textContent='No values for this period.';card.append(empty);grid.append(card);continue;}
    const width=600,height=250,left=70,right=18,top=18,bottom=48,plotW=width-left-right,plotH=height-top-bottom;
    const first=points[0].time,last=points.at(-1).time;
    let low=Math.min(...valid.map(p=>p.value)),high=Math.max(...valid.map(p=>p.value));
    if(high===low){const padding=Math.max(Math.abs(low)*.1,1);low-=padding;high+=padding;}
    if(key==='rain_in'){low=0;high=Math.max(high,0.01);}
    const x=t=>first===last?left+plotW/2:left+(t-first)/(last-first)*plotW;
    const y=v=>top+(high-v)/(high-low)*plotH;
    const svg=element('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${label}; hourly values in Central Time. Focus and use left or right arrow keys for values.`,tabindex:0});
    for(let i=0;i<5;i++){
      const v=low+(high-low)*i/4,py=y(v);
      svg.append(element('line',{x1:left,x2:width-right,y1:py,y2:py,stroke:'#e0e3d8'}),element('text',{x:left-8,y:py+4,'text-anchor':'end',class:'chart-axis'},format(v)));
    }
    const indexes=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
    for(const i of indexes){
      const label=element('text',{x:x(points[i].time),y:height-25,'text-anchor':i===0?'start':i===points.length-1?'end':'middle',class:'chart-axis'});
      label.append(element('tspan',{x:x(points[i].time),dy:0},shortTime(points[i].time)),element('tspan',{x:x(points[i].time),dy:15},shortDate(points[i].time)));svg.append(label);
    }
    let path='',connected=false,prior=null;
    for(const p of points){
      if(p.value===null){connected=false;prior=null;continue;}
      if(key==='wind_from_degrees'&&prior!==null&&Math.abs(p.value-prior)>180)connected=false;
      path+=`${connected?'L':'M'}${x(p.time)},${y(p.value)} `;connected=true;prior=p.value;
    }
    svg.append(element('path',{d:path,fill:'none',stroke:'#b64c2e','stroke-width':2.5}));
    for(const p of valid)svg.append(element('circle',{cx:x(p.time),cy:y(p.value),r:3,fill:'#b64c2e'}));
    if(windRows){
      for(const p of valid){
        const direction=windAt(p);if(!direction||direction.calm)continue;
        const arrow=element('g',{transform:`translate(${x(p.time)} ${y(p.value)}) rotate(${direction.rotation})`});
        arrow.append(element('path',{d:'M0 10 L0 -10 M-4 -4 L0 -10 L4 -4',fill:'none',stroke:'#fffef9','stroke-width':5,'stroke-linecap':'round','stroke-linejoin':'round'}),element('path',{d:'M0 10 L0 -10 M-4 -4 L0 -10 L4 -4',fill:'none',stroke:'#315b40','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'}),element('title',{},`${time(p.time)} · ${format(p.value)} mph · From ${direction.from}`));svg.append(arrow);
      }
    }
    const guide=element('line',{x1:left,x2:left,y1:top,y2:height-bottom,stroke:'#496b4f','stroke-dasharray':'4 4',visibility:'hidden'});svg.append(guide);
    const detail=document.createElement('div');detail.className='hourly-chart-tooltip';detail.hidden=true;detail.setAttribute('role','status');
    const hint=document.createElement('p');hint.className='chart-hint';hint.textContent='Hover or tap for time and value · Arrow keys also work';
    if(windRows)hint.textContent='Arrows point where wind blows; North is up, East is right. Hover for speed and wind-from direction.';
    let selected=0;
    function show(index){
      selected=index;const p=points[index],px=x(p.time);
      guide.setAttribute('x1',px);guide.setAttribute('x2',px);guide.setAttribute('visibility','visible');
      detail.textContent=`${time(p.time)} · ${label}: ${p.value===null?'No value':format(p.value)}`;
      if(windRows&&p.value!==null){const direction=windAt(p);detail.textContent+=direction?.calm?' · Calm':direction?` · From ${direction.from}`:' · Direction unavailable';}
      detail.hidden=false;detail.style.left=`${Math.max(8,Math.min(58,px/width*100))}%`;
    }
    const pointer=event=>{const box=svg.getBoundingClientRect(),px=(event.clientX-box.left)/box.width*width;const target=first+(Math.max(0,Math.min(1,(px-left)/plotW)))*(last-first);show(nearestPoint(points,target));};
    svg.addEventListener('pointermove',pointer);svg.addEventListener('pointerdown',pointer);
    svg.addEventListener('pointerleave',()=>{detail.hidden=true;guide.setAttribute('visibility','hidden');});
    svg.addEventListener('focus',()=>show(selected));
    svg.addEventListener('blur',()=>{detail.hidden=true;guide.setAttribute('visibility','hidden');});
    svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,selected+(event.key==='ArrowRight'?1:-1))));}});
    card.append(svg,detail,hint);grid.append(card);
  }
  return grid;
}
