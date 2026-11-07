// Geometry-only validation, shared by the UI and offline tests.
export function validateIgnition(ignition, domain, turf) {
  if (!domain) throw new Error('Draw the simulation domain before adding an ignition.');
  const geometry = ignition?.type === 'Feature' ? ignition.geometry : null;
  if (!geometry || !['Point','LineString','Polygon'].includes(geometry.type)) {
    throw new Error('Provide a point, line, or polygon ignition.');
  }
  function checkCoordinates(coords) {
    if (!Array.isArray(coords) || !coords.length) throw new Error('Ignition coordinates are missing.');
    if (typeof coords[0] === 'number') {
      if (coords.length !== 2 || !coords.every(Number.isFinite) || Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) {
        throw new Error('Ignition coordinates must be finite longitude/latitude pairs.');
      }
    } else coords.forEach(checkCoordinates);
  }
  checkCoordinates(geometry.coordinates);
  const inside = p => turf.booleanPointInPolygon(turf.point(p), domain, { ignoreBoundary: false });
  const outsideMessage = 'Keep the entire ignition inside the simulation domain.';
  if (geometry.type === 'Point') {
    if (typeof geometry.coordinates[0] !== 'number' || !inside(geometry.coordinates)) throw new Error(outsideMessage);
  } else if (geometry.type === 'LineString') {
    const points = geometry.coordinates;
    if (points.length < 2 || turf.length(ignition) <= 0) throw new Error('An ignition line needs two or more distinct points.');
    if (!points.every(inside)) throw new Error(outsideMessage);
    // Split each segment at boundary crossings and check every interval.
    // Endpoint checks alone miss a line crossing outside a concave domain.
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const dx = b[0]-a[0], dy = b[1]-a[1], length2 = dx*dx+dy*dy;
      if (!length2) continue;
      const crossings = turf.lineIntersect(turf.lineString([a,b]), domain).features;
      const fractions = [0,1,...crossings.map(f => ((f.geometry.coordinates[0]-a[0])*dx+(f.geometry.coordinates[1]-a[1])*dy)/length2)]
        .filter(t => t >= 0 && t <= 1).sort((x,y)=>x-y);
      for (let j = 1; j < fractions.length; j++) {
        if (fractions[j]-fractions[j-1] < 1e-12) continue;
        const t = (fractions[j]+fractions[j-1])/2;
        if (!inside([a[0]+dx*t,a[1]+dy*t])) throw new Error(outsideMessage);
      }
    }
  } else {
    const rings = geometry.coordinates;
    if (rings.some(ring => ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
      throw new Error('An ignition polygon must have a closed boundary and at least three corners.');
    }
    if (turf.area(ignition) <= 0 || turf.kinks(ignition).features.length) throw new Error('Draw a nonzero ignition polygon with no crossed edges.');
    const outside = turf.difference(turf.featureCollection([ignition,domain]));
    if (outside && turf.area(outside) > 0.001) throw new Error(outsideMessage);
  }
  return ignition;
}

export function ignitionDescription(ignition, turf) {
  if (!ignition) return 'No ignition provided';
  try { switch (ignition.geometry.type) {
    case 'Point': return `Point · ${ignition.geometry.coordinates[1].toFixed(5)}, ${ignition.geometry.coordinates[0].toFixed(5)}`;
    case 'LineString': return `Line · ${(turf.length(ignition)*1000).toLocaleString(undefined,{maximumFractionDigits:1})} m`;
    case 'Polygon': return `Polygon · ${(turf.area(ignition)/10000).toLocaleString(undefined,{maximumFractionDigits:2})} ha`;
    default: return 'Unsupported ignition';
  } } catch { return 'Invalid saved ignition'; }
}
