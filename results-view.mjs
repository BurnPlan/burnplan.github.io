import { hourlyCharts } from './hourly-charts.mjs';
import { createBurnSuggestions } from './burn-suggestions.mjs';
import { rasterGrid,drawRaster } from './raster-map.mjs';
export function resultPath(owner,job,filename) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(owner)||!uuid.test(job)||typeof filename!=='string'||!filename.match(/^[A-Za-z0-9_.-]+$/)||filename.includes('..')) throw new Error('Invalid private result path.');
  return `${owner}/${job}/${filename}`;
}
export function metricGroups(layers) {return [...new Map(layers.map(layer=>[layer.metric,layer.title])).entries()];}
export function rasterPixel(grid,px,py){
  const [a,b,c,d,e,f]=grid.transform,det=a*e-b*d;
  const col=Math.floor((e*(px-c)-b*(py-f))/det),row=Math.floor((-d*(px-c)+a*(py-f))/det);
  if(row<0||col<0||row>=grid.height||col>=grid.width)return null;
  return {row,col,value:grid.values[row*grid.width+col]};
}
const timeLabel=value=>value==='Final'?'Final result':new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value.match(/^\d{8}T\d{4}Z$/)?`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(9,11)}:${value.slice(11,13)}:00Z`:value));
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const number=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value).toLocaleString(undefined,{maximumFractionDigits:2}):'—';

export function createResultsViewer(client) {
  const dialog=document.getElementById('results-dialog'),content=document.getElementById('results-content');
  let resultMap=null,overlay=null,abort=null,generation=0;
  function close(){generation++;abort?.abort();if(resultMap){resultMap.remove();resultMap=null;}if(dialog.open)dialog.close();}
  document.getElementById('close-results').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  async function open(job,owner) {
    close();const current=++generation;abort=new AbortController();const signal=abort.signal;
    content.replaceChildren(node('p','Loading your private results…'));dialog.showModal();
    const path=name=>resultPath(owner,job.id,name);
    async function signed(name){
      const {data,error}=await client.storage.from('simulation-results').createSignedUrl(path(name),300);
      if(error||!data?.signedUrl)throw new Error('Could not access the result file. Check your sign-in and connection.');
      return data.signedUrl;
    }
    async function getJSON(name){const response=await fetch(await signed(name),{signal});if(!response.ok)throw new Error('Result download failed.');return response.json();}
    try {
      if(job.result_path!==path('results.json'))throw new Error('This request has no supported result manifest.');
      const result=await getJSON('results.json');if(current!==generation)return;
      if(result.schema!==1||!Array.isArray(result.layers)||!result.summary)throw new Error('Unsupported result format.');
      result.layers=result.layers.filter(layer=>{
        const metric=layer.metric.split('/').pop();
        return !['dmc_1000_hr','lmc_herb','lmc_woody'].includes(metric)
          && !layer.metric.startsWith('potential/');
      });
      const simulatedTitles={spread_rate:'Simulated rate of spread',flame_length:'Simulated flame length',fireline_intensity:'Simulated fireline intensity',fire_type:'Simulated fire type',time_of_arrival_minutes:'Simulated fire arrival time'};
      for(const layer of result.layers){
        if(layer.metric.startsWith('spread/'))layer.title=simulatedTitles[layer.metric.split('/').pop()]||layer.title.replace(/^Actual /,'Simulated ');
      }
      const heading=node('div',undefined,'results-heading');heading.append(node('span','SIMULATION RESULTS','eyebrow'),node('h2',job.name));
      const cards=node('div',undefined,'result-summary');
      for(const [label,value] of [['Simulated burned area',`${number(result.summary.burned_raster_acres)} acres`],['Domain',`${number(result.summary.domain_acres)} acres`]]){
        const card=node('div');card.append(node('small',label),node('strong',value));cards.append(card);
      }
      const note=node('p',`Requested period: ${timeLabel(result.summary.start_utc)} → ${timeLabel(result.summary.end_utc)}. Stop: ${result.summary.stop_condition}.`,'field-help');
      const controls=node('div',undefined,'result-controls');
      const metric=node('select'),time=node('select');metric.setAttribute('aria-label','Result map');time.setAttribute('aria-label','Result map time');
      const groups=metricGroups(result.layers);
      const categories=[['spread','Fire spread simulation variables'],['danger','Fire danger'],['moisture','Fuel moisture']];
      const category=value=>value.startsWith('spread/')?'spread':value.startsWith('potential/')?'potential':['BI','ERC','SC','IC'].includes(value.split('/').pop())?'danger':'moisture';
      for(const [key,label] of categories){
        const group=document.createElement('optgroup');group.label=label;
        for(const [value,title] of groups.filter(([value])=>category(value)===key))group.append(new Option(title,value));
        if(group.children.length)metric.append(group);
      }
      if(groups.some(([value])=>value==='spread/time_of_arrival_minutes'))metric.value='spread/time_of_arrival_minutes';
      for(const [title,input] of [['Map variable',metric],['Map time',time]]){const field=node('label',title,'result-control-field');field.append(input);controls.append(field);}
      const mapBox=node('div',undefined,'result-map');mapBox.id='result-map';mapBox.setAttribute('aria-label','Simulation results map');
      const legend=node('div',undefined,'result-legend');
      const feedback=node('p','','field-help');feedback.setAttribute('role','status');
      const warning=node('p','Fire spread is limited to the drawn domain. Its boundary is not a physical containment line.','result-note');
      const tabs=node('div',undefined,'results-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Simulation result categories');
      const panels=node('div',undefined,'results-panels');const panelEntries=[];
      function activate(entry){
        for(const item of panelEntries){const active=item===entry;item.panel.hidden=!active;item.button.setAttribute('aria-selected',String(active));item.button.tabIndex=active?0:-1;}
        if(entry.key==='map')requestAnimationFrame(()=>resultMap?.invalidateSize());
      }
      function addPanel(key,title,panel){
        const button=node('button',title,'results-tab');button.type='button';button.id=`results-tab-${key}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`results-panel-${key}`);
        panel.id=`results-panel-${key}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;
        const entry={key,button,panel};panelEntries.push(entry);tabs.append(button);panels.append(panel);button.onclick=()=>activate(entry);
        button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const i=panelEntries.indexOf(entry);const next=panelEntries[event.key==='Home'?0:event.key==='End'?panelEntries.length-1:(i+(event.key==='ArrowRight'?1:-1)+panelEntries.length)%panelEntries.length];activate(next);next.button.focus();}};
        activate(panelEntries[0]);
      }
      const mapPanel=node('section',undefined,'results-map-panel');mapPanel.append(controls,mapBox,legend,feedback,warning);
      content.replaceChildren(heading,note,cards,tabs,panels);addPanel('map','Maps',mapPanel);
      resultMap=L.map(mapBox,{minZoom:5,maxZoom:20});
      resultMap.createPane('resultRaster');resultMap.getPane('resultRaster').style.zIndex=350;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(resultMap);
      const domain=L.geoJSON(job.area_geojson,{style:{color:'#315b40',weight:2,fill:false}}).addTo(resultMap);
      resultMap.fitBounds(domain.getBounds(),{padding:[20,20],maxZoom:17});
      if(job.area_geojson?.properties?.ignition)L.geoJSON(job.area_geojson.properties.ignition,{style:{color:'#9c2547',weight:3},pointToLayer:(_f,ll)=>L.circleMarker(ll,{radius:5,color:'#9c2547'})}).addTo(resultMap);
      const perimeter=await getJSON(result.perimeter);if(current!==generation)return;
      L.geoJSON(perimeter,{style:{color:'#c04725',weight:2,fill:false}}).addTo(resultMap);
      let hoverGrid=null,hoverLayer=null,projectPoint=null;
      const rasterFiles=new Map();
      async function loadRaster(file){
        if(!rasterFiles.has(file))rasterFiles.set(file,getJSON(file).catch(error=>{rasterFiles.delete(file);throw error;}));
        return rasterFiles.get(file);
      }
      const valueTip=L.tooltip({direction:'top',offset:[0,-10],className:'result-pixel-tooltip'});
      function inspectPixel(event){
        if(!hoverGrid||!projectPoint)return;
        const [px,py]=projectPoint.forward([event.latlng.lng,event.latlng.lat]);
        const pixel=rasterPixel(hoverGrid,px,py);
        if(!pixel){valueTip.remove();return;}
        const value=pixel.value;
        const units=hoverLayer.metric.endsWith('/time_of_arrival_minutes')?'minutes since fire ignition':hoverLayer.units;
        const text=node('div');text.append(node('strong',hoverLayer.title),node('div',value===null?'No simulated value':`${number(value)} ${units}`),node('small',timeLabel(hoverLayer.time)));
        valueTip.setLatLng(event.latlng).setContent(text).addTo(resultMap);
      }
      resultMap.on('mousemove click',inspectPixel);resultMap.on('mouseout',()=>valueTip.remove());
      let selection=0;
      async function updateLayer(){
        const version=++selection;feedback.textContent='Loading map…';hoverGrid=null;projectPoint=null;valueTip.remove();
        try{
          const layer=result.layers.find(item=>item.metric===metric.value&&item.time===time.value);if(!layer)return;
          const minimum=Number(layer.minimum),maximum=Number(layer.maximum);
          const arrivalLegend=layer.metric.endsWith('/time_of_arrival_minutes');
          const unit=arrivalLegend?'mins since ignition':layer.units;
          legend.replaceChildren(node('strong',layer.title));
          const scale=node('div',undefined,'result-color-scale');
          const ramp=node('div',undefined,'result-color-ramp');const colors=layer.palette.filter(color=>/^#[0-9a-f]{6}$/i.test(color));
          ramp.style.background=maximum===minimum?colors[0]:`linear-gradient(to right,${colors.join(',')})`;scale.append(ramp);
          const ticks=node('div',undefined,'result-color-ticks');
          const values=maximum===minimum?[minimum]:layer.metric.endsWith('/fire_type')?[0,1,2,3].filter(value=>value>=minimum&&value<=maximum):Array.from({length:5},(_,i)=>minimum+(maximum-minimum)*i/4);
          for(const value of values){
            const label=node('span',`${Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:2}):'—'}${arrivalLegend?'':` ${unit}`}`);
            ticks.append(label);
          }
          scale.append(ticks);
          if(arrivalLegend){const caption=node('div','Minutes since fire ignition','result-legend-unit');scale.append(caption);}
          legend.append(scale);
          if(layer.metric.endsWith('/fire_type'))legend.append(node('small','Classes: 0 = unburned; 1 = surface fire; 2 = passive crown fire; 3 = active crown fire.'));
          feedback.textContent='Orange outline: simulated burned area. Green outline: domain. Red: ignition.';
          if(layer.values_file){
            const grid=rasterGrid(await loadRaster(layer.values_file),layer.values_band);if(current!==generation||version!==selection)return;
            if(grid.schema!==1||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||grid.width<=0||grid.height<=0||!Array.isArray(grid.values)||grid.values.length!==grid.width*grid.height||!Array.isArray(grid.transform)||grid.transform.length!==6||!grid.transform.every(Number.isFinite)||!grid.crs)throw new Error('Pixel values unavailable: invalid raster grid.');
            if(Math.abs(grid.transform[0]*grid.transform[4]-grid.transform[1]*grid.transform[3])<1e-12)throw new Error('Pixel values unavailable: invalid map coordinates.');
            projectPoint=window.proj4('EPSG:4326',grid.crs);hoverGrid=grid;hoverLayer=layer;
            const url=drawRaster(grid,layer,projectPoint);
            if(overlay)overlay.remove();overlay=L.imageOverlay(url,layer.bounds,{opacity:.85,interactive:false,pane:'resultRaster',className:'simulation-result-image'}).addTo(resultMap);
            feedback.textContent+=' Hover over the map or tap to inspect a 30 m pixel.';
          }else if(layer.file){
            const url=await signed(layer.file);if(current!==generation||version!==selection)return;
            if(overlay)overlay.remove();overlay=L.imageOverlay(url,layer.bounds,{opacity:.85,interactive:false,pane:'resultRaster',className:'simulation-result-image'}).addTo(resultMap);
          }else throw new Error('Map data are unavailable.');
        }catch(error){if(current===generation)feedback.textContent=error.message;}
      }
      metric.onchange=()=>{time.replaceChildren();for(const layer of result.layers.filter(item=>item.metric===metric.value))time.add(new Option(timeLabel(layer.time),layer.time));updateLayer();};
      time.onchange=updateLayer;metric.onchange();
      if(result.hourly_domain?.length){
        const tables=[['Fire spread',[['burned_acres','Cumulative burned (acres)'],['new_burned_acres','Newly burned (acres)'],['spread_rate','Simulated spread rate (m/min)'],['flame_length','Simulated flame length (m)'],['fireline_intensity','Simulated fireline intensity (kW/m)']]],
          ['Fire danger',[['BI','BI'],['ERC','ERC'],['SC','SC'],['IC','IC']]],
          ['Fuel moisture',[['dmc_1_hr','1 h (%)'],['dmc_10_hr','10 h (%)'],['dmc_100_hr','100 h (%)']]]];
        for(const [title,fields] of tables){
          const section=node('section',undefined,'result-data');section.append(node('h3',`${title} · Hourly`));
          section.append(node('p',title==='Fire spread'?(result.hourly_domain.some(row=>row.behavior_source==='active_front')?'Behavior shows instantaneous hourly means along the actively spreading fire front, even when no new grid cells burn. Zero means the frontier is not spreading; missing values mean no frontier or a stopped simulation.':'This older simulation reports behavior only for newly reached cells. Rerun it to record hourly active-front behavior.'):'Area-weighted means over valid burnable cells in the domain. All times are Central.','field-help'));
          section.append(hourlyCharts(result.hourly_domain,fields));addPanel(title.toLowerCase().replaceAll(' ','-'),title,section);
        }
      }else if(result.series?.length){
        const section=node('section',undefined,'result-data');section.append(node('h3','Hourly results'));
        const sampleTime=node('select');sampleTime.setAttribute('aria-label','Fuel moisture sample time');
        for(const value of [...new Set(result.series.map(row=>row.valid_time_utc))])sampleTime.add(new Option(timeLabel(value),value));
        const wrapper=node('div',undefined,'result-table-scroll');section.append(sampleTime,wrapper);
        sampleTime.onchange=()=>{
          wrapper.replaceChildren();
          const common=[['fuel_model','Fuel'],['slope_class','Slope class']];
          for(const [title,fields] of [['Fire danger',[['BI','BI'],['ERC','ERC'],['SC','SC'],['IC','IC']]],['Fuel moisture',[['dmc_1_hr','1 h (%)'],['dmc_10_hr','10 h (%)'],['dmc_100_hr','100 h (%)']]]]){
            const cols=[...common,...fields];
            const table=node('table'),head=node('tr');for(const [,label] of cols)head.append(node('th',label));const thead=node('thead');thead.append(head);table.append(thead);
            const body=node('tbody');for(const row of result.series.filter(row=>row.valid_time_utc===sampleTime.value)){const tr=node('tr');for(const [key] of cols)tr.append(node('td',key==='fuel_model'?row[key]:number(row[key])));body.append(tr);}table.append(body);wrapper.append(node('h3',title),table);
          }
        };sampleTime.onchange();addPanel('hourly','Hourly results',section);
      }
      if(result.hourly_weather?.length){
        const section=node('section',undefined,'result-data');section.append(node('h3','Hourly weather · Central Time'));
        section.append(node('p','Weather at the domain centroid’s nearest HRRR grid cell. Rainfall covers the hour ending at the listed time. Wind direction is the direction the wind comes from, clockwise from true north.','field-help'));
        const fields=[['temperature_c','Temperature (°C)'],['rh_percent','Relative humidity (%)'],['rain_mm','Rainfall (mm)'],['solar_w_m2','Solar radiation (W/m²)'],['wind_m_s','Wind speed and direction (m/s)']];
        section.append(hourlyCharts(result.hourly_weather,fields));addPanel('weather','Weather',section);
      }
      addPanel('burn-suggestion','Burn suggestion',createBurnSuggestions(result));
      requestAnimationFrame(()=>resultMap?.invalidateSize());
    }catch(error){if(current===generation)content.replaceChildren(node('h2','Results unavailable'),node('p',error.message,'inline-error'));}
  }
  return {open,close};
}
