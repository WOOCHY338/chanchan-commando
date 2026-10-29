const http=require('http'),fs=require('fs'),crypto=require('crypto'),{WebSocketServer}=require('ws');
const rooms=new Map();let seq=0;
const NF='notice.dat';let notice=null;try{notice=JSON.parse(fs.readFileSync(NF,'utf8'))}catch(e){}
const FF='feedback.dat';let fb=[];try{fb=JSON.parse(fs.readFileSync(FF,'utf8'))||[]}catch(e){}
const saveFb=()=>{try{fs.writeFileSync(FF,JSON.stringify(fb))}catch(e){}};const lastFb=new Map();

const AF='accounts.dat';let accounts=new Map();
try{const arr=JSON.parse(fs.readFileSync(AF,'utf8'));for(const a of arr)accounts.set(a.did,a)}catch(e){}
const saveAccounts=()=>{try{fs.writeFileSync(AF,JSON.stringify([...accounts.values()]))}catch(e){}};

const RF='ranking.dat';let rankings={users:[],guilds:[]};
try{rankings=JSON.parse(fs.readFileSync(RF,'utf8'))||{users:[],guilds:[]}}catch(e){}
const saveRankings=()=>{try{fs.writeFileSync(RF,JSON.stringify(rankings))}catch(e){}};
const RWF='ranking_week.dat';let rankWeek='';
try{rankWeek=fs.readFileSync(RWF,'utf8').trim()}catch(e){}
function getWeekId(){const d=new Date(),day=d.getUTCDay(),diff=d.getUTCDate()-day+(day===0?-6:1);const mon=new Date(d);mon.setUTCDate(diff);return mon.toISOString().slice(0,10)}
function checkWeekReset(){const w=getWeekId();if(w!==rankWeek){
  if(rankings.users.length){
    for(let i=0;i<rankings.users.length;i++){const u=rankings.users[i],acc=accounts.get(u.did);
      if(!acc)continue;const r=i+1;acc.rewards=acc.rewards||[];
      if(r===1)acc.rewards.push({type:'title',val:'주간 챔피언',gold:300});
      else if(r<=10)acc.rewards.push({type:'gold',val:300});
      else if(r<=100)acc.rewards.push({type:'gold',val:100})}}
  if(rankings.guilds.length){
    for(let i=0;i<rankings.guilds.length;i++){const g=guilds.get(rankings.guilds[i].gid);
      if(!g)continue;const r=i+1;for(const mid of g.members){const acc=accounts.get(mid);if(!acc)continue;acc.rewards=acc.rewards||[];
        if(r===1)acc.rewards.push({type:'guild_top',gold:200});
        else if(r<=10)acc.rewards.push({type:'gold',val:100})}}}
  saveAccounts();rankings={users:[],guilds:[]};saveRankings();rankWeek=w;try{fs.writeFileSync(RWF,w)}catch(e){}}}

const GF='guilds.dat';let guilds=new Map();
try{const arr=JSON.parse(fs.readFileSync(GF,'utf8'));for(const g of arr)guilds.set(g.id,g)}catch(e){}
const saveGuilds=()=>{try{fs.writeFileSync(GF,JSON.stringify([...guilds.values()]))}catch(e){}};
let guildSeq=0;try{for(const g of guilds.values())guildSeq=Math.max(guildSeq,parseInt(g.id.replace('g',''))||0)}catch(e){}

const PLF='plaza.dat';let plazaChannels=new Map();
const PLAZA_MAX=30;

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
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}
  const u=req.url.split('?')[0];
  if(u==='/rooms'){json(res,[...rooms.values()].map(pub));return}
  if(u==='/notice'&&req.method==='GET'){json(res,notice||{});return}
  if(u==='/notice'&&req.method==='POST'){body(req,m=>{
      if(!m||!keyOk(m.key)){res.statusCode=403;res.end();return}
      const t=String(m.text||'').trim().slice(0,500);notice=t?{id:Date.now(),text:t,at:new Date().toISOString()}:null;
      try{fs.writeFileSync(NF,JSON.stringify(notice))}catch(e){}
      for(const ws of wss.clients)send(ws,{t:'notice',n:notice||{}});
      json(res,{ok:true})});return}
  if(u==='/feedback'&&req.method==='POST'){const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),now=Date.now();
    if(now-(lastFb.get(ip)||0)<10000){json(res,{err:'wait'},429);return}
    body(req,m=>{const t=m&&String(m.text||'').trim().slice(0,500),n=m&&String(m.name||'').trim().slice(0,12);if(!t){json(res,{err:'empty'},400);return}
      lastFb.set(ip,now);fb.push({id:now,name:n||'익명',text:t,at:new Date(now).toISOString()});if(fb.length>500)fb=fb.slice(-500);saveFb();json(res,{ok:true})});return}
  if(u==='/feedback/admin'&&req.method==='POST'){body(req,m=>{if(!m||!keyOk(m.key)){json(res,{},403);return}
      if(m.del){fb=fb.filter(f=>f.id!==m.del);saveFb()}json(res,fb)});return}

  if(u==='/account/register'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.name){json(res,{err:'missing'},400);return}
    const did=String(m.did).slice(0,64),name=String(m.name).trim().slice(0,12);
    if(!name||name.length<1){json(res,{err:'invalid_name'},400);return}
    const existing=accounts.get(did);
    if(existing){json(res,{ok:true,account:existing});return}
    for(const a of accounts.values())if(a.name===name){json(res,{err:'name_taken'},409);return}
    const acc={did,name,level:1,xp:0,gold:0,guild:null,titles:[],rewards:[],createdAt:new Date().toISOString()};
    accounts.set(did,acc);saveAccounts();json(res,{ok:true,account:acc})});return}
  if(u==='/account/get'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));
    if(!acc){json(res,{err:'not_found'},404);return}
    json(res,{ok:true,account:acc})});return}
  if(u==='/account/sync'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc){json(res,{err:'not_found'},404);return}
    if(m.level!=null)acc.level=Math.max(1,m.level|0);
    if(m.xp!=null)acc.xp=Math.max(0,m.xp|0);
    if(m.gold!=null)acc.gold=Math.max(0,m.gold|0);
    if(m.skin)acc.skin=String(m.skin).slice(0,32);
    saveAccounts();
    const rw=acc.rewards||[];acc.rewards=[];if(rw.length)saveAccounts();
    json(res,{ok:true,account:acc,rewards:rw})});return}
  if(u==='/account/rename'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.name){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc){json(res,{err:'not_found'},404);return}
    const name=String(m.name).trim().slice(0,12);
    if(!name){json(res,{err:'invalid_name'},400);return}
    for(const a of accounts.values())if(a.did!==m.did&&a.name===name){json(res,{err:'name_taken'},409);return}
    acc.name=name;saveAccounts();json(res,{ok:true})});return}

  if(u==='/ranking/submit'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.wave){json(res,{err:'missing'},400);return}
    checkWeekReset();
    const did=String(m.did),wave=m.wave|0,time=m.time|0;
    const acc=accounts.get(did);if(!acc){json(res,{err:'no_account'},400);return}
    if(wave>200){json(res,{err:'suspicious'},400);return}
    const idx=rankings.users.findIndex(r=>r.did===did);
    if(idx>=0){const r=rankings.users[idx];if(wave>r.wave||(wave===r.wave&&time>r.time)){r.wave=wave;r.time=time;r.name=acc.name;r.level=acc.level}}
    else rankings.users.push({did,name:acc.name,level:acc.level,wave,time});
    rankings.users.sort((a,b)=>b.wave-a.wave||(b.time-a.time));
    if(rankings.users.length>200)rankings.users.length=200;
    saveRankings();
    const myRank=rankings.users.findIndex(r=>r.did===did)+1;
    json(res,{ok:true,myRank})});return}
  if(u==='/ranking/get'){checkWeekReset();
    const params=new URL('http://x'+req.url).searchParams;
    const did=params.get('did')||'';
    const myRank=did?rankings.users.findIndex(r=>r.did===did)+1:0;
    json(res,{users:rankings.users.slice(0,100),myRank,guilds:rankings.guilds.slice(0,50),week:rankWeek});return}

  if(u==='/guild/create'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.name){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc){json(res,{err:'no_account'},400);return}
    if(acc.guild){json(res,{err:'already_in_guild'},400);return}
    const gname=String(m.name).trim().slice(0,10);
    if(gname.length<2){json(res,{err:'name_too_short'},400);return}
    for(const g of guilds.values())if(g.name===gname){json(res,{err:'name_taken'},409);return}
    const gid='g'+(++guildSeq);
    const guild={id:gid,name:gname,master:m.did,officers:[],members:[m.did],maxMembers:20,joinType:'free',level:1,contrib:0,weekContrib:0,chat:[],createdAt:new Date().toISOString()};
    guilds.set(gid,guild);acc.guild=gid;saveGuilds();saveAccounts();
    json(res,{ok:true,guild})});return}
  if(u==='/guild/list'){
    const list=[...guilds.values()].map(g=>({id:g.id,name:g.name,members:g.members.length,maxMembers:g.maxMembers,level:g.level,joinType:g.joinType,master:g.master}));
    json(res,{guilds:list});return}
  if(u==='/guild/get'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.gid){json(res,{err:'missing'},400);return}
    const g=guilds.get(String(m.gid));if(!g){json(res,{err:'not_found'},404);return}
    const memberInfo=g.members.map(did=>{const a=accounts.get(did);return a?{did,name:a.name,level:a.level}:{did,name:'?',level:0}});
    json(res,{ok:true,guild:{...g,memberInfo}})});return}
  if(u==='/guild/join'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.gid){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc){json(res,{err:'no_account'},400);return}
    if(acc.guild){json(res,{err:'already_in_guild'},400);return}
    if(acc.guildLeft&&Date.now()-acc.guildLeft<86400000){json(res,{err:'cooldown'},400);return}
    const g=guilds.get(String(m.gid));if(!g){json(res,{err:'not_found'},404);return}
    if(g.members.length>=g.maxMembers){json(res,{err:'full'},400);return}
    g.members.push(m.did);acc.guild=g.id;saveGuilds();saveAccounts();
    json(res,{ok:true})});return}
  if(u==='/guild/leave'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc||!acc.guild){json(res,{err:'not_in_guild'},400);return}
    const g=guilds.get(acc.guild);if(!g){acc.guild=null;saveAccounts();json(res,{ok:true});return}
    if(g.master===m.did){
      if(g.members.length>1){json(res,{err:'transfer_first'},400);return}
      for(const mid of g.members){const ma=accounts.get(mid);if(ma)ma.guild=null}
      guilds.delete(g.id);saveGuilds();saveAccounts();json(res,{ok:true,disbanded:true});return}
    g.members=g.members.filter(d=>d!==m.did);g.officers=g.officers.filter(d=>d!==m.did);
    acc.guild=null;acc.guildLeft=Date.now();saveGuilds();saveAccounts();
    json(res,{ok:true})});return}
  if(u==='/guild/kick'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.target){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc||!acc.guild){json(res,{err:'not_in_guild'},400);return}
    const g=guilds.get(acc.guild);if(!g){json(res,{err:'not_found'},400);return}
    if(g.master!==m.did&&!g.officers.includes(m.did)){json(res,{err:'no_perm'},403);return}
    if(m.target===g.master){json(res,{err:'cannot_kick_master'},400);return}
    const tAcc=accounts.get(String(m.target));
    if(tAcc){tAcc.guild=null;tAcc.guildLeft=Date.now()}
    g.members=g.members.filter(d=>d!==m.target);g.officers=g.officers.filter(d=>d!==m.target);
    saveGuilds();saveAccounts();json(res,{ok:true})});return}
  if(u==='/guild/transfer'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.target){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc||!acc.guild){json(res,{err:'not_in_guild'},400);return}
    const g=guilds.get(acc.guild);if(!g||g.master!==m.did){json(res,{err:'not_master'},403);return}
    if(!g.members.includes(m.target)){json(res,{err:'not_member'},400);return}
    g.master=m.target;saveGuilds();json(res,{ok:true})});return}
  if(u==='/guild/contrib'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did||!m.amount){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc||!acc.guild){json(res,{err:'not_in_guild'},400);return}
    const g=guilds.get(acc.guild);if(!g){json(res,{err:'not_found'},400);return}
    const amount=Math.max(0,Math.min(1000,m.amount|0));
    g.contrib=(g.contrib||0)+amount;g.weekContrib=(g.weekContrib||0)+amount;
    const lvUp=Math.floor(g.contrib/500);if(lvUp>g.level)g.level=Math.min(lvUp,50);
    const ri=rankings.guilds.findIndex(r=>r.gid===g.id);
    if(ri>=0){rankings.guilds[ri].contrib=g.weekContrib;rankings.guilds[ri].name=g.name;rankings.guilds[ri].members=g.members.length}
    else rankings.guilds.push({gid:g.id,name:g.name,contrib:g.weekContrib,members:g.members.length});
    rankings.guilds.sort((a,b)=>b.contrib-a.contrib);
    if(rankings.guilds.length>100)rankings.guilds.length=100;
    saveGuilds();saveRankings();json(res,{ok:true,level:g.level,contrib:g.contrib})});return}
  if(u==='/guild/chat'&&req.method==='POST'){body(req,m=>{
    if(!m||!m.did){json(res,{err:'missing'},400);return}
    const acc=accounts.get(String(m.did));if(!acc||!acc.guild){json(res,{err:'not_in_guild'},400);return}
    const g=guilds.get(acc.guild);if(!g){json(res,{err:'not_found'},400);return}
    g.chat=g.chat||[];
    if(m.text){const msg={name:acc.name,text:String(m.text).slice(0,100),at:Date.now()};
      g.chat.push(msg);if(g.chat.length>200)g.chat=g.chat.slice(-200);saveGuilds()}
    json(res,{ok:true,chat:g.chat.slice(-50)})});return}

  if(u==='/admin/ranking'&&req.method==='POST'){body(req,m=>{
    if(!m||!keyOk(m.key)){json(res,{},403);return}
    if(m.del){rankings.users=rankings.users.filter(r=>r.did!==m.del);saveRankings()}
    if(m.ban){const acc=accounts.get(m.ban);if(acc){acc.cheats=true;saveAccounts()}}
    json(res,{users:rankings.users,total_accounts:[...accounts.values()].length})});return}
  if(u==='/admin'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(ADMIN);return}
  res.end('ccsg lobby ok')});
const wss=new WebSocketServer({server:srv,maxPayload:256*1024});

const plazaUsers=new Map();
function broadcastPlaza(ch,msg,except){
  for(const [ws,u] of plazaUsers)if(u.ch===ch&&ws!==except)send(ws,msg)}

wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>{ws.alive=true});
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}
    if(m.t==='host'&&!ws.room&&!ws.relay){const id=String(++seq);ws.room={id,name:String(m.name||'방').slice(0,24),peer:String(m.peer||'').slice(0,64),n:1,playing:false,ws,cl:new Map(),cid:0};rooms.set(id,ws.room);send(ws,{t:'hosted',id})}
    else if(m.t==='upd'&&ws.room){ws.room.n=Math.max(1,Math.min(4,m.n|0));ws.room.playing=!!m.playing}
    else if(m.t==='join'&&!ws.room&&!ws.relay){const r=rooms.get(String(m.room));if(!r){send(ws,{t:'nojoin'});return}
      const cid='r'+(++r.cid);r.cl.set(cid,ws);ws.relay={r,cid};send(ws,{t:'joined',cid});send(r.ws,{t:'rjoin',cid})}
    else if(m.t==='r'){if(ws.room){const c=ws.room.cl.get(m.to);send(c,{t:'r',d:m.d})}else if(ws.relay)send(ws.relay.r.ws,{t:'r',from:ws.relay.cid,d:m.d})}
    else if(m.t==='kick'&&ws.room){const c=ws.room.cl.get(m.to);if(c)c.close()}
    else if(m.t==='plaza_join'){
      const did=String(m.did||'').slice(0,64),name=String(m.name||'?').slice(0,12),skin=String(m.skin||'default').slice(0,32);
      let ch=1;for(let i=1;i<=20;i++){let cnt=0;for(const u of plazaUsers.values())if(u.ch===i)cnt++;if(cnt<PLAZA_MAX){ch=i;break}}
      const u={did,name,skin,ch,x:400,y:300};plazaUsers.set(ws,u);
      const others=[];for(const [ows,ou] of plazaUsers)if(ou.ch===ch&&ows!==ws)others.push({did:ou.did,name:ou.name,skin:ou.skin,x:ou.x,y:ou.y});
      send(ws,{t:'plaza_joined',ch,users:others});
      broadcastPlaza(ch,{t:'plaza_enter',did,name,skin,x:u.x,y:u.y},ws)}
    else if(m.t==='plaza_move'){const u=plazaUsers.get(ws);if(!u)return;
      u.x=Math.max(0,Math.min(800,m.x|0));u.y=Math.max(0,Math.min(600,m.y|0));
      broadcastPlaza(u.ch,{t:'plaza_move',did:u.did,x:u.x,y:u.y},ws)}
    else if(m.t==='plaza_chat'){const u=plazaUsers.get(ws);if(!u)return;
      const text=String(m.text||'').slice(0,60);if(!text)return;
      broadcastPlaza(u.ch,{t:'plaza_chat',did:u.did,name:u.name,text},null)}
    else if(m.t==='plaza_leave'){const u=plazaUsers.get(ws);if(u){broadcastPlaza(u.ch,{t:'plaza_leave',did:u.did},ws);plazaUsers.delete(ws)}}
  });
  ws.on('close',()=>{
    if(ws.room){rooms.delete(ws.room.id);for(const c of ws.room.cl.values())c.close()}
    if(ws.relay){const r=ws.relay.r;r.cl.delete(ws.relay.cid);send(r.ws,{t:'rleave',cid:ws.relay.cid})}
    const u=plazaUsers.get(ws);if(u){broadcastPlaza(u.ch,{t:'plaza_leave',did:u.did},ws);plazaUsers.delete(ws)}})});
setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},20000);
setInterval(checkWeekReset,600000);
checkWeekReset();
srv.listen(process.env.PORT||3000,()=>console.log('lobby on',process.env.PORT||3000));
