# Prairie Fire demo

A local, dependency-free website prototype for a prescribed fire decision support proposal for the state of Oklahoma.

## Run

From this folder, run `node server.js`, then visit http://127.0.0.1:4173. You can also open `index.html` directly. An optional Google Fonts stylesheet improves typography; system fonts work offline.

## Explore

- Move the hourly timeline across the past 10 days and next seven days. Dates are relative to the browser's current local date. The current day begins the forecast period.
- Switch between six illustrative map layers and inspect synthetic hourly site conditions and a 24-hour wind chart.
- Open Burn planner, drag a rectangle, and click inside it to place ignition. Select a duration and start hour, then run the animation.
- Download the scenario inputs and synthetic conditions as JSON.

## Scope and limitations

All weather, fuel moisture, danger categories, flame lengths, and spread rates are deterministic synthetic data for demonstrating interactions. They are not observations or forecasts. Map layers show qualitative schematic patterns, not gridded model output. The Oklahoma map is generated from `Asset/OK_Counties/OK_counties.shp` (77 counties). It retains the supplied Albers Equal Area projection with uniform scaling and subpixel vertex thinning. Map coordinates exported by the planner remain SVG units; no acreage conversion is provided.

Fire progression consists of wind-oriented animated ellipses clipped to a selected rectangle. It has no physical calibration and is not a validated fire model. Output metrics repeat synthetic site conditions; they are not derived from a fire simulation. No operational burn recommendation is made. No external data APIs or modeling services are connected.

Production development requires geographic mapping and regional boundaries, documented weather and fuel pipelines, historical/forecast timestamps and uncertainty, a validated modeling backend, asynchronous scenario processing, and scientific and practitioner evaluation.

## Files

- `index.html`: application structure
- `style.css`: responsive visual design
- `app.js`: synthetic timeline, layer controls, scenario selection, animation, and export
- `server.js`: localhost-only static preview server

No installation or build step is required. Source is saved locally; no hosted site has been registered or published.

## Rebuild the county map

Run `node build-map.js` after replacing the source shapefile. The script reads the SHP and DBF files and embeds county geometry in `index.html`, so the demo continues to work offline without GIS dependencies. The source PRJ describes WGS 84 Albers Equal Area, central meridian -96, latitude of origin 23, standard parallels 29.5 and 45.5, in meters.
