  /* ================================================================
     app: tab bar, money, compass, our own must-sees, the blue line through our stops, events
     ================================================================ */
  var EVENTS=__EVENTS__;

  /* ---------- tabs ---------- */
  function syncTabs(){
    var t = !$('fpanel').hidden ? 'money' : !$('epanel').hidden ? 'events' : !$('spanel').hidden ? 'sleep' : !$('gpanel').hidden ? 'fuel' : !panel.hidden ? 'list' : !$('qpanel').hidden ? 'queue' : 'map';
    Array.prototype.forEach.call($('tabbar').children, function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-tab')===t?'true':'false'); });
    $('iosComp').hidden = t!=='map';
    $('gchips').hidden = t!=='map';
  }
  function setTab(t){
    if(t!=='list' && !panel.hidden) openPanel(false);
    if(t!=='queue' && !$('qpanel').hidden) toggleQueue(false);
    $('fpanel').hidden = t!=='money';
    $('epanel').hidden = t!=='events';
    $('spanel').hidden = t!=='sleep';
    $('gpanel').hidden = t!=='fuel';
    if(t==='list' && panel.hidden) openPanel(true);
    if(t==='queue' && $('qpanel').hidden) toggleQueue(true);
    if(t==='events') renderEvents();
    if(t==='sleep') sleepOpen();
    if(t==='fuel') fuelOpen();
    if(t==='money' && FIN) FIN.refresh();
    if(t!=='map'){ togglePop(false); if(!sheet.hidden && t!=='queue') closeSheet(); }
    syncTabs();
  }
  $('tabbar').addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) setTab(b.getAttribute('data-tab')); });
  $('fclose').addEventListener('click', function(){ setTab('map'); });
  $('eclose').addEventListener('click', function(){ setTab('map'); });

  /* ---------- money ---------- */
  var FIN=null;
  function loadScript(src){ return new Promise(function(res, rej){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  function saveText(name, text){
    if(IN_FRAME){
      var p=(window.claude && window.claude.use) ? window.claude.use('downloads') : Promise.resolve(null);
      Promise.resolve(p).catch(function(){ return null; }).then(function(dl){ if(dl) dl.save({filename:name, data:text}).catch(function(){}); else toast('השמירה לא זמינה בתצוגה הזו.'); });
      return;
    }
    try{ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text], {type:'text/csv'})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }catch(e){ toast('השמירה לא הצליחה.'); }
  }
  function finStart(){
    try{
      FIN=finInit($('fin'), {toast:toast, download:saveText, loadScript:loadScript, claude:false, fire:!!(HOST && HOST.sw) && !IN_FRAME, docs:['queue','must','picks'], onDoc:onRemoteDoc, builtin:FB_BUILTIN});
    }catch(e){ FIN=null; }
  }
  // the queue, our must-sees and my-route stars travel with the money sync (when it is connected)
  var qT=+(lsGet('rt_qT')||0), mT=+(lsGet('rt_mT')||0);
  function onRemoteDoc(name, d){
    if(!d) return;
    if(name==='queue' && Array.isArray(d.items) && (+d.t||0)>qT){ qT=+d.t; lsSet('rt_qT', String(qT)); queue=d.items; lsSet(QKEY, JSON.stringify(queue)); renderQueue(); planRoute(); refreshPoiLabels(); remoteNote('התור'); }
    if(name==='must' && d.ids && (+d.t||0)>mT){ mT=+d.t; lsSet('rt_mT', String(mT)); MUST=d.ids; lsSet('rt_must', JSON.stringify(MUST)); mustChanged(false); remoteNote('החובה'); }
    if(name==='picks' && remotePicks(d)) remoteNote('המסלול שלי');
  }
  function queueChanged(){
    qT=Date.now(); lsSet('rt_qT', String(qT));
    if(FIN) FIN.setDoc('queue', {items:queue, t:qT});
    planRoute(); refreshPoiLabels();
  }

  /* ---------- our own must-sees (on top of the list's), glowing on the map ---------- */
  var MUST;   // read lazily: the list is drawn before this part of the script runs
  function mustMap(){ if(!MUST){ try{ MUST=JSON.parse(lsGet('rt_must')||'{}')||{}; }catch(e){ MUST={}; } } return MUST; }
  function isMust(it){ var m=mustMap(); return m[it.id]!=null ? !!m[it.id] : it.w>=5; }
  function mustBtn(it){ var on=isMust(it); return '<button class="mustbtn" type="button" data-must="'+esc(it.id)+'" aria-pressed="'+(on?'true':'false')+'">'+(on?'חובה ★':'לסמן כחובה ☆')+'</button>'; }
  function toggleMust(id){
    var it=ITEMBY[id]; if(!it) return;
    var on=!isMust(it);
    mustMap(); if(on===(it.w>=5)) delete MUST[id]; else MUST[id]=on?1:0;
    mT=Date.now(); lsSet('rt_mT', String(mT)); lsSet('rt_must', JSON.stringify(MUST));
    if(FIN) FIN.setDoc('must', {ids:MUST, t:mT});
    toast(on ? 'סומן כחובה. זוהר במפה.' : 'הוסר מהחובה.', 2200);
    mustChanged(true);
  }
  function mustChanged(){
    refreshPoiLabels();
    Array.prototype.forEach.call(document.querySelectorAll('[data-must]'), function(b){ var it=ITEMBY[b.getAttribute('data-must')]; if(!it) return; var on=isMust(it); b.setAttribute('aria-pressed', on?'true':'false'); b.textContent = b.classList.contains('maplink') ? (on?'חובה ★':'חובה ☆') : (on?'חובה ★':'לסמן כחובה ☆'); });
    Array.prototype.forEach.call(document.querySelectorAll('article.card[data-pid]'), function(el){ var it=ITEMBY[el.getAttribute('data-pid')]; if(it){ el.classList.toggle('must', isMust(it)); el.classList.toggle('mymust', mustMap()[it.id]===1); } });
    if(state.must) render();
  }
  document.addEventListener('click', function(e){ var b=e.target.closest ? e.target.closest('[data-must]') : null; if(b){ e.stopPropagation(); toggleMust(b.getAttribute('data-must')); } }, true);
  var glowT=null;
  function glowStart(){
    if(glowT || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var t0=performance.now();
    glowT=setInterval(function(){
      if(document.hidden || !map.getLayer('poi-glow')) return;
      var k=(Math.sin((performance.now()-t0)/520)+1)/2;
      map.setPaintProperty('poi-glow', 'circle-opacity', .35+.4*k);
      map.setPaintProperty('poi-glow', 'circle-radius', ['interpolate',['linear'],['zoom'],4,7+3*k,9,15+5*k,13,20+6*k]);
    }, 90);
  }

  /* ---------- compass ---------- */
  var HEAD={on:false, deg:null, abs:false};
  function compassTicks(){
    var s='';
    for(var a=0;a<360;a+=30){ var r=a*Math.PI/180, x1=20+16*Math.sin(r), y1=20-16*Math.cos(r), x2=20+18.5*Math.sin(r), y2=20-18.5*Math.cos(r); s+='<line class="tk" x1="'+x1.toFixed(2)+'" y1="'+y1.toFixed(2)+'" x2="'+x2.toFixed(2)+'" y2="'+y2.toFixed(2)+'"></line>'; }
    return s;
  }
  $('iosComp').innerHTML='<svg viewBox="0 0 40 40" id="iosCompSvg" aria-hidden="true">'+compassTicks()+'<path d="M20 3.2l3.4 6.2h-6.8z" fill="#FF3B30"></path><text x="20" y="22.6" text-anchor="middle">N</text></svg>';
  map.on('rotate', function(){ $('iosCompSvg').style.transform='rotate('+(-map.getBearing())+'deg)'; });
  $('iosComp').addEventListener('click', function(){
    if(Math.abs(map.getBearing())>1 || map.getPitch()>1){ if(geo.mode===3) setFollow(2); map.easeTo({bearing:0, pitch:state.t3d?map.getPitch():0, duration:500}); return; }
    openCompass();
  });
  function dialSVG(){
    var s='<svg viewBox="-160 -160 320 320" role="img" aria-label="מצפן"><g id="dial">';
    for(var a=0;a<360;a+=2){ var big=a%30===0, mid=a%10===0, r1=big?118:mid?122:126, r=a*Math.PI/180;
      s+='<line x1="'+(r1*Math.sin(r)).toFixed(1)+'" y1="'+(-r1*Math.cos(r)).toFixed(1)+'" x2="'+(134*Math.sin(r)).toFixed(1)+'" y2="'+(-134*Math.cos(r)).toFixed(1)+'" stroke="'+(a===0?'#FF3B30':big?'#fff':'#8e8e93')+'" stroke-width="'+(big?2.4:1.2)+'"></line>';
      if(big) s+='<text x="'+(148*Math.sin(r)).toFixed(1)+'" y="'+(-148*Math.cos(r)+4.5).toFixed(1)+'" text-anchor="middle" font-size="12" transform="rotate(0)">'+a+'</text>'; }
    [['N',0,'#FF3B30'],['E',90,'#fff'],['S',180,'#fff'],['W',270,'#fff']].forEach(function(c){ var r=c[1]*Math.PI/180; s+='<text x="'+(96*Math.sin(r)).toFixed(1)+'" y="'+(-96*Math.cos(r)+10).toFixed(1)+'" text-anchor="middle" font-size="30" font-weight="500" fill="'+c[2]+'">'+c[0]+'</text>'; });
    s+='</g><line x1="0" y1="-136" x2="0" y2="-108" stroke="#fff" stroke-width="3"></line><line x1="-18" y1="0" x2="18" y2="0" stroke="#8e8e93" stroke-width="1.4"></line><line x1="0" y1="-18" x2="0" y2="18" stroke="#8e8e93" stroke-width="1.4"></line></svg>';
    return s;
  }
  var DIRS=['צפון','צפון-מזרח','מזרח','דרום-מזרח','דרום','דרום-מערב','מערב','צפון-מערב'], DIRL=['N','NE','E','SE','S','SW','W','NW'];
  function openCompass(){
    var d=$('compDlg'); d.hidden=false;
    if(!d.getAttribute('data-built')){ $('compDial').innerHTML=dialSVG(); d.setAttribute('data-built','1'); }
    drawHeading();
    if(!HEAD.on) startHeading(true);
  }
  $('compClose').addEventListener('click', function(){ $('compDlg').hidden=true; });
  $('compGo').addEventListener('click', function(){ startHeading(true); });
  function drawHeading(){
    var h=HEAD.deg, dial=document.getElementById('dial');
    if(h==null){ $('compDeg').innerHTML='—'; $('compDir').textContent=''; }
    else { var i=Math.round(h/45)%8; $('compDeg').innerHTML=Math.round(h)+'°<small>'+DIRL[i]+'</small>'; $('compDir').textContent=DIRS[i]; if(dial) dial.setAttribute('transform','rotate('+(-h).toFixed(1)+')'); }
    $('compLL').innerHTML = geo.pos ? (Math.abs(geo.pos.lat).toFixed(4)+'° '+(geo.pos.lat>=0?'N':'S')+'  '+Math.abs(geo.pos.lng).toFixed(4)+'° '+(geo.pos.lng>=0?'E':'W')+(geo.pos.alt!=null?'<br>'+Math.round(geo.pos.alt*3.28084).toLocaleString('en-US')+' ft':'')) : '';
  }
  function onOrient(e){
    var h=null;
    if(e.webkitCompassHeading!=null) h=e.webkitCompassHeading;
    else if((e.type==='deviceorientationabsolute' || e.absolute===true) && e.alpha!=null) h=360-e.alpha;
    if(h==null || isNaN(h)) return;
    var so=(screen.orientation && screen.orientation.angle) || window.orientation || 0;
    h=(h+so+360)%360;
    HEAD.deg = HEAD.deg==null ? h : (function(a,b){ var d=((b-a+540)%360)-180; return (a+d*.35+360)%360; })(HEAD.deg, h);
    if(!$('compDlg').hidden) drawHeading();
    if(geo.marker && geo.el && (geo.pos && !(geo.pos.speed>2))){ geo.el.classList.remove('nohead'); geo.marker.setRotation(HEAD.deg); }
  }
  function startHeading(fromClick){
    if(IN_FRAME){ $('compMsg').textContent='בתצוגה הזו (דף Claude) אין גישה למצפן של הטלפון. באפליקציה עצמה זה עובד.'; return; }
    function listen(){
      HEAD.on=true; $('compGo').hidden=true;
      window.addEventListener('deviceorientationabsolute', onOrient);
      window.addEventListener('deviceorientation', onOrient);
      $('compMsg').textContent='החזיקו את הטלפון שטוח. אם הכיוון לא מדויק, הזיזו אותו בצורת 8.';
      setTimeout(function(){ if(HEAD.deg==null) $('compMsg').textContent='אין חיישן מצפן במכשיר הזה (במחשב זה רגיל).'; }, 2500);
    }
    var DOE=window.DeviceOrientationEvent;
    if(DOE && typeof DOE.requestPermission==='function'){
      if(!fromClick){ $('compGo').hidden=false; return; }
      DOE.requestPermission().then(function(r){ if(r==='granted') listen(); else $('compMsg').textContent='צריך לאשר גישה לחיישני תנועה כדי שהמצפן יעבוד.'; }, function(){ $('compGo').hidden=false; $('compMsg').textContent='לחצו ״הפעלת המצפן״ ואשרו.'; });
    } else if(DOE) listen();
    else $('compMsg').textContent='אין מצפן בדפדפן הזה.';
  }

  /* ---------- the blue line goes through our stops ---------- */
  var RC=null, DET={busy:false, t:null};
  function routeMiles(){
    if(RC) return RC;
    RC=new Float64Array(ROUTE.length);
    for(var i=1;i<ROUTE.length;i++) RC[i]=RC[i-1]+hav(ROUTE[i-1], ROUTE[i])/1609.34;
    return RC;
  }
  function idxAtMile(m){ var a=0, b=RC.length-1; while(a<b){ var c=(a+b)>>1; if(RC[c]<m) a=c+1; else b=c; } return a; }
  function nearestIdx(lng, lat){
    // coarse: the simplified route gives the mile, then refine on the full line nearby
    var pr=project(lng, lat), i0=idxAtMile(Math.max(0, pr.mile-25)), i1=idxAtMile(pr.mile+25), best=1e18, bi=i0, cl=Math.cos(lat*Math.PI/180);
    for(var i=i0;i<=i1;i++){ var dx=(ROUTE[i][0]-lng)*cl, dy=ROUTE[i][1]-lat, d=dx*dx+dy*dy; if(d<best){ best=d; bi=i; } }
    return {i:bi, mi:RC[bi], off:Math.sqrt(best)*69.05};
  }
  function detKey(pts){ return 'rt_det_'+pts.map(function(p){ return p[0].toFixed(3)+','+p[1].toFixed(3); }).join(';'); }
  function clusters(){
    routeMiles();
    var st=[];
    queue.forEach(function(s,qi){ if(s.done || s.lat==null) return; var n=nearestIdx(s.lng, s.lat); if(n.off<.25) return; var w=Math.max(2, Math.min(70, n.off*1.15)); st.push({s:s, qi:qi, mi:n.mi, a:Math.max(0,n.mi-w), b:Math.min(RC[RC.length-1], n.mi+w), off:n.off}); });
    st.sort(function(x,y){ return x.a-y.a; });
    var cl=[];
    st.forEach(function(x){ var c=cl[cl.length-1]; if(c && x.a<=c.b){ c.b=Math.max(c.b,x.b); c.st.push(x); } else cl.push({a:x.a, b:x.b, st:[x]}); });
    cl.forEach(function(c){ c.st.sort(function(x,y){ return x.qi-y.qi; }); c.ia=idxAtMile(c.a); c.ib=idxAtMile(c.b); c.pts=[ROUTE[c.ia]].concat(c.st.map(function(x){ return [x.s.lng, x.s.lat]; }), [ROUTE[c.ib]]); c.key=detKey(c.pts);
      var hit=null; try{ hit=JSON.parse(lsGet(c.key)||'null'); }catch(e){} c.geo=hit; });
    return cl;
  }
  function drawPlan(cl){
    var main=[], det=[], est=[], skip=[], last=0, addMi=0, addH=0, exact=true;
    cl.forEach(function(c){
      if(c.ia>last) main.push(ROUTE.slice(last, c.ia+1));
      skip.push(ROUTE.slice(c.ia, c.ib+1));
      if(c.geo){ det.push(decP(c.geo.g, 1e5)); addMi+=c.geo.mi-(RC[c.ib]-RC[c.ia]); addH+=c.geo.h-(RC[c.ib]-RC[c.ia])/58; }
      else { est.push(c.pts); exact=false; var m=0; for(var i=1;i<c.pts.length;i++) m+=hav(c.pts[i-1],c.pts[i])/1609.34*1.25; addMi+=m-(RC[c.ib]-RC[c.ia]); addH+=(m-(RC[c.ib]-RC[c.ia]))/50; }
      last=c.ib;
    });
    main.push(ROUTE.slice(last));
    var lines=main.concat(det).map(function(l){ return {type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:l}}; });
    if(map.getSource('route')) map.getSource('route').setData(featColl(lines));
    if(map.getSource('qdet')) map.getSource('qdet').setData(featColl(est.map(function(l){ return {type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:l}}; })));
    if(map.getSource('qskip')) map.getSource('qskip').setData(featColl(skip.map(function(l){ return {type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:l}}; })));
    var el=$('qDet');
    if(!cl.length){ el.innerHTML=''; return; }
    var hh=Math.max(0,addH), h=Math.floor(hh), mm=Math.round((hh-h)*60);
    el.innerHTML='הקו הכחול עובר עכשיו דרך '+cl.reduce(function(s,c){ return s+c.st.length; },0)+' עצירות: <b class="lat">+'+fmtMi(Math.max(0,addMi))+' mi</b> · <b>+'+(h?h+':'+(mm<10?'0':'')+mm+' ש׳':mm+' דק׳')+'</b>'+(exact?'':' (הערכה; יתעדכן בדרך המדויקת כשיהיה אינטרנט)');
  }
  function planRoute(){
    clearTimeout(DET.t);
    DET.t=setTimeout(function(){
      if(!styleReady) return;
      var cl=clusters(); drawPlan(cl);
      var miss=cl.filter(function(c){ return !c.geo; });
      if(!miss.length || !netUp() || DET.busy) return;
      DET.busy=true;
      var chain=Promise.resolve();
      miss.forEach(function(c){
        chain=chain.then(function(){
          return jfetch('https://router.project-osrm.org/route/v1/driving/'+c.pts.map(function(p){ return p[0].toFixed(5)+','+p[1].toFixed(5); }).join(';')+'?overview=full&geometries=polyline', 20000).then(function(j){
            var r=j.routes && j.routes[0]; if(!r) return;
            c.geo={g:r.geometry, mi:r.distance/1609.34, h:r.duration/3600};
            lsSet(c.key, JSON.stringify(c.geo));
          }).catch(function(){}).then(function(){ return new Promise(function(res){ setTimeout(res, 350); }); });
        });
      });
      chain.then(function(){ DET.busy=false; drawPlan(cl); });
    }, 500);
  }

  /* ---------- events along the way ---------- */
  var EV_TYPE={concert:['music_note','#7E57C2','הופעה'], sports:['stadium','#1A5FB4','ספורט'], motorsport:['sports_score','#C2185B','מרוץ'], festival:['festival','#E07020','פסטיבל'], market:['storefront','#0B7FAB','שוק'], fair:['attractions','#D4A017','יריד'], rodeo:['rodeo','#8B5E34','רודאו'], parade:['celebration','#C2185B','מצעד'], holiday:['celebration','#2C8A5E','חג ואורות'], show:['theater_comedy','#12828F','מופע'], other:['event','#5F6368','אירוע']};
  function evType(e){ return EV_TYPE[e.type]||EV_TYPE.other; }
  function tripDates(){
    var s=null; try{ s=JSON.parse(lsGet('fin_s')||'null'); }catch(e){}
    return {start:(s&&s.start)||'2026-12-14', end:(s&&s.end)||'2027-02-15'};
  }
  function dParse(s){ var p=String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function dFmt(d, wd){ return (wd?['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'][d.getDay()]+' ':'')+d.getDate()+'.'+(d.getMonth()+1); }
  function etaAt(mile){
    // a rough guess of when we pass each mile: New York → Miami before the start date, then evenly to Phoenix
    var td=tripDates(), st=dParse(td.start), en=dParse(td.end), MIA=1330, END=NAV.total||5660, day=864e5;
    if(mile<=MIA) return new Date(st.getTime()-(MIA-mile)/MIA*13*day);
    return new Date(st.getTime()+(mile-MIA)/(END-MIA)*(en-st));
  }
  function evPrep(){
    if(EVENTS.__p) return; EVENTS.__p=1;
    EVENTS.forEach(function(e){ var pr=project(e.n, e.g); e.mi=pr.mile; e.off=pr.km/1.609; e.eta=etaAt(pr.mile); e.sd=dParse(e.start); e.ed=dParse(e.end||e.start);
      var gap=e.eta<e.sd ? (e.sd-e.eta)/864e5 : e.eta>e.ed ? (e.eta-e.ed)/864e5 : 0; e.gap=Math.round(gap); });
  }
  var evState={st:'', fit:false, sort:'route'};
  function renderEvents(){
    evPrep();
    var sel=$('evState');
    if(!sel.options.length){
      var seen={}, order=[]; EVENTS.slice().sort(function(a,b){ return a.mi-b.mi; }).forEach(function(e){ if(!seen[e.state]){ seen[e.state]=1; order.push(e.state); } });
      sel.innerHTML='<option value="">כל המדינות ('+EVENTS.length+')</option>'+order.map(function(s){ return '<option value="'+esc(s)+'">'+esc(s)+'</option>'; }).join('');
    }
    var list=EVENTS.filter(function(e){ return (!evState.st || e.state===evState.st) && (!evState.fit || e.gap<=6); });
    list.sort(evState.sort==='date' ? function(a,b){ return a.sd-b.sd; } : function(a,b){ return a.mi-b.mi || a.sd-b.sd; });
    var el=$('evList');
    if(!EVENTS.length){ el.innerHTML='<div class="evempty">רשימת האירועים עוד לא נטענה.</div>'; return; }
    if(!list.length){ el.innerHTML='<div class="evempty">אין אירועים לסינון הזה. נסו ״כל המדינות״ או לבטל ״רק כשאנחנו שם״.</div>'; return; }
    var html='', cur=null;
    list.forEach(function(e){
      var key = evState.sort==='date' ? (e.sd.getMonth()+1)+'/'+e.sd.getFullYear() : e.state;
      if(key!==cur){ cur=key; var n=list.filter(function(x){ return (evState.sort==='date' ? (x.sd.getMonth()+1)+'/'+x.sd.getFullYear() : x.state)===key; }).length;
        html+='<div class="evstate"><span>'+esc(evState.sort==='date' ? ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'][e.sd.getMonth()]+' '+e.sd.getFullYear() : e.state)+'</span><small>'+n+' אירועים</small></div>'; }
      var t=evType(e), same=e.start===(e.end||e.start);
      var fit = e.gap===0 ? '<span class="est ok">אנחנו שם בערך בזמן ✓</span>' : e.gap<=6 ? '<span class="est">פער של ~'+e.gap+' ימים מהתכנון</span>' : '<span class="est no">לפי התכנון: באזור ~'+dFmt(e.eta)+'</span>';
      html+='<article class="evc'+(e.gap===0?' fit':'')+'" style="--ec:'+t[1]+'"><div class="evtop"><img alt="" src="'+badgeCanvas(t[0], t[1], 26, null, 2).toDataURL()+'"><div class="t"><b>'+esc(e.name_he)+'</b><small>'+esc(e.name_en)+' · '+esc(e.city)+'</small></div></div>'+
        '<div class="evdate">'+dFmt(e.sd,1)+(same?'':' – '+dFmt(e.ed,1))+(e.confirmed?'':' <span class="unc">תאריך משוער</span>')+fit+'</div>'+
        '<p>'+esc(e.why)+'</p>'+(e.tip?'<div class="tip"><b>טיפ:</b> '+esc(e.tip)+'</div>':'')+
        '<div class="links"><span>'+esc(t[2])+(e.cost?' · '+esc(e.cost):'')+(e.venue?' · '+esc(e.venue):'')+'</span>'+
        '<button class="maplink onmap" type="button" data-ev="'+esc(e.id)+'">במפה</button>'+qLink({n:e.name_he, lat:e.g, lng:e.n, k:t[2]})+
        (e.url?'<a class="maplink" target="_blank" rel="noopener" href="'+esc(e.url)+'">אתר ↗</a>':'')+'</div></article>';
    });
    el.innerHTML=html; syncQButtons();
  }
  function qLink(s){ return '<button class="maplink q" type="button" data-q="'+attr(s)+'">לתור +</button>'; }
  $('evState').addEventListener('change', function(){ evState.st=this.value; renderEvents(); });
  $('evFit').addEventListener('click', function(){ evState.fit=!evState.fit; this.setAttribute('aria-pressed', evState.fit?'true':'false'); renderEvents(); });
  $('evSort').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; evState.sort=b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function(x){ x.setAttribute('aria-pressed', x===b?'true':'false'); }); renderEvents(); });
  $('evList').addEventListener('click', function(e){
    var b=e.target.closest('[data-ev]'); if(!b) return;
    var ev=null; EVENTS.forEach(function(x){ if(x.id===b.getAttribute('data-ev')) ev=x; }); if(!ev) return;
    setTab('map'); setFollow(geo.pos?1:0); map.flyTo({center:[ev.n, ev.g], zoom:Math.max(map.getZoom(),12), duration:1100}); selectEvent(ev);
  });
  function selectEvent(ev){
    var t=evType(ev); selected=null;
    sheetBody.innerHTML='<div class="mini"><div class="k">'+esc(t[2])+' · '+dFmt(ev.sd,1)+(ev.start===(ev.end||ev.start)?'':' – '+dFmt(ev.ed,1))+'</div><h3 style="direction:rtl;text-align:right;font-family:\'Suez One\',serif;font-weight:400">'+esc(ev.name_he)+'</h3><div class="cen">'+esc(ev.name_en)+' · '+esc(ev.city)+', '+esc(ev.state)+'</div>'+
      '<p class="cwhy" style="margin:0">'+esc(ev.why)+'</p>'+(ev.tip?'<div class="ctip"><b>טיפ:</b> '+esc(ev.tip)+'</div>':'')+
      '<div class="navbtns"><a class="wz" target="_blank" rel="noopener" href="'+wazeLL(ev.g,ev.n)+'">נווט בוויז</a>'+(ev.url?'<a target="_blank" rel="noopener" href="'+esc(ev.url)+'">אתר האירוע</a>':'')+'</div><div class="navbtns">'+qBtn({n:ev.name_he, lat:ev.g, lng:ev.n, k:t[2]})+'</div></div>';
    hideQ(); sheet.hidden=false; sheet.scrollTop=0; $('nav').hidden=true; syncQButtons();
  }
  function eventsGeo(){
    evPrep();
    return featColl(EVENTS.map(function(e){ return {type:'Feature', properties:{id:e.id, t:EV_TYPE[e.type]?e.type:'other', h:e.name_he}, geometry:{type:'Point', coordinates:[e.n, e.g]}}; }));
  }

  function appOnLoad(){
    // must-see glow under the attraction badges
    map.addLayer({id:'poi-glow', type:'circle', source:'items', filter:['==',['get','m'],1], paint:{'circle-color':'#FFC21A', 'circle-blur':.85, 'circle-opacity':.55, 'circle-radius':['interpolate',['linear'],['zoom'],4,8,9,17,13,23]}}, 'poi-dot');
    // the changed route: guessed legs (dashed) and the part we skip (faint)
    map.addSource('qskip', {type:'geojson', data:featColl([])});
    map.addLayer({id:'qskip', type:'line', source:'qskip', layout:{'line-cap':'round'}, paint:{'line-color':'#1A8CFF', 'line-opacity':.35, 'line-width':['interpolate',['linear'],['zoom'],3,1.5,12,4], 'line-dasharray':[1,2]}}, 'route-case');
    map.addSource('qdet', {type:'geojson', data:featColl([])});
    map.addLayer({id:'qdet', type:'line', source:'qdet', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#1A8CFF', 'line-width':['interpolate',['linear'],['zoom'],3,2.4,8,5,12,7], 'line-dasharray':[1.2,1.2]}}, 'poi-glow');
    // events
    map.addSource('events', {type:'geojson', data:eventsGeo()});
    map.addLayer({id:'ev-dot', type:'symbol', source:'events', minzoom:5, layout:{'icon-image':['concat','e-',['get','t']], 'icon-size':['interpolate',['linear'],['zoom'],5,.55,10,.85,13,1], 'icon-allow-overlap':true}}, 'poi-glow');
    map.on('mouseenter','ev-dot', function(){ map.getCanvas().style.cursor='pointer'; });
    map.on('mouseleave','ev-dot', function(){ map.getCanvas().style.cursor=''; });
    glowStart(); finStart(); planRoute(); liveOnLoad(); syncTabs();
    window.addEventListener('online', function(){ setTimeout(planRoute, 1500); });
  }
  function appMapClick(e){
    if(liveMapClick(e)) return true;
    if(!map.getLayer('ev-dot')) return false;
    var h=map.queryRenderedFeatures([[e.point.x-9,e.point.y-9],[e.point.x+9,e.point.y+9]], {layers:['ev-dot']});
    if(!h.length) return false;
    evPrep(); var ev=null; EVENTS.forEach(function(x){ if(x.id===h[0].properties.id) ev=x; });
    if(ev){ selectEvent(ev); return true; }
    return false;
  }
