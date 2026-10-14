  /* ================================================================
     ext: photos & reviews, nearby places (internet), the stop queue,
     hosting (map parts next to the page, PWA install)
     ================================================================ */
  var MAPS = (HOST && HOST.maps) ? HOST.maps : ((MAPPARTS && MAPPARTS.parts && MAPPARTS.parts.length) ? [MAPPARTS] : []);
  function netUp(){ return !IN_FRAME && navigator.onLine!==false; }
  function jfetch(url, ms, opt){
    var ctl=('AbortController' in window) ? new AbortController() : null, o=opt||{};
    if(ctl) o.signal=ctl.signal;
    var to=setTimeout(function(){ if(ctl) ctl.abort(); }, ms||9000);
    return fetch(url, o).then(function(r){ clearTimeout(to); if(!r.ok) throw new Error('http '+r.status); return r.json(); }, function(e){ clearTimeout(to); throw e; });
  }
  function attr(o){ return esc(JSON.stringify(o)); }
  function miOf(m){ return m/1609.34; }
  function fmtMi(mi){ return mi<10 ? mi.toFixed(1) : Math.round(mi).toLocaleString('en-US'); }

  /* ---------- map parts hosted next to this page (one half per Claude page, both on the app site) ---------- */
  function mapFile(m){ return 'roadtrip-map-'+(m.half||'all')+'.zip'; }
  function fetchParts(m, bar){
    var got=[], done=0, chain=Promise.resolve();
    if(bar){ bar.parentNode.hidden=false; bar.style.width='0%'; }
    m.parts.forEach(function(p){
      chain=chain.then(function(){
        return fetch(p).then(function(r){ if(!r.ok) throw new Error('http '+r.status); return m.b64 ? r.text().then(unb64) : r.blob(); }).then(function(b){
          got.push(b); done+=b.size; if(bar) bar.style.width=Math.min(100, done/m.size*100).toFixed(1)+'%';
        });
      });
    });
    return chain.then(function(){ if(bar) bar.parentNode.hidden=true; return new Blob(got, {type:'application/octet-stream'}); }, function(e){ if(bar) bar.parentNode.hidden=true; throw e; });
  }
  function saveArchivesNow(){
    var list=ARCHS.filter(function(r){ return r.blob; }).map(function(r){ return {blob:r.blob, name:r.name, t:Date.now()}; });
    if(!list.length) return Promise.resolve(false);
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
    return idbDo('readwrite', function(st){ return st.put({list:list}, 'maps'); }).then(function(){ ARCHS.forEach(function(r){ if(r.blob) r.saved=true; }); idbOK=true; return true; }, function(){ return false; });
  }
  function archOf(m){ var i=-1; ARCHS.forEach(function(r,k){ if(i<0 && r.name && m.half && r.name.indexOf(m.half)>=0) i=k; }); return i>=0 ? ARCHS[i] : null; }
  var hostBusy={};
  function hostUI(){
    var row=$('hostRow'); if(!MAPS.length){ row.hidden=true; return; }
    row.hidden=false; row.innerHTML=''; row.style.flexDirection='column';
    var site=!!(HOST && HOST.maps);
    $('offTx').innerHTML = site
      ? 'המפה המפורטת (כל רחוב, בניין, תחנת דלק ומלון לאורך המסלול) מחולקת לשני חלקים. הורידו את שניהם פעם אחת עם אינטרנט טוב, והם נשמרים בטלפון.'
      : 'המפה המפורטת מחולקת לשני קבצים. בדף הזה: <b>'+esc(MAPS[0].label)+'</b>.'+(MAPS[0].other ? ' החלק השני, <b>'+esc(MAPS[0].other.label)+'</b>, נמצא <a href="'+esc(MAPS[0].other.url)+'" target="_blank" rel="noopener">בדף הזה</a>.' : '')+' שמרו את שני הקבצים בטלפון ובחרו אותם יחד באפליקציה.';
    MAPS.forEach(function(m){
      var a=archOf(m), mb=Math.round(m.size/1048576), d=document.createElement('div'); d.className='maprow';
      var st = a ? (a.saved ? '<span class="ok">שמור במכשיר ✓</span>' : '<span class="ok">טעון</span>') : '<small>'+mb+'MB</small>';
      d.innerHTML='<div class="t"><span>'+esc(m.label)+'</span>'+st+'</div><div class="prog" hidden><i></i></div><div class="row"></div>';
      var r=d.querySelector('.row'), bar=d.querySelector('.prog i');
      if(!a){
        var b=document.createElement('button'); b.className='btn pri'; b.type='button'; b.textContent= site ? 'הורדה ושמירה בטלפון' : 'טעינה לכאן';
        b.addEventListener('click', function(){
          if(hostBusy[m.half]) return; hostBusy[m.half]=true; b.disabled=true; b.textContent='מוריד…';
          fetchParts(m, bar).then(function(blob){ return openAny(blob, mapFile(m), true); }).then(function(){
            return site ? saveArchivesNow() : (idbOK ? saveArchivesNow() : false);
          }).then(function(saved){
            toast(saved ? esc(m.label)+' נשמר בטלפון. עובד מעכשיו גם בלי אינטרנט.' : 'נטען: '+m.label, 4500);
          }).catch(function(){ toast('ההורדה נכשלה. בדקו את החיבור ונסו שוב.'); }).then(function(){ hostBusy[m.half]=false; hostUI(); offUI(); });
        });
        r.appendChild(b);
      }
      if(!site){
        var s=document.createElement('button'); s.className='btn'; s.type='button'; s.textContent='שמירת הקובץ '+mapFile(m)+' בטלפון';
        s.addEventListener('click', function(){
          s.disabled=true;
          var dlp=(window.claude && window.claude.use) ? window.claude.use('downloads') : Promise.resolve(null);
          Promise.all([fetchParts(m, bar), Promise.resolve(dlp).catch(function(){ return null; })]).then(function(x){
            var blob=x[0], dl=x[1];
            if(dl && dl.save) return dl.save({filename:mapFile(m), data:blob}).then(function(){ toast('הקובץ נשמר. באפליקציה: שכבות → בחירת קובץ מפה.', 5500); }, function(e){
              if(e && e.code==='too_large') toast('הקובץ גדול מדי לאפליקציה. פתחו את הקישור בדפדפן ושמרו משם.', 6000);
              else if(!(e && e.code==='declined')) toast('השמירה לא הצליחה בתצוגה הזו.', 4000);
            });
            try{ var el=document.createElement('a'); el.href=URL.createObjectURL(blob); el.download=mapFile(m); document.body.appendChild(el); el.click(); el.remove(); }catch(e){}
          }).catch(function(){ toast('ההורדה נכשלה. בדקו את החיבור ונסו שוב.'); }).then(function(){ s.disabled=false; });
        });
        r.appendChild(s);
      }
      row.appendChild(d);
    });
  }
  function pwaInit(){
    if(!HOST || !HOST.sw) return;
    var secure=/^https:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if(secure && 'serviceWorker' in navigator){
      navigator.serviceWorker.register(HOST.sw).then(function(reg){
        reg.addEventListener('updatefound', function(){ var w=reg.installing; if(!w) return; w.addEventListener('statechange', function(){ if(w.state==='installed' && navigator.serviceWorker.controller) toast('יש גרסה חדשה של האפליקציה. סגרו אותה ופתחו שוב.', 6000); }); });
      }).catch(function(){});
    }
    var ios=/iP(hone|ad|od)/.test(navigator.userAgent), standalone=(navigator.standalone===true) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if(ios && !standalone && lsGet('rt_inst')!=='1') $('install').hidden=false;
    $('installx').addEventListener('click', function(){ $('install').hidden=true; lsSet('rt_inst','1'); });
  }

  /* ---------- photos (Wikimedia Commons near the spot + the Wikipedia article) and review links ---------- */
  var PH_TTL=30*864e5, BAD_IMG=/map|plan|logo|diagram|\bsign|plaque|flag|seal|coat|icon|chart|poster|ticket|brochure|\.(png|gif|svg|tiff?)$/i;
  function words(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(function(w){ return w.length>2 && !/^(the|and|for|of|at|in|on|park|state|national|center|centre|museum|beach|city|new)$/.test(w); }); }
  function sameName(a,b){ var wa=words(a), wb=words(b); if(!wa.length||!wb.length) return false; var n=0; wb.forEach(function(w){ if(wa.indexOf(w)>=0) n++; }); return n>=Math.ceil(wb.length*.6); }
  function photoRadius(it){ var g=gOf(it).g; if(it.cf==='town') return 1500; if(g==='nature') return 2500; if(g==='water') return 1200; return 450; }
  function taUrl(it){ return 'https://www.tripadvisor.com/Search?q='+encodeURIComponent(it.e+' '+it.l); }
  function yelpUrl(it){ return 'https://www.yelp.com/search?find_desc='+encodeURIComponent(it.e)+'&find_loc='+encodeURIComponent(it.l); }
  function extCardExtra(it){
    return '<div class="rev"><span class="k">דירוג וביקורות (אינטרנט)</span>'+
      '<a target="_blank" rel="noopener" href="'+mapsUrl(it)+'">Google ★</a><a target="_blank" rel="noopener" href="'+taUrl(it)+'">TripAdvisor</a><a target="_blank" rel="noopener" href="'+yelpUrl(it)+'">Yelp</a></div>'+
      '<div class="ph" id="ph"></div><div id="wp"></div>';
  }
  function loadPhotos(it){
    var box=$('ph'), wpEl=$('wp'); if(!box) return;
    if(!netUp() || it.g==null){ box.innerHTML='<div class="phnone">תמונות וביקורות מופיעות עם אינטרנט. <a target="_blank" rel="noopener" href="'+photoUrl(it)+'">תמונות בגוגל ↗</a></div>'; return; }
    var key='rt_ph_'+it.id, cached=null;
    try{ cached=JSON.parse(lsGet(key)||'null'); }catch(e){}
    if(cached && Date.now()-cached.t<PH_TTL){ renderPhotos(it, cached); return; }
    box.innerHTML='<div class="phload">טוען תמונות…</div>';
    var lat=it.g, lon=it.n, r=photoRadius(it);
    var geo=jfetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&list=geosearch&gsnamespace=6&gscoord='+lat+'|'+lon+'&gsradius='+r+'&gslimit=40').then(function(j){
      var ps=((j.query&&j.query.geosearch)||[]).filter(function(p){ return /\.jpe?g$/i.test(p.title) && !BAD_IMG.test(p.title); }).slice(0,14);
      if(!ps.length) return [];
      return jfetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|size&iiurlwidth=640&titles='+encodeURIComponent(ps.map(function(p){ return p.title; }).join('|'))).then(function(j2){
        var pages=(j2.query&&j2.query.pages)||{}, order={}, out=[];
        ps.forEach(function(p,i){ order[p.title]=i; });
        for(var k in pages){ var ii=pages[k].imageinfo&&pages[k].imageinfo[0]; if(ii && ii.width>=500 && ii.width>=ii.height*.75) out.push({u:ii.thumburl, f:ii.descriptionurl||ii.url, t:pages[k].title}); }
        out.sort(function(a,b){ return (order[a.t]||0)-(order[b.t]||0); });
        return out.slice(0,8);
      });
    }).catch(function(){ return []; });
    var wp=jfetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch='+encodeURIComponent(it.e)+'&gsrlimit=1&prop=pageimages|extracts|coordinates|info&inprop=url&piprop=thumbnail&pithumbsize=640&exintro=1&explaintext=1&exsentences=3').then(function(j){
      var pages=(j.query&&j.query.pages)||{}, p=null; for(var k in pages){ p=pages[k]; break; }
      if(!p) return null;
      var co=p.coordinates&&p.coordinates[0];
      if(co && hav([co.lon,co.lat],[lon,lat])>40000) return null;
      if(!co && !sameName(p.title, it.e)) return null;
      return {title:p.title, url:p.fullurl, ex:(p.extract||'').slice(0,420), th:p.thumbnail&&p.thumbnail.source};
    }).catch(function(){ return null; });
    Promise.all([geo, wp]).then(function(x){
      var d={t:Date.now(), ph:x[0], wp:x[1]};
      if(d.wp && d.wp.th && !d.ph.some(function(p){ return p.u===d.wp.th; })) d.ph.unshift({u:d.wp.th, f:d.wp.url, t:d.wp.title});
      lsSet(key, JSON.stringify(d));
      if(selected===it) renderPhotos(it, d);
    });
  }
  function renderPhotos(it, d){
    var box=$('ph'), wpEl=$('wp'); if(!box) return;
    if(d.ph && d.ph.length){
      box.innerHTML=d.ph.map(function(p){ return '<a target="_blank" rel="noopener" href="'+esc(p.f)+'" title="'+esc(p.t||'')+'"><img loading="lazy" alt="" src="'+esc(p.u)+'"></a>'; }).join('');
      box.insertAdjacentHTML('afterend','<div class="phcred" id="phc">תמונות: Wikimedia Commons · <a target="_blank" rel="noopener" href="'+photoUrl(it)+'">עוד תמונות בגוגל ↗</a></div>');
    } else box.innerHTML='<div class="phnone">אין תמונות חופשיות למקום הזה. <a target="_blank" rel="noopener" href="'+photoUrl(it)+'">תמונות בגוגל ↗</a></div>';
    if(d.wp && wpEl) wpEl.innerHTML='<div class="wp">'+esc(d.wp.ex)+' <a target="_blank" rel="noopener" href="'+esc(d.wp.url)+'">Wikipedia ↗</a></div>';
  }
  function hideQ(){ $('qpanel').hidden=true; $('bQueue').setAttribute('aria-pressed','false'); if(typeof syncTabs==='function' && $('tabbar')) syncTabs(); }
  function extAfterSelect(it){ hideQ(); loadPhotos(it); syncQButtons(); }

  /* ---------- the stop queue: our own order of visits ---------- */
  var QKEY='rt_queue_v2';
  var queue=(function(){ try{ return JSON.parse(lsGet(QKEY)||'[]')||[]; }catch(e){ return []; } })();
  var qMarkers=[], qRouteKey='', qRoad=null;
  function qStopOf(it){ return {id:it.id, n:it.h, e:it.e, lat:it.g, lng:it.n, k:gOf(it).he}; }
  function qIndex(s){ for(var i=0;i<queue.length;i++){ var x=queue[i]; if(s.id ? x.id===s.id : (Math.abs(x.lat-s.lat)<1e-5 && Math.abs(x.lng-s.lng)<1e-5)) return i; } return -1; }
  function qAdd(s){
    if(s.lat==null || s.lng==null){ toast('למקום הזה אין מיקום מדויק במפה.'); return; }
    if(qIndex(s)>=0){ toast('כבר בתור.'); return; }
    s.t=Date.now(); queue.push(s); saveQueue(); toast('נוסף לתור: '+s.n+' ('+queue.length+')', 2600);
  }
  function qToggle(s){ var i=qIndex(s); if(i>=0){ queue.splice(i,1); saveQueue(); toast('הוסר מהתור.', 2000); } else qAdd(s); }
  function saveQueue(){ lsSet(QKEY, JSON.stringify(queue)); renderQueue(); queueChanged(); }
  function qNextIdx(){ for(var i=0;i<queue.length;i++) if(!queue[i].done) return i; return -1; }
  function legMi(a,b){ return miOf(hav([a.lng,a.lat],[b.lng,b.lat]))*1.25; }
  function qBtn(s){ return '<button class="qadd" type="button" data-q="'+attr(s)+'" aria-pressed="false">הוספה לתור +</button>'; }
  function syncQButtons(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-q]'), function(b){
      var s; try{ s=JSON.parse(b.getAttribute('data-q')); }catch(e){ return; }
      var on=qIndex(s)>=0; b.setAttribute('aria-pressed', on?'true':'false');
      if(b.classList.contains('qadd')) b.textContent= on ? 'בתור ✓ (הסרה)' : 'הוספה לתור +';
      else b.textContent= on ? 'בתור ✓' : 'לתור +';
    });
  }
  document.addEventListener('click', function(e){
    var b=e.target.closest ? e.target.closest('[data-q]') : null; if(!b) return;
    var s; try{ s=JSON.parse(b.getAttribute('data-q')); }catch(x){ return; }
    qToggle(s); syncQButtons();
  });
  function renderQueue(){
    var n=queue.length, badge=$('qBadge'); badge.hidden=!n; badge.textContent=n;
    var tbq=$('tbQ'); if(tbq){ tbq.hidden=!n; tbq.textContent=n; }
    qMarkers.forEach(function(m){ m.remove(); }); qMarkers=[];
    if(styleReady) queue.forEach(function(s,i){
      var el=document.createElement('div'); el.className='qmk'+(s.done?' done':''); el.innerHTML='<b>'+(i+1)+'</b><span>'+esc(s.n)+'</span>';
      qMarkers.push(new maplibregl.Marker({element:el, anchor:'left', offset:[-12,0]}).setLngLat([s.lng,s.lat]).addTo(map));
    });
    var list=$('qlist'), head=$('qSub'), nx=qNextIdx();
    if(!n){ list.innerHTML='<div class="qempty">התור ריק. בכל אטרקציה, מקום במפה או נקודה שלוחצים עליה ארוכות יש כפתור ״הוספה לתור״. כאן מסדרים לאיזה מקום נוסעים קודם.</div>'; head.textContent='אין עצירות'; $('qRoadTx').textContent=''; drawRoad(null); return; }
    var tot=0, prev=null, html='';
    queue.forEach(function(s,i){
      var leg = prev && !s.done ? legMi(prev,s) : 0; if(!s.done){ tot+=leg; prev=s; }
      html+='<div class="qs'+(i===nx?' next':'')+(s.done?' done':'')+'" data-i="'+i+'"><b class="num">'+(i+1)+'</b><div class="qt"><div class="qn">'+esc(s.n)+'</div><div class="qm">'+(s.k?'<span>'+esc(s.k)+'</span>':'')+(leg?'<span class="lat">≈ '+fmtMi(leg)+' mi · '+fmtDur(leg)+'</span>':'')+(i===nx?'<span style="color:var(--neon);font-weight:800">הבא</span>':'')+'</div></div>'+
        '<div class="qb"><button type="button" data-a="up" aria-label="למעלה"'+(i===0?' disabled':'')+'>▲</button><button type="button" data-a="dn" aria-label="למטה"'+(i===n-1?' disabled':'')+'>▼</button><button type="button" class="ok" data-a="ok" aria-pressed="'+(s.done?'true':'false')+'" aria-label="סיימנו">✓</button><button type="button" data-a="go" aria-label="במפה">◎</button><button type="button" data-a="rm" aria-label="הסרה">×</button></div></div>';
    });
    list.innerHTML=html;
    var left=queue.filter(function(s){ return !s.done; }).length;
    head.innerHTML=left+' עצירות לפנינו · <span class="lat">≈ '+fmtMi(tot)+' mi</span> · '+fmtDur(tot)+' (בקו ישר)';
    $('qShareTx').value=qCode();
    if(qRoad && qRoad.key!==qKey()) drawRoad(null);
    syncQButtons();
  }
  function qKey(){ return queue.filter(function(s){ return !s.done; }).map(function(s){ return s.lat.toFixed(4)+','+s.lng.toFixed(4); }).join(';'); }
  function qCode(){ return 'RT1:'+btoa(unescape(encodeURIComponent(JSON.stringify(queue.map(function(s){ return [s.n, +s.lat.toFixed(5), +s.lng.toFixed(5), s.id||'', s.done?1:0, s.k||'']; }))))); }
  function qImport(code){
    try{
      var m=/RT1:([A-Za-z0-9+/=]+)/.exec(code||''); if(!m) throw new Error('fmt');
      var arr=JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      queue=arr.map(function(a){ return {n:a[0], lat:a[1], lng:a[2], id:a[3]||undefined, done:a[4]?1:0, k:a[5]||'', t:Date.now()}; });
      saveQueue(); toast('התור יובא: '+queue.length+' עצירות.');
    }catch(e){ toast('זה לא קוד של תור. העתיקו את כל הקוד מהטלפון השני.', 4500); }
  }
  $('qlist').addEventListener('click', function(e){
    var b=e.target.closest('button'), row=e.target.closest('.qs'); if(!row) return;
    var i=+row.getAttribute('data-i'), s=queue[i]; if(!s) return;
    var a=b ? b.getAttribute('data-a') : 'go';
    if(a==='up' && i>0){ queue.splice(i,1); queue.splice(i-1,0,s); saveQueue(); }
    else if(a==='dn' && i<queue.length-1){ queue.splice(i,1); queue.splice(i+1,0,s); saveQueue(); }
    else if(a==='ok'){ s.done=s.done?0:1; saveQueue(); }
    else if(a==='rm'){ queue.splice(i,1); saveQueue(); }
    else if(a==='go'){ if(s.id && ITEMBY[s.id]) selectItem(ITEMBY[s.id], true); else { setFollow(geo.pos?1:0); map.flyTo({center:[s.lng,s.lat], zoom:Math.max(map.getZoom(),13), duration:1000}); } if(window.innerWidth<=560) toggleQueue(false); }
  });
  function toggleQueue(on){ var p=$('qpanel'); p.hidden=!on; $('bQueue').setAttribute('aria-pressed', on?'true':'false'); if(on){ sheet.hidden=true; $('nav').hidden=true; renderQueue(); } else updateNav(); syncTabs(); }
  $('bQueue').addEventListener('click', function(){ toggleQueue($('qpanel').hidden); });
  $('qclose').addEventListener('click', function(){ toggleQueue(false); });
  $('qSort').addEventListener('click', function(){
    var done=queue.filter(function(s){ return s.done; }), todo=queue.filter(function(s){ return !s.done; });
    todo.forEach(function(s){ s._m=project(s.lng,s.lat).mile; });
    todo.sort(function(a,b){ return a._m-b._m; }); todo.forEach(function(s){ delete s._m; });
    queue=done.concat(todo); saveQueue(); toast('סודר לפי סדר הנסיעה במסלול.');
  });
  $('qNav').addEventListener('click', function(){
    var i=qNextIdx(); if(i<0){ toast('אין עצירה הבאה בתור.'); return; }
    var s=queue[i], a=document.createElement('a'); a.href=wazeLL(s.lat,s.lng); a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('qShare').addEventListener('click', function(){ var sh=$('qshare'); sh.setAttribute('data-open', sh.getAttribute('data-open')==='1'?'0':'1'); $('qShareTx').value=qCode(); });
  $('qCopy').addEventListener('click', function(){
    var tx=$('qShareTx'); tx.value=qCode();
    var p=(navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(tx.value) : Promise.reject();
    p.then(function(){ toast('הקוד הועתק. שלחו אותו בוואטסאפ לטלפון השני.'); }, function(){ tx.focus(); tx.select(); toast('סמנו והעתיקו את הקוד.'); });
  });
  $('qImport').addEventListener('click', function(){ qImport($('qShareTx').value); });
  $('qClear').addEventListener('click', function(){ if(!queue.length) return; if($('qClear').getAttribute('data-arm')==='1'){ queue=[]; saveQueue(); $('qClear').textContent='ניקוי התור'; $('qClear').removeAttribute('data-arm'); } else { $('qClear').textContent='בטוח? לחצו שוב'; $('qClear').setAttribute('data-arm','1'); setTimeout(function(){ $('qClear').textContent='ניקוי התור'; $('qClear').removeAttribute('data-arm'); }, 3000); } });
  // road route through the queue (OSRM, internet): real miles and time, drawn on the map
  function drawRoad(r){
    qRoad=r;
    var src=map.getSource('qroad'); if(src) src.setData(r ? {type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:r.pts}} : featColl([]));
    $('qRoadTx').innerHTML = r ? 'בכביש: <span class="lat">'+fmtMi(r.mi)+' mi</span> · '+r.hh : '';
  }
  $('qRoad').addEventListener('click', function(){
    if(!queue.filter(function(s){ return !s.done; }).length){ toast('הוסיפו עצירות לתור.'); return; }
    if(!netUp()) toast('בלי אינטרנט הקו מוצג בהערכה (מקווקו). הדרך המדויקת תחושב כשיהיה חיבור.', 4200);
    planRoute(); toggleQueue(false); setFollow(geo.pos?1:0);
    var pts=queue.filter(function(s){ return !s.done; }).map(function(s){ return [s.lng, s.lat]; }); if(geo.pos) pts.push([geo.pos.lng, geo.pos.lat]);
    if(pts.length) map.fitBounds(bboxOf(pts), {padding:{top:130,bottom:150,left:70,right:64}, maxZoom:11});
  });

  /* ---------- a point on the map (long press / right click) ---------- */
  var pinMarker=null;
  function pinAt(ll){
    if(!pinMarker){ var el=document.createElement('div'); el.className='pinmk'; pinMarker=new maplibregl.Marker({element:el}).setLngLat(ll).addTo(map); } else pinMarker.setLngLat(ll);
    selected=null;
    var s={n:'נקודה במפה', lat:+ll.lat.toFixed(5), lng:+ll.lng.toFixed(5), k:'נקודה'};
    sheetBody.innerHTML='<div class="mini"><div class="k">נקודה שבחרתם</div><h3 id="pinName">'+esc(s.n)+'</h3><div class="cen" id="pinAddr">'+ll.lat.toFixed(5)+', '+ll.lng.toFixed(5)+'</div>'+
      '<div class="navbtns"><a class="wz" target="_blank" rel="noopener" href="'+wazeLL(ll.lat,ll.lng)+'">נווט בוויז</a><a target="_blank" rel="noopener" href="'+gmapsLL(ll.lat,ll.lng)+'">Google Maps</a></div>'+
      '<div class="navbtns">'+qBtn(s)+'</div></div>';
    hideQ(); sheet.hidden=false; sheet.scrollTop=0; $('nav').hidden=true; syncQButtons();
    if(map.getLayer('poi-sel')) map.setFilter('poi-sel', ['==',['get','id'],'']);
    if(netUp()) jfetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat='+ll.lat+'&lon='+ll.lng, 8000).then(function(j){
      var a=j.address||{}, nm=j.name || a.road || a.hamlet || a.village || a.town || a.city || '', loc=[a.city||a.town||a.village||a.county||'', a.state||''].filter(Boolean).join(', ');
      if(!$('pinName')) return;
      if(nm){ $('pinName').textContent=nm; s.n=nm+(loc?' ('+loc+')':''); var b=sheetBody.querySelector('[data-q]'); if(b) b.setAttribute('data-q', attr(s)); }
      if(loc) $('pinAddr').textContent=(j.display_name||loc).slice(0,120);
    }).catch(function(){});
  }
  function longPress(){
    var c=map.getCanvasContainer(), t=null, p0=null;
    c.addEventListener('touchstart', function(e){ if(e.touches.length!==1){ clearTimeout(t); return; } p0=[e.touches[0].clientX, e.touches[0].clientY]; clearTimeout(t); t=setTimeout(function(){ t=null; var r=c.getBoundingClientRect(); pinAt(map.unproject([p0[0]-r.left, p0[1]-r.top])); }, 650); }, {passive:true});
    c.addEventListener('touchmove', function(e){ if(!t || !p0) return; var dx=e.touches[0].clientX-p0[0], dy=e.touches[0].clientY-p0[1]; if(dx*dx+dy*dy>100){ clearTimeout(t); t=null; } }, {passive:true});
    c.addEventListener('touchend', function(){ clearTimeout(t); t=null; }, {passive:true});
    c.addEventListener('touchcancel', function(){ clearTimeout(t); t=null; }, {passive:true});
    map.on('contextmenu', function(e){ e.preventDefault(); pinAt(e.lngLat); });
  }

  /* ---------- nearby places (OpenStreetMap via Overpass, internet) ---------- */
  var NEAR_CATS=[
    {id:'fuel', he:'דלק', q:'nwr["amenity"="fuel"]', c:'#4A5FC1', icon:'local_gas_station', z:11},
    {id:'ev', he:'טעינה', q:'nwr["amenity"="charging_station"]', c:'#188038', icon:'ev_station', z:9},
    {id:'rest', he:'תחנת מנוחה', q:'nwr["highway"~"^(rest_area|services)$"]', c:'#4A5FC1', icon:'rest_area', z:8},
    {id:'park', he:'פארקים', q:'nwr["leisure"~"^(park|nature_reserve|garden)$"]["name"]', c:'#2C7A3F', icon:'park', z:11},
    {id:'view', he:'תצפיות ואתרים', q:'nwr["tourism"~"^(viewpoint|attraction)$"]["name"]', c:'#12828F', icon:'binoculars', z:10},
    {id:'food', he:'אוכל', q:'nwr["amenity"~"^(restaurant|fast_food)$"]', c:'#E8710A', icon:'restaurant', z:12},
    {id:'cafe', he:'קפה', q:'nwr["amenity"="cafe"]', c:'#A0522D', icon:'local_cafe', z:12},
    {id:'shop', he:'סופר', q:'nwr["shop"~"^(supermarket|convenience)$"]', c:'#0B7FAB', icon:'shopping_cart', z:11},
    {id:'sleep', he:'לינה', q:'nwr["tourism"~"^(hotel|motel|camp_site|guest_house)$"]', c:'#8E44AD', icon:'hotel', z:10},
    {id:'pharm', he:'בית מרקחת', q:'nwr["amenity"="pharmacy"]', c:'#D93025', icon:'local_pharmacy', z:11},
    {id:'med', he:'רפואה', q:'nwr["amenity"~"^(hospital|clinic)$"]', c:'#B3261E', icon:'local_hospital', z:10},
    {id:'atm', he:'כספומט', q:'nwr["amenity"~"^(atm|bank)$"]', c:'#5F6368', icon:'atm', z:12},
    {id:'wc', he:'שירותים', q:'nwr["amenity"="toilets"]', c:'#5F6368', icon:'wc', z:12}
  ];
  var NEAR_BY={}; NEAR_CATS.forEach(function(c){ NEAR_BY[c.id]=c; });
  var near={cat:null, feats:[], bb:null, busy:false, t:null};
  var OVP=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  function nearChips(){
    $('nearChips').innerHTML=NEAR_CATS.map(function(c){ return '<button class="chip" type="button" data-c="'+c.id+'" style="--c:'+c.c+'" aria-pressed="false"><img alt="" src="'+badgeCanvas(c.icon, c.c, 18, null, 2).toDataURL()+'">'+c.he+'</button>'; }).join('');
  }
  $('nearChips').addEventListener('click', function(e){
    var b=e.target.closest('button'); if(!b) return;
    var id=b.getAttribute('data-c');
    setNear(near.cat===id ? null : id);
  });
  function setNear(id){
    near.cat=id; near.bb=null;
    Array.prototype.forEach.call($('nearChips').children, function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-c')===id?'true':'false'); });
    if(!id){ near.feats=[]; setNearData(); $('nearNote').textContent='בחרו סוג מקום. התוצאות מ-OpenStreetMap לאזור שרואים במפה.'; return; }
    nearLoad();
  }
  function setNearData(){ var s=map.getSource('near'); if(s) s.setData(featColl(near.feats)); }
  function nearLoad(){
    var c=NEAR_BY[near.cat]; if(!c) return;
    if(!netUp()){ $('nearNote').textContent='צריך אינטרנט. בלי חיבור, תחנות דלק ומלונות מופיעים במפה עצמה כשמתקרבים.'; return; }
    if(map.getZoom()<c.z){ $('nearNote').textContent='התקרבו עוד קצת למפה (האזור גדול מדי לחיפוש).'; return; }
    var b=map.getBounds(), bb=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()];
    if(near.bb && bb[0]>=near.bb[0] && bb[1]>=near.bb[1] && bb[2]<=near.bb[2] && bb[3]<=near.bb[3]) return;
    var dy=(bb[2]-bb[0])*.3, dx=(bb[3]-bb[1])*.3; bb=[bb[0]-dy, bb[1]-dx, bb[2]+dy, bb[3]+dx];
    if(near.busy) return; near.busy=true;
    $('nearNote').textContent='מחפש '+c.he+'…';
    var q='[out:json][timeout:25];('+c.q+'('+bb.map(function(v){ return v.toFixed(4); }).join(',')+'););out center 160;';
    var cat=near.cat;
    function tryAt(i){
      if(i>=OVP.length) return Promise.reject(new Error('all'));
      return jfetch(OVP[i]+'?data='+encodeURIComponent(q), 30000).catch(function(){ return tryAt(i+1); });
    }
    tryAt(0).then(function(j){
      if(near.cat!==cat) return;
      near.bb=bb;
      near.feats=(j.elements||[]).map(function(el){
        var lat=el.lat!=null?el.lat:(el.center&&el.center.lat), lon=el.lon!=null?el.lon:(el.center&&el.center.lon); if(lat==null) return null;
        var t=el.tags||{}, nm=t.name||t.brand||t.operator||c.he;
        return {type:'Feature', properties:{id:el.type+el.id, n:nm, c:c.c, cat:cat, tags:JSON.stringify({brand:t.brand, hours:t.opening_hours, phone:t.phone||t['contact:phone'], web:t.website||t['contact:website'], cuisine:t.cuisine, fuel:t['fuel:diesel']?'דיזל':'', addr:[t['addr:housenumber'],t['addr:street'],t['addr:city']].filter(Boolean).join(' ')})}, geometry:{type:'Point', coordinates:[lon,lat]}};
      }).filter(Boolean);
      setNearData();
      $('nearNote').innerHTML=(near.feats.length? near.feats.length+' '+c.he+' באזור הזה' : 'לא נמצאו '+c.he+' באזור הזה')+(near.feats.length>=160?' (יש עוד; התקרבו)':'')+' <button type="button" id="nearList">רשימה לפי מרחק</button>';
    }).catch(function(){ if(near.cat===cat) $('nearNote').textContent='החיפוש לא הצליח כרגע. נסו שוב בעוד רגע.'; }).then(function(){ near.busy=false; });
  }
  $('nearNote').addEventListener('click', function(e){ if(e.target && e.target.id==='nearList') nearListSheet(); });
  function nearStop(p, co){ return {id:'osm:'+p.id, n:p.n, lat:+co[1].toFixed(5), lng:+co[0].toFixed(5), k:NEAR_BY[p.cat]?NEAR_BY[p.cat].he:''}; }
  function nearListSheet(){
    var c=NEAR_BY[near.cat]; if(!c || !near.feats.length) return;
    var ref=geo.pos ? [geo.pos.lng,geo.pos.lat] : [map.getCenter().lng, map.getCenter().lat];
    var rows=near.feats.map(function(f){ return {f:f, d:miOf(hav(ref, f.geometry.coordinates))}; }).sort(function(a,b){ return a.d-b.d; }).slice(0,30);
    selected=null;
    sheetBody.innerHTML='<div class="mini"><div class="k">'+esc(c.he)+' · '+(geo.pos?'מרחק ממני':'מרחק ממרכז המפה')+'</div><div class="nlist">'+rows.map(function(r){ var p=r.f.properties, t={}; try{ t=JSON.parse(p.tags); }catch(e){}
      return '<button type="button" data-nid="'+esc(p.id)+'" style="--c:'+p.c+'"><img class="ni" alt="" src="'+badgeCanvas(c.icon, c.c, 22, null, 2).toDataURL()+'"><span style="flex:1;min-width:0"><b>'+esc(p.n)+'</b><small>'+esc([t.brand,t.addr,t.hours].filter(Boolean).join(' · '))+'</small></span><span class="lat">'+fmtMi(r.d)+' mi</span></button>'; }).join('')+'</div></div>';
    hideQ(); sheet.hidden=false; sheet.scrollTop=0; $('nav').hidden=true;
  }
  function selectNear(f){
    var p=f.properties, t={}; try{ t=JSON.parse(p.tags||'{}'); }catch(e){}
    var co=f.geometry.coordinates, c=NEAR_BY[p.cat]||{he:'מקום'};
    var ref=geo.pos ? [geo.pos.lng,geo.pos.lat] : null, d= ref ? miOf(hav(ref, co)) : null;
    var rows=[]; if(t.brand && t.brand!==p.n) rows.push(esc(t.brand)); if(t.addr) rows.push(esc(t.addr)); if(t.hours) rows.push('🕒 '+esc(t.hours)); if(t.cuisine) rows.push(esc(t.cuisine.replace(/_/g,' '))); if(t.fuel) rows.push(t.fuel);
    if(t.phone) rows.push('<a href="tel:'+esc(t.phone)+'">'+esc(t.phone)+'</a>'); if(t.web) rows.push('<a target="_blank" rel="noopener" href="'+esc(t.web)+'">אתר ↗</a>');
    selected=null;
    sheetBody.innerHTML='<div class="mini"><div class="k">'+esc(c.he)+(d!=null?' · <span class="lat">'+fmtMi(d)+' mi</span> ממני':'')+'</div><h3>'+esc(p.n)+'</h3>'+(rows.length?'<div class="tagrow">'+rows.join('<span>·</span>')+'</div>':'')+
      '<div class="navbtns"><a class="wz" target="_blank" rel="noopener" href="'+wazeLL(co[1],co[0])+'">נווט בוויז</a><a target="_blank" rel="noopener" href="'+gmapsLL(co[1],co[0])+'">Google Maps</a></div>'+
      '<div class="navbtns">'+qBtn(nearStop(p,co))+'</div></div>';
    hideQ(); sheet.hidden=false; sheet.scrollTop=0; $('nav').hidden=true; syncQButtons();
    if(map.getLayer('poi-sel')) map.setFilter('poi-sel', ['==',['get','id'],'']);
  }
  sheet.addEventListener('click', function(e){
    var b=e.target.closest ? e.target.closest('[data-nid]') : null; if(!b) return;
    var id=b.getAttribute('data-nid'), f=null; near.feats.forEach(function(x){ if(x.properties.id===id) f=x; }); if(!f) return;
    setFollow(geo.pos?1:0); map.flyTo({center:f.geometry.coordinates, zoom:Math.max(map.getZoom(),14), duration:900}); selectNear(f);
  });
  $('bNear').addEventListener('click', function(){ var bar=$('nearbar'); bar.hidden=!bar.hidden; $('bNear').setAttribute('aria-expanded', bar.hidden?'false':'true'); togglePop(false); if(bar.hidden) setNear(null); });
  map.on('moveend', function(){ if(!near.cat) return; clearTimeout(near.t); near.t=setTimeout(nearLoad, 700); });
  function extMapClick(e){
    if(map.getLayer('near-dot')){
      var h=map.queryRenderedFeatures([[e.point.x-8,e.point.y-8],[e.point.x+8,e.point.y+8]], {layers:['near-dot']});
      if(h.length){ var f=null; near.feats.forEach(function(x){ if(x.properties.id===h[0].properties.id) f=x; }); if(f){ selectNear(f); return true; } }
    }
    return false;
  }
  function extFeatureButtons(name, kind, ll){ hideQ(); setTimeout(syncQButtons,0); return '<div class="navbtns">'+qBtn({n:name, lat:+ll.lat.toFixed(5), lng:+ll.lng.toFixed(5), k:kind})+'</div>'; }

  function extOnLoad(){
    map.addSource('qroad', {type:'geojson', data:featColl([])});
    map.addLayer({id:'qroad-case', type:'line', source:'qroad', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],3,5,12,11]}}, firstOf(['route-case']));
    map.addLayer({id:'qroad', type:'line', source:'qroad', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#BC2F5C','line-width':['interpolate',['linear'],['zoom'],3,2.5,12,6],'line-dasharray':[1.5,1.2]}}, firstOf(['route-case']));
    map.addSource('near', {type:'geojson', data:featColl([])});
    map.addLayer({id:'near-dot', type:'symbol', source:'near', layout:{'icon-image':['concat','n-',['get','cat']], 'icon-size':['interpolate',['linear'],['zoom'],8,.6,13,1], 'icon-allow-overlap':true, 'icon-padding':0}}, firstOf(['poi-dot']));
    map.addLayer({id:'near-label', type:'symbol', source:'near', minzoom:11, layout:{'text-field':['get','n'],'text-font':['Noto Sans Regular'],'text-size':11.5,'text-anchor':'top','text-offset':[0,1.25],'text-max-width':8,'text-optional':true}, paint:{'text-color':['get','c'],'text-halo-color':'#fff','text-halo-width':1.5}}, firstOf(['poi-dot']));
    map.on('mouseenter','near-dot', function(){ map.getCanvas().style.cursor='pointer'; });
    map.on('mouseleave','near-dot', function(){ map.getCanvas().style.cursor=''; });
    nearChips(); renderQueue(); longPress(); pwaInit();
    if(IN_FRAME){ $('bNear').hidden=true; }
  }
  renderQueue();
