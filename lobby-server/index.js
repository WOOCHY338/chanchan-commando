const http=require('http'),{WebSocketServer}=require('ws');
const rooms=new Map();let seq=0;
const pub=r=>({id:r.id,name:r.name,peer:r.peer,n:r.n,playing:r.playing});
const send=(ws,o)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
const srv=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url.startsWith('/rooms')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify([...rooms.values()].map(pub)));return}
  res.end('ccsg lobby ok')});
const wss=new WebSocketServer({server:srv,maxPayload:256*1024});
wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>{ws.alive=true});
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}
    if(m.t==='host'&&!ws.room&&!ws.relay){const id=String(++seq);ws.room={id,name:String(m.name||'방').slice(0,24),peer:String(m.peer||'').slice(0,64),n:1,playing:false,ws,cl:new Map(),cid:0};rooms.set(id,ws.room);send(ws,{t:'hosted',id})}
    else if(m.t==='upd'&&ws.room){ws.room.n=Math.max(1,Math.min(4,m.n|0));ws.room.playing=!!m.playing}
    else if(m.t==='join'&&!ws.room&&!ws.relay){const r=rooms.get(String(m.room));if(!r){send(ws,{t:'nojoin'});return}
      const cid='r'+(++r.cid);r.cl.set(cid,ws);ws.relay={r,cid};send(ws,{t:'joined',cid});send(r.ws,{t:'rjoin',cid})}
    else if(m.t==='r'){if(ws.room){const c=ws.room.cl.get(m.to);send(c,{t:'r',d:m.d})}else if(ws.relay)send(ws.relay.r.ws,{t:'r',from:ws.relay.cid,d:m.d})}
    else if(m.t==='kick'&&ws.room){const c=ws.room.cl.get(m.to);if(c)c.close()}});
  ws.on('close',()=>{
    if(ws.room){rooms.delete(ws.room.id);for(const c of ws.room.cl.values())c.close()}
    if(ws.relay){const r=ws.relay.r;r.cl.delete(ws.relay.cid);send(r.ws,{t:'rleave',cid:ws.relay.cid})}})});
setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},20000);
srv.listen(process.env.PORT||3000,()=>console.log('lobby on',process.env.PORT||3000));
