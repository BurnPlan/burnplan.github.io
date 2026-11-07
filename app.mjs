import { DateTime, ZONE, centralNow, limits, localFormat, choices, resolveLocal, validatePeriod, formatTime } from './time-utils.mjs';
import { validateIgnition, ignitionDescription } from './ignition-utils.mjs';
import { createResultsViewer } from './results-view.mjs';
import { addFuelLayer } from './fuel-layer.mjs';

const $ = id => document.getElementById(id);
const state = { user: null, domain: null, countyNames: [], counties: null, outline: null,
  jobs: [], drawing: null, editing: null, drawTarget: null, editTarget: null, ignition: null,
  submitting: false, realtime: null, labels: true, loadingJobs: false };
const client = window.supabase.createClient(window.OKBURN_CONFIG.supabaseUrl, window.OKBURN_CONFIG.publishableKey);
const resultsViewer=createResultsViewer(client);
const map = L.map('map', { zoomControl: false, minZoom: 5, maxZoom: 19 }).setView([35.6, -98.4], 7);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
}).addTo(map);
let tileErrors = 0;
tiles.on('tileerror', () => { if (++tileErrors > 2) $('map-status').textContent = 'Basemap tiles are unavailable. County boundaries and drawing still work.'; });
const drawn = new L.FeatureGroup().addTo(map);
const ignitionLayers = new L.FeatureGroup().addTo(map);
const ignitionIcon = L.divIcon({ className: 'ignition-point-icon', html: '<span></span>', iconSize: [20,20], iconAnchor: [10,10] });
const ignitionStyle = { color: '#9c2547', weight: 4, fillColor: '#c83955', fillOpacity: 0.36 };
const countyLayers = new Map();
const domainStyle = { color: '#b64c2e', weight: 3, fillColor: '#db854e', fillOpacity: 0.23 };
let toastTimer, labelTimer;
addFuelLayer(map, $('fuel-toggle'), notice).catch(()=>{
  $('fuel-toggle').checked=false;$('fuel-toggle').disabled=true;
  notice('Fuel map unavailable. Reload the website before choosing an ignition location.');
});

function notice(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 7000);
}
function errorAt(id, message = '') { $(id).textContent = message; $(id).hidden = !message; }
function openSignIn() { $('auth-dialog').showModal(); setTimeout(() => $('email').focus(), 50); }
function setView(view) {
  const isJobs = view === 'jobs'; $('planner').hidden = isJobs; $('jobs-view').hidden = !isJobs;
  for (const [id, selected] of [['planner-tab', !isJobs], ['jobs-tab', isJobs]]) {
    $(id).classList.toggle('active', selected); $(id).setAttribute('aria-selected', String(selected));
  }
  if (isJobs) refreshJobs(); else setTimeout(() => map.invalidateSize(), 20);
}

function offsetOptions(which) {
  const input = $(which + '-time'), select = $(which + '-offset');
  const previous = select.value;
  const possible = input.value ? choices(input.value) : [];
  select.replaceChildren(); select.hidden = possible.length < 2;
  if (possible.length > 1) {
    select.add(new Option('Repeated hour — choose CDT or CST', ''));
    possible.forEach((dt, i) => select.add(new Option(`${dt.offsetNameShort} (UTC${dt.toFormat('ZZ')}) · ${i ? 'second' : 'first'} occurrence`, String(dt.offset))));
    if (possible.some(dt => String(dt.offset) === previous)) select.value = previous;
  }
}
function readPeriod() {
  if (!$('start-time').value || !$('end-time').value) throw new Error('Choose both a start and end time.');
  if (![$('start-time').value,$('end-time').value].every(value=>/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value))) throw new Error('Choose whole hours for the simulation period, such as 10:00 AM or 2:00 PM.');
  const start = resolveLocal($('start-time').value, $('start-offset').hidden ? '' : $('start-offset').value);
  const end = resolveLocal($('end-time').value, $('end-offset').hidden ? '' : $('end-offset').value);
  return validatePeriod(start, end);
}
function refreshLimits() {
  const now = centralNow(), { min, max } = limits(now);
  ['start-time', 'end-time'].forEach(id => { $(id).min = min.toFormat(localFormat); $(id).max = max.toFormat(localFormat); });
  ['start','end'].forEach(which=>{ $(which+'-date').min=min.toISODate();$(which+'-date').max=max.toISODate(); });
  $('range-label').textContent = `Available planning window: ${min.toFormat('MMM d, h:mm a ZZZZ')} – ${max.toFormat('MMM d, h:mm a ZZZZ')}.`;
  $('central-clock').textContent = `${now.toFormat('ccc, MMM d · h:mm a ZZZZ')} · Central Time`;
}
function updatePeriod() {
  refreshLimits(); offsetOptions('start'); offsetOptions('end');
  try {
    const period = readPeriod(); errorAt('time-error');
    $('period-kind').textContent = period.kind;
    $('period-duration').textContent = `${Number(period.hours.toFixed(2))} hours`;
  } catch (error) {
    errorAt('time-error', error.message); $('period-duration').textContent = 'Check period'; $('period-kind').textContent = 'Check times';
  }
  updateReview();
}
function preset(which) {
  const today = centralNow().startOf('day');
  const base = which === 'yesterday' ? today.minus({ days: 1 }) : which === 'tomorrow' ? today.plus({ days: 1 }) : today;
  $('start-time').value = base.set({ hour: 10 }).toFormat(localFormat);
  $('end-time').value = base.set({ hour: 14 }).toFormat(localFormat);
  ['start','end'].forEach(which=>{const value=$(which+'-time').value;$(which+'-date').value=value.slice(0,10);$(which+'-hour').value=value.slice(11,13);});
  ['start-offset','end-offset'].forEach(id => { $(id).value = ''; });
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('selected', b.dataset.preset === which));
  updatePeriod();
}
function updateReview() {
  $('submit-button').replaceChildren(document.createTextNode(state.submitting ? 'Saving request…' : state.user ? 'Submit simulation' : 'Sign in to submit'));
  const arrow = document.createElement('span'); arrow.textContent = '→'; $('submit-button').append(arrow);
  $('submit-button').disabled = state.submitting;
  if (!state.domain) { $('review-summary').textContent = 'Draw a domain and choose a period to review your request.'; return; }
  const acres = turf.area(state.domain) / 4046.8564224;
  if (!Number.isFinite(acres) || acres >= 1000) {
    $('submit-button').disabled = true;
    $('review-summary').textContent = `Domain exceeds the size limit (${acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres). Reduce the domain to less than 1,000 acres before submitting.`;
    return;
  }
  try {
    const p = readPeriod();
    $('review-summary').textContent = `${(turf.area(state.domain) / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })} hectares · ${state.countyNames.join(', ')}\nIgnition: ${ignitionDescription(state.ignition,turf)}\n${formatTime(p.start)}\n→ ${formatTime(p.end)}`;
  } catch { $('review-summary').textContent = 'Your domain is ready. Check the simulation period above.'; }
}

function setDomain(feature) {
  state.domain = feature;
  state.countyNames = state.counties.features.filter(county => turf.booleanIntersects(feature, county)).map(c => c.properties.name).sort();
  drawn.clearLayers();
  const layer = L.geoJSON(feature, { style: domainStyle }); layer.eachLayer(item => drawn.addLayer(item));
  const area = turf.area(feature);
  const strong = document.createElement('strong'); strong.textContent = `${(area / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })} ha · ${(area / 4046.8564224).toLocaleString(undefined, { maximumFractionDigits: 1 })} acres`;
  const small = document.createElement('small'); small.textContent = state.countyNames.length ? state.countyNames.map(name => `${name} County`).join(' · ') : 'Oklahoma';
  const detail = document.createElement('div'); detail.append(strong, small);
  const icon = document.createElement('span'); icon.className = 'outline-icon'; icon.textContent = '⬡';
  $('domain-summary').replaceChildren(icon, detail);
  $('domain-tag').textContent = 'Ready'; $('domain-tag').classList.add('ready');
  $('edit-button').disabled = false; $('clear-button').disabled = false; $('edit-button').textContent = 'Edit';
  errorAt('domain-error');
  if (state.ignition) {
    try { validateIgnition(state.ignition, feature, turf); }
    catch { resetIgnition(); notice('Domain updated. The previous ignition was outside it and has been cleared.'); }
  }
  updateIgnitionControls(); ignitionLayers.bringToFront(); updateReview();
}
function updateIgnitionControls() {
  ['ignition-point','ignition-line','ignition-polygon'].forEach(id => { $(id).disabled = !state.domain; });
  $('edit-ignition').disabled = !state.ignition; $('clear-ignition').disabled = !state.ignition;
  $('ignition-tag').textContent = state.ignition ? 'Ready' : 'Required';
  $('ignition-tag').classList.toggle('ready', !!state.ignition);
  if (!state.ignition) {
    $('ignition-summary').replaceChildren(textElement('div', state.domain ? 'Choose Point, Line, or Polygon above.' : 'Draw the simulation domain first.'));
  }
}
function resetIgnition() {
  state.ignition = null; ignitionLayers.clearLayers(); errorAt('ignition-error'); updateIgnitionControls(); updateReview();
}
function setIgnition(feature) {
  validateIgnition(feature, state.domain, turf);
  state.ignition = structuredClone(feature); ignitionLayers.clearLayers();
  L.geoJSON(feature, { style: ignitionStyle, pointToLayer: (_f, latlng) => L.marker(latlng, { icon: ignitionIcon }) })
    .eachLayer(layer => ignitionLayers.addLayer(layer));
  ignitionLayers.bringToFront();
  $('ignition-summary').replaceChildren(textElement('div', ignitionDescription(feature,turf)));
  errorAt('ignition-error'); updateIgnitionControls(); updateReview();
}
function validateDomain(feature) {
  if (!state.outline) throw new Error('Wait for the Oklahoma boundaries to load.');
  if (!feature?.geometry || feature.geometry.type !== 'Polygon') throw new Error('Draw one polygon for your simulation domain.');
  const ring = feature.geometry.coordinates[0];
  if (ring.length < 4 || !ring.every(p => p.length >= 2 && p.every(Number.isFinite))) throw new Error('The domain needs at least three distinct corners.');
  if (turf.kinks(feature).features.length) throw new Error('Polygon edges must not cross. Edit the domain and try again.');
  const area = turf.area(feature);
  if (area < 1) throw new Error('Draw a larger polygon with a nonzero area.');
  if (!Number.isFinite(area) || area >= 1000 * 4046.8564224) throw new Error(`Domain not submitted: ${ (area / 4046.8564224).toLocaleString(undefined, { maximumFractionDigits: 2 }) } acres. The simulation domain must be smaller than 1,000 acres. Draw a smaller polygon or reduce its size using Edit.`);
  const outside = turf.difference(turf.featureCollection([feature, state.outline]));
  if (outside && turf.area(outside) > 100) throw new Error('Keep the simulation polygon inside Oklahoma. Zoom in near the state boundary and try again.');
}
function stopTools() {
  state.drawing?.disable(); state.drawing = null;
  if (state.editing) { state.editing.revertLayers(); state.editing.disable(); state.editing = null; }
  state.drawTarget = null; state.editTarget = null;
  $('edit-ignition').textContent = 'Edit ignition'; $('cancel-ignition-edit').hidden = true;
  $('draw-banner').hidden = true; $('edit-button').textContent = 'Edit'; $('cancel-edit').hidden = true;
}
function clearDomain() {
  stopTools(); state.domain = null; state.countyNames = []; drawn.clearLayers();
  resetIgnition();
  $('domain-summary').innerHTML = '<span class="outline-icon" aria-hidden="true">⬡</span><div><strong>No domain drawn yet</strong><small>Your area and counties will appear here.</small></div>';
  $('domain-tag').textContent = 'Required'; $('domain-tag').classList.remove('ready');
  $('edit-button').disabled = true; $('clear-button').disabled = true; errorAt('domain-error'); updateReview();
}
function refreshLabels() {
  const show = state.labels && map.getZoom() >= 7;
  countyLayers.forEach(layer => show ? layer.openTooltip() : layer.closeTooltip());
}
async function loadMapData() {
  try {
    const [countiesResponse, outlineResponse] = await Promise.all([fetch('data/oklahoma-counties.geojson'), fetch('data/oklahoma.geojson')]);
    if (!countiesResponse.ok || !outlineResponse.ok) throw new Error('Boundary download failed.');
    [state.counties, state.outline] = await Promise.all([countiesResponse.json(), outlineResponse.json()]);
    L.geoJSON(state.counties, { style: { color: '#829174', weight: 1, fillColor: '#dce3c6', fillOpacity: 0.24 },
      onEachFeature(feature, layer) {
        countyLayers.set(feature.properties.geoid, layer);
        layer.bindTooltip(feature.properties.name, { permanent: true, direction: 'center', className: 'county-label', interactive: false });
        layer.on('mouseover', () => { if (!state.drawing && !state.editing) layer.setStyle({ fillOpacity: 0.48, weight: 2 }); });
        layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.24, weight: 1 }));
      }
    }).addTo(map);
    const outlineLayer = L.geoJSON(state.outline, { style: { color: '#536948', weight: 2, fill: false }, interactive: false }).addTo(map);
    state.bounds = outlineLayer.getBounds(); map.invalidateSize(); map.fitBounds(state.bounds, { padding: [25, 50], animate: false });
    [...state.counties.features].sort((a,b) => a.properties.name.localeCompare(b.properties.name)).forEach(f => $('county-select').add(new Option(f.properties.name + ' County', f.properties.geoid)));
    $('map-status').textContent = tileErrors > 2 ? 'County boundaries loaded. Basemap unavailable.' : '';
    refreshLabels();
  } catch {
    $('map-status').textContent = 'Could not load county boundaries. Start the local server, then reload this page.';
    $('draw-button').disabled = true;
  }
}

function updateAccount() {
  $('account-button').textContent = state.user ? 'My account ↗' : 'Sign in ↗';
  $('account-email').textContent = state.user?.email || '';
  $('password').value = '';
  if (!state.user) { resultsViewer.close(); state.jobs = []; $('job-count').textContent = '0'; renderJobs(); }
  updateReview();
}
async function setupRealtime() {
  if (state.realtime) { await client.removeChannel(state.realtime); state.realtime = null; }
  if (!state.user) return;
  const userId = state.user.id;
  state.realtime = client.channel(`my-jobs-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'simulation_jobs', filter: `user_id=eq.${userId}` }, () => refreshJobs())
    .subscribe(status => {
      if (state.user?.id !== userId) return;
      if (status === 'SUBSCRIBED') $('jobs-status').textContent = 'Live progress updates connected. Completed results appear here when uploads finish.';
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') $('jobs-status').textContent = 'Live updates unavailable. Use Refresh; this list also refreshes every 20 seconds while open.';
    });
}
function textElement(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function emptyJobs(title, message, login = false) {
  const box = document.createElement('div'); box.className = 'empty-state';
  box.append(textElement('div','⬡','big-icon'), textElement('h2', title), textElement('p', message));
  if (login) { const b = textElement('button','Sign in','button primary'); b.onclick = openSignIn; box.append(b); }
  $('jobs-list').replaceChildren(box);
}
const removingJobs = new Set();
async function removeJob(job) {
  if (!state.user || !['completed','failed'].includes(job.status) || removingJobs.has(job.id)) return;
  if (!window.confirm(`Permanently remove "${job.name}" and its results? All saved results and simulation files will be permanently deleted when the simulation service is available. This cannot be undone.`)) return;
  const userId = state.user.id;
  removingJobs.add(job.id); renderJobs();
  try {
    const { data, error } = await client.rpc('remove_my_finished_simulation', { p_job_id: job.id });
    if (error) {
      if (['PGRST202','42883','42501'].includes(error.code)) throw new Error('Removal is not enabled yet. Run Website/app/supabase_remove_simulations.sql in the Supabase SQL Editor once, then try again.');
      throw new Error('Could not remove the simulation. Check your connection and try again.');
    }
    if (!data) throw new Error('The request could not be removed. It may no longer be completed or failed. Refresh the list.');
    if (state.user?.id === userId) {
      resultsViewer.close();
      state.jobs = state.jobs.filter(item => item.id !== job.id);
      $('job-count').textContent = String(state.jobs.length); renderJobs();
      notice('Simulation removed. Results and simulation files are queued for permanent deletion.');
    }
  } catch (error) { if (state.user?.id === userId) notice(error.message); }
  finally { removingJobs.delete(job.id); if (state.user?.id === userId) { renderJobs(); await refreshJobs(); } }
}
const rerunningJobs = new Set();
async function rerunJob(job) {
  if (!state.user || job.status !== 'completed' || rerunningJobs.has(job.id) || removingJobs.has(job.id)) return;
  const userId=state.user.id;
  let period;
  try {
    validateDomain(job.area_geojson);
    validateIgnition(job.area_geojson?.properties?.ignition,job.area_geojson,turf);
    period=validatePeriod(DateTime.fromISO(job.simulation_start,{setZone:true}),DateTime.fromISO(job.simulation_end,{setZone:true}));
  } catch(error){notice(`Cannot rerun this request: ${error.message}`);return;}
  rerunningJobs.add(job.id);renderJobs();
  try {
    const {data,error}=await client.rpc('rerun_my_simulation',{p_job_id:job.id});
    if(error){
      if(['PGRST202','42883','42501'].includes(error.code))throw new Error('Rerun setup is required: run Website/app/supabase_rerun_simulations.sql in Supabase SQL Editor once.');
      throw new Error('Could not confirm the rerun. Refresh My simulations before retrying.');
    }
    if(!data)throw new Error('This simulation is no longer completed or is unavailable. Refresh the list.');
    if(state.user?.id===userId){notice('Rerun queued. Existing results will be replaced using the same request and folder.');await refreshJobs();}
  } catch(error) {if(state.user?.id===userId)notice(error.message);}
  finally {rerunningJobs.delete(job.id);if(state.user?.id===userId)renderJobs();}
}
function renderJobs() {
  if (!state.user) { emptyJobs('Your plans, in one place.', 'Sign in to see simulation requests saved to your account.', true); return; }
  if (!state.jobs.length) { emptyJobs('A fresh start.', 'Draw your first domain and submit a simulation request.'); return; }
  $('jobs-list').replaceChildren();
  for (const job of state.jobs) {
    const card = document.createElement('article'); card.className = 'job-card';
    const main = document.createElement('div'); main.append(textElement('h2', job.name));
    main.append(textElement('p', `${formatTime(job.simulation_start)} → ${formatTime(job.simulation_end)}`));
    main.append(textElement('p', 'Ignition: ' + ignitionDescription(job.area_geojson?.properties?.ignition, turf)));
    main.append(textElement('p', `Submitted ${formatTime(job.created_at)} · ID ${job.id.slice(0,8)}`, 'job-meta'));
    if (job.status === 'queued') main.append(textElement('p','Queued — waiting to start.'));
    if(job.status==='running'){
      const percent=Math.max(0,Math.min(99,Number(job.progress_percent)||0));
      main.append(textElement('p',`${job.stage||'Running simulation'} · ${percent}%`,'job-progress-label'));
      const progress=document.createElement('progress');progress.max=100;progress.value=percent;progress.setAttribute('aria-label','Simulation progress');main.append(progress);
      if(job.updated_at&&Date.now()-Date.parse(job.updated_at)>180000)main.append(textElement('p','Waiting for a progress update.','field-help'));
    }
    if (job.error_message) main.append(textElement('p', job.error_message, 'inline-error'));
    const actions = document.createElement('div'); actions.className = 'job-card-actions';
    const manage = document.createElement('div'); manage.className = 'job-manage-actions';
    if (job.status === 'completed') {
      main.append(textElement('p',job.result_path?'Simulation complete — results are ready.':'Completed locally; results have not been uploaded.'));
      if(job.result_path){const results=textElement('button','View results ↗','button primary');results.onclick=()=>resultsViewer.open(job,state.user.id);actions.append(results);}
      const rerun=textElement('button',rerunningJobs.has(job.id)?'Submitting rerun…':'Rerun simulation','button secondary');
      rerun.type='button';rerun.disabled=rerunningJobs.has(job.id)||removingJobs.has(job.id);
      rerun.setAttribute('aria-label',`Rerun simulation ${job.name}`);rerun.onclick=()=>rerunJob(job);manage.append(rerun);
    }
    if (['completed','failed'].includes(job.status)) {
      const remove = textElement('button', removingJobs.has(job.id) ? 'Removing…' : 'Remove simulation', 'button secondary');
      remove.type = 'button'; remove.disabled = removingJobs.has(job.id)||rerunningJobs.has(job.id);
      remove.setAttribute('aria-label', `Remove simulation ${job.name}`);
      remove.onclick = () => removeJob(job); manage.append(remove);
    }
    const status = textElement('span', job.status, 'status ' + (['queued','running','completed','failed'].includes(job.status) ? job.status : ''));
    card.append(main, status);
    if(manage.childElementCount) actions.append(manage);
    if(actions.childElementCount) card.append(actions);
    $('jobs-list').append(card);
  }
}
async function refreshJobs() {
  if (!state.user) { renderJobs(); return; }
  if (state.loadingJobs) return;
  state.loadingJobs = true; const userId = state.user.id;
  try {
    const columns='id,name,created_at,simulation_start,simulation_end,status,area_geojson,error_message,result_path';
    let { data, error } = await client.from('simulation_jobs').select(columns+',progress_percent,stage,updated_at,result_manifest')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if(error&&['42703','PGRST204'].includes(error.code))({data,error}=await client.from('simulation_jobs').select(columns).eq('user_id',userId).order('created_at',{ascending:false}).limit(100));
    if (error) throw error;
    if (state.user?.id !== userId) return;
    state.jobs = data; $('job-count').textContent = String(data.length); renderJobs();
    if (data.length === 100) $('jobs-status').textContent = 'Showing your 100 most recent simulation requests.';
  } catch { $('jobs-status').textContent = 'Could not load simulation requests. Check your connection and Supabase access rules, then Refresh.'; }
  finally { state.loadingJobs = false; }
}

$('auth-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-button').disabled = true; $('login-button').textContent = 'Signing in…'; errorAt('auth-error');
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    if (error) throw error;
    state.user = data.user; updateAccount(); $('auth-dialog').close(); notice('Signed in. Your current domain and period are ready to submit.');
    refreshJobs();
  } catch { errorAt('auth-error','Sign-in failed. Check your test-account email, password, and email-confirmation status.'); }
  finally { $('password').value = ''; $('login-button').disabled = false; $('login-button').textContent = 'Sign in →'; }
});
$('simulation-form').addEventListener('submit', async event => {
  event.preventDefault(); errorAt('submit-error');
  if (!state.user) { openSignIn(); return; }
  if (state.submitting) return;
  let period;
  try {
    if (state.drawing || state.editing) throw new Error('Finish drawing or save your polygon edits first.');
    if (!state.domain) throw new Error('Draw a simulation domain on the map first.');
    validateDomain(state.domain);
    if (!state.ignition) throw new Error('Add an ignition point, line, or polygon before submitting.');
    validateIgnition(state.ignition, state.domain, turf); period = readPeriod();
    if (!$('simulation-name').value.trim()) { $('simulation-name').focus(); throw new Error('Give your simulation a name.'); }
  } catch (error) { errorAt('submit-error', error.message); return; }
  state.submitting = true; updateReview();
  const requestId = crypto.randomUUID();
  const feature = structuredClone(state.domain);
  feature.properties = { ...(feature.properties || {}), timezone: ZONE,
    start_local: period.start.toISO(), end_local: period.end.toISO(),
    weather_source: 'HRRR', weather_availability: 'pending_worker_check',
    period_type: period.kind, area_hectares: turf.area(feature) / 10000,
    counties: state.countyNames, app: 'OKBurnPlan', request_version: 2,
    ignition: structuredClone(state.ignition) };
  try {
    const { error } = await client.from('simulation_jobs').insert({ id: requestId, user_id: state.user.id,
      name: $('simulation-name').value.trim(), area_geojson: feature,
      simulation_start: period.start.toUTC().toISO(), simulation_end: period.end.toUTC().toISO(), status: 'queued' });
    if (error) throw error;
    clearDomain();
    $('simulation-name').value = '';
    notice('Simulation request saved and queued.'); await refreshJobs(); setView('jobs');
  } catch {
    errorAt('submit-error', `Could not confirm submission. Check My simulations before retrying to avoid duplicates. Request ID: ${requestId}`);
  } finally { state.submitting = false; updateReview(); }
});
$('draw-button').onclick = () => {
  if (!state.outline) { notice('Wait for the county map to finish loading.'); return; }
  stopTools(); state.drawTarget = 'domain'; state.drawing = new L.Draw.Polygon(map, { allowIntersection: false, showArea: true,
    shapeOptions: domainStyle, drawError: { color: '#c44528', message: 'Polygon edges cannot cross.' } });
  state.drawing.enable(); $('draw-banner').hidden = false;
  $('draw-banner').textContent = 'Drawing mode · Click to place corners. Click the first point to finish.';
  if (window.matchMedia('(max-width:720px)').matches) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
map.on(L.Draw.Event.CREATED, event => {
  const feature = event.layer.toGeoJSON(), target = state.drawTarget; stopTools();
  try {
    if (target === 'ignition') { setIgnition(feature); notice('Ignition saved inside your simulation domain.'); }
    else { validateDomain(feature); setDomain(feature); notice('Domain saved. Add your ignition next.'); }
  } catch (error) { errorAt(target === 'ignition' ? 'ignition-error' : 'domain-error', error.message); }
});
map.on('draw:drawstop', () => { state.drawing = null; $('draw-banner').hidden = true; });
$('edit-button').onclick = () => {
  if (state.editing && state.editTarget === 'domain') {
    const feature = drawn.getLayers()[0].toGeoJSON();
    try { validateDomain(feature); stopTools(); setDomain(feature); notice('Domain edits saved.'); }
    catch (error) { errorAt('domain-error', error.message); }
  } else {
    stopTools(); state.editTarget = 'domain';
    state.editing = new L.EditToolbar.Edit(map, { featureGroup: drawn }); state.editing.enable();
    $('edit-button').textContent = 'Save edits'; $('cancel-edit').hidden = false; notice('Drag polygon corners, then select Save edits.');
  }
};
$('clear-button').onclick = clearDomain;
for (const [id, type] of [['ignition-point','Point'],['ignition-line','LineString'],['ignition-polygon','Polygon']]) {
  $(id).onclick = () => {
    if (!state.domain) { errorAt('ignition-error','Draw the simulation domain first.'); return; }
    stopTools(); state.drawTarget = 'ignition';
    if (type === 'Point') state.drawing = new L.Draw.Marker(map, { icon: ignitionIcon });
    else if (type === 'LineString') state.drawing = new L.Draw.Polyline(map, { shapeOptions: ignitionStyle, allowIntersection: false });
    else state.drawing = new L.Draw.Polygon(map, { shapeOptions: ignitionStyle, allowIntersection: false, showArea: true });
    state.drawing.enable();
    $('draw-banner').textContent = type === 'Point' ? 'Ignition point · Click inside your domain to place it.' : type === 'LineString' ? 'Ignition line · Click to add points. Click the last point again to finish.' : 'Ignition polygon · Click corners, then click the first point to finish.';
    $('draw-banner').hidden = false;
    if (window.matchMedia('(max-width:720px)').matches) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}
$('edit-ignition').onclick = () => {
  if (state.editing && state.editTarget === 'ignition') {
    const feature = ignitionLayers.getLayers()[0].toGeoJSON();
    try { validateIgnition(feature,state.domain,turf); stopTools(); setIgnition(feature); notice('Ignition edits saved.'); }
    catch (error) { errorAt('ignition-error',error.message); }
  } else {
    stopTools(); state.editTarget = 'ignition';
    state.editing = new L.EditToolbar.Edit(map, { featureGroup: ignitionLayers }); state.editing.enable();
    $('edit-ignition').textContent = 'Save ignition'; $('cancel-ignition-edit').hidden = false;
    notice('Drag the ignition point or vertices, then select Save ignition.');
  }
};
$('clear-ignition').onclick = () => { stopTools(); resetIgnition(); };
$('cancel-ignition-edit').onclick = () => { stopTools(); errorAt('ignition-error'); notice('Ignition edits canceled.'); };
$('cancel-edit').onclick = () => { stopTools(); errorAt('domain-error'); notice('Edits canceled.'); };
$('fit-state').onclick = () => { if (state.bounds) map.fitBounds(state.bounds, { padding: [25, 50] }); $('county-select').value = ''; };
$('county-select').onchange = event => {
  const layer = countyLayers.get(event.target.value);
  if (layer) map.fitBounds(layer.getBounds(), { padding: [40, 40] });
  else if (state.bounds) map.fitBounds(state.bounds, { padding: [25, 50] });
};
$('county-labels').onchange = event => { state.labels = event.target.checked; refreshLabels(); };
map.on('zoomend', () => { clearTimeout(labelTimer); labelTimer = setTimeout(refreshLabels, 50); });
map.on('mousemove', event => { $('map-coordinates').textContent = `${Math.abs(event.latlng.lat).toFixed(4)}° ${event.latlng.lat < 0 ? 'S' : 'N'}, ${Math.abs(event.latlng.lng).toFixed(4)}° ${event.latlng.lng < 0 ? 'W' : 'E'}`; });
document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => preset(button.dataset.preset));
['start-time','end-time','start-offset','end-offset'].forEach(id => $(id).addEventListener('change', () => {
  document.querySelectorAll('[data-preset]').forEach(button => button.classList.remove('selected')); updatePeriod();
}));
for(const which of ['start','end']){
  for(let hour=0;hour<24;hour++)$(which+'-hour').add(new Option(`${hour%12||12} ${hour<12?'AM':'PM'}`,String(hour).padStart(2,'0')));
  for(const part of ['date','hour'])$(which+'-'+part).addEventListener('change',()=>{
    $(which+'-time').value=$(which+'-date').value?`${$(which+'-date').value}T${$(which+'-hour').value}:00`:'';
    $(which+'-offset').value='';
    document.querySelectorAll('[data-preset]').forEach(button=>button.classList.remove('selected'));updatePeriod();
  });
}
$('planner-tab').onclick = () => setView('planner'); $('jobs-tab').onclick = () => setView('jobs');
$('new-plan').onclick = () => setView('planner'); $('refresh-jobs').onclick = refreshJobs;
$('account-button').onclick = () => state.user ? $('account-dialog').showModal() : openSignIn();
$('close-auth').onclick = () => $('auth-dialog').close(); $('auth-dialog').addEventListener('close', () => { $('password').value = ''; });
$('close-account').onclick = () => $('account-dialog').close();
$('signout-button').onclick = async () => {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) { notice('Sign-out failed. Check your connection and try again.'); return; }
  state.user = null; $('account-dialog').close(); updateAccount(); notice('Signed out.');
};
client.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user || null; updateAccount();
  setTimeout(() => { setupRealtime(); if (state.user) refreshJobs(); }, 0);
});
setInterval(() => { updatePeriod(); if (!$('jobs-view').hidden && state.user) refreshJobs(); }, 20000);
window.addEventListener('online', () => { notice('Connection restored.'); refreshJobs(); });
window.addEventListener('offline', () => notice('You are offline. Your current domain stays on screen; reconnect before submitting.'));
new ResizeObserver(() => {
  map.invalidateSize({ pan: false });
  if (state.bounds && !state.domain && !$('county-select').value && !state.drawing) {
    map.fitBounds(state.bounds, { padding: [25, 50], animate: false });
  }
}).observe($('map'));
preset('today'); loadMapData();
client.auth.getSession().then(({ data, error }) => {
  if (error) notice('Could not restore your session. Sign in again.');
  state.user = data?.session?.user || null; updateAccount(); if (state.user) refreshJobs();
});
