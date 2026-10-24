// Runs tools/fin/live_sync.js in Node against real public MQTT servers: two "phones" + a late third one.
const fs=require('fs');
const store={}; global.localStorage={getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);}};
global.document={addEventListener(){}, visibilityState:'visible'}; global.window={addEventListener(){}};
eval(fs.readFileSync(__dirname+'/../fin/live_sync.js','utf8')+';global.liveSync=liveSync;');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SERVERS=process.argv.slice(2);
async function one(url){
  const topic='rt-probe/'+Math.random().toString(36).slice(2)+'/state';
  const mk=(name)=>{ let st='', n=0; const s=liveSync({topic, servers:[url], key:'k'+name, onStatus:(x)=>{st=x;}, onData:()=>{n++;}}); return {s, st:()=>st, n:()=>n}; };
  const t0=Date.now();
  const A=mk('A'+url), B=mk('B'+url);
  for(let i=0;i<40 && (A.st()!=='ok'||B.st()!=='ok');i++) await wait(250);
  const tc=Date.now()-t0;
  A.s.put('exp','e1',{amt:12.5,note:'קפה',d:'2026-12-14'});
  let t1=Date.now(); for(let i=0;i<60 && !B.s.db.exp.e1;i++) await wait(100);
  const ab=B.s.db.exp.e1?Date.now()-t1:-1;
  B.s.del('e1'); B.s.put('doc','queue',{items:[{n:'x'}],t:Date.now()});
  t1=Date.now(); for(let i=0;i<60 && (A.s.db.exp.e1 || !A.s.db.docs.queue);i++) await wait(100);
  const ba=(!A.s.db.exp.e1 && A.s.db.docs.queue)?Date.now()-t1:-1;
  // both change at the same moment
  A.s.put('exp','a2',{amt:1}); B.s.put('exp','b2',{amt:2});
  await wait(3000);
  const both=!!(A.s.db.exp.a2&&A.s.db.exp.b2&&B.s.db.exp.a2&&B.s.db.exp.b2);
  await wait(Number(process.env.LATE||20000));
  const C=mk('C'+url);
  for(let i=0;i<60 && !(C.s.db.exp.a2&&C.s.db.exp.b2&&C.s.db.del.e1);i++) await wait(250);
  const late=!!(C.s.db.exp.a2&&C.s.db.exp.b2&&C.s.db.del.e1&&C.s.db.docs.queue);
  console.log(JSON.stringify({url, connect_ms:tc, a_to_b_ms:ab, b_to_a_ms:ba, both_at_once:both, late_phone_gets_all:late, sizeA:JSON.stringify(A.s.db).length}));
}
(async()=>{ await Promise.all(SERVERS.map(u=>one(u).catch(e=>console.log(u,'ERR',e.message)))); process.exit(0); })();
