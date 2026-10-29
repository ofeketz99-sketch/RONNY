#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const folder=path.resolve(__dirname,'../tests');
const files=fs.readdirSync(folder).filter(name=>/\.test\.cjs$/.test(name)).sort().map(name=>path.join(folder,name));
if(!files.length){console.error('No test files in tests/');process.exit(1)}
const run=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(run.error)throw run.error;
process.exit(typeof run.status==='number'?run.status:1);
