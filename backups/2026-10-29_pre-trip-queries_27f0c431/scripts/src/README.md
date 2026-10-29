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
