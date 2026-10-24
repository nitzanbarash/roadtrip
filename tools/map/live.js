  /* ================================================================
     live: one shared trip for everyone with the link, one-tap map download,
     a tidy map (like Google Maps: small things only up close), fuel prices, where to sleep
     ================================================================ */

  // The shared trip. When set, everyone who opens the link is on the same trip with no setup:
  // {c:{apiKey,authDomain,projectId,storageBucket,messagingSenderId,appId}, t:'trip id (16+ chars)'}
  var FB_BUILTIN=null;

  /* ---------- small helpers ---------- */
  var US={AL:['Alabama','אלבמה'],AK:['Alaska','אלסקה'],AZ:['Arizona','אריזונה'],AR:['Arkansas','ארקנסו'],CA:['California','קליפורניה'],CO:['Colorado','קולורדו'],CT:['Connecticut','קונטיקט'],DE:['Delaware','דלאוור'],DC:['District of Columbia','וושינגטון די.סי.'],FL:['Florida','פלורידה'],GA:['Georgia','ג׳ורג׳יה'],HI:['Hawaii','הוואי'],ID:['Idaho','איידהו'],IL:['Illinois','אילינוי'],IN:['Indiana','אינדיאנה'],IA:['Iowa','איווה'],KS:['Kansas','קנזס'],KY:['Kentucky','קנטקי'],LA:['Louisiana','לואיזיאנה'],ME:['Maine','מיין'],MD:['Maryland','מרילנד'],MA:['Massachusetts','מסצ׳וסטס'],MI:['Michigan','מישיגן'],MN:['Minnesota','מינסוטה'],MS:['Mississippi','מיסיסיפי'],MO:['Missouri','מיזורי'],MT:['Montana','מונטנה'],NE:['Nebraska','נברסקה'],NV:['Nevada','נבדה'],NH:['New Hampshire','ניו המפשייר'],NJ:['New Jersey','ניו ג׳רזי'],NM:['New Mexico','ניו מקסיקו'],NY:['New York','ניו יורק'],NC:['North Carolina','צפון קרוליינה'],ND:['North Dakota','צפון דקוטה'],OH:['Ohio','אוהיו'],OK:['Oklahoma','אוקלהומה'],OR:['Oregon','אורגון'],PA:['Pennsylvania','פנסילבניה'],RI:['Rhode Island','רוד איילנד'],SC:['South Carolina','דרום קרוליינה'],SD:['South Dakota','דרום דקוטה'],TN:['Tennessee','טנסי'],TX:['Texas','טקסס'],UT:['Utah','יוטה'],VT:['Vermont','ורמונט'],VA:['Virginia','וירג׳יניה'],WA:['Washington','וושינגטון'],WV:['West Virginia','מערב וירג׳יניה'],WI:['Wisconsin','ויסקונסין'],WY:['Wyoming','ויומינג']};
  var US_BY_NAME={}; Object.keys(US).forEach(function(a){ US_BY_NAME[US[a][0].toLowerCase()]=a; });
  function stOfLoc(l){ var p=String(l||'').split(','), n=(p[p.length-1]||'').trim(); return US_BY_NAME[n.toLowerCase()] || (US[n.toUpperCase()] ? n.toUpperCase() : null); }
  function stHe(a){ return US[a] ? US[a][1] : a; }
  var LP=null;   // a one-off position for "near me" when the map isn't following the GPS
  function hereNow(){ if(geo.pos) return {lng:geo.pos.lng, lat:geo.pos.lat, me:true}; if(LP && Date.now()-LP.t<10*60000) return LP; var c=map.getCenter(); return {lng:c.lng, lat:c.lat, me:false}; }
  function withHere(cb){
    var h=hereNow(); if(h.me || !navigator.geolocation || IN_FRAME){ cb(h); return; }
    var done=false, to=setTimeout(function(){ if(!done){ done=true; cb(hereNow()); } }, 9000);
    navigator.geolocation.getCurrentPosition(function(p){ if(done) return; done=true; clearTimeout(to); LP={lng:p.coords.longitude, lat:p.coords.latitude, me:true, t:Date.now()}; cb(LP); },
      function(){ if(done) return; done=true; clearTimeout(to); cb(hereNow()); }, {enableHighAccuracy:false, timeout:8000, maximumAge:300000});
  }
  function miAB(a,b){ return hav([a.lng,a.lat],[b.lng,b.lat])/1609.34; }
  function dirAB(a,b){ var y=Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180), x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180); return DIRS[Math.round(((Math.atan2(y,x)*180/Math.PI)+360)%360/45)%8]; }
  function usd(v){ return '$'+v.toFixed(2); }
  function agoHe(t){ var m=Math.max(0, Math.round((Date.now()-t)/60000)); return m<2 ? 'עכשיו' : m<60 ? 'לפני '+m+' דק׳' : m<1440 ? 'לפני '+Math.round(m/60)+' ש׳' : 'לפני '+Math.round(m/1440)+' ימים'; }
  function ovp(q){
    var i=0;
    function go(){ return jfetch(OVP[i], 32000, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'data='+encodeURIComponent(q)}).catch(function(e){ if(++i<OVP.length) return go(); throw e; }); }
    return go();
  }
  function ll2(o){ return {lng:o.lon!=null?o.lon:(o.center&&o.center.lon), lat:o.lat!=null?o.lat:(o.center&&o.center.lat)}; }
  function badgeURL(icon, color, s){ var k=icon+color+s; if(!badgeURL.c[k]) badgeURL.c[k]=badgeCanvas(icon, color, s||26, null, 2).toDataURL(); return badgeURL.c[k]; }
  badgeURL.c={};
  function addMapPts(id, feats, color){
    var s=map.getSource(id);
    if(!s){
      map.addSource(id, {type:'geojson', data:featColl([])});
      map.addLayer({id:id, type:'circle', source:id, paint:{'circle-color':['coalesce',['get','c'],color], 'circle-radius':['interpolate',['linear'],['zoom'],5,4,10,7,14,9], 'circle-stroke-color':'#fff', 'circle-stroke-width':2}});
      map.addLayer({id:id+'-l', type:'symbol', source:id, minzoom:10, layout:{'text-field':['get','h'], 'text-font':['Noto Sans Medium'], 'text-size':11.5, 'text-anchor':'top', 'text-offset':[0,.9], 'text-optional':true, 'text-max-width':9}, paint:{'text-color':'#1f2328','text-halo-color':'#fff','text-halo-width':1.5}});
      s=map.getSource(id);
    }
    s.setData(featColl(feats));
  }

  /* ---------- the screens: two more tabs, לינה and דלק ---------- */
  (function(){
    var tb=$('tabbar'), qb=tb.querySelector('[data-tab="events"]');
    qb.insertAdjacentHTML('beforebegin',
      '<button type="button" data-tab="sleep" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 12 5l9 15z"/><path d="M12 5v15M9.2 20 12 15l2.8 5"/></svg><span>לינה</span></button>'+
      '<button type="button" data-tab="fuel" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V20M3 20h12M4 10h10"/><path d="M14 8h2.2a1.8 1.8 0 0 1 1.8 1.8V16a1.5 1.5 0 0 0 3 0V8.5L18 6"/></svg><span>דלק</span></button>');
    tb.classList.add('t7');
    var seg=function(id, opts){ return '<span class="lseg" id="'+id+'">'+opts.map(function(o,i){ return '<button class="chip" type="button" data-v="'+o[0]+'" aria-pressed="'+(i===0?'true':'false')+'">'+o[1]+'</button>'; }).join('')+'</span>'; };
    $('epanel').insertAdjacentHTML('afterend',
      '<aside class="panel epanel lpanel" id="spanel" hidden aria-label="איפה לישון">'+
        '<div class="phead"><div class="ptitle"><h2>לינה <span>איפה לישון</span></h2><button class="pclose" id="sclose" type="button" aria-label="סגירה">×</button></div>'+
        '<div class="evtools">'+
          '<form class="lwhere" id="sForm"><input id="sQ" type="search" placeholder="עיר או מקום (למשל Moab)" autocomplete="off" enterkeyhint="search"><button class="btn pri" type="submit">חיפוש</button></form>'+
          '<div class="prow">'+seg('sAt', [['me','לידי'],['ahead','בדרך קדימה'],['center','איפה שהמפה']])+'</div>'+
          '<div class="prow" id="sType">'+[['tent','אוהל'],['car','לישון באוטו'],['rv','קרוואן'],['motel','מוטל / מלון'],['hostel','הוסטל / בקתה']].map(function(t){ return '<button class="chip" type="button" data-t="'+t[0]+'" aria-pressed="false">'+t[1]+'</button>'; }).join('')+'</div>'+
          '<div class="prow" id="sOpt"><button class="chip" type="button" data-o="free" aria-pressed="false">רק חינם</button><button class="chip" type="button" data-o="shower" aria-pressed="false">מקלחות</button><button class="chip" type="button" data-o="wc" aria-pressed="false">שירותים</button>'+
            '<select class="sel" id="sRad" aria-label="מרחק"><option value="10">עד 10 mi</option><option value="25" selected>עד 25 mi</option><option value="50">עד 50 mi</option></select></div>'+
          '<div class="prow">'+seg('sSort', [['cheap','הכי זול'],['near','הכי קרוב']])+'<label class="ldate">לילה של <input type="date" id="sDate"></label></div>'+
        '</div></div>'+
        '<div class="pbody"><div class="resline" id="sNote"></div><div class="evlist" id="sList"></div></div>'+
      '</aside>'+
      '<aside class="panel epanel lpanel" id="gpanel" hidden aria-label="מחירי דלק">'+
        '<div class="phead"><div class="ptitle"><h2>דלק <span>מחירים</span></h2><button class="pclose" id="gclose" type="button" aria-label="סגירה">×</button></div>'+
        '<div class="evtools"><div class="prow">'+seg('gGrade', [['regular','רגיל'],['mid','בינוני'],['premium','פרימיום'],['diesel','דיזל']])+'</div></div></div>'+
        '<div class="pbody">'+
          '<section class="lsec"><h3>תחנות לידי עכשיו</h3>'+
            '<div class="lrow"><button class="btn pri" id="gNear" type="button">הזולות לידי</button><a class="btn" id="gGB" target="_blank" rel="noopener">GasBuddy ↗</a><a class="btn" id="gGM" target="_blank" rel="noopener">Google Maps ↗</a></div>'+
            '<div class="lnote" id="gNearNote"></div><div id="gNearList" class="lst"></div>'+
            '<details class="lkey" id="gKeyBox"><summary>מחיר חי לכל תחנה, בתוך האפליקציה</summary><div id="gKeyIn"></div></details></section>'+
          '<section class="lsec"><h3>ממוצע לפי מדינה, לאורך הדרך</h3><div class="ltip" id="gTip"></div><div id="gStates" class="lst"></div><div class="lsrc" id="gSrc"></div></section>'+
          '<section class="lsec"><h3>כמה עולה הדלק לשאר הדרך</h3><div class="lrow"><label class="ldate">צריכה <input id="gMpg" type="number" min="8" max="80" step="1" inputmode="numeric"> מייל לגלון</label></div><div class="ltip" id="gEst"></div></section>'+
        '</div>'+
      '</aside>');
    $('sclose').addEventListener('click', function(){ setTab('map'); });
    $('gclose').addEventListener('click', function(){ setTab('map'); });
  })();

  /* ---------- everything is shared: my-route stars too (queue, must-sees and money already are) ---------- */
  var pT=+(lsGet('rt_pT')||0);
  savePicks=(function(orig){ return function(){ orig(); pT=Date.now(); lsSet('rt_pT', String(pT)); if(FIN) FIN.setDoc('picks', {ids:picks, t:pT}); refreshPoiLabels(); }; })(savePicks);
  function remotePicks(d){
    if(!d || !d.ids || (+d.t||0)<=pT) return false;
    pT=+d.t; lsSet('rt_pT', String(pT));
    Object.keys(picks).forEach(function(k){ delete picks[k]; });
    Object.keys(d.ids).forEach(function(k){ if(d.ids[k]) picks[k]=1; });
    try{ localStorage.setItem(LS, JSON.stringify(picks)); }catch(e){}
    updatePickCount();
    Array.prototype.forEach.call(document.querySelectorAll('[data-pid]'), function(el){ syncPickEl(el, el.getAttribute('data-pid')); });
    if(state.pickOnly) render();
    refreshPoiLabels();
    return true;
  }
  var remoteT=null, remoteWhat={};
  function remoteNote(what){
    // a few changes arriving together become one short note
    remoteWhat[what]=1; clearTimeout(remoteT);
    remoteT=setTimeout(function(){ var w=Object.keys(remoteWhat); remoteWhat={}; toast('עודכן מהטלפון השני: '+w.join(', '), 2600); }, 700);
  }

  /* ---------- the map in the phone: one button, parts in parallel ---------- */
  function fastParts(m, onBytes){
    var out=new Array(m.parts.length), next=0, N=Math.min(4, m.parts.length);
    function worker(){
      if(next>=m.parts.length) return Promise.resolve();
      var i=next++;
      return fetch(m.parts[i], {cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error('http '+r.status); return m.b64 ? r.text().then(unb64) : r.blob(); }).then(function(b){ out[i]=b; onBytes(b.size); return worker(); });
    }
    var ws=[]; for(var k=0;k<N;k++) ws.push(worker());
    return Promise.all(ws).then(function(){ return new Blob(out, {type:'application/octet-stream'}); });
  }
  fetchParts=function(m, bar){
    var done=0; if(bar){ bar.parentNode.hidden=false; bar.style.width='0%'; }
    return fastParts(m, function(n){ done+=n; if(bar) bar.style.width=Math.min(100, done/m.size*100).toFixed(1)+'%'; })
      .then(function(b){ if(bar) bar.parentNode.hidden=true; return b; }, function(e){ if(bar) bar.parentNode.hidden=true; throw e; });
  };
  function mapsMissing(){ return MAPS.filter(function(m){ var a=archOf(m); return !(a && a.saved); }); }
  var DL={busy:false};
  function dlCardSync(){
    var c=$('dlCard'); if(!c) return;
    var miss=(HOST && HOST.maps && !IN_FRAME) ? mapsMissing() : [];
    var later=+(lsGet('rt_dl_later')||0);
    c.hidden = !DL.busy && (!miss.length || Date.now()-later<3*864e5);
    if(!DL.busy && miss.length) $('dlSize').textContent=Math.round(miss.reduce(function(s,m){ return s+m.size; },0)/1048576)+'MB';
  }
  function dlAll(){
    if(DL.busy) return;
    var miss=mapsMissing(); if(!miss.length){ dlCardSync(); return; }
    if(!netUp()){ toast('צריך אינטרנט כדי להוריד את המפה.'); return; }
    DL.busy=true; var total=miss.reduce(function(s,m){ return s+m.size; },0), done=0;
    $('dlGo').disabled=true; $('dlGo').textContent='מוריד…'; $('dlLater').hidden=true; $('dlProg').hidden=false;
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
    var chain=Promise.resolve();
    miss.forEach(function(m){
      chain=chain.then(function(){
        return fastParts(m, function(n){ done+=n; var p=Math.min(100, done/total*100); $('dlBar').style.width=p.toFixed(1)+'%'; $('dlPct').textContent=Math.floor(p)+'% · '+Math.round(done/1048576)+' מתוך '+Math.round(total/1048576)+'MB'; })
          .then(function(blob){ return openAny(blob, mapFile(m), true); }).then(function(){ return saveArchivesNow(); });
      });
    });
    chain.then(function(){ toast('המפה המלאה שמורה בטלפון. עובדת מהר, וגם בלי קליטה.', 5000); }, function(){ toast('ההורדה נעצרה. בדקו את החיבור ולחצו שוב: ממשיכים מאיפה שאפשר.', 5000); })
      .then(function(){ DL.busy=false; $('dlGo').disabled=false; $('dlGo').textContent='הורדה'; $('dlLater').hidden=false; $('dlProg').hidden=true; hostUI(); offUI(); dlCardSync(); });
  }
  $('app').insertAdjacentHTML('beforeend',
    '<div class="dlcard glass" id="dlCard" hidden role="region" aria-label="הורדת המפה"><div class="dlt"><b>המפה המלאה בטלפון</b><span>נטענת מהר בכל מקום, וגם בלי קליטה. <i id="dlSize"></i>, עדיף בוויי-פיי.</span></div>'+
    '<div class="dlb"><button class="btn pri" id="dlGo" type="button">הורדה</button><button class="btn" id="dlLater" type="button">אחר כך</button></div>'+
    '<div class="dlp" id="dlProg" hidden><div class="prog"><i id="dlBar"></i></div><small id="dlPct">0%</small></div></div>');
  $('dlGo').addEventListener('click', dlAll);
  $('dlLater').addEventListener('click', function(){ lsSet('rt_dl_later', String(Date.now())); dlCardSync(); toast('אפשר גם אחר כך: שכבות ← הורדה ושמירה בטלפון.', 3500); });
  hostUI=(function(orig){ return function(){ orig(); dlCardSync(); }; })(hostUI);

  /* ---------- a tidy map: like Google Maps, small things show up only when you get close ---------- */
  // the bigger the place on the ground, the further out it shows; must-sees and our picks always early
  var ZOOM_OF={national_park:3.5, canyon:4, state_park:5, city:5, ski:6, lake_river:6, beach:6.5, scenic:6.5, theme_park:7, hike:8, waterfall:8, cave:8, springs:8, zoo_aquarium:8.5, camping:9, water_park:9, museum:9, adventure:9, quirky:9.5, shopping:10, karting:10, free_camp:9.5, campground:10, food:11, hostel:11, motel:11, car_sleep:11};
  // a search or a filter shows every match, at any zoom
  function filtersOn(){ return !!(state.q || state.must || state.pickOnly || (state.groups && state.groups.size)); }
  function minZoom(it){
    var z=ZOOM_OF[it.k]!=null ? ZOOM_OF[it.k] : 9;
    z -= it.w>=5 ? 2 : it.w>=4 ? 1 : it.w<=1 ? -1 : 0;
    if(mustMap()[it.id]===1) z=Math.min(z, 3);
    else if(isMust(it)) z=Math.min(z, 5);
    if(picks[it.id] || qIndex({id:it.id})>=0) z=Math.min(z, 4.5);
    return Math.max(2.5, Math.min(13, z));
  }
  itemsGeo=(function(orig){ return function(){
    var fc=orig(), all=filtersOn();
    fc.features.forEach(function(f){ var it=ITEMBY[f.properties.id], p=f.properties; if(!it) return;
      p.z = all ? 0 : minZoom(it);
      p.r = (p.m ? 0 : 6-(it.w||3)) + p.z/30; });
    return fc;
  }; })(itemsGeo);
  function tidyLayers(){
    if(!map.getLayer('poi-dot')) return;
    // must-sees get their own layer that always shows (others make room); the rest give way to each other
    var L=null; map.getStyle().layers.forEach(function(l){ if(l.id==='poi-dot') L=l; });
    if(L && !map.getLayer('poi-must')){
      var lay=JSON.parse(JSON.stringify(L.layout||{})); lay['icon-allow-overlap']=true; lay['icon-ignore-placement']=false;
      map.addLayer({id:'poi-must', type:'symbol', source:'items', filter:['all',['==',['get','m'],1],['>=',['zoom'],['get','z']]], layout:lay, paint:L.paint||{}}, 'poi-sel');
      map.on('mouseenter','poi-must', function(){ map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','poi-must', function(){ map.getCanvas().style.cursor=''; });
    }
    map.setFilter('poi-dot', ['all',['!=',['get','m'],1],['>=',['zoom'],['get','z']]]);
    map.setLayoutProperty('poi-dot', 'icon-allow-overlap', false);
    map.setLayoutProperty('poi-dot', 'icon-ignore-placement', false);
    map.setLayoutProperty('poi-dot', 'icon-padding', 1);
    map.setLayoutProperty('poi-dot', 'symbol-sort-key', ['get','r']);
    if(map.getLayer('poi-glow')) map.setFilter('poi-glow', ['all',['==',['get','m'],1],['>=',['zoom'],['get','z']]]);
    if(map.getLayer('poi-label')) map.setFilter('poi-label', ['>=',['zoom'],['max',['+',['get','z'],2.5],['case',['==',['get','m'],1],8,10]]]);
    if(map.getLayer('ev-dot')){ map.setLayoutProperty('ev-dot', 'icon-allow-overlap', false); map.setLayerZoomRange('ev-dot', 8, 24); }
    refreshPoiLabels();
  }

  /* ---------- Google-style chips under the search bar ---------- */
  var GCHIPS=[['fuel','דלק ומחירים','local_gas_station','#188038'],['sleep','איפה לישון','camping','#7A3E9D'],['food','אוכל','restaurant','#E8710A'],['cafe','קפה','local_cafe','#A0522D'],['shop','סופר','shopping_cart','#0B7FAB'],['wc','שירותים','wc','#5F6368'],['rest','תחנת מנוחה','rest_area','#4A5FC1'],['view','תצפיות','binoculars','#12828F'],['pharm','בית מרקחת','local_pharmacy','#D93025'],['atm','כספומט','atm','#5F6368']];
  $('app').insertAdjacentHTML('beforeend', '<div class="gchips" id="gchips" role="toolbar" aria-label="חיפוש מהיר">'+GCHIPS.map(function(c){ return '<button class="gchip" type="button" data-g="'+c[0]+'" style="--c:'+c[3]+'" aria-pressed="false"><img alt="" src="'+badgeURL(c[2], c[3], 18)+'">'+c[1]+'</button>'; }).join('')+'</div>');
  $('gchips').addEventListener('click', function(e){
    var b=e.target.closest('.gchip'); if(!b) return;
    var g=b.getAttribute('data-g');
    if(g==='fuel' || g==='sleep'){ setTab(g); return; }
    if(!NEAR_BY[g]) return;
    if(map.getZoom()<NEAR_BY[g].z) map.easeTo({zoom:NEAR_BY[g].z+.3, duration:500});
    setTimeout(function(){ setNear(near.cat===g ? null : g); }, map.getZoom()<NEAR_BY[g].z ? 650 : 0);
  });
  setNear=(function(orig){ return function(id){ orig(id); Array.prototype.forEach.call($('gchips').children, function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-g')===id?'true':'false'); }); if(id){ var nb=$('nearbar'); if(nb.hidden){ nb.hidden=false; $('bNear').setAttribute('aria-expanded','true'); } } }; })(setNear);

  /* ---------- events: small and local too (bars, farmers, town festivals), and what's on tonight ---------- */
  var EV_KINDS=[['all','הכול'],['small','קטן ומקומי'],['music','הופעות ובר'],['farm','חקלאים ושווקים'],['big','גדולים']];
  function evTags(e){ return e.tags||[]; }
  function evKindOK(e){
    var k=evState.kind||'all', t=e.type, tg=evTags(e);
    if(k==='music') return t==='bar' || t==='concert' || tg.indexOf('bar')>=0;
    if(k==='farm') return t==='farm' || t==='market' || tg.indexOf('farm')>=0;
    if(k==='small') return /^(bar|farm|market|local)$/.test(t) || tg.indexOf('local')>=0 || tg.indexOf('young')>=0;
    if(k==='big') return !/^(bar|farm|market|local)$/.test(t) && tg.indexOf('local')<0;
    return true;
  }
  (function(){
    var tools=$('epanel').querySelector('.evtools');
    tools.insertAdjacentHTML('afterbegin', '<div class="prow" id="evKind">'+EV_KINDS.map(function(k,i){ return '<button class="chip" type="button" data-k="'+k[0]+'" aria-pressed="'+(i?'false':'true')+'">'+k[1]+'</button>'; }).join('')+'</div>');
    tools.insertAdjacentHTML('beforeend', '<div class="evnow"><b>מה יש הערב לידי?</b><span id="evNowLinks"></span></div>');
    $('evKind').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; evState.kind=b.getAttribute('data-k'); Array.prototype.forEach.call(this.children, function(x){ x.setAttribute('aria-pressed', x===b?'true':'false'); }); renderEvents(); });
  })();
  var EVC={key:'', city:null};
  function nearCityItem(p){ var best=null, bd=1e9; ITEMS.forEach(function(it){ if(it.g==null || !it.l) return; var d=Math.abs(it.g-p.lat)+Math.abs(it.n-p.lng)*.8; if(d<bd){ bd=d; best=it; } }); return best && best.l; }
  function evNowLinks(){
    var p=hereNow(), key=p.lat.toFixed(1)+','+p.lng.toFixed(1);
    var draw=function(city){
      var c=city||'', parts=c.split(','), ct=(parts[0]||'').trim(), st=stOfLoc(c)||'', E=encodeURIComponent, where=ct+(st?' '+st:'');
      var eb= ct && st ? 'https://www.eventbrite.com/d/'+st.toLowerCase()+'--'+ct.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'/events--this-weekend/' : 'https://www.eventbrite.com/d/united-states/events--this-weekend/';
      var L=[['הופעות הערב','https://www.google.com/search?q='+E('live music tonight '+where)],['בסוף השבוע','https://www.google.com/search?q='+E('events this weekend '+where)],['Eventbrite',eb],['שוק איכרים','https://www.google.com/maps/search/'+E('farmers market')+'/@'+p.lat.toFixed(4)+','+p.lng.toFixed(4)+',11z']];
      $('evNowLinks').innerHTML=(ct?'<small>'+esc(where)+'</small>':'')+L.map(function(l){ return '<a class="maplink" target="_blank" rel="noopener" href="'+esc(l[1])+'">'+esc(l[0])+' ↗</a>'; }).join('');
    };
    if(EVC.key===key && EVC.city){ draw(EVC.city); return; }
    EVC.key=key; EVC.city=nearCityItem(p); draw(EVC.city);
    if(netUp()) jfetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat='+p.lat+'&lon='+p.lng, 8000).then(function(j){
      var a=j && j.address; if(!a) return; var ct=a.city||a.town||a.village||a.county||''; var st=a.state||''; if(ct && EVC.key===key){ EVC.city=ct+', '+st; draw(EVC.city); }
    }).catch(function(){});
  }
  renderEvents=(function(orig){ return function(){ orig(); evNowLinks(); }; })(renderEvents);

  /* ---------- fuel: today's state averages along the way + live prices at nearby stations ---------- */
  var FUEL={data:null, grade:lsGet('rt_fuel_g')||'regular', at:0, zip:null};
  var GRADE_HE={regular:'רגיל', mid:'בינוני', premium:'פרימיום', diesel:'דיזל'};
  var GTYPE={REGULAR_UNLEADED:'regular', MIDGRADE:'mid', PREMIUM:'premium', DIESEL:'diesel'};
  var RSTATES=null;
  function routeStates(){
    // which states the route crosses, in order, from where our places sit along it
    if(RSTATES) return RSTATES;
    var pts=[];
    ITEMS.forEach(function(it){ if(it.g==null || (it.dh||0)>0.35) return; var st=stOfLoc(it.l); if(st) pts.push({st:st, mi:it.mi!=null ? it.mi : project(it.n, it.g).mile}); });
    pts.sort(function(a,b){ return a.mi-b.mi; });
    var runs=[];
    pts.forEach(function(p){ var r=runs[runs.length-1]; if(r && r.st===p.st){ r.b=p.mi; r.n++; } else runs.push({st:p.st, a:p.mi, b:p.mi, n:1}); });
    for(var i=1;i<runs.length-1;i++){ if(runs[i].n<=2 && runs[i-1].st===runs[i+1].st){ runs[i-1].b=runs[i+1].b; runs[i-1].n+=runs[i].n+runs[i+1].n; runs.splice(i,2); i--; } }
    runs=runs.filter(function(r){ return r.n>=2 || r.b-r.a>20; });
    RSTATES=runs; return runs;
  }
  function myMile(){ var p=hereNow(); if(!p.me && map.getZoom()<6) return null; return project(p.lng, p.lat).mile; }
  function stateAt(mile){ var rs=routeStates(), best=null, bd=1e9; rs.forEach(function(r,i){ var d= mile<r.a ? r.a-mile : mile>r.b ? mile-r.b : 0; if(d<bd){ bd=d; best=i; } }); return best; }
  function loadFuel(){
    if(FUEL.data && Date.now()-FUEL.at<30*60000) return Promise.resolve(FUEL.data);
    return jfetch('fuel.json?t='+Math.floor(Date.now()/600000), 12000).then(function(d){ FUEL.data=d; FUEL.at=Date.now(); try{ localStorage.setItem('rt_fuel', JSON.stringify(d)); }catch(e){} return d; }, function(){
      if(!FUEL.data){ try{ FUEL.data=JSON.parse(lsGet('rt_fuel')||'null'); }catch(e){} }
      return FUEL.data;
    });
  }
  function priceOf(st, g){ var d=FUEL.data, s=d && d.states && d.states[st]; return s && s[g]!=null ? s[g] : null; }
  function renderFuel(){
    var d=FUEL.data, g=FUEL.grade, rs=routeStates();
    if(!d){ $('gStates').innerHTML='<div class="lnote">אין עדיין נתונים. צריך אינטרנט פעם אחת.</div>'; $('gTip').textContent=''; $('gSrc').textContent=''; return; }
    var seen={}, rows=[];
    rs.forEach(function(r,i){ if(seen[r.st]) return; seen[r.st]=1; rows.push({st:r.st, i:i}); });
    var vals=rows.map(function(r){ return priceOf(r.st,g); }).filter(function(v){ return v!=null; });
    var lo=Math.min.apply(null, vals), hi=Math.max.apply(null, vals);
    var mm=myMile(), cur= mm!=null ? stateAt(mm) : null, curSt= cur!=null ? rs[cur].st : null;
    $('gStates').innerHTML=rows.map(function(r){
      var v=priceOf(r.st,g); if(v==null) return '';
      var s=d.states[r.st], pv=s.prev && s.prev[g], ch= pv ? Math.round((v-pv)*100) : 0;
      var w= hi>lo ? 18+82*(v-lo)/(hi-lo) : 60;
      return '<div class="gst'+(r.st===curSt?' here':'')+(v===lo?' lo':'')+(v===hi?' hi':'')+'"><span class="n">'+esc(stHe(r.st))+(r.st===curSt?' <em>'+(hereNow().me?'אתם כאן':'במפה')+'</em>':'')+'</span>'+
        '<span class="bar"><i style="width:'+w.toFixed(0)+'%"></i></span><b class="lat">'+usd(v)+'</b><small class="lat ch'+(ch>0?' up':ch<0?' dn':'')+'">'+(ch>0?'▲'+ch+'¢':ch<0?'▼'+(-ch)+'¢':'')+'</small></div>';
    }).join('');
    // the tip: fill up before an expensive state, wait for a cheap one
    var tip='';
    if(cur!=null){
      var nx=null; for(var k=cur+1;k<rs.length;k++){ if(rs[k].st!==rs[cur].st){ nx=rs[k]; break; } }
      var a=priceOf(rs[cur].st,g), b=nx && priceOf(nx.st,g);
      if(a!=null && b!=null){
        var dlt=b-a, inMi=Math.max(0, Math.round(nx.a-mm));
        tip = dlt>0.12 ? 'ב'+stHe(nx.st)+' (בעוד ~'+inMi+' mi) הדלק יקר ב-'+usd(dlt)+' לגלון. כדאי למלא לפני הגבול.' :
              dlt<-0.12 ? 'ב'+stHe(nx.st)+' (בעוד ~'+inMi+' mi) זול ב-'+usd(-dlt)+' לגלון. אם אפשר, למלא שם.' :
              'במדינה הבאה ('+stHe(nx.st)+') המחיר דומה.';
      }
    } else tip='הכי זול בדרך: '+rows.filter(function(r){ return priceOf(r.st,g)===lo; }).map(function(r){ return stHe(r.st); }).join(', ')+' ('+usd(lo)+'). הכי יקר: '+rows.filter(function(r){ return priceOf(r.st,g)===hi; }).map(function(r){ return stHe(r.st); }).join(', ')+' ('+usd(hi)+').';
    $('gTip').textContent=tip;
    $('gSrc').innerHTML='ממוצע יומי לכל מדינה, '+GRADE_HE[g]+', לגלון · AAA · '+esc(d.asof||'')+' · מתעדכן כל יום · <a href="'+esc(d.url||'https://gasprices.aaa.com/')+'" target="_blank" rel="noopener">מקור ↗</a>';
    // what's left of the road, in money
    var mpg=+(lsGet('rt_mpg')||25), from= mm!=null ? mm : 0, cost=0, miles=0;
    rs.forEach(function(r){ var a=Math.max(r.a, from), b=r.b; if(b<=a) return; var v=priceOf(r.st,g); if(v==null) return; cost+=(b-a)/mpg*v; miles+=b-a; });
    var left=Math.max(0, (NAV.total||5660)-from);
    if(miles>0) cost*=left/miles;
    $('gMpg').value=mpg;
    $('gEst').innerHTML= left>5 ? 'לשאר הדרך (~'+fmtMi(left)+' mi): בערך <b class="lat">'+Math.round(left/mpg)+'</b> גלון, <b class="lat">$'+Math.round(cost).toLocaleString('en-US')+'</b>. מילוי מלא (15 גלון) כאן: <b class="lat">'+(curSt && priceOf(curSt,g) ? usd(15*priceOf(curSt,g)) : '–')+'</b>.' : 'הגעתם.';
  }
  function fuelLinks(){
    var p=hereNow(), gb={regular:1, mid:2, premium:3, diesel:4}[FUEL.grade];
    $('gGM').href='https://www.google.com/maps/search/gas+station/@'+p.lat.toFixed(5)+','+p.lng.toFixed(5)+',13z';
    $('gGB').href= FUEL.zip ? 'https://www.gasbuddy.com/home?search='+encodeURIComponent(FUEL.zip)+'&fuel='+gb : 'https://www.gasbuddy.com/home?search='+p.lat.toFixed(4)+'%2C'+p.lng.toFixed(4)+'&fuel='+gb;
    if(!FUEL.zip && netUp() && !FUEL.zipBusy){
      FUEL.zipBusy=true;
      jfetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat='+p.lat+'&lon='+p.lng, 8000).then(function(j){ var a=j && j.address; if(a && a.postcode){ FUEL.zip=a.postcode.split('-')[0]; fuelLinks(); } }).catch(function(){}).then(function(){ FUEL.zipBusy=false; });
    }
  }
  function keyUI(){
    var k=lsGet('rt_gkey')||'';
    $('gKeyIn').innerHTML= k
      ? '<p class="lnote">מחובר. "הזולות לידי" מראה מחיר עדכני בכל תחנה (מגוגל).</p><button class="btn" id="gKeyDel" type="button">הסרת המפתח</button>'
      : '<p class="lnote">בלי זה, "הזולות לידי" מראה את התחנות הקרובות, והמחיר נפתח ב-GasBuddy או ב-Google Maps. עם מפתח של Google (חינם עד 1,000 חיפושים בחודש) המחירים מופיעים כאן, ממוינים מהזול ליקר.</p>'+
        '<ol class="lnote"><li>נכנסים ל-<b>console.cloud.google.com</b>, פותחים פרויקט ומוסיפים אמצעי תשלום (לא מחייבים בטווח החינמי).</li><li>APIs &amp; Services ← Library ← מפעילים את <b>Places API (New)</b>.</li><li>Credentials ← Create credentials ← API key. ב-Website restrictions מוסיפים: <code>nitzanbarash.github.io/*</code></li><li>מדביקים את המפתח כאן.</li></ol>'+
        '<div class="lrow"><input id="gKey" type="text" placeholder="AIza…" autocomplete="off" spellcheck="false"><button class="btn pri" id="gKeySave" type="button">שמירה</button></div>';
    if(k) $('gKeyDel').onclick=function(){ try{ localStorage.removeItem('rt_gkey'); }catch(e){} keyUI(); };
    else $('gKeySave').onclick=function(){ var v=$('gKey').value.trim(); if(!/^AIza[\w-]{20,}$/.test(v)){ toast('זה לא נראה כמו מפתח של Google (מתחיל ב-AIza).'); return; } lsSet('rt_gkey', v); keyUI(); nearStations(); };
  }
  function nearStations(){
    if(!netUp()){ $('gNearNote').textContent='צריך אינטרנט. במפה עצמה תחנות הדלק מופיעות גם בלי קליטה.'; return; }
    $('gNearNote').textContent='מאתר את המיקום…';
    withHere(nearStationsAt);
  }
  function nearStationsAt(p){
    var key=lsGet('rt_gkey'), el=$('gNearList'), note=$('gNearNote');
    fuelLinks(); renderFuel();
    note.textContent= key ? 'בודק מחירים בתחנות סביב '+(p.me?'המיקום שלכם':'מרכז המפה')+'…' : 'מחפש תחנות סביב '+(p.me?'המיקום שלכם':'מרכז המפה')+'…';
    el.innerHTML='';
    var g=FUEL.grade;
    var job = key ? fetch('https://places.googleapis.com/v1/places:searchNearby', {method:'POST', headers:{'Content-Type':'application/json', 'X-Goog-Api-Key':key, 'X-Goog-FieldMask':'places.id,places.displayName,places.location,places.fuelOptions,places.googleMapsUri,places.shortFormattedAddress'},
        body:JSON.stringify({includedTypes:['gas_station'], maxResultCount:20, rankPreference:'DISTANCE', locationRestriction:{circle:{center:{latitude:p.lat, longitude:p.lng}, radius:16000}}})})
        .then(function(r){ return r.json(); }).then(function(j){
          if(j.error) throw new Error(j.error.message||'google');
          return (j.places||[]).map(function(s){
            var pr={}, t=0; ((s.fuelOptions||{}).fuelPrices||[]).forEach(function(f){ var k2=GTYPE[f.type]; if(k2 && f.price){ pr[k2]=(+f.price.units||0)+(+f.price.nanos||0)/1e9; t=Math.max(t, Date.parse(f.updateTime)||0); } });
            return {n:(s.displayName||{}).text||'תחנה', a:s.shortFormattedAddress||'', lat:s.location.latitude, lng:s.location.longitude, pr:pr, t:t, url:s.googleMapsUri};
          });
        })
      : ovp('[out:json][timeout:20];nwr["amenity"="fuel"](around:12000,'+p.lat.toFixed(5)+','+p.lng.toFixed(5)+');out center tags 80;').then(function(j){
          return (j.elements||[]).map(function(e){ var c=ll2(e), t=e.tags||{}; return {n:t.brand||t.name||'תחנת דלק', a:t['addr:street']?(t['addr:housenumber']||'')+' '+t['addr:street']:'', lat:c.lat, lng:c.lng, pr:{}, t:0, hgv:t.hgv==='yes'}; });
        });
    job.then(function(list){
      list.forEach(function(s){ s.d=miAB(p, s); s.v=s.pr[g]; });
      list=list.filter(function(s){ return s.lat!=null; });
      list.sort(function(a,b){ return (a.v!=null?0:1)-(b.v!=null?0:1) || (a.v!=null && b.v!=null ? a.v-b.v : 0) || a.d-b.d; });
      list=list.slice(0, 15);
      if(!list.length){ note.textContent='לא נמצאו תחנות בטווח של 10 מייל.'; return; }
      var withP=list.filter(function(s){ return s.v!=null; }), cheap=withP.length ? withP[0].v : null;
      note.textContent= withP.length ? 'מחיר '+GRADE_HE[g]+' לגלון, מהזול ליקר. ההפרש בין הזולה ליקרה: '+usd(withP[withP.length-1].v-cheap)+'.' : key ? 'לתחנות האלה אין כרגע מחיר בגוגל.' : 'התחנות הקרובות. המחיר העדכני: GasBuddy או Google Maps (למעלה), או מפתח Google כדי לראות אותו כאן.';
      el.innerHTML=list.map(function(s){
        return '<div class="gstn'+(s.v!=null && s.v===cheap?' best':'')+'"><img alt="" src="'+badgeURL('local_gas_station', s.v!=null && s.v===cheap ? '#188038' : '#5F6368', 22)+'"><div class="t"><b>'+esc(s.n)+'</b><small>'+fmtMi(s.d)+' mi '+esc(dirAB(p,s))+(s.a?' · '+esc(s.a):'')+(s.t?' · עודכן '+agoHe(s.t):'')+(s.hgv?' · משאיות':'')+'</small></div>'+
          (s.v!=null ? '<b class="pz lat">'+usd(s.v)+'</b>' : '')+'<a class="maplink" target="_blank" rel="noopener" href="'+wazeLL(s.lat, s.lng)+'">נווט</a></div>';
      }).join('');
      addMapPts('fuelpts', list.map(function(s){ return {type:'Feature', properties:{h:s.v!=null ? usd(s.v) : s.n, c:s.v!=null && s.v===cheap ? '#188038' : '#5F6368'}, geometry:{type:'Point', coordinates:[s.lng, s.lat]}}; }), '#5F6368');
    }).catch(function(e){ note.textContent= key ? 'גוגל לא החזיר מחירים: '+String(e.message||e).slice(0,140)+'. בדקו שהמפתח פעיל ו-Places API (New) מופעל.' : 'החיפוש לא הצליח. נסו שוב בעוד רגע.'; });
  }
  function fuelOpen(){
    fuelLinks(); keyUI();
    if(FUEL.data) renderFuel();
    loadFuel().then(renderFuel);
    // if location is already allowed, use it (no prompt)
    try{ if(!hereNow().me && navigator.permissions) navigator.permissions.query({name:'geolocation'}).then(function(r){ if(r.state==='granted') withHere(function(){ renderFuel(); fuelLinks(); }); }, function(){}); }catch(e){}
  }
  $('gGrade').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; FUEL.grade=b.getAttribute('data-v'); lsSet('rt_fuel_g', FUEL.grade); segSet(this, FUEL.grade); renderFuel(); fuelLinks(); if($('gNearList').children.length) nearStations(); });
  $('gNear').addEventListener('click', nearStations);
  $('gMpg').addEventListener('change', function(){ var v=Math.max(8, Math.min(80, +this.value||25)); lsSet('rt_mpg', String(v)); renderFuel(); });
  function segSet(el, v){ Array.prototype.forEach.call(el.children, function(x){ x.setAttribute('aria-pressed', x.getAttribute('data-v')===v?'true':'false'); }); }
  segSet($('gGrade'), FUEL.grade);

  /* ---------- where to sleep: tent, car, RV, motel; ours + OpenStreetMap; where it's cheapest to book ---------- */
  var SL={at:'me', types:{}, free:false, shower:false, wc:false, rad:25, sort:'cheap', raw:null, key:'', pt:null, mile:null, busy:false, show:60};
  var SL_KIND={tent:['camping','אוהל'], car:['directions_car','באוטו'], rv:['rv_hookup','קרוואן'], motel:['hotel','מוטל / מלון'], hostel:['bed','הוסטל / בקתה']};
  function priceFromText(c){
    c=String(c||''); var m=/\$\s*(\d+(?:\.\d+)?)/.exec(c);
    if(m) return +m[1];
    if(/חינם|free/i.test(c)) return 0;
    return null;
  }
  function ourSleep(){
    return ITEMS.filter(function(it){ return gOf(it).g==='sleep' && it.g!=null; }).map(function(it){
      var txt=(it.y||'')+' '+(it.p||''), t={};
      if(it.k==='free_camp'){ t.tent=1; t.car=1; }
      if(it.k==='campground'){ t.tent=1; t.car=1; if(/RV|קרוואן|hookup/i.test(txt)) t.rv=1; }
      if(it.k==='car_sleep'){ t.car=1; }
      if(it.k==='motel') t.motel=1;
      if(it.k==='hostel'){ t.hostel=1; if(/מוטל|motel/i.test(it.e+txt)) t.motel=1; }
      if(/RV|קרוואן/.test(txt) && (t.tent||t.car)) t.rv=1;
      return {src:'ours', id:it.id, it:it, n:it.h, en:it.e, city:it.l, lat:it.g, lng:it.n, t:t, price:priceFromText(it.c), ptx:it.c||'', note:it.y||'', tip:it.p||'',
        shower:/מקלחו/.test(txt) && !/(בלי|אין)\s+מקלחו/.test(txt), wc:/שירותים/.test(txt) && !/(בלי|אין)\s+שירותים/.test(txt), web:'', phone:'', fed:/recreation\.gov|NPS|National Park|Forest|BLM|יער לאומי|פארק לאומי/i.test(it.e+' '+txt)};
    });
  }
  function osmSleep(e){
    var t=e.tags||{}, c=ll2(e), k={}, kind=t.tourism||t.highway||t.amenity||t.shop||'';
    if(c.lat==null) return null;
    if(kind==='camp_site'){ if(t.tents!=='no') k.tent=1; if(t.motor_vehicle!=='no' && t.backcountry!=='yes' && t.walk_in!=='yes') k.car=1; if(t.caravans==='yes' || t.sanitary_dump_station || t.power_supply==='yes') k.rv=1; }
    else if(kind==='caravan_site'){ k.rv=1; k.car=1; }
    else if(/^(motel|hotel|guest_house)$/.test(kind)) k.motel=1;
    else if(/^(hostel|chalet|alpine_hut|wilderness_hut)$/.test(kind)) k.hostel=1;
    else k.car=1; // rest areas, truck stops, big stores that often allow a night in the car
    var price = t.fee==='no' ? 0 : priceFromText((t.charge||'').replace(/(\d+(?:\.\d+)?)\s*USD/i, '$$$1'));
    var carSpot=!!k.car && !k.tent && !k.rv;
    var nm=t.name||t.brand||({camp_site:'קמפינג', caravan_site:'חניון קרוואנים', motel:'מוטל', hotel:'מלון', hostel:'הוסטל', rest_area:'תחנת מנוחה'})[kind]||'מקום לינה';
    return {src:'osm', id:'osm'+e.type[0]+e.id, n:nm, en:nm, city:[t['addr:city'], t['addr:state']].filter(Boolean).join(', '), lat:c.lat, lng:c.lng, t:k,
      price: carSpot ? 0 : price, ptx: carSpot ? 'חינם · לבדוק שמותר' : (t.fee==='no' ? 'חינם' : t.charge || (t.fee==='yes' ? 'בתשלום' : '')),
      note: carSpot ? (kind==='rest_area' ? 'תחנת מנוחה. בחלק מהמדינות מותר לישון כמה שעות ברכב, בחלק אסור. בודקים שלטים.' : 'בהרבה סניפים מותר לישון ברכב בחניה בלילה, בחינם. שואלים בכניסה ובודקים שלטים.') : '',
      tip:'', shower:t.shower==='yes' || t.showers==='yes', wc:t.toilets==='yes', water:t.drinking_water==='yes', power:t.power_supply==='yes',
      web:t.website||t['contact:website']||'', phone:t.phone||t['contact:phone']||'', fed:/National Park|Forest Service|USFS|Bureau of Land|BLM|Corps of Engineers|USACE/i.test(t.operator||''), op:t.operator||''};
  }
  function slPoint(){
    if(SL.at==='q' && SL.pt) return SL.pt;
    if(SL.at==='me' || SL.at==='ahead'){ var h=hereNow(); if(h.me) return h; }
    var c=map.getCenter(); return {lng:c.lng, lat:c.lat};
  }
  function aheadLine(){
    // the next ~150 miles of the route, from where we are
    routeMiles();
    var p=slPoint(), n=nearestIdx(p.lng, p.lat), m0=n.mi, pts=[], m;
    for(m=m0; m<=Math.min(m0+150, RC[RC.length-1]); m+=9){ var i=idxAtMile(m); pts.push({lng:ROUTE[i][0], lat:ROUTE[i][1], mi:RC[i]}); }
    return {m0:m0, pts:pts};
  }
  function slQuery(area, types){
    var A='('+area+')', parts=[];
    if(types.tent || types.car || types.rv) parts.push('(nwr["tourism"~"^(camp_site|caravan_site)$"]'+A+';);out center tags 260;');
    if(types.motel || types.hostel) parts.push('(nwr["tourism"~"^(motel|hotel|hostel|guest_house|chalet|wilderness_hut)$"]'+A+';);out center tags 160;');
    if(types.car) parts.push('(nwr["highway"="rest_area"]'+A+';nwr["brand"~"^(Walmart|Love\'s|Pilot|Flying J|Petro|TA|Cabela\'s|Bass Pro Shops|Cracker Barrel)$"]'+A+';);out center tags 80;');
    return '[out:json][timeout:30];'+parts.join('');
  }
  function slTypesOn(){ var t={}, any=false; Object.keys(SL.types).forEach(function(k){ if(SL.types[k]){ t[k]=1; any=true; } }); return any ? t : {tent:1, car:1, rv:1, motel:1, hostel:1}; }
  function sleepSearch(force){
    var types=slTypesOn(), p=slPoint(), area, key, ahead=null;
    if(SL.at==='ahead'){ ahead=aheadLine(); var r=Math.min(SL.rad, 15)*1609; area='around:'+r.toFixed(0)+','+ahead.pts.map(function(x){ return x.lat.toFixed(4)+','+x.lng.toFixed(4); }).join(','); key='a'+Math.round(ahead.m0)+'|'+SL.rad; }
    else { area='around:'+(SL.rad*1609).toFixed(0)+','+p.lat.toFixed(4)+','+p.lng.toFixed(4); key=p.lat.toFixed(2)+','+p.lng.toFixed(2)+'|'+SL.rad; }
    key+='|'+Object.keys(types).sort().join('');
    SL.ahead=ahead; SL.cpt=p;
    if(!force && SL.raw && SL.key===key){ renderSleep(); return; }
    SL.key=key; SL.raw=null; SL.show=60;
    var ours=ourSleep();
    if(!netUp()){ SL.raw=ours; SL.osmNote='בלי אינטרנט: רק המקומות מהרשימה שלנו.'; renderSleep(); return; }
    SL.osmNote=''; SL.raw=ours; renderSleep(true);
    var my=key;
    ovp(slQuery(area, types)).then(function(j){
      if(SL.key!==my) return;
      var o=(j.elements||[]).map(osmSleep).filter(Boolean);
      // drop OSM places that are already on our list (ours has the notes and prices)
      o=o.filter(function(x){ return !ours.some(function(y){ return Math.abs(y.lat-x.lat)<.004 && Math.abs(y.lng-x.lng)<.005; }); });
      SL.raw=ours.concat(o); SL.osmNote=''; renderSleep();
    }).catch(function(){ if(SL.key!==my) return; SL.osmNote='OpenStreetMap לא ענה. מוצגים המקומות מהרשימה שלנו; נסו שוב בעוד רגע.'; renderSleep(); });
  }
  function bookLinks(r){
    var q=(r.en||r.n)+(r.city?' '+r.city:''), E=encodeURIComponent, L=[], d1=$('sDate').value, d2='';
    if(d1){ var dd=new Date(d1+'T12:00:00'); dd.setDate(dd.getDate()+1); d2=dd.toISOString().slice(0,10); }
    var gm='https://www.google.com/maps/search/?api=1&query='+E(q);
    var tip='';
    if(r.t.motel || r.t.hostel){
      L.push(['Google Hotels: כל האתרים זה לצד זה', 'https://www.google.com/travel/search?q='+E(q)]);
      L.push(['Booking', 'https://www.booking.com/searchresults.html?ss='+E(q)+(d1?'&checkin='+d1+'&checkout='+d2:'')+'&group_adults=2&no_rooms=1']);
      L.push(['Expedia', 'https://www.expedia.com/Hotel-Search?destination='+E(q)+(d1?'&startDate='+d1+'&endDate='+d2:'')+'&adults=2']);
      if(r.t.hostel) L.push(['Hostelworld', 'https://www.hostelworld.com/find?search_keywords='+E(r.city||q)]);
      tip='Google Hotels משווה את כל אתרי ההזמנות למקום הזה. אחרי שמוצאים את המחיר הזול, שווה לבדוק גם באתר של המקום עצמו או להתקשר: לפעמים זה עוד יותר זול.';
    }
    else if(r.price===0){
      L.push(['ביקורות ותנאים עדכניים', 'https://www.google.com/search?q='+E(q+' camping site:freecampsites.net OR site:campendium.com OR site:ioverlander.com')]);
      tip= r.src==='osm' && !r.t.tent ? 'חינם, אבל מותר רק בחלק מהמקומות. בודקים שלטים, שואלים בכניסה, ולא פותחים כיסאות בחוץ.' : 'חינם, בלי הזמנה. לפני שנוסעים: בודקים ביקורות עדכניות (סגירות, שלג, גישה לרכב רגיל).';
    }
    else {
      L.push(['Recreation.gov (פארקים ויערות)', 'https://www.recreation.gov/search?q='+E(r.en||r.n)]);
      L.push(['Hipcamp / The Dyrt / Campendium', 'https://www.google.com/search?q='+E(q+' site:hipcamp.com OR site:thedyrt.com OR site:campendium.com')]);
      tip= r.fed ? 'מקום פדרלי: מזמינים ב-Recreation.gov, בלי תיווך. זה המחיר הזול.' : 'הכי זול להזמין ישר באתר הרשמי (של הפארק או של המקום). Hipcamp ו-The Dyrt מוסיפים עמלה.';
    }
    if(r.web) L.push(['האתר שלהם', /^https?:/.test(r.web)?r.web:'https://'+r.web]);
    if(r.phone) L.push(['להתקשר '+r.phone, 'tel:'+r.phone.replace(/[^\d+]/g,'')]);
    L.push(['Google Maps: תמונות וביקורות', gm]);
    return '<div class="book">'+L.map(function(l){ return '<a class="btn" target="_blank" rel="noopener" href="'+esc(l[1])+'">'+esc(l[0])+' ↗</a>'; }).join('')+'<p>'+esc(tip)+'</p></div>';
  }
  function slFilter(list){
    var types=slTypesOn(), p=SL.cpt||slPoint(), ah=SL.ahead;
    return list.filter(function(r){
      if(!Object.keys(r.t).some(function(k){ return types[k]; })) return false;
      if(SL.free && r.price!==0) return false;
      if(SL.shower && !r.shower) return false;
      if(SL.wc && !r.wc) return false;
      if(ah){
        var best=1e9; ah.pts.forEach(function(x){ var d=miAB(x, r); if(d<best){ best=d; r.amile=x.mi; } });
        r.d=best; if(best>Math.min(SL.rad, 15)*1.15) return false;
        return true;
      }
      r.d=miAB(p, r); r.amile=null;
      return r.d<=SL.rad*1.05;
    });
  }
  function renderSleep(loading){
    var el=$('sList'), list=slFilter(SL.raw||[]);
    var priceKey=function(r){ return r.price==null ? 1e6 : r.price; };
    list.sort(SL.sort==='near' ? function(a,b){ return a.d-b.d; } : function(a,b){ return priceKey(a)-priceKey(b) || (a.src==='ours'?0:1)-(b.src==='ours'?0:1) || a.d-b.d; });
    var nOurs=list.filter(function(r){ return r.src==='ours'; }).length, p=SL.cpt||slPoint();
    $('sNote').innerHTML=(loading ? 'מחפש גם ב-OpenStreetMap… ' : '')+'<span>'+list.length+' מקומות'+(SL.at==='ahead' ? ' ב-150 המייל הבאים' : SL.at==='me' && p.me ? ' סביבכם' : SL.at==='q' ? ' סביב '+esc(SL.qn||'') : ' סביב מרכז המפה')+' · '+nOurs+' מהרשימה שלנו</span>'+(SL.osmNote?'<span>'+esc(SL.osmNote)+'</span>':'');
    if(!list.length){ el.innerHTML= loading ? '' : '<div class="evempty">אין תוצאות. נסו מרחק גדול יותר, סוג אחר, או בלי "רק חינם".</div>'; addMapPts('sleeppts', [], '#7A3E9D'); return; }
    var shown=list.slice(0, SL.show);
    el.innerHTML=shown.map(function(r, i){
      var kinds=Object.keys(r.t).filter(function(k){ return SL_KIND[k]; }), main=kinds[0]||'tent';
      var pz= r.price===0 ? '<span class="lp free">חינם</span>' : r.price!=null ? '<span class="lp">$'+(r.price%1?r.price.toFixed(2):r.price)+'</span>' : '<span class="lp unk">מחיר: לבדוק</span>';
      var am=[r.shower?'מקלחות':'', r.wc?'שירותים':'', r.water?'מים':'', r.power?'חשמל':''].filter(Boolean);
      var where= r.amile!=null ? 'בעוד ~'+Math.max(0, Math.round(r.amile-SL.ahead.m0))+' mi בדרך, '+fmtMi(r.d)+' mi ממנה' : fmtMi(r.d)+' mi '+dirAB(p, r);
      return '<article class="evc scard" data-si="'+i+'" style="--ec:'+(r.price===0?'#2E7D32':'#7A3E9D')+'"><div class="evtop"><img alt="" src="'+badgeURL(SL_KIND[main][0], r.price===0?'#2E7D32':'#7A3E9D', 26)+'"><div class="t"><b>'+esc(r.n)+'</b><small>'+esc(kinds.map(function(k){ return SL_KIND[k][1]; }).join(' · '))+(r.city?' · '+esc(r.city):'')+'</small></div>'+pz+'</div>'+
        '<div class="lmeta">'+esc(where)+(am.length?' · '+esc(am.join(' · ')):'')+(r.src==='osm'?' · OpenStreetMap':'')+'</div>'+
        (r.note?'<p>'+esc(r.note.length>220 ? r.note.slice(0,215)+'…' : r.note)+'</p>':'')+
        (r.ptx && r.price!==0 && r.src==='ours'?'<div class="tip"><b>מחיר:</b> '+esc(r.ptx)+'</div>':'')+
        '<div class="links"><button class="maplink onmap" type="button" data-sm="'+i+'">במפה</button>'+qLink({n:r.n, lat:r.lat, lng:r.lng, k:'לינה'})+
        '<a class="maplink" target="_blank" rel="noopener" href="'+wazeLL(r.lat, r.lng)+'">נווט</a><button class="maplink bk" type="button" data-bk="'+i+'" aria-expanded="false">איפה הכי זול להזמין ▾</button></div><div class="bkbox" hidden></div></article>';
    }).join('')+(list.length>SL.show?'<button class="btn" id="sMore" type="button">עוד '+(list.length-SL.show)+' מקומות</button>':'');
    SL.list=shown;
    syncQButtons();
    addMapPts('sleeppts', shown.map(function(r){ return {type:'Feature', properties:{h:r.n, c:r.price===0?'#2E7D32':r.price!=null?'#7A3E9D':'#8E8E93'}, geometry:{type:'Point', coordinates:[r.lng, r.lat]}}; }), '#7A3E9D');
  }
  $('sList').addEventListener('click', function(e){
    var b=e.target.closest('[data-bk],[data-sm],#sMore'); if(!b) return;
    if(b.id==='sMore'){ SL.show+=60; renderSleep(); return; }
    var r=SL.list[+b.getAttribute(b.hasAttribute('data-bk')?'data-bk':'data-sm')]; if(!r) return;
    if(b.hasAttribute('data-bk')){
      var box=b.closest('article').querySelector('.bkbox'), open=box.hidden;
      if(open) box.innerHTML=bookLinks(r);
      box.hidden=!open; b.setAttribute('aria-expanded', open?'true':'false'); b.textContent= open ? 'איפה הכי זול להזמין ▴' : 'איפה הכי זול להזמין ▾';
      return;
    }
    if(r.it){ setTab('map'); selectItem(r.it, true); return; }
    setTab('map'); map.flyTo({center:[r.lng, r.lat], zoom:Math.max(map.getZoom(), 13), duration:1000});
  });
  $('sAt').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; SL.at=b.getAttribute('data-v'); segSet(this, SL.at); $('sQ').value='';
    if(SL.at==='center'){ sleepSearch(); return; }
    $('sNote').textContent='מאתר את המיקום…';
    withHere(function(h){ if(!h.me) toast('אין גישה למיקום, אז מחפש סביב מרכז המפה.', 3200); sleepSearch(); }); });
  $('sSort').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; SL.sort=b.getAttribute('data-v'); segSet(this, SL.sort); renderSleep(); });
  $('sType').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; var t=b.getAttribute('data-t'); SL.types[t]=!SL.types[t]; b.setAttribute('aria-pressed', SL.types[t]?'true':'false'); sleepSearch(); });
  $('sOpt').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; var o=b.getAttribute('data-o'); SL[o]=!SL[o]; b.setAttribute('aria-pressed', SL[o]?'true':'false'); renderSleep(); });
  $('sRad').addEventListener('change', function(){ SL.rad=+this.value; sleepSearch(); });
  $('sForm').addEventListener('submit', function(e){
    e.preventDefault(); var v=$('sQ').value.trim(); if(!v) return; $('sQ').blur();
    var hit=null; ITEMS.forEach(function(it){ if(!hit && it.l && it.l.toLowerCase().indexOf(v.toLowerCase())===0) hit=it; });
    function go(pt, name){ SL.at='q'; SL.pt=pt; SL.qn=name; segSet($('sAt'), ''); sleepSearch(); }
    if(!netUp()){ if(hit) go({lng:hit.n, lat:hit.g}, hit.l); else toast('בלי אינטרנט אפשר לחפש רק ערים מהרשימה שלנו.'); return; }
    jfetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q='+encodeURIComponent(v), 9000).then(function(j){
      if(j && j[0]){ go({lng:+j[0].lon, lat:+j[0].lat}, j[0].display_name.split(',').slice(0,2).join(',')); map.flyTo({center:[+j[0].lon, +j[0].lat], zoom:10, duration:900}); }
      else if(hit) go({lng:hit.n, lat:hit.g}, hit.l);
      else toast('לא מצאתי את המקום. נסו שם באנגלית.');
    }).catch(function(){ if(hit) go({lng:hit.n, lat:hit.g}, hit.l); else toast('החיפוש לא הצליח. נסו שוב.'); });
  });
  function sleepOpen(){
    if(!$('sDate').value){ var d=new Date(), td=tripDates(); var s=td.start; var ds=d.toISOString().slice(0,10); $('sDate').value = ds<s ? s : ds; }
    if(SL.raw){ sleepSearch(); return; }
    if(!hereNow().me && map.getZoom()>=7){ SL.at='center'; segSet($('sAt'), 'center'); sleepSearch(); return; }
    $('sNote').textContent='מאתר את המיקום…';
    withHere(function(h){ if(!h.me){ SL.at='center'; segSet($('sAt'), 'center'); } sleepSearch(); });
  }

  function liveMapClick(e){
    var box=[[e.point.x-8,e.point.y-8],[e.point.x+8,e.point.y+8]];
    if(map.getLayer('poi-must')){ var h=map.queryRenderedFeatures(e.point, {layers:['poi-must']}); if(h.length && ITEMBY[h[0].properties.id]){ selectItem(ITEMBY[h[0].properties.id], false); return true; } }
    if(map.getLayer('sleeppts') && SL.list){
      var f=map.queryRenderedFeatures(box, {layers:['sleeppts']})[0]; if(!f) return false;
      var c=f.geometry.coordinates, r=null; SL.list.forEach(function(x){ if(!r && Math.abs(x.lng-c[0])<1e-5 && Math.abs(x.lat-c[1])<1e-5) r=x; });
      if(!r) return false;
      if(r.it){ selectItem(r.it, false); return true; }
      setTab('sleep'); var el=document.querySelector('#sList [data-si="'+SL.list.indexOf(r)+'"]');
      if(el){ el.scrollIntoView({block:'center'}); el.classList.add('flash'); setTimeout(function(){ el.classList.remove('flash'); }, 1400); }
      return true;
    }
    return false;
  }
  try{ window.__rt={map:map, state:state, SL:SL, FUEL:FUEL}; }catch(e){}  // for tests
  function liveOnLoad(){
    tidyLayers();
    dlCardSync(); setTimeout(dlCardSync, 2500);
    loadFuel();
  }
