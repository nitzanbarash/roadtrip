/* Live sync between our phones, with no account and no setup.
   Every phone keeps the whole trip (expenses, settings, queue, must-sees, stars) and sends it as one
   "retained" message to free public MQTT servers (two of them, in case one is down). Whoever connects
   gets the latest copy at once, merges it with its own (newest change of each item wins; deletions
   are remembered), and sends back the merge if it knows something the server doesn't. If a server
   loses its copy, the next phone to connect simply puts its own back.

   liveSync({topic, servers, key, onData(db, changed), onStatus(state, text)}) ->
     {db, put(kind, id, value), del(id), ping()}
*/
function liveSync(o){
  var LSK=o.key||'rt_live_db';
  function lget(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lset(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function empty(){ return {v:1, exp:{}, del:{}, set:null, docs:{}}; }
  var db=(function(){ try{ var d=JSON.parse(lget(LSK)||'null'); if(d && d.v===1 && d.exp) return d; }catch(e){} return empty(); })();
  db.del=db.del||{}; db.docs=db.docs||{};

  // ---- merge: newest change of each item wins (u = when it was changed, on the phone that changed it) ----
  function merge(a, b){   // returns {db, changed:{exp,set,docs:{}}} with b folded into a
    var out={v:1, exp:{}, del:{}, set:a.set, docs:{}}, ch={exp:false, set:false, docs:{}}, k;
    for(k in a.del) out.del[k]=a.del[k];
    for(k in (b.del||{})) if(!(out.del[k]>=b.del[k])) out.del[k]=b.del[k];
    for(k in a.exp) out.exp[k]=a.exp[k];
    for(k in (b.exp||{})){ var x=b.exp[k]; if(x && (!out.exp[k] || (+x.u||0)>(+out.exp[k].u||0))){ if(!out.exp[k] || JSON.stringify(out.exp[k])!==JSON.stringify(x)) ch.exp=true; out.exp[k]=x; } }
    for(k in out.del) if(out.exp[k] && (+out.exp[k].u||0)<=out.del[k]){ if(a.exp[k]) ch.exp=true; delete out.exp[k]; }
    if(b.set && (!a.set || (+b.set.u||0)>(+a.set.u||0))){ out.set=b.set; ch.set=true; }
    for(k in a.docs) out.docs[k]=a.docs[k];
    for(k in (b.docs||{})){ var d=b.docs[k]; if(d && (!out.docs[k] || (+d.t||0)>(+out.docs[k].t||0))){ out.docs[k]=d; ch.docs[k]=true; } }
    return {db:out, changed:ch};
  }
  // the same data always gives the same text, so two phones can tell when they agree
  function canon(v){
    if(v===null || typeof v!=='object') return JSON.stringify(v);
    if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
    return '{'+Object.keys(v).sort().filter(function(k){ return v[k]!==undefined; }).map(function(k){ return JSON.stringify(k)+':'+canon(v[k]); }).join(',')+'}';
  }
  var mine=canon(db);
  function save(){ mine=canon(db); lset(LSK, mine); }

  // ---- a tiny MQTT 3.1.1 client over WebSocket (just what we need: connect, subscribe, publish retained, ping) ----
  var te=new TextEncoder(), td=new TextDecoder();
  function str(s){ var b=te.encode(s); return [b.length>>8, b.length&255].concat(Array.prototype.slice.call(b)); }
  function packet(type, body){
    var n=body.length, len=[]; do{ var d=n%128; n=Math.floor(n/128); if(n>0) d|=128; len.push(d); }while(n>0);
    var out=new Uint8Array(1+len.length+body.length); out[0]=type; out.set(len,1); out.set(body,1+len.length); return out;
  }
  function client(url){
    var c={url:url, ws:null, up:false, seen:null, tries:0, timer:null, ping:null, buf:new Uint8Array(0), id:'rt'+Math.random().toString(36).slice(2,12)};
    function send(p){ try{ if(c.ws && c.ws.readyState===1){ c.ws.send(p); return true; } }catch(e){} return false; }
    c.publish=function(text){
      var t=str(o.topic), p=te.encode(text), body=new Uint8Array(t.length+p.length); body.set(t,0); body.set(p,t.length);
      return send(packet(0x31, body));   // PUBLISH, QoS 0, retain
    };
    function onPacket(type, b){
      var k=type>>4;
      if(k===2){   // CONNACK
        if(b[1]!==0){ c.ws.close(); return; }
        c.up=true; c.tries=0; c.seen=null; status();
        var t=str(o.topic); send(packet(0x82, new Uint8Array([0,1].concat(t,[0]))));   // SUBSCRIBE id 1, QoS 0
        clearInterval(c.ping); c.ping=setInterval(function(){ send(new Uint8Array([0xC0,0])); }, 25000);
        c.syncTimer=setTimeout(function(){ if(c.seen===null){ c.seen=''; offer(); } }, 2500);   // nothing stored there yet
      } else if(k===3){   // PUBLISH
        var qos=(type>>1)&3, tl=(b[0]<<8)|b[1], i=2+tl;
        if(qos>0){ send(new Uint8Array([0x40,2,b[i],b[i+1]])); i+=2; }
        var text=td.decode(b.subarray(i));
        clearTimeout(c.syncTimer); got(c, text);
      }
    }
    function onBytes(u8){
      var all=new Uint8Array(c.buf.length+u8.length); all.set(c.buf,0); all.set(u8,c.buf.length);
      var i=0;
      while(i+2<=all.length){
        var mul=1, n=0, j=i+1, d;
        do{ if(j>=all.length) { c.buf=all.slice(i); return; } d=all[j++]; n+=(d&127)*mul; mul*=128; }while(d&128);
        if(j+n>all.length) break;
        onPacket(all[i], all.subarray(j, j+n)); i=j+n;
      }
      c.buf=all.slice(i);
    }
    c.open=function(){
      clearTimeout(c.timer); if(c.ws && c.ws.readyState<2) return;
      var ws; try{ ws=new WebSocket(url, ['mqtt']); }catch(e){ later(); return; }
      c.ws=ws; ws.binaryType='arraybuffer'; c.buf=new Uint8Array(0);
      ws.onopen=function(){
        var body=[0,4,77,81,84,84, 4, 2, 0,60].concat(str(c.id));   // "MQTT", level 4, clean session, keep-alive 60s
        send(packet(0x10, new Uint8Array(body)));
      };
      ws.onmessage=function(e){ if(e.data instanceof ArrayBuffer) onBytes(new Uint8Array(e.data)); };
      ws.onclose=function(){ if(c.ws!==ws) return; c.up=false; clearInterval(c.ping); clearTimeout(c.syncTimer); status(); later(); };
      ws.onerror=function(){};
    };
    function later(){ clearTimeout(c.timer); c.tries++; c.timer=setTimeout(c.open, Math.min(60000, 1500*Math.pow(1.8, Math.min(c.tries,8)))); }
    c.kick=function(){ if(!c.ws || c.ws.readyState>1){ c.tries=0; c.open(); } };
    return c;
  }

  var C=(o.servers||[]).map(client);
  function got(c, text){
    var r=null; try{ r=JSON.parse(text); }catch(e){}
    c.seen=text;
    if(!r || r.v!==1){ offer(); return; }
    var m=merge(db, r);
    if(canon(m.db)!==mine){ db=m.db; save(); if(o.onData) o.onData(db, m.changed); }
    offer();
  }
  // send our copy to every server that doesn't have exactly it yet
  var offerT=null;
  function offer(){
    clearTimeout(offerT);
    offerT=setTimeout(function(){
      C.forEach(function(c){ if(c.up && c.seen!==null && c.seen!==mine){ if(c.publish(mine)) c.seen=mine; } });
      status();
    }, 150);
  }
  function status(){
    var up=C.filter(function(c){ return c.up; }).length;
    if(o.onStatus) o.onStatus(up ? (C.some(function(c){ return c.up && c.seen===mine; }) ? 'ok' : 'busy') : (navigator.onLine===false ? 'offline' : 'off'), up);
  }
  function kick(){ C.forEach(function(c){ c.kick(); }); }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') kick(); });
  window.addEventListener('online', kick);
  window.addEventListener('pageshow', kick);
  C.forEach(function(c){ c.open(); });

  return {
    get db(){ return db; },
    put:function(kind, id, val){
      var now=Date.now();
      if(kind==='exp'){ val.u=now; db.exp[id]=val; delete db.del[id]; }
      else if(kind==='set'){ db.set={s:val, u:now}; }
      else if(kind==='doc'){ db.docs[id]=val; }
      save(); offer();
    },
    del:function(id){ delete db.exp[id]; db.del[id]=Date.now(); save(); offer(); },
    // fold in things written on this phone before it ever synced (they lose to anything newer)
    seed:function(part){ var m=merge(part, db); db=m.db; save(); },
    ping:kick,
    merge:merge, canon:canon
  };
}
