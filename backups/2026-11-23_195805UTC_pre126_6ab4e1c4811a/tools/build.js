#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const parts=[
  "00a-core-time",
  "00b-core-geo",
  "00c-core-leg-timing",
  "00d-core-format",
  "00e-trip-storage",
  "00f-trip-queries",
  "00g-trip-state-commands",
  "00h-route-geometry",
  "00i-routing-service",
  "00j-route-plan",
  "00-initial-state",
  "05-storage-trips",
  "10-days-groups",
  "20-route-geometry",
  "22-route-editor",
  "24-timeline-scheduling",
  "30-map-tools",
  "40-outline-mode",
  "50-point-editing",
  "52-drawer-navigation",
  "60-version-ui",
  "61-country-boundaries",
  "62-geographic-stats",
  "64-dashboard",
  "66-event-bindings",
  "70-clock-places",
  "80-imported-places",
  "90-geocoding-startup"
];
const prefix="\n(function(){'use strict';\n";
const suffix="\n})();\n";
const content=prefix+parts.map(name=>fs.readFileSync(path.join(root,'scripts','src',name+'.js'),'utf8')).join('')+suffix;
const file=path.join(root,'scripts','app.js');
const existing=fs.readFileSync(file,'utf8');
try { new Function(content); } catch(e){console.error('JavaScript syntax error:',e);process.exit(1);}
if(process.argv.includes('--check')){
 if(content!==existing){console.error('Generated app.js differs from module sources. Run npm run build.');process.exit(1);}
 console.log('PASS: exact app.js match; JS syntax valid; '+parts.length+' source files; sha256 '+crypto.createHash('sha256').update(content).digest('hex'));
}else{
 fs.writeFileSync(file,content,'utf8');
 console.log('Built scripts/app.js from '+parts.length+' source files');
}
