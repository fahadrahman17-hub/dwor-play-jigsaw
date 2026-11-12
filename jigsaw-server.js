const {WebSocketServer}=require('ws');
module.exports=function(){
const wss=new WebSocketServer({noServer:true,maxPayload:14*1024*1024});
const games={};
const send=(ws,s)=>{if(ws.readyState===1)ws.send(s)};
const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
function make(d){
 const ts=Array.isArray(d.teams)?d.teams.slice(0,12):[];if(!ts.length)return {err:'No teams.'};
 const N=d.count;if(!int(N,4,150))return {err:'Choose between 4 and 150 pieces.'};
 const teams=[];
 for(const x of ts){
  const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(x&&x.img||''));
  if(!m)return {err:'A team has no valid picture.'};
  const buf=Buffer.from(m[2],'base64');if(buf.length>3*1024*1024)return {err:'A picture is too large.'};
  if(!int(x.rows,1,40)||!int(x.cols,1,40)||x.rows*x.cols!==N)return {err:'The piece grid does not match the piece count.'};
  teams.push({name:String(x.name||'Team').slice(0,24),buf,mime:m[1],rows:x.rows,cols:x.cols,placed:[],last:0,fin:null,played:false})}
 let code;do{code=Math.random().toString(36).slice(2,6).padEnd(4,'x')}while(games[code]);
 const G={code,key:Math.random().toString(36).slice(2),teams,count:N,limit:Math.min(90,Math.max(1,+d.limit||10))*60,ref:!!d.ref,phase:'lobby',cur:0,t0:0,rank:[],tied:[],cl:new Set(),seen:Date.now()};
 G.timer=setInterval(()=>{if(G.phase==='play'&&Date.now()-G.t0>=G.limit*1000)endTurn(G)},1000);
 games[code]=G;return {G}}
function bc(G){G.seen=Date.now();
 const sj=JSON.stringify({p:G.phase,c:G.code,lim:G.limit,ref:G.ref,n:G.count,cur:G.cur,t0:G.t0,now:Date.now(),tn:G.teams.map(t=>t.name),
  rows:G.teams.map(t=>t.rows),cols:G.teams.map(t=>t.cols),
  sum:G.teams.map((t,i)=>({s:t.placed.length,t:G.count,f:t.fin,pd:t.played?1:0,m:[...G.cl].filter(c=>c.team===i).map(c=>c.nick)})),
  pl:G.teams.map((t,i)=>(i===G.cur&&G.phase==='play')||G.phase==='end'||i<G.cur?t.placed:[]),
  rank:G.rank,tied:G.tied,watch:[...G.cl].filter(c=>c.team<0&&!c.host).length});
 for(const c of G.cl)send(c,'{"t":"state","s":'+sj+',"you":'+JSON.stringify({host:c.host,team:c.team})+'}')}
function endTurn(G){if(G.phase!=='play')return;G.teams[G.cur].played=true;
 if(G.cur+1<G.teams.length){G.cur++;G.phase='ready';G.t0=0;bc(G)}else endGame(G)}
function endGame(G){if(G.phase!=='play'&&G.phase!=='ready')return;if(G.phase==='play')G.teams[G.cur].played=true;G.phase='end';
 const key=t=>[t.fin===null?1:0,t.fin||0,-t.placed.length,t.last];
 const cmp=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0};
 const ord=G.teams.map((t,i)=>i).sort((a,b)=>cmp(key(G.teams[a]),key(G.teams[b])));
 G.rank=ord;G.tied=ord.filter(i=>cmp(key(G.teams[i]),key(G.teams[ord[0]]))===0);bc(G)}
const err=(ws,msg,gone)=>send(ws,JSON.stringify({t:'err',msg,gone}));
wss.on('connection',ws=>{
 ws.team=-1;ws.host=false;ws.nick='Player';ws.G=null;
 ws.on('message',raw=>{let d;try{d=JSON.parse(raw)}catch(e){return}
  const G=ws.G;
  if(d.t==='create'){const r=make(d);if(r.err)return err(ws,r.err);
   ws.G=r.G;ws.host=true;r.G.cl.add(ws);send(ws,JSON.stringify({t:'created',code:r.G.code,key:r.G.key}));bc(r.G);return}
  if(d.t==='join'){const g=games[String(d.code||'').toLowerCase()];if(!g)return err(ws,'Game not found. Check the code.',true);
   ws.G=g;ws.nick=String(d.nick||'Player').slice(0,16);ws.host=d.key===g.key;ws.team=Number.isInteger(d.team)&&d.team>=0&&d.team<g.teams.length?d.team:-1;
   g.cl.add(ws);bc(g);return}
  if(!G)return;
  if(d.t==='team'&&Number.isInteger(d.i)&&d.i>=-1&&d.i<G.teams.length&&(G.phase==='lobby'||ws.team<0)){ws.team=d.i;bc(G)}
  else if(d.t==='start'&&ws.host&&G.phase==='lobby'){G.phase='ready';G.cur=0;bc(G)}
  else if(d.t==='begin'&&ws.host&&G.phase==='ready'){G.phase='play';G.t0=Date.now();bc(G)}
  else if(d.t==='endturn'&&ws.host)endTurn(G);
  else if(d.t==='end'&&ws.host)endGame(G);
  else if(d.t==='again'&&ws.host&&G.phase==='end'){G.teams.forEach(t=>{t.placed=[];t.last=0;t.fin=null;t.played=false});G.cur=0;G.phase='lobby';G.rank=[];G.tied=[];bc(G)}
  else if(d.t==='place'&&G.phase==='play'&&ws.team===G.cur&&int(d.p,0,G.count-1)){
   const t=G.teams[G.cur];if(t.placed.includes(d.p))return;
   t.placed.push(d.p);const el=Date.now()-G.t0;t.last=el;
   if(t.placed.length===G.count){t.fin=el;return endTurn(G)}
   bc(G)}
 });
 ws.on('close',()=>{if(ws.G){ws.G.cl.delete(ws);bc(ws.G)}});
});
setInterval(()=>{for(const c in games){const G=games[c];if(!G.cl.size&&Date.now()-G.seen>30*60e3){clearInterval(G.timer);delete games[c]}}},10*60e3);
const image=(code,i)=>{const G=games[code];if(!G||!(i>=0&&i<G.teams.length))return null;
 const ok=G.phase==='end'||(G.phase!=='lobby'&&(i<G.cur||(i===G.cur&&G.phase==='play')));
 return ok?{buf:G.teams[i].buf,mime:G.teams[i].mime}:null};
return {wss,image}};
