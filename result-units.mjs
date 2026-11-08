// Older stored results are converted on read; new exports already use these units.
export const behaviorFactors = {spread_rate:1/.3048,flame_length:1/.3048,fireline_intensity:1000*.3048/1055.05585262};
const behaviorUnits = {spread_rate:'ft/min',flame_length:'ft',fireline_intensity:'Btu/ft/s'};
const converted=(value,factor,offset=0)=>value===null||value===undefined?null:Number(value)*factor+offset;
export function customaryResults(input) {
  const result=structuredClone(input);
  if(result.unit_system==='US customary')return result;
  for(const row of result.hourly_weather||[]){
    for(const [from,to,factor,offset] of [['temperature_c','temperature_f',1.8,32],['wind_m_s','wind_mph',1/.44704,0],['rain_mm','rain_in',1/25.4,0],['solar_w_m2','solar_btu_ft2_hr',3600*.09290304/1055.05585262,0]]){
      if(from in row){row[to]=converted(row[from],factor,offset);delete row[from];}
    }
  }
  for(const row of result.hourly_domain||[])for(const [key,factor] of Object.entries(behaviorFactors))if(key in row)row[key]=converted(row[key],factor);
  for(const layer of result.layers||[]){
    const metric=layer.metric.split('/').pop(),factor=behaviorFactors[metric];
    if(factor&&layer.units!==behaviorUnits[metric]){
      layer.minimum=converted(layer.minimum,factor);layer.maximum=converted(layer.maximum,factor);
      layer.units=behaviorUnits[metric];layer.display_factor=factor;
    }
  }
  result.unit_system='US customary';return result;
}
export function customaryGrid(grid,layer){
  if(!layer.display_factor)return grid;
  return {...grid,values:grid.values.map(value=>converted(value,layer.display_factor))};
}
