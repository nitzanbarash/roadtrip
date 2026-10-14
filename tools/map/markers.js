  /* ================================================================
     markers: a small picture for every kind of place (Material Symbols outlines + a few drawn ones),
     drawn into round badges on demand, so the map reads at a glance and works offline
     ================================================================ */
  var ICONS=__ICONS__;
  var PC={car:'#4A5FC1', ev:'#188038', food:'#E8710A', shop:'#0B7FAB', sleep:'#8E44AD', health:'#D93025', nature:'#2C7A3F', water:'#136C7E', culture:'#12828F', fun:'#C2185B', svc:'#5F6368'};
  // attraction kinds -> glyph (color comes from the kind's group)
  var KIND_ICON={national_park:'forest', state_park:'park', hike:'hiking', waterfall:'waterfall', canyon:'landscape', cave:'cave', scenic:'binoculars', camping:'camping',
    beach:'beach_access', lake_river:'kayaking', springs:'hot_tub', water_park:'pool', theme_park:'attractions', karting:'sports_motorsports', adventure:'paragliding',
    museum:'museum', zoo_aquarium:'pets', city:'location_city', shopping:'shopping_bag', quirky:'auto_awesome', food:'restaurant', ski:'downhill_skiing',
    free_camp:'camping', campground:'cabin', hostel:'bed', motel:'hotel', car_sleep:'airline_seat_flat'};
  // map places (OpenStreetMap classes) -> glyph, color group, Hebrew name
  var POI_ICON={
    fuel:['local_gas_station','car','תחנת דלק'], charging_station:['ev_station','ev','עמדת טעינה'], highway_rest_area:['rest_area','car','תחנת מנוחה'], rest_area:['rest_area','car','תחנת מנוחה'],
    parking:['local_parking','car','חניה'], parking_garage:['local_parking','car','חניון'], car_rental:['car_rental','car','השכרת רכב'], car_repair:['build','car','מוסך'], car:['directions_car','car','רכב'],
    restaurant:['restaurant','food','מסעדה'], fast_food:['fastfood','food','אוכל מהיר'], cafe:['local_cafe','food','בית קפה'], bar:['local_bar','food','בר'], beer:['sports_bar','food','בירה'], ice_cream:['icecream','food','גלידה'], bakery:['bakery_dining','food','מאפייה'],
    grocery:['shopping_cart','shop','סופרמרקט'], shop:['storefront','shop','חנות'], clothing_store:['checkroom','shop','בגדים'], alcohol_shop:['liquor','shop','חנות משקאות'],
    lodging:['hotel','sleep','מלון / מוטל'], campsite:['camping','nature','קמפינג'],
    hospital:['local_hospital','health','בית חולים'], pharmacy:['local_pharmacy','health','בית מרקחת'], doctors:['medical_services','health','מרפאה'],
    park:['park','nature','פארק'], garden:['local_florist','nature','גן'], viewpoint:['binoculars','nature','תצפית'], waterfall:['waterfall','water','מפל'], hot_spring:['hot_tub','water','מעיין חם'], beach:['beach_access','water','חוף'], swimming:['pool','water','בריכה'],
    museum:['museum','culture','מוזיאון'], art_gallery:['palette','culture','גלריה'], monument:['fort','culture','אתר היסטורי'], castle:['fort','culture','מבצר'], attraction:['star','culture','אטרקציה'], theatre:['theater_comedy','culture','תיאטרון'], cinema:['movie','culture','קולנוע'], library:['local_library','culture','ספרייה'], lighthouse:['lighthouse','culture','מגדלור'],
    amusement_park:['attractions','fun','לונה פארק'], theme_park:['attractions','fun','לונה פארק'], zoo:['pets','fun','גן חיות'], aquarium:['set_meal','fun','אקווריום'], casino:['casino','fun','קזינו'], golf:['golf_course','fun','גולף'], stadium:['stadium','fun','אצטדיון'], skiing:['downhill_skiing','fun','סקי'],
    bank:['account_balance','svc','בנק'], atm:['atm','svc','כספומט'], post:['local_post_office','svc','דואר'], police:['local_police','svc','משטרה'], information:['info','svc','מרכז מבקרים'], toilets:['wc','svc','שירותים'], airport:['flight','svc','שדה תעופה']
  };
  var P2D={};
  function glyph(name){
    if(P2D[name]!==undefined) return P2D[name];
    var g=ICONS[name], r=null;
    try{ if(g && window.Path2D) r={p:new Path2D(g.d), h:g.h?new Path2D(g.h):null, b:g.b}; }catch(e){ r=null; }
    P2D[name]=r; return r;
  }
  // a round badge: white ring (gold for must-see), colored disc, white picture
  function badgeCanvas(name, color, s, ring, pr){
    pr=pr||2; var W=s+4, c=document.createElement('canvas'); c.width=W*pr; c.height=W*pr;
    var x=c.getContext('2d'); x.scale(pr,pr);
    var cx=W/2, cy=W/2-.5, r=s/2, rw=ring?2.4:1.6;
    x.beginPath(); x.arc(cx, cy+1, r, 0, 7); x.fillStyle='rgba(0,0,0,.25)'; x.fill();
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fillStyle=ring||'#fff'; x.fill();
    x.beginPath(); x.arc(cx, cy, r-rw, 0, 7); x.fillStyle=color; x.fill();
    var g=glyph(name);
    if(g){
      var gw=g.b[2]-g.b[0], gh=g.b[3]-g.b[1], k=(r-rw)*2*.66/Math.max(gw,gh);
      x.save(); x.translate(cx-(g.b[0]+gw/2)*k, cy-(g.b[1]+gh/2)*k); x.scale(k,k);
      x.fillStyle='#fff'; x.fill(g.p); if(g.h){ x.fillStyle=color; x.fill(g.h); }
      x.restore();
    } else { x.beginPath(); x.arc(cx, cy, r*.28, 0, 7); x.fillStyle='#fff'; x.fill(); }
    return c;
  }
  function badgeImg(name, color, s, ring){ var c=badgeCanvas(name, color, s, ring, 2); return {img:c.getContext('2d').getImageData(0,0,c.width,c.height), pr:2}; }
  function treePattern(sz, spots, col){
    var pr=2, c=document.createElement('canvas'); c.width=sz*pr; c.height=sz*pr;
    var x=c.getContext('2d'); x.scale(pr,pr); var g=glyph('park');
    if(g) spots.forEach(function(sp){ var k=sp[2]/(g.b[3]-g.b[1]); x.save(); x.translate(sp[0]-(g.b[0]+(g.b[2]-g.b[0])/2)*k, sp[1]-(g.b[1]+(g.b[3]-g.b[1])/2)*k); x.scale(k,k); x.fillStyle=col; x.fill(g.p); x.restore(); });
    return {img:x.getImageData(0,0,c.width,c.height), pr:pr};
  }
  function kindColor(k){ var kd=KINDS[k]; return (kd && GHEX[kd.g]) || '#6B4A93'; }
  // image ids: a-<kind>[-m] attractions, p-<class> map places, n-<cat> nearby search, pat-* patterns
  function markerImage(id){
    var m;
    if((m=/^a-(.+?)(-m)?$/.exec(id))) return badgeImg(KIND_ICON[m[1]]||'star', kindColor(m[1]), 28, m[2]?'#F2B01E':null);
    if((m=/^p-(.+)$/.exec(id)) && POI_ICON[m[1]]) return badgeImg(POI_ICON[m[1]][0], PC[POI_ICON[m[1]][1]], 21, null);
    if((m=/^n-(.+)$/.exec(id)) && NEAR_BY[m[1]]) return badgeImg(NEAR_BY[m[1]].icon, NEAR_BY[m[1]].c, 25, null);
    if((m=/^e-(.+)$/.exec(id))){ var et=EV_TYPE[m[1]]||EV_TYPE.other; return badgeImg(et[0], et[1], 26, '#ffffff'); }
    if(id==='pat-trees') return treePattern(28, [[7,8,9],[21,22,9]], 'rgba(46,110,52,.42)');
    if(id==='pat-park') return treePattern(44, [[11,12,9],[33,34,9]], 'rgba(46,110,52,.26)');
    return null;
  }
  function legendHTML(){
    function it(src, t){ return '<span><img alt="" src="'+src+'">'+esc(t)+'</span>'; }
    var a=Object.keys(KIND_ICON).filter(function(k){ return KINDS[k]; }).map(function(k){ return it(badgeCanvas(KIND_ICON[k], kindColor(k), 22, null, 2).toDataURL(), KINDS[k].he); }).join('');
    var seen={}, b=['fuel','charging_station','highway_rest_area','restaurant','fast_food','cafe','grocery','lodging','campsite','hospital','pharmacy','parking','information','toilets','viewpoint','amusement_park','zoo','museum','bank','atm'].map(function(c){ var p=POI_ICON[c]; if(seen[p[2]]) return ''; seen[p[2]]=1; return it(badgeCanvas(p[0], PC[p[1]], 20, null, 2).toDataURL(), p[2]); }).join('');
    return '<div class="lgk">אטרקציות מהרשימה (טבעת זהב = חובה)</div><div class="lg">'+a+'</div><div class="lgk">במפה, כשמתקרבים</div><div class="lg">'+b+'</div><div class="lgk">יער ופארקים מסומנים בעצים קטנים</div>';
  }
  var legendDone=false;
  $('bLayers').addEventListener('click', function(){ if(legendDone) return; legendDone=true; try{ $('legend').innerHTML=legendHTML(); }catch(e){} });
