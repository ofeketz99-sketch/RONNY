// Pure CoreGeo logic: no DOM, network, trip state, or map dependencies.
const CoreGeo=(()=>{
function kmBetween(a,b){const k=Math.PI/180,lat1=a[0]*k,lat2=b[0]*k,dlat=(b[0]-a[0])*k,dlng=(b[1]-a[1])*k;const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))}
function distanceOfCoords(coords){let d=0;for(let i=1;i<coords.length;i++)d+=kmBetween(coords[i-1],coords[i]);return d}
function ronnyPolyContains(lng,lat,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [ax,ay]=polygon[i],[bx,by]=polygon[j];if(((ay>lat)!==(by>lat))&&lng<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside}return inside}
function parseCoordinatePair(raw){
 if(typeof raw!=='string')return null;
 const m=raw.trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?:\s|$)/);
 if(!m)return null;
 const lat=+m[1],lng=+m[2];return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
return Object.freeze({kmBetween, distanceOfCoords, ronnyPolyContains, parseCoordinatePair});
})();
