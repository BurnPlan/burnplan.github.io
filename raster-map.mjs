// Draw native raster values locally; no server-generated PNG is required.
export function rasterColor(value,minimum,maximum,palette){
  if(value===null||!Number.isFinite(Number(value)))return null;
  const colors=palette.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  const ratio=maximum===minimum?0:Math.max(0,Math.min(1,(Number(value)-minimum)/(maximum-minimum)));
  const position=ratio*(colors.length-1),index=Math.min(colors.length-2,Math.floor(position)),fraction=position-index;
  return colors[index].map((v,i)=>Math.floor(v+(colors[index+1][i]-v)*fraction));
}
export function rasterGrid(payload,band){
  if(payload.schema===1)return payload;
  if(payload.schema===2&&Number.isInteger(band)&&Array.isArray(payload.grids)&&payload.grids[band])return payload.grids[band];
  throw new Error('Unsupported raster data.');
}
export function drawRaster(grid,layer,projection){
  const southwest=L.CRS.EPSG3857.project(L.latLng(...layer.bounds[0]));
  const northeast=L.CRS.EPSG3857.project(L.latLng(...layer.bounds[1]));
  const dx=northeast.x-southwest.x,dy=northeast.y-southwest.y;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(2,Math.round(1024*dx/Math.max(dx,dy)));canvas.height=Math.max(2,Math.round(1024*dy/Math.max(dx,dy)));
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.globalAlpha=205/255;
  const vertices=new Map(),colors=new Map();
  const [a,b,c,d,e,f]=grid.transform;
  function vertex(row,col){
    const key=row*(grid.width+1)+col;if(vertices.has(key))return vertices.get(key);
    const [lng,lat]=projection.inverse([a*col+b*row+c,d*col+e*row+f]);
    const p=L.CRS.EPSG3857.project(L.latLng(lat,lng));
    const point=[(p.x-southwest.x)/dx*canvas.width,(northeast.y-p.y)/dy*canvas.height];vertices.set(key,point);return point;
  }
  for(let row=0;row<grid.height;row++)for(let col=0;col<grid.width;col++){
    const value=grid.values[row*grid.width+col];if(value===null)continue;
    if(!colors.has(value)){const rgb=rasterColor(value,Number(layer.minimum),Number(layer.maximum),layer.palette);colors.set(value,rgb?`rgb(${rgb.join(',')})`:null);}
    const color=colors.get(value);if(!color)continue;
    context.fillStyle=color;context.beginPath();
    const corners=[vertex(row,col),vertex(row,col+1),vertex(row+1,col+1),vertex(row+1,col)];
    context.moveTo(...corners[0]);for(const point of corners.slice(1))context.lineTo(...point);context.closePath();context.fill();
  }
  return canvas.toDataURL('image/png'); // Generated on this device, never uploaded.
}
