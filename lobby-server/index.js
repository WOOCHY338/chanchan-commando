const http=require('http'),fs=require('fs'),crypto=require('crypto'),{WebSocketServer}=require('ws');
const rooms=new Map();let seq=0;
const NF='notice.dat';let notice=null;try{notice=JSON.parse(fs.readFileSync(NF,'utf8'))}catch(e){}
const FF='feedback.dat';let fb=[];try{fb=JSON.parse(fs.readFileSync(FF,'utf8'))||[]}catch(e){}
const saveFb=()=>{try{fs.writeFileSync(FF,JSON.stringify(fb))}catch(e){}};const lastFb=new Map();
const body=(req,cb)=>{let b='';req.on('data',c=>{b+=c;if(b.length>8192)req.destroy()});req.on('end',()=>{let m=null;try{m=JSON.parse(b)}catch(e){}cb(m)})};
const json=(res,o,code)=>{res.statusCode=code||200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(o))};
const pub=r=>({id:r.id,name:r.name,peer:r.peer,n:r.n,playing:r.playing});
const send=(ws,o)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
const keyOk=k=>{const a=Buffer.from(String(process.env.ADMIN_KEY||'')),b=Buffer.from(String(k||''));return a.length>0&&a.length===b.length&&crypto.timingSafeEqual(a,b)};
const ADMIN=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>찬찬특공개 공지 관리</title>
<style>:root{--bg:#fbfaf3;--fg:#111;--card:#fff;--acc:#ffe24a;--mut:#777}@media (prefers-color-scheme:dark){:root{--bg:#1c1b17;--fg:#f2f0e6;--card:#2a2924;--mut:#aaa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif;padding:16px;display:flex;justify-content:center}
main{width:100%;max-width:520px;display:flex;flex-direction:column;gap:12px}h1{font-size:24px;margin:8px 0}
.box{background:var(--card);border:3px solid var(--fg);border-radius:14px;padding:14px}
input,textarea{width:100%;font:inherit;font-size:17px;padding:10px;border:2px solid var(--fg);border-radius:10px;background:var(--card);color:var(--fg)}textarea{min-height:140px;resize:vertical}
.row{display:flex;gap:8px}button{flex:1;font:inherit;font-size:17px;font-weight:700;padding:12px;border:3px solid var(--fg);border-radius:12px;background:var(--acc);color:#111;cursor:pointer}button.gray{background:#ddd}
#cur{white-space:pre-wrap;line-height:1.4}h2{font-size:20px;margin:18px 0 0}.fb{background:var(--card);border:2px solid var(--fg);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}.fb b{font-size:17px}.fb p{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.4}.fb .meta{display:flex;justify-content:space-between;align-items:center}.fb .meta button{flex:0;padding:4px 10px;font-size:14px;border-width:2px;background:#ddd}#msg{min-height:1.2em;color:var(--mut)}small{color:var(--mut)}</style></head>
<body><main><h1>📢 찬찬특공개 공지 관리</h1>
<div class="box"><small>현재 공지</small><div id="cur">불러오는 중...</div></div>
<input id="key" type="password" placeholder="관리자 비밀번호" autocomplete="current-password">
<textarea id="text" maxlength="500" placeholder="공지 내용 (최대 500자)"></textarea>
<div class="row"><button onclick="post(false)">공지 올리기</button><button class="gray" onclick="post(true)">공지 내리기</button></div>
<div id="msg"></div>
<h2>💌 의견함 <small id="fbn"></small></h2><button class="gray" onclick="loadFb()">의견 불러오기</button><div id="fbl" style="display:flex;flex-direction:column;gap:8px"></div></main>
<script>
const $=s=>document.querySelector(s);
try{$('#key').value=sessionStorage.getItem('k')||''}catch(e){}
function load(){fetch('/notice').then(r=>r.json()).then(n=>{$('#cur').textContent=n&&n.text?n.text+'\\n\\n('+new Date(n.at).toLocaleString('ko-KR')+')':'(없음)'})}
function post(clear){const key=$('#key').value,text=clear?'':$('#text').value.trim();if(!clear&&!text){$('#msg').textContent='내용을 입력하세요';return}
  fetch('/notice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,text})}).then(r=>{
    if(r.status===403){$('#msg').textContent='비밀번호가 틀렸어요';return}
    if(!r.ok){$('#msg').textContent='실패했어요 ('+r.status+')';return}
    try{sessionStorage.setItem('k',key)}catch(e){}$('#msg').textContent=clear?'공지를 내렸어요':'공지를 올렸어요! 접속 중인 사람은 1분 안에 보여요';if(!clear)$('#text').value='';load()})
  .catch(()=>{$('#msg').textContent='서버 연결 실패'})}
function esc(s){return String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';')}
function fbReq(o){return fetch('/feedback/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:$('#key').value,...o})})}
function loadFb(){fbReq({}).then(r=>{if(r.status===403){$('#fbl').textContent='비밀번호를 먼저 입력하세요';return null}return r.json()}).then(l=>{if(!l)return;try{sessionStorage.setItem('k',$('#key').value)}catch(e){}$('#fbn').textContent='('+l.length+'개)';
  $('#fbl').innerHTML=l.length?l.slice().reverse().map(f=>'<div class="fb"><div class="meta"><b>'+esc(f.name)+'</b><button onclick="delFb('+f.id+')">삭제</button></div><p>'+esc(f.text)+'</p><small>'+new Date(f.at).toLocaleString('ko-KR')+'</small></div>').join(''):'<small>아직 의견이 없어요</small>'}).catch(()=>{$('#fbl').textContent='서버 연결 실패'})}
function delFb(id){if(!confirm('이 의견을 삭제할까요?'))return;fbReq({del:id}).then(()=>loadFb())}
load();if($('#key').value)loadFb();
</script></body></html>`;
const srv=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  const u=req.url.split('?')[0];
  if(u==='/rooms'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify([...rooms.values()].map(pub)));return}
  if(u==='/notice'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(notice||{}));return}
  if(u==='/notice'&&req.method==='POST'){let b='';req.on('data',c=>{b+=c;if(b.length>8192)req.destroy()});
    req.on('end',()=>{let m;try{m=JSON.parse(b)}catch(e){res.statusCode=400;res.end();return}
      if(!keyOk(m.key)){res.statusCode=403;res.end();return}
      const t=String(m.text||'').trim().slice(0,500);notice=t?{id:Date.now(),text:t,at:new Date().toISOString()}:null;
      try{fs.writeFileSync(NF,JSON.stringify(notice))}catch(e){}
      for(const ws of wss.clients)send(ws,{t:'notice',n:notice||{}});
      res.setHeader('Content-Type','application/json');res.end('{"ok":true}')});return}
  if(u==='/feedback'&&req.method==='POST'){const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),now=Date.now();
    if(now-(lastFb.get(ip)||0)<10000){json(res,{err:'wait'},429);return}
    body(req,m=>{const t=m&&String(m.text||'').trim().slice(0,500),n=m&&String(m.name||'').trim().slice(0,12);if(!t){json(res,{err:'empty'},400);return}
      lastFb.set(ip,now);fb.push({id:now,name:n||'익명',text:t,at:new Date(now).toISOString()});if(fb.length>500)fb=fb.slice(-500);saveFb();json(res,{ok:true})});return}
  if(u==='/feedback/admin'&&req.method==='POST'){body(req,m=>{if(!m||!keyOk(m.key)){json(res,{},403);return}
      if(m.del){fb=fb.filter(f=>f.id!==m.del);saveFb()}json(res,fb)});return}
  if(u==='/admin'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(ADMIN);return}
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
