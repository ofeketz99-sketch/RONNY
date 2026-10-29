# RONNY JavaScript source organization

The public site still loads `scripts/app.js` as **one classic script**. The ordered files in `scripts/src/` are sequential source partitions, **not ES modules**. They deliberately share the original IIFE and its lexical scope. Changing the execution order or loading these source partitions directly as separate `<script>` tags may break the application.

## Editing

1. Edit the relevant `scripts/src/*.js` partition.
2. Run `npm run build` (Node.js 18+; no dependencies) to regenerate `scripts/app.js`.
3. Run `npm test` to confirm byte-for-byte equivalence with the concatenated sources and JavaScript syntax.
4. Keep the generated `scripts/app.js` committed and deployed alongside `index.html`; Netlify does not need a build step.
5. Apply the mandatory GitHub `dev` backup and patch-note workflow before changing any tracked file.

The partitioning preserves **the exact text** of the pre-split application. It does not solve coupling or prove browser behavior. Further modularization should establish explicit boundaries, followed by browser regression tests for routing, walking loops, schedule, local storage, import/export and release notes.

## Pure foundation APIs (patch 47)
Four generated-source partitions define frozen CoreTime, CoreGeo, CoreLegTiming and CoreFormat APIs at the start of the classic app IIFE. Existing function names remain compatibility wrappers. These APIs do not access the application state or browser. Always run npm run build and npm test after editing source files; the remaining code is still coupled and is not an ES module.

## Browser persistence boundary (patch 48)
The `00e-trip-storage.js` partition defines a frozen `TripStorage` adapter for IndexedDB opening, transactions, fallback JSON reads and writes. All browser capabilities and identifiers are passed explicitly by the thin `05-storage-trips.js` wrappers. The save queue, trip snapshots, in-memory library, active-trip selection, syncing of walking/loop endpoints, Undo and user error notifications remain in the library controller. Do **not** move those operations into a generic IO transaction without preserving their order. The adapter can be tested using mock IndexedDB events without changing saved-trip schema or storage keys. Run `npm test` for core and persistence boundary tests before committing.

## Trip state → map read boundary (patch 49)
`00f-trip-queries.js` defines a frozen `TripQueries` API. Its methods take a trip snapshot and explicit selection/type/distance dependencies, and NEVER read application-global `state`, `selectedDay`, Leaflet, DOM or local storage. The original function names remain thin adapters in their existing source partitions, including `currentStopsForMap`, `routeStopsForDay`, `poiLinksForDay`, `getStop`, `tripMapPositions` and endpoint status checks. Read queries preserve original stop-object references (not copies), the map's off-day idea markers, map-only-point filtering, and original nearest-POI linkage. The map drawing/orchestration and all mutating commands remain separate and unchanged. Test with `npm test` before moving further stateful behavior.

## Model mutation boundary (patch 50)
`00g-trip-state-commands.js` exposes `TripStateCommands`, responsible for **in-place model mutations**: route stop ordering, numbered day labels, named/unique endpoints, chronological endpoint naming and the pre-render model synchronization sequence. It receives the trip, day, point, and dependencies explicitly. Thin compatibility adapters remain in the former files; therefore existing consumers do not need rewiring and the identity of route stop objects is preserved. `renderAll` delegates its model synchronization phase to `synchronizeForRender` **before** rendering, while keeping its original UI-call order and conditional `save()` at the end. This does NOT decouple walking-loop, trip-loop or day-start synchronization implementations; they are injected callbacks and remain distinct stateful work for later. Do not turn normalization into a render-only operation without ensuring saved changes and Undo behavior remain intact. Run `npm test`, then browser regressions for day starts/ends, walking loops, route reordering, save and reloading.

## Routing and map geometry boundaries (patch 52)
Two new source partitions are loaded inside the existing classic IIFE: `00h-route-geometry.js` (frozen `RouteGeometry`) and `00i-routing-service.js` (frozen `RoutingService`). The former owns manual/pencil leg coordinates, visual route segmentation, nearest segment selection, manual duration/distance objects, and ruler distances. Dependencies (e.g. `legAt`, `kmBetween`, `routeLegMinutes`) are passed explicitly. The latter owns the OSRM / OSM network request, including walking/hiking cycling endpoint selection, geocoordinate formatting, response validation and AbortSignal forwarding; the global `fetch` is passed by its compatibility adapter in `30-map-tools.js`. Public wrapper functions keep their original names and default arguments. Leaflet drawing, route caching, walking-loop retracing, route cancellation token, start/end semantics, schedule updates and error fallbacks remain unchanged in the map/controller layer. This is an incremental separation, NOT an independent full routing engine nor a map performance optimization. Use `npm test`, then a real browser for routed vs hand-drawn paths and walking loops.
