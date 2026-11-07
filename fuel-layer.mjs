// Static tiles generated from the same local NFDRS4 raster used by the worker.
export async function addFuelLayer(map, checkbox, notice) {
  const response=await fetch('./data/fuel-tiles/metadata.json');
  if(!response.ok)throw new Error('Fuel map metadata unavailable');
  const metadata=await response.json();
  map.createPane('fuels');map.getPane('fuels').style.zIndex='350';map.getPane('fuels').style.pointerEvents='none';
  const layer=L.tileLayer('./data/fuel-tiles/{z}/{x}/{y}.png',{
    pane:'fuels',minZoom:6,maxNativeZoom:metadata.maxzoom,maxZoom:19,
    bounds:metadata.bounds,noWrap:true,opacity:0.65,
    errorTileUrl:'./data/fuel-tiles/empty.png',className:'fuel-map-tiles',
    attribution:'Fuel: LANDFIRE 2025 / local NFDRS4 grouping'
  });
  const legend=L.control({position:'bottomright'});
  legend.onAdd=()=>{
    const box=L.DomUtil.create('div','fuel-legend');
    const title=document.createElement('strong');title.textContent='Model fuel classes';box.append(title);
    for(const [id,label] of [[0,'Nonburnable'],[1,'V · Grass'],[2,'W · Grass / shrub'],[3,'X · Brush'],[4,'Y · Timber'],[5,'Z · Slash / blowdown']]){
      const row=document.createElement('div'),swatch=document.createElement('i');
      swatch.style.backgroundColor=`rgb(${metadata.colors[id].join(',')})`;row.append(swatch,document.createTextNode(label));box.append(row);
    }
    const help=document.createElement('small');help.textContent='30 m source · Zoom in to place ignition. Uncolored areas have no fuel data.';box.append(help);
    L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);return box;
  };
  function update(){if(checkbox.checked){layer.addTo(map);legend.addTo(map);}else{layer.remove();legend.remove();}}
  checkbox.addEventListener('change',update);update();
  let reported=false;layer.on('tileerror',()=>{if(!reported){reported=true;notice('Some fuel tiles could not load. Uncolored areas may be unavailable; do not assume they are burnable.');}});
  return layer;
}
