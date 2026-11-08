// Transparent model-based comparisons; no universal burn/no-burn thresholds.
const numeric=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const fmt=value=>numeric(value)===null?'—':Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export const prescriptionFields=[
  ['tempMin','Minimum temperature (°F)','temperature_f','min'],['tempMax','Maximum temperature (°F)','temperature_f','max'],
  ['rhMin','Minimum RH (%)','rh_percent','min'],['rhMax','Maximum RH (%)','rh_percent','max'],
  ['windMin','Minimum wind (mph)','wind_mph','min'],['windMax','Maximum wind (mph)','wind_mph','max'],
  ['moistMin','Minimum 1-hour moisture (%)','dmc_1_hr','min'],['moistMax','Maximum 1-hour moisture (%)','dmc_1_hr','max'],
  ['moist10Min','Minimum 10-hour moisture (%)','dmc_10_hr','min'],['moist10Max','Maximum 10-hour moisture (%)','dmc_10_hr','max']
];
// OK-FIRE beginner screening guidance, NOT universal NWCG limits.
// Limits and hourly weather are in U.S. customary units.
export const OKFIRE_DEFAULTS={tempMin:35,rhMin:40,rhMax:80,windMin:4,windMax:15,moistMin:8,moistMax:20,moist10Min:7,moist10Max:15};
export function effectiveLimits(limits={},useDefaults=false){
  const effective=useDefaults?{...OKFIRE_DEFAULTS}:{};
  for(const [key] of prescriptionFields)if(numeric(limits[key])!==null)effective[key]=Number(limits[key]);
  return effective;
}
export function assessHours(result,limits={},useDefaults=false){
  limits=effectiveLimits(limits,useDefaults);
  const weather=new Map((result.hourly_weather||[]).map(row=>[Date.parse(row.valid_time_utc),row]));
  return (result.hourly_domain||[]).map(row=>{
    const w=weather.get(Date.parse(row.weather_valid_time_utc||row.valid_time_utc))||{};
    const merged={...w,...row},outside=[],missing=[],outsideFields=[];
    const entered=prescriptionFields.filter(([key])=>numeric(limits[key])!==null);
    for(const [key,label,field,kind] of entered){const value=numeric(merged[field]);if(value===null)missing.push(label);else if(kind==='min'?value<Number(limits[key]):value>Number(limits[key])){outside.push(`${label}: ${fmt(value)} versus ${fmt(limits[key])}`);outsideFields.push(field);}}
    const required=['temperature_f','rh_percent','wind_mph','dmc_1_hr','dmc_10_hr'];
    const complete=required.every(key=>numeric(merged[key])!==null);
    const covered=new Set(entered.map(([,label,field])=>field));
    const status=outside.length?'Outside entered limits':missing.length||!complete||entered.length&&covered.size<required.length?'Incomplete comparison':entered.length?'Within entered limits':'Prescription not entered';
    const notes=[];
    notes.push(...outside,...missing.map(label=>`${label}: model value unavailable`));
    if(!complete)notes.push('One or more of the five required hourly values are missing.');
    if(covered.size<required.length)notes.push('Set at least one limit for each of the five variables or enable reference ranges.');
    if(!notes.length)notes.push('All five variables are within the selected limits.');
    return {...merged,status,notes,complete,outsideFields:[...new Set(outsideFields)],inWindow:status==='Within entered limits'};
  }).sort((a,b)=>Date.parse(a.valid_time_utc)-Date.parse(b.valid_time_utc));
}
export function createBurnSuggestions(result){
  const section=el('section',undefined,'result-data burn-suggestions');section.append(el('h3','Burn suggestion · Planning outlook'));
  section.append(el('p','Green rows meet the selected limits for all five variables. Red rows are outside a limit or cannot be fully assessed. Green indicates a screening window, not approval to burn.','field-help'));
  const summary=el('div',undefined,'burn-outlook-summary');
  const source=el('label',undefined,'burn-default-toggle'),useDefaults=el('input');useDefaults.type='checkbox';useDefaults.checked=true;
  source.append(useDefaults,document.createTextNode(' Use OK-FIRE beginner screening ranges when a limit is blank'));
  const sourceNote=el('p','Reference ranges: RH 40–80%; 33 ft wind 4–15 mph; 1 h dead moisture 8–20%; 10 h dead moisture 7–15%; temperature ≥35°F, with no reference upper temperature limit. These are OK-FIRE screening ranges, not NWCG limits.','field-help');
  const details=el('details',undefined,'burn-prescription');details.append(el('summary','Compare with limits from your burn prescription'));
  details.append(el('p','Your numbers override the reference ranges. Only temperature, RH, wind speed and 1 h / 10 h dead-fuel moisture determine this window.','field-help'));
  const inputs=el('div',undefined,'burn-limit-rows');const controls={};
  for(const [field,title] of [['temperature_f','Temperature (°F)'],['rh_percent','Relative humidity (%)'],['wind_mph','Wind speed (mph)'],['dmc_1_hr','1-hour dead-fuel moisture (%)'],['dmc_10_hr','10-hour dead-fuel moisture (%)']]){
    const row=el('div',undefined,'burn-limit-row');row.append(el('strong',title));
    for(const [key,label,,kind] of prescriptionFields.filter(entry=>entry[2]===field)){
      const wrapper=el('label',kind==='min'?'Minimum':'Maximum');const input=el('input');input.type='number';input.min=field==='temperature_f'?'-80':'0';input.step='any';input.placeholder=key in OKFIRE_DEFAULTS?`Reference: ${fmt(OKFIRE_DEFAULTS[key])}`:'Site-specific limit';input.setAttribute('aria-label',label);if(field==='rh_percent'||field.startsWith('dmc_'))input.max='100';wrapper.append(input);controls[key]=input;row.append(wrapper);
    }
    inputs.append(row);
  }
  details.append(inputs);
  const report=el('p','','field-help');report.setAttribute('role','status');
  const wrapper=el('div',undefined,'result-table-scroll');
  function update(){
    const limits=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value]));
    const effective=effectiveLimits(limits,useDefaults.checked);
    const bad=Object.values(controls).some(input=>!input.checkValidity())||[['tempMin','tempMax'],['rhMin','rhMax'],['windMin','windMax'],['moistMin','moistMax'],['moist10Min','moist10Max']].some(([a,b])=>numeric(effective[a])!==null&&numeric(effective[b])!==null&&Number(effective[a])>Number(effective[b]));
    summary.replaceChildren();wrapper.replaceChildren();
    if(bad){report.textContent='Check the limits: the effective minimum cannot exceed the effective maximum, including reference values used for blank fields.';return;}
    const hours=assessHours(result,limits,useDefaults.checked);
    if(!hours.length){report.textContent='Hourly domain results are unavailable for this older simulation. Rerun it to generate the planning outlook.';return;}
    for(const [label,count] of [['Inside window',hours.filter(row=>row.inWindow).length],['Outside limits',hours.filter(row=>row.status==='Outside entered limits').length],['Incomplete / unassessed',hours.filter(row=>!row.inWindow&&row.status!=='Outside entered limits').length]]){const card=el('div');card.append(el('small',label),el('strong',String(count)));summary.append(card);}
    const entered=Object.keys(effective).length;
    report.textContent=entered?'Green: all five variables meet the selected limits. Red: outside a limit, missing data, or incomplete limits.':'No limits entered or enabled; hours are red because they cannot be assessed.';
    const table=el('table'),head=el('tr');for(const title of ['Time (Central)','Window','Temperature (°F)','RH (%)','Wind (mph)','1 h moisture (%)','10 h moisture (%)','Spread rate (ft/min)','Flame length (ft)','BI'])head.append(el('th',title));const thead=el('thead');thead.append(head);table.append(thead);
    const body=el('tbody');for(const row of hours){const tr=el('tr',undefined,row.inWindow?'burn-window-inside':'burn-window-outside');tr.append(el('td',time(row.valid_time_utc)),el('td',row.inWindow?'Within window':row.status==='Outside entered limits'?'Outside window':'Not fully assessed'));for(const key of ['temperature_f','rh_percent','wind_mph','dmc_1_hr','dmc_10_hr','spread_rate','flame_length','BI']){const cell=el('td',fmt(row[key]));if(row.outsideFields.includes(key)){cell.className='burn-value-outside';cell.title='Outside the selected limits';cell.setAttribute('aria-label',`${fmt(row[key])}, outside the selected limits`);}tr.append(cell);}body.append(tr);}table.append(body);wrapper.replaceChildren(table);
  }
  for(const input of Object.values(controls))input.addEventListener('input',update);
  useDefaults.addEventListener('change',update);
  const limitations=el('p','This window checks only five variables using centroid weather and domain-average dead-fuel moisture. Rain, fire danger, simulated behavior, gusts, smoke dispersion and other requirements do not determine the row color. Verify the full site prescription and current field conditions before any burn.','result-note');
  const links=el('p',undefined,'field-help');for(const [label,url] of [['NWCG prescription guidance','https://www.nwcg.gov/publications/pms205/nwcg-glossary-of-wildland-fire-pms-205/prescription'],['Prescribed-fire Go/No-Go checklist','https://tfsweb.tamu.edu/forest-land/prescribed-fire/prescribed-burning-burn-managers/day-of-the-burn-go-no-go-checklist/']]){const link=el('a',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';links.append(link,document.createTextNode(' · '));}
  const reference=el('a','OK-FIRE published screening guidance');reference.href='https://mesonet.org/fire-management/learning-materials/prescribed-burning';reference.target='_blank';reference.rel='noopener noreferrer';links.prepend(reference,document.createTextNode(' · '));
  section.append(source,sourceNote,summary,details,report,wrapper,limitations,links);update();return section;
}
