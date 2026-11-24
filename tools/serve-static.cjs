#!/usr/bin/env node
'use strict';
// Dependency-free static server for browser tests. Binds to loopback only.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.argv[2])||4173;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((request,response)=>{
 let relative;
 try{relative=decodeURIComponent(new URL(request.url,'http://localhost').pathname)}catch{response.writeHead(400).end();return}
 if(relative.endsWith('/'))relative+='index.html';
 const file=path.resolve(root,'.'+relative);
 if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return}
 fs.readFile(file,(error,data)=>{
  if(error){response.writeHead(404).end('not found');return}
  response.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  response.end(data);
 });
}).listen(port,'127.0.0.1',()=>console.log('Serving '+root+' on http://127.0.0.1:'+port));
