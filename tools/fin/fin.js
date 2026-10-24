/* ================================================================
   trip money: shared expenses, who owes whom, charts, tables, budgets.
   finInit(root, env) — env: {toast, download(name,text), loadScript(src), claude, fire, docs:[names], onDoc(name,data)}
   Storage: Claude page database, Firebase (the app), or this phone only.
   ================================================================ */
function finInit(root, env){
  function $f(id){ return root.querySelector('#'+id); }
  function fe(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[m]; }); }
  function lg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function ls(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function lj(k){ try{ return JSON.parse(lg(k)||'null'); }catch(e){ return null; } }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function b64e(s){ return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s){ return decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/')))); }
  var toast=env.toast||function(){};
  var SYM={USD:'$', ILS:'₪', EUR:'€'}, CURS=['USD','ILS','EUR'];
  var DEF={people:[{id:'p1',name:'ניצן'},{id:'p2',name:'אוסטר'}],
    cats:[{id:'fuel',name:'דלק'},{id:'food',name:'אוכל'},{id:'sleep',name:'לינה'},{id:'fun',name:'אטרקציות'},{id:'gro',name:'סופר'},{id:'car',name:'רכב והשכרה'},{id:'shop',name:'קניות'},{id:'park',name:'חניה ואגרה'},{id:'ins',name:'ביטוח'},{id:'other',name:'אחר'}],
    rates:{ILS:3.65, EUR:0.92}, display:'USD', start:'2026-12-14', end:'2027-02-15', budgets:{}};
  function norm(s){
    s=s&&s.people&&s.cats ? s : clone(DEF);
    if(s.people.length<2) s.people=clone(DEF.people);
    if(!s.cats.length) s.cats=[{id:'other',name:'אחר'}];
    s.rates=s.rates||clone(DEF.rates); s.budgets=s.budgets||{}; s.display=s.display||'USD';
    return s;
  }
  var S=norm(lj('fin_s')), EX=lj('fin_ex')||[];
  var me=lg('fin_me')||'p1';
  var form={cur:lg('fin_cur')||'USD', payer:me, cat:S.cats[0].id, split:'eq'};
  var editing=null, store=null, tab=lg('fin_tab')||'add', sortBy={k:'d', up:false}, H;

  /* ---------- money ---------- */
  function rate(c){ return c==='USD' ? 1 : (+S.rates[c]||1); }
  function usd(e){ return (+e.amt||0)/rate(e.cur); }
  function disp(u){ return u*rate(S.display); }
  function fmt(u, cur){ var c=cur||S.display, v=cur?u:disp(u), a=Math.abs(v), d=a<100?2:0; return (v<0?'−':'')+SYM[c]+a.toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d}); }
  function shareOf(e,p){ if(!e.split) return .5; return e.split[p]!=null ? +e.split[p] : 0; }
  function pName(id){ for(var i=0;i<S.people.length;i++) if(S.people[i].id===id) return S.people[i].name; return id; }
  function catIdx(id){ for(var i=0;i<S.cats.length;i++) if(S.cats[i].id===id) return i; return 99; }
  function cName(id){ var i=catIdx(id); return i<99 ? S.cats[i].name : id; }
  function catColor(id){ var i=catIdx(id); return i<7 ? 'var(--c'+(i+1)+')' : 'var(--cx)'; }
  function pColor(id){ return id===S.people[0].id ? 'var(--p1)' : 'var(--p2)'; }
  function pad(n){ return (n<10?'0':'')+n; }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function dObj(s){ var p=String(s||'').split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function fmtDate(d, short){ if(!d) return ''; var dt=dObj(d); return (short?'':['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][dt.getDay()]+' ')+dt.getDate()+'.'+(dt.getMonth()+1); }
  function isPersonal(e){ return S.people.filter(function(p){ return shareOf(e,p.id)>0; }).length===1; }
  function sums(list){
    list=list||EX;
    var o={paid:{}, owed:{}, spent:{}, cat:{}, day:{}, tot:0};
    S.people.forEach(function(p){ o.paid[p.id]=0; o.owed[p.id]=0; o.spent[p.id]={tot:0, cats:{}}; });
    list.forEach(function(e){
      var u=usd(e); o.tot+=u; if(o.paid[e.payer]!=null) o.paid[e.payer]+=u;
      S.people.forEach(function(p){ var sh=u*shareOf(e,p.id); o.owed[p.id]+=sh; o.spent[p.id].tot+=sh; o.spent[p.id].cats[e.cat]=(o.spent[p.id].cats[e.cat]||0)+sh; });
      o.cat[e.cat]=(o.cat[e.cat]||0)+u; o.day[e.d]=(o.day[e.d]||0)+u;
    });
    return o;
  }
  function daysInfo(){
    if(!S.start || !S.end) return null;
    var st=dObj(S.start), en=dObj(S.end), now=dObj(today()), ms=864e5;
    var total=Math.max(1, Math.round((en-st)/ms)+1), left=now<st ? total : Math.max(1, Math.round((en-now)/ms)+1);
    return {total:total, left:Math.min(total,left)};
  }

  /* ---------- tabs ---------- */
  function busy(sec){ var a=document.activeElement; return !!(a && sec.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)); }
  function showTab(t){
    tab=t; ls('fin_tab', t);
    Array.prototype.forEach.call(root.querySelectorAll('section[data-p]'), function(s){ s.hidden = s.getAttribute('data-p')!==t; });
    Array.prototype.forEach.call($f('fTabs').children, function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-t')===t?'true':'false'); });
    render(false);
  }
  $f('fTabs').addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) showTab(b.getAttribute('data-t')); });
  function render(remote){
    renderForm();
    var sec=root.querySelector('section[data-p="'+tab+'"]');
    if(tab==='add') renderList();
    else if(tab==='bal') renderBal();
    else if(tab==='tab') renderTable();
    else if(tab==='bud'){ if(!(remote && busy(sec))) renderBud(); }
    else if(tab==='set'){ if(!remote) renderSet(); else renderSyncBox(); }
  }

  /* ---------- add / edit ---------- */
  function seg(el, opts, cur, on){
    el.innerHTML=opts.map(function(o){ return '<button type="button" data-v="'+fe(o.v)+'" aria-pressed="'+(o.v===cur?'true':'false')+'">'+fe(o.t)+'</button>'; }).join('');
    el.onclick=function(e){ var b=e.target.closest('button'); if(b) on(b.getAttribute('data-v')); };
  }
  function renderForm(){
    var ppl=S.people.map(function(p){ return {v:p.id, t:p.name}; });
    seg($f('fMe'), ppl, me, function(v){ me=v; ls('fin_me', v); if(!editing) form.payer=v; renderForm(); });
    seg($f('fCur'), CURS.map(function(c){ return {v:c, t:SYM[c]}; }), form.cur, function(v){ form.cur=v; ls('fin_cur', v); renderForm(); });
    seg($f('fPay'), ppl, form.payer, function(v){ form.payer=v; renderForm(); });
    var other=S.people.filter(function(p){ return p.id!==form.payer; })[0];
    seg($f('fSplit'), [{v:'eq', t:'חצי-חצי'}, {v:'mine', t:'רק '+pName(form.payer)}, {v:'theirs', t:'רק '+(other?other.name:'')}, {v:'custom', t:'אחוזים'}], form.split, function(v){ form.split=v; renderForm(); });
    $f('fCustom').hidden = form.split!=='custom';
    $f('fCL1').textContent=S.people[0].name+' %'; $f('fCL2').textContent=S.people[1].name+' %';
    if(catIdx(form.cat)===99) form.cat=S.cats[0].id;
    $f('fCats').innerHTML=S.cats.map(function(c){ return '<button class="fchip" type="button" data-v="'+fe(c.id)+'" style="--sw:'+catColor(c.id)+'" aria-pressed="'+(c.id===form.cat?'true':'false')+'"><i></i>'+fe(c.name)+'</button>'; }).join('');
    $f('fCats').onclick=function(e){ var b=e.target.closest('button'); if(!b) return; form.cat=b.getAttribute('data-v'); renderForm(); };
    if(!$f('fDate').value) $f('fDate').value=today();
    $f('fSave').textContent = editing ? 'שמירת השינוי' : 'הוספת הוצאה';
    $f('fCancel').hidden=!editing; $f('fDel').hidden=!editing;
  }
  $f('fC1').addEventListener('input', function(){ $f('fC2').value=100-Math.max(0,Math.min(100,+this.value||0)); });
  $f('fC2').addEventListener('input', function(){ $f('fC1').value=100-Math.max(0,Math.min(100,+this.value||0)); });
  function splitOf(){
    var a=S.people[0].id, b=S.people[1].id, o={};
    if(form.split==='eq'){ o[a]=.5; o[b]=.5; }
    else if(form.split==='mine') o[form.payer]=1;
    else if(form.split==='theirs'){ var x=S.people.filter(function(p){ return p.id!==form.payer; })[0]; o[x?x.id:b]=1; }
    else { var v=Math.max(0,Math.min(100,+$f('fC1').value||50)); o[a]=v/100; o[b]=(100-v)/100; }
    return o;
  }
  function clearForm(){ editing=null; $f('fAmt').value=''; $f('fNote').value=''; $f('fDate').value=today(); form.split='eq'; form.payer=me; renderForm(); }
  $f('fCancel').addEventListener('click', clearForm);
  function newId(){ return 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  $f('fSave').addEventListener('click', function(){
    var amt=parseFloat($f('fAmt').value);
    if(!(amt>0)){ toast('כתבו סכום.'); $f('fAmt').focus(); return; }
    var e={d:$f('fDate').value||today(), t:editing?editing.t:Date.now(), payer:form.payer, amt:Math.round(amt*100)/100, cur:form.cur, cat:form.cat, note:$f('fNote').value.trim(), split:splitOf()};
    var id=editing ? editing.id : newId(), was=!!editing;
    applyLocal(id, e);
    store.setExpense(id, e).then(function(ok){ if(!ok && store.kind!=='local') toast('נשמר בטלפון. יסונכרן כשיהיה חיבור.'); });
    toast(was ? 'עודכן.' : 'נוסף: '+fmt(usd(e)));
    clearForm();
  });
  $f('fDel').addEventListener('click', function(){
    if(!editing) return; var b=$f('fDel');
    if(b.getAttribute('data-arm')!=='1'){ b.textContent='בטוח? לחצו שוב'; b.setAttribute('data-arm','1'); setTimeout(function(){ b.textContent='מחיקה'; b.removeAttribute('data-arm'); }, 3000); return; }
    var id=editing.id; b.textContent='מחיקה'; b.removeAttribute('data-arm');
    applyLocal(id, null); store.delExpense(id); toast('נמחק.'); clearForm();
  });
  function startEdit(e){
    editing=e; $f('fAmt').value=e.amt; $f('fNote').value=e.note||''; $f('fDate').value=e.d; form.cur=e.cur; form.payer=e.payer; form.cat=e.cat;
    var a=S.people[0].id, b=S.people[1].id, sa=shareOf(e,a), sb=shareOf(e,b);
    if(sa===.5 && sb===.5) form.split='eq'; else if(shareOf(e,e.payer)===1) form.split='mine'; else if(sa===1||sb===1) form.split='theirs'; else { form.split='custom'; $f('fC1').value=Math.round(sa*100); $f('fC2').value=Math.round(sb*100); }
    showTab('add'); try{ $f('fAmt').scrollIntoView({block:'center', behavior:'smooth'}); }catch(x){}
  }
  function byId(id){ for(var i=0;i<EX.length;i++) if(EX[i].id===id) return EX[i]; return null; }
  function sorted(){ return EX.slice().sort(function(a,b){ return (b.d>a.d?1:b.d<a.d?-1:0) || ((b.t||0)-(a.t||0)); }); }
  function renderList(){
    var el=$f('fList'), list=sorted();
    if(!list.length){ el.innerHTML='<div class="fempty">עוד אין הוצאות. כותבים סכום למעלה, בוחרים מי שילם ואיך מתחלקים, ולוחצים ״הוספת הוצאה״.</div>'; return; }
    var dayTot={}; list.forEach(function(e){ dayTot[e.d]=(dayTot[e.d]||0)+usd(e); });
    var html='', day=null;
    list.slice(0,40).forEach(function(e){
      if(e.d!==day){ day=e.d; html+='<div class="fday"><span>'+fmtDate(day)+'</span><span class="fnum">'+fmt(dayTot[day])+'</span></div>'; }
      html+='<button class="fex" type="button" data-id="'+fe(e.id)+'" style="--sw:'+catColor(e.cat)+'"><span class="ic"></span><span class="tx"><b>'+fe(e.note||cName(e.cat))+'</b><small>'+fe(cName(e.cat))+' · שילם/ה '+fe(pName(e.payer))+(isPersonal(e)?' · רק של '+fe(pName(S.people.filter(function(p){ return shareOf(e,p.id)>0; })[0].id)):'')+(e.cur!==S.display?' · '+SYM[e.cur]+e.amt:'')+'</small></span><b class="am fnum">'+fmt(usd(e))+'</b></button>';
    });
    if(list.length>40) html+='<p class="fnote" style="padding-top:8px">ועוד '+(list.length-40)+' הוצאות בלשונית ״טבלה״.</p>';
    el.innerHTML=html;
  }
  root.addEventListener('click', function(e){ var b=e.target.closest('[data-id]'); if(!b || !root.contains(b)) return; var x=byId(b.getAttribute('data-id')); if(x) startEdit(x); });

  /* ---------- charts ---------- */
  function arc(cx,cy,R,r,a0,a1){
    var big=(a1-a0)>Math.PI?1:0;
    function p(rad,a){ return (cx+rad*Math.cos(a)).toFixed(2)+' '+(cy+rad*Math.sin(a)).toFixed(2); }
    return 'M'+p(R,a0)+'A'+R+' '+R+' 0 '+big+' 1 '+p(R,a1)+'L'+p(r,a1)+'A'+r+' '+r+' 0 '+big+' 0 '+p(r,a0)+'Z';
  }
  function donut(el, rows, label){
    var tot=rows.reduce(function(s,w){ return s+w.v; },0);
    if(!(tot>0)){ el.innerHTML='<p class="fnote">עוד אין הוצאות.</p>'; return; }
    var a=-Math.PI/2, paths='';
    rows.forEach(function(w,i){ var f=w.v/tot, a1=a+f*2*Math.PI; if(f>.9999) a1=a+2*Math.PI-.0005; paths+='<path data-i="'+i+'" d="'+arc(90,90,84,55,a,a1)+'" style="fill:'+w.c+';stroke:var(--surface);stroke-width:2"></path>'; a=a1; });
    el.innerHTML='<svg viewBox="0 0 180 180" role="img" aria-label="'+fe(label)+'">'+paths+'<text class="s" x="90" y="84" text-anchor="middle" font-size="12.5">'+fe(label)+'</text><text x="90" y="106" text-anchor="middle" font-size="19" font-weight="800">'+fe(fmt(tot))+'</text></svg>'+
      '<div class="flegend">'+rows.map(function(w,i){ return '<button type="button" data-i="'+i+'" style="--sw:'+w.c+'"><i></i><b>'+fe(w.t)+'</b><span class="fnum">'+fe(fmt(w.v))+'</span><span class="pc fnum">'+Math.round(w.v/tot*100)+'%</span></button>'; }).join('')+'</div>';
    var sel=-1, svg=el.querySelector('svg'), t1=svg.querySelectorAll('text')[0], t2=svg.querySelectorAll('text')[1];
    function focus(i){
      sel = sel===i ? -1 : i;
      Array.prototype.forEach.call(svg.querySelectorAll('path'), function(p,k){ p.style.opacity = sel<0||sel===k ? 1 : .28; });
      Array.prototype.forEach.call(el.querySelectorAll('.flegend button'), function(b,k){ b.setAttribute('aria-pressed', sel===k?'true':'false'); });
      if(sel<0){ t1.textContent=label; t2.textContent=fmt(tot); } else { t1.textContent=rows[sel].t+' · '+Math.round(rows[sel].v/tot*100)+'%'; t2.textContent=fmt(rows[sel].v); }
    }
    el.onclick=function(e){ var x=e.target.closest('[data-i]'); if(x) focus(+x.getAttribute('data-i')); };
  }
  function catRows(map){
    var rows=[], rest=0;
    S.cats.forEach(function(c,i){ var v=map[c.id]||0; if(!v) return; if(i<7) rows.push({t:c.name, v:v, c:'var(--c'+(i+1)+')'}); else rest+=v; });
    Object.keys(map).forEach(function(k){ if(catIdx(k)===99) rest+=map[k]; });
    if(rest>0) rows.push({t:'שאר', v:rest, c:'var(--cx)'});
    return rows;
  }
  function niceMax(v){ if(!(v>0)) return 1; var m=Math.pow(10, Math.floor(Math.log(v)/Math.LN10)); var f=[1,2,2.5,5,10]; for(var i=0;i<f.length;i++) if(f[i]*m>=v) return f[i]*m; return 10*m; }
  function short(v){ var c=SYM[S.display]; return v>=1000 ? c+(Math.round(v/100)/10)+'k' : c+Math.round(v); }
  function dayBars(el, tipEl, map){
    var days=Object.keys(map).sort();
    if(!days.length){ el.innerHTML='<p class="fnote">עוד אין הוצאות.</p>'; tipEl.textContent=''; return; }
    var vals=days.map(function(d){ return disp(map[d]); }), mx=niceMax(Math.max.apply(null, vals));
    var n=days.length, step=28, bw=18, left=40, H=150, top=10, base=H-24, W=Math.max((el.clientWidth||320), left+n*step+8), ch=base-top, svg='';
    [0, .5, 1].forEach(function(f){ var y=base-f*ch; svg+='<line class="gl" x1="'+left+'" x2="'+(W-4)+'" y1="'+y+'" y2="'+y+'"></line><text x="'+(left-6)+'" y="'+(y+3.5)+'" text-anchor="end">'+short(mx*f)+'</text>'; });
    days.forEach(function(d,i){
      var x=W-8-(i+1)*step+(step-bw)/2, h=Math.max(1.5, vals[i]/mx*ch), y=base-h, r=Math.min(4,h);
      svg+='<path class="bar" data-i="'+i+'" d="M'+x+' '+base+'V'+(y+r)+'Q'+x+' '+y+' '+(x+r)+' '+y+'H'+(x+bw-r)+'Q'+(x+bw)+' '+y+' '+(x+bw)+' '+(y+r)+'V'+base+'Z"></path>';
      if(n<=16 || i%2===0) svg+='<text x="'+(x+bw/2)+'" y="'+(base+14)+'" text-anchor="middle">'+fmtDate(d,true)+'</text>';
      svg+='<rect class="hit" data-i="'+i+'" x="'+(x-(step-bw)/2)+'" y="'+top+'" width="'+step+'" height="'+(base-top)+'"></rect>';
    });
    el.innerHTML='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="הוצאות לפי יום">'+svg+'</svg>';
    var on=-1;
    el.onclick=function(e){ var x=e.target.closest('[data-i]'); if(!x) return; var i=+x.getAttribute('data-i'); on = on===i ? -1 : i;
      Array.prototype.forEach.call(el.querySelectorAll('.bar'), function(b,k){ b.classList.toggle('on', k===on); });
      tipEl.textContent = on<0 ? 'לחצו על עמודה לפרטים' : fmtDate(days[on])+' · '+fmt(map[days[on]]); };
    tipEl.textContent='לחצו על עמודה לפרטים';
  }

  /* ---------- balance ---------- */
  function renderBal(){
    var s=sums(), a=S.people[0], b=S.people[1], net=s.paid[a.id]-s.owed[a.id], o=$f('fOwe'), even=Math.abs(net)<.005;
    o.className='fowe'+(even?' even':'');
    o.innerHTML= even ? 'מאוזן. אף אחד לא חייב כלום.' : fe(net>0?b.name:a.name)+' צריך/ה להחזיר ל'+fe(net>0?a.name:b.name)+'<br><span class="fnum">'+fmt(Math.abs(net))+'</span>';
    var di=daysInfo();
    $f('fTiles').innerHTML='<div class="ftile"><span class="flbl">סה״כ הוצאות</span><span class="fnum">'+fmt(s.tot)+'</span><small>'+EX.length+' הוצאות</small></div>'+
      '<div class="ftile"><span class="flbl">ממוצע ליום</span><span class="fnum">'+fmt(s.tot/Math.max(1,Object.keys(s.day).length))+'</span><small>'+Object.keys(s.day).length+' ימים עם הוצאות</small></div>'+
      S.people.map(function(p){ return '<div class="ftile"><span class="flbl">'+fe(p.name)+' שילם/ה</span><span class="fnum">'+fmt(s.paid[p.id])+'</span><small>החלק שלו/ה: '+fmt(s.owed[p.id])+'</small></div>'; }).join('');
    donut($f('fDonut'), catRows(s.cat), 'סה״כ');
    var pa=s.paid[a.id], pb=s.paid[b.id], pt=pa+pb;
    $f('fWho').innerHTML= pt>0 ? '<div class="fsplit"><i style="width:'+(pa/pt*100).toFixed(1)+'%;background:var(--p1)"></i><i style="width:'+(pb/pt*100).toFixed(1)+'%;background:var(--p2)"></i></div>'+
      '<div class="fsplitl"><span><i style="--sw:var(--p1)"></i>'+fe(a.name)+' <b class="fnum">'+fmt(pa)+'</b> ('+Math.round(pa/pt*100)+'%)</span><span><i style="--sw:var(--p2)"></i>'+fe(b.name)+' <b class="fnum">'+fmt(pb)+'</b> ('+Math.round(pb/pt*100)+'%)</span></div>' : '<p class="fnote">עוד אין הוצאות.</p>';
    dayBars($f('fDays'), $f('fDayTip'), s.day);
  }

  /* ---------- tables ---------- */
  function renderTable(){
    var s=sums(), a=S.people[0], b=S.people[1];
    var rows=S.cats.filter(function(c){ return s.cat[c.id]; });
    $f('fSum').innerHTML = !rows.length ? '<p class="fnote" style="padding:10px">עוד אין הוצאות.</p>' :
      '<table class="ftable"><thead><tr><th>קטגוריה</th><th class="n">'+fe(a.name)+'</th><th class="n">'+fe(b.name)+'</th><th class="n">סה״כ</th><th class="n">%</th></tr></thead><tbody>'+
      rows.map(function(c){ return '<tr><td><span class="sw" style="--sw:'+catColor(c.id)+'"></span>'+fe(c.name)+'</td><td class="n">'+fmt(s.spent[a.id].cats[c.id]||0)+'</td><td class="n">'+fmt(s.spent[b.id].cats[c.id]||0)+'</td><td class="n">'+fmt(s.cat[c.id])+'</td><td class="n">'+Math.round(s.cat[c.id]/s.tot*100)+'%</td></tr>'; }).join('')+
      '<tr class="tot"><td>סה״כ</td><td class="n">'+fmt(s.spent[a.id].tot)+'</td><td class="n">'+fmt(s.spent[b.id].tot)+'</td><td class="n">'+fmt(s.tot)+'</td><td class="n">100%</td></tr></tbody></table>';
    var fc=$f('fFCat'), fp=$f('fFPay'), cv=fc.value, pv=fp.value;
    fc.innerHTML='<option value="">כל הקטגוריות</option>'+S.cats.map(function(c){ return '<option value="'+fe(c.id)+'">'+fe(c.name)+'</option>'; }).join(''); fc.value=cv;
    fp.innerHTML='<option value="">כולם שילמו</option>'+S.people.map(function(p){ return '<option value="'+fe(p.id)+'">שילם/ה '+fe(p.name)+'</option>'; }).join(''); fp.value=pv;
    var list=filtered(), tot=0;
    list.forEach(function(e){ tot+=usd(e); });
    function th(k,t,n){ return '<th'+(n?' class="n"':'')+'><button type="button" data-sort="'+k+'" class="'+(sortBy.k===k?'on'+(sortBy.up?' up':''):'')+'">'+t+'</button></th>'; }
    $f('fAll').innerHTML = !list.length ? '<p class="fnote" style="padding:10px">אין הוצאות לסינון הזה.</p>' :
      '<table class="ftable"><thead><tr>'+th('d','תאריך')+th('note','מה')+th('cat','קטגוריה')+th('payer','שילם')+th('amt','מקורי',1)+th('usd','סכום',1)+'</tr></thead><tbody>'+
      list.map(function(e){ return '<tr data-id="'+fe(e.id)+'" style="cursor:pointer"><td>'+fmtDate(e.d,true)+'</td><td class="w">'+fe(e.note||'—')+'</td><td><span class="sw" style="--sw:'+catColor(e.cat)+'"></span>'+fe(cName(e.cat))+'</td><td>'+fe(pName(e.payer))+'</td><td class="n">'+SYM[e.cur]+(+e.amt).toLocaleString('en-US')+'</td><td class="n">'+fmt(usd(e))+'</td></tr>'; }).join('')+
      '<tr class="tot"><td colspan="5">'+list.length+' הוצאות</td><td class="n">'+fmt(tot)+'</td></tr></tbody></table>';
  }
  function filtered(){
    var c=$f('fFCat').value, p=$f('fFPay').value, k=sortBy.k, up=sortBy.up?1:-1;
    return EX.filter(function(e){ return (!c||e.cat===c) && (!p||e.payer===p); }).sort(function(a,b){
      var x, y;
      if(k==='usd'){ x=usd(a); y=usd(b); } else if(k==='amt'){ x=+a.amt; y=+b.amt; } else if(k==='cat'){ x=cName(a.cat); y=cName(b.cat); } else if(k==='payer'){ x=pName(a.payer); y=pName(b.payer); } else if(k==='note'){ x=a.note||''; y=b.note||''; } else { x=a.d+(a.t||0); y=b.d+(b.t||0); }
      return (x>y?1:x<y?-1:0)*up;
    });
  }
  $f('fAll').addEventListener('click', function(e){ var b=e.target.closest('[data-sort]'); if(!b) return; e.stopPropagation(); var k=b.getAttribute('data-sort'); sortBy = sortBy.k===k ? {k:k, up:!sortBy.up} : {k:k, up:k!=='d'&&k!=='usd'&&k!=='amt'}; renderTable(); }, true);
  $f('fFCat').addEventListener('change', renderTable); $f('fFPay').addEventListener('change', renderTable);
  function csvCell(v){ v=v==null?'':String(v); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
  $f('fCsv').addEventListener('click', function(){
    var a=S.people[0], b=S.people[1];
    var rows=[['Date','What','Category','Paid by','Amount','Currency','Amount '+S.display, a.name+' share', b.name+' share']];
    filtered().forEach(function(e){ var u=usd(e); rows.push([e.d, e.note||'', cName(e.cat), pName(e.payer), e.amt, e.cur, disp(u).toFixed(2), disp(u*shareOf(e,a.id)).toFixed(2), disp(u*shareOf(e,b.id)).toFixed(2)]); });
    var txt='﻿'+rows.map(function(r){ return r.map(csvCell).join(','); }).join('\r\n');
    if(env.download) env.download('trip-expenses.csv', txt); else toast('הייצוא לא זמין כאן.');
  });

  /* ---------- budgets ---------- */
  function renderBud(){
    var s=sums(), di=daysInfo(), html='';
    S.people.forEach(function(p){
      var b=S.budgets[p.id]||{total:0, cats:{}}, sp=s.spent[p.id], totB=+b.total||0, left=totB-sp.tot;
      html+='<div class="fcard"><h3>'+fe(p.name)+'</h3><div class="ftiles">'+
        '<div class="ftile"><span class="flbl">הוצאתי</span><span class="fnum">'+fmt(sp.tot)+'</span><small>כולל החלק שלי במשותף</small></div>'+
        '<div class="ftile"><span class="flbl">'+(totB?'נשאר':'תקציב')+'</span><span class="fnum" style="color:'+(totB&&left<0?'var(--fpink)':'inherit')+'">'+(totB?fmt(left):'—')+'</span><small>'+(totB&&di?'≈ '+fmt(Math.max(0,left)/di.left)+' ליום · '+di.left+' ימים':(totB?'מתוך '+fmt(totB):'קבעו למטה'))+'</small></div></div>'+
        (totB?'<div class="fbar'+(sp.tot>totB?' over':sp.tot>totB*.8?' warn':'')+'"><div class="t"><b>מהתקציב הכולל</b><span class="fnum">'+Math.round(sp.tot/totB*100)+'%</span></div><div class="g"><i style="width:'+Math.min(100,sp.tot/totB*100).toFixed(1)+'%"></i></div></div>':'')+
        '<div class="fdonut" data-don="'+p.id+'"></div>'+
        S.cats.map(function(c){ var cb=+(b.cats&&b.cats[c.id])||0, cs=sp.cats[c.id]||0; if(!cb) return ''; return '<div class="fbar'+(cs>cb?' over':cs>cb*.8?' warn':'')+'"><div class="t"><b>'+fe(c.name)+'</b><span class="fnum">'+fmt(cs)+' / '+fmt(cb)+'</span></div><div class="g"><i style="width:'+Math.min(100,cs/cb*100).toFixed(1)+'%"></i></div></div>'; }).join('')+
        '<h4>התקציב שלי ('+SYM[S.display]+')</h4><div class="fbud"><span>סה״כ לכל הטיול</span><input type="number" min="0" step="1" inputmode="decimal" data-p="'+p.id+'" data-c="" value="'+(totB?Math.round(disp(totB)):'')+'">'+
        S.cats.map(function(c){ var cb=+(b.cats&&b.cats[c.id])||0; return '<span>'+fe(c.name)+'</span><input type="number" min="0" step="1" inputmode="decimal" data-p="'+p.id+'" data-c="'+fe(c.id)+'" value="'+(cb?Math.round(disp(cb)):'')+'" placeholder="—">'; }).join('')+'</div></div>';
    });
    $f('fBud').innerHTML=html;
    S.people.forEach(function(p){ var el=$f('fBud').querySelector('[data-don="'+p.id+'"]'); if(el) donut(el, catRows(s.spent[p.id].cats), 'שלי'); });
  }
  $f('fBudSave').addEventListener('click', function(){
    var b={}; S.people.forEach(function(p){ b[p.id]={total:0, cats:{}}; });
    Array.prototype.forEach.call($f('fBud').querySelectorAll('input'), function(i){ var v=parseFloat(i.value); if(!(v>0)) return; var u=v/rate(S.display), p=i.getAttribute('data-p'), c=i.getAttribute('data-c'); if(!b[p]) return; if(c) b[p].cats[c]=u; else b[p].total=u; });
    S.budgets=b; saveSettings($f('fBudNote')); renderBud();
  });

  /* ---------- settings ---------- */
  function renderSet(){
    $f('fN1').value=S.people[0].name; $f('fN2').value=S.people[1].name; $f('fRILS').value=S.rates.ILS; $f('fREUR').value=S.rates.EUR; $f('fDisp').value=S.display; $f('fDS').value=S.start||''; $f('fDE').value=S.end||'';
    $f('fCatsEdit').innerHTML=S.cats.map(function(c,i){ return '<div class="frow"><i style="--sw:'+catColor(c.id)+'"></i><input type="text" maxlength="24" data-i="'+i+'" value="'+fe(c.name)+'" aria-label="שם קטגוריה"><button class="fbtn sm" type="button" data-up="'+i+'" aria-label="למעלה"'+(i?'':' disabled')+'>▲</button><button class="fbtn sm dng" type="button" data-rm="'+i+'">הסרה</button></div>'; }).join('');
    renderSyncBox();
  }
  $f('fCatsEdit').addEventListener('click', function(e){
    var r=e.target.closest('[data-rm]'), u=e.target.closest('[data-up]');
    if(r){ readSet(); S.cats.splice(+r.getAttribute('data-rm'),1); if(!S.cats.length) S.cats=[{id:'other',name:'אחר'}]; renderSet(); }
    if(u){ readSet(); var i=+u.getAttribute('data-up'); if(i>0){ var c=S.cats.splice(i,1)[0]; S.cats.splice(i-1,0,c); } renderSet(); }
  });
  $f('fAddCat').addEventListener('click', function(){ var n=$f('fNewCat').value.trim(); if(!n) return; readSet(); S.cats.push({id:'c'+Date.now().toString(36), name:n}); $f('fNewCat').value=''; renderSet(); });
  function readSet(){
    S.people[0].name=$f('fN1').value.trim()||S.people[0].name; S.people[1].name=$f('fN2').value.trim()||S.people[1].name;
    S.rates.ILS=parseFloat($f('fRILS').value)||S.rates.ILS; S.rates.EUR=parseFloat($f('fREUR').value)||S.rates.EUR; S.display=$f('fDisp').value; S.start=$f('fDS').value; S.end=$f('fDE').value;
    Array.prototype.forEach.call($f('fCatsEdit').querySelectorAll('input'), function(i){ var k=+i.getAttribute('data-i'); if(S.cats[k]) S.cats[k].name=i.value.trim()||S.cats[k].name; });
  }
  $f('fSetSave').addEventListener('click', function(){ readSet(); saveSettings($f('fSetNote')); renderSet(); renderForm(); });
  function saveSettings(note){
    cache(); ls('fin_sdirty','1');
    if(note) note.textContent='שומר…';
    return store.setSettings(S).then(function(ok){
      if(ok) ls('fin_sdirty','0');
      if(note) note.textContent = ok ? (store.kind==='local' ? 'נשמר בטלפון הזה ✓' : 'נשמר לשניכם ✓') : 'נשמר בטלפון. יסונכרן כשיהיה חיבור.';
      return ok;
    });
  }
  // move all data between phones / apps with a code
  $f('fMoveOut').addEventListener('click', function(){
    var tx=$f('fMoveTx'); tx.value='RTFIN1:'+b64e(JSON.stringify({s:S, e:EX}));
    var p=(navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(tx.value) : Promise.reject();
    p.then(function(){ toast('הקוד הועתק. הדביקו אותו במכשיר השני.'); }, function(){ tx.focus(); tx.select(); toast('סמנו והעתיקו את הקוד.'); });
  });
  $f('fMoveIn').addEventListener('click', function(){
    try{
      var m=/RTFIN1:([A-Za-z0-9+/=_-]+)/.exec($f('fMoveTx').value||''); if(!m) throw 0;
      var o=JSON.parse(b64d(m[1])); if(!o || !o.s || !o.e) throw 0;
      S=norm(o.s); var have={}; EX.forEach(function(e){ have[e.id]=e; });
      o.e.forEach(function(e){ if(!have[e.id] || (e.t||0)>=(have[e.id].t||0)){ applyLocal(e.id, e, true); store.setExpense(e.id, e); } });
      cache(); saveSettings(null); render(false); toast('יובאו '+o.e.length+' הוצאות.');
    }catch(x){ toast('זה לא קוד העברה תקין. העתיקו את כל הקוד.'); }
  });

  /* ---------- sync between the phones ---------- */
  var RULES="rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /trips/{trip}/{rest=**} {\n      allow read, write: if trip.size() >= 16;\n    }\n  }\n}";
  function renderSyncBox(){
    var el=$f('fSyncBox'), sc=syncCfg();
    if(store && store.kind==='claude'){
      el.innerHTML='<p class="fnote">הנתונים שמורים בדף הזה ומסתנכרנים לכל מי שהדף משותף איתו. כדי ש'+fe(S.people[1].name)+' יוכל/תוכל להוסיף: בתפריט <b>שיתוף</b> מזמינים אותו/ה <b>במייל, כעורך/ת</b>. קישור ציבורי לא מאפשר כתיבה.</p>';
      return;
    }
    if(!env.fire){ el.innerHTML='<p class="fnote">בתצוגה הזו אין סנכרון: ההוצאות נשמרות רק בטלפון הזה. אפשר להעביר אותן עם ״העברת נתונים״ למטה, או להשתמש באפליקציה (שם יש סנכרון).</p>'; return; }
    if(sc && sc.c && sc.t){
      var link=location.href.split('#')[0]+'#join=RTSYNC1:'+b64u(JSON.stringify({c:sc.c, t:sc.t}));
      el.innerHTML='<p class="fnote">מחובר. כל שינוי מתעדכן אצל כולם מיד: הוצאות, התור, החובה והמסלול שלי. גם בלי קליטה (נשלח כשחוזרת).</p>'+
        (sc.builtin ? '<p class="fnote">זה הטיול המשותף: כל מי שפותח את הקישור של האפליקציה רואה ועורך אותו.</p>' : '<span class="flbl">קישור הצטרפות: שולחים ל'+fe(S.people[1].name)+', פותחים אותו בטלפון ומחוברים</span><textarea readonly id="fJoinOut">'+fe(link)+'</textarea>'+
        '<div class="frow"><button class="fbtn sm" id="fJoinCopy" type="button">העתקת הקישור</button>'+(navigator.share?'<button class="fbtn sm" id="fJoinShare" type="button">שיתוף…</button>':'')+'<button class="fbtn sm dng" id="fUnsync" type="button">ניתוק</button></div>'+
        '<p class="fnote">באפליקציה שעל מסך הבית: מדביקים את הקישור כאן למטה בהגדרות ← סנכרון (פעם אחת).</p>');
      if(!sc.builtin){
        $f('fJoinCopy').onclick=function(){ var t=$f('fJoinOut'); var p=(navigator.clipboard&&navigator.clipboard.writeText)?navigator.clipboard.writeText(t.value):Promise.reject(); p.then(function(){ toast('הועתק. שלחו בוואטסאפ.'); }, function(){ t.focus(); t.select(); }); };
        if($f('fJoinShare')) $f('fJoinShare').onclick=function(){ navigator.share({title:'הטיול', text:'הצטרפות לטיול המשותף', url:link}).catch(function(){}); };
        $f('fUnsync').onclick=function(){ ls('fin_sync', JSON.stringify({off:1})); toast('נותק. ההוצאות נשארות בטלפון.'); setTimeout(function(){ location.reload(); }, 800); };
      }
      return;
    }
    el.innerHTML='<p class="fnote">כדי ששני הטלפונים יראו את אותן הוצאות (ואת התור), מחברים פעם אחת שירות חינמי של גוגל (Firebase). אחד מכם עושה את ההקמה; השני רק מדביק קוד.</p>'+
      '<details><summary>הקמה חד-פעמית (5 דקות, במחשב)</summary><ol>'+
      '<li>נכנסים ל-<b>console.firebase.google.com</b> עם חשבון גוגל ← <b>Create a project</b> (שם: roadtrip, בלי Analytics).</li>'+
      '<li>בתפריט: <b>Build ← Firestore Database ← Create database</b> ← מיקום us-east ← <b>production mode</b>.</li>'+
      '<li>בלשונית <b>Rules</b> מוחקים הכול, מדביקים את הכללים מתחת, ולוחצים <b>Publish</b>.</li>'+
      '<li>גלגל השיניים ← <b>Project settings</b> ← למטה <b>Your apps</b> ← הסמל <code>&lt;/&gt;</code> ← שם כלשהו ← <b>Register app</b>.</li>'+
      '<li>מעתיקים את כל הקטע <code>firebaseConfig</code> ומדביקים כאן למטה ← <b>חיבור</b>.</li></ol><pre>'+fe(RULES)+'</pre></details>'+
      '<span class="flbl">הדביקו כאן את הקישור או הקוד שקיבלתם מהטלפון השני, או את firebaseConfig</span><textarea id="fSyncIn" spellcheck="false" placeholder="https://…#join=RTSYNC1:… או const firebaseConfig = {…}"></textarea>'+
      '<div class="frow"><button class="fbtn pri" id="fSyncGo" type="button">חיבור</button></div>';
    $f('fSyncGo').onclick=function(){
      var o=parseCfg($f('fSyncIn').value);
      if(!o){ toast('לא זיהיתי. צריך את כל ה-firebaseConfig או קוד RTSYNC1.', 4500); return; }
      if(!o.t) o.t=tripCode();
      ls('fin_sync', JSON.stringify(o)); toast('מתחבר…'); setTimeout(function(){ location.reload(); }, 500);
    };
  }
  function parseCfg(txt){
    txt=String(txt||'').trim();
    var m=/RTSYNC1:([A-Za-z0-9+/=_-]+)/.exec(txt);
    if(m){ try{ var o=JSON.parse(b64d(m[1].replace(/-/g,'+').replace(/_/g,'/'))); if(o && o.c && o.c.apiKey && o.t) return {c:o.c, t:o.t}; }catch(e){} return null; }
    var c={}, re=/(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId)\s*["']?\s*:\s*["']([^"']+)["']/g, x;
    while((x=re.exec(txt))) c[x[1]]=x[2];
    return (c.apiKey && c.projectId && c.appId) ? {c:c, t:null} : null;
  }
  // this phone's own choice wins; otherwise the shared trip built into the app (if any)
  function syncCfg(){
    var s=lj('fin_sync');
    if(s && s.off) return null;
    if(s && s.c && s.t) return s;
    var b=env.builtin; return (b && b.c && b.c.apiKey && b.t) ? {c:b.c, t:b.t, builtin:true} : null;
  }
  function b64u(s){ return b64e(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function tripCode(){ var a='abcdefghjkmnpqrstuvwxyz23456789', u=new Uint8Array(20), s=''; try{ crypto.getRandomValues(u); }catch(e){ for(var i=0;i<20;i++) u[i]=Math.random()*256; } for(var j=0;j<20;j++) s+=a[u[j]%a.length]; return s; }

  /* ---------- stores ---------- */
  function cache(){ ls('fin_s', JSON.stringify(S)); ls('fin_ex', JSON.stringify(EX)); }
  function strip(e){ var d=clone(e); delete d.id; return d; }
  function applyLocal(id, e, quiet){
    var i=-1; EX.forEach(function(x,k){ if(x.id===id) i=k; });
    if(e){ e=clone(e); e.id=id; if(i>=0) EX[i]=e; else EX.push(e); } else if(i>=0) EX.splice(i,1);
    if(!quiet){ cache(); render(false); }
  }
  function T(){ return true; } function F(){ return false; }
  function localStore(){
    return {kind:'local', start:function(h){ h.status('local','שמור רק בטלפון הזה'); },
      setSettings:function(){ return Promise.resolve(true); }, setExpense:function(){ return Promise.resolve(true); }, delExpense:function(){ return Promise.resolve(true); }, setDoc:function(){ return Promise.resolve(false); }};
  }
  function claudeStore(){
    var db=null, h=null, pend=lj('fin_pending')||[];
    function savePend(){ ls('fin_pending', JSON.stringify(pend)); }
    function flush(){ if(!db || !pend.length) return; var p=pend[0]; (p.e ? db.doc('expenses/'+p.id).set(strip(p.e)) : db.doc('expenses/'+p.id).delete()).then(function(){ pend.shift(); savePend(); flush(); }, function(){}); }
    function queue(id, e){ pend=pend.filter(function(p){ return p.id!==id; }); pend.push({id:id, e:e}); savePend(); }
    return {kind:'claude',
      start:function(hh){
        h=hh; h.status('','מתחבר…');
        if(!(window.claude && window.claude.use)){ h.status('off','אין סנכרון בתצוגה הזו'); return; }
        Promise.all([claude.use('db'), claude.use('user')]).then(function(r){
          db=r[0]; var user=r[1];
          if(!db){ h.status('off','אין סנכרון כאן. פתחו את הדף בדפדפן דרך claude.ai, מחוברים לחשבון.'); return; }
          if(user && user.can){ try{ Promise.resolve(user.can('data.write')).then(function(v){ if(v===false) h.status('local','צפייה בלבד: צריך הזמנה כעורך/ת'); }, function(){}); }catch(e){} }
          db.doc('trip/settings').onSnapshot(function(s){ h.settings(s.exists?s.data():null, s.exists); }, function(){ h.status('off','אין גישה לנתונים של הדף'); });
          db.collection('expenses').onSnapshot(function(s){
            h.expenses(s.docs.map(function(d){ var e=d.data()||{}; e.id=d.id; return e; }));
            var pw=s.metadata && s.metadata.hasPendingWrites;
            h.status(pw||pend.length?'':'ok', pw||pend.length ? 'מסנכרן…' : 'מסונכרן · '+s.docs.length+' הוצאות');
            flush();
          }, function(){ h.status('off','אין גישה לנתונים של הדף'); });
          (env.docs||[]).forEach(function(n){ db.doc('trip/'+n).onSnapshot(function(s){ if(s.exists && env.onDoc) env.onDoc(n, s.data()); }, function(){}); });
        }).catch(function(){ h.status('off','אין סנכרון בתצוגה הזו'); });
      },
      setSettings:function(s){ return db ? db.doc('trip/settings').set(clone(s)).then(T,F) : Promise.resolve(false); },
      setExpense:function(id,e){ if(!db){ queue(id,e); return Promise.resolve(false); } return db.doc('expenses/'+id).set(strip(e)).then(T, function(err){ queue(id,e); if(err && err.code==='permission_denied') h.status('local','אין הרשאת כתיבה: צריך הזמנה כעורך/ת'); return false; }); },
      delExpense:function(id){ if(!db){ queue(id,null); return Promise.resolve(false); } return db.doc('expenses/'+id).delete().then(T, function(){ queue(id,null); return false; }); },
      setDoc:function(n,o){ return db ? db.doc('trip/'+n).set(o).then(T,F) : Promise.resolve(false); }
    };
  }
  function fireStore(cfg, trip){
    var base=null, h=null;
    function err(e){ var c=e && e.code; h.status('off', c==='permission-denied' ? 'אין הרשאה: בדקו את הכללים (Rules) בפיירבייס' : c==='failed-precondition' || c==='not-found' ? 'צריך ליצור Firestore Database בפרויקט' : 'בעיה בחיבור לסנכרון'); }
    return {kind:'fire', key:trip,
      start:function(hh){
        h=hh; h.status('','מתחבר לסנכרון…');
        env.loadScript('fb/firebase-app-compat.js').then(function(){ return env.loadScript('fb/firebase-firestore-compat.js'); }).then(function(){
          var app=null; (firebase.apps||[]).forEach(function(a){ if(a.name==='rt') app=a; });
          app=app||firebase.initializeApp(cfg, 'rt');
          var db=app.firestore();
          return db.enablePersistence({synchronizeTabs:true}).catch(function(){}).then(function(){ return db; });
        }).then(function(db){
          base=db.collection('trips').doc(trip);
          base.collection('fin').doc('settings').onSnapshot(function(s){ h.settings(s.exists?s.data():null, s.exists); }, err);
          base.collection('expenses').onSnapshot({includeMetadataChanges:true}, function(s){
            h.expenses(s.docs.map(function(d){ var e=d.data()||{}; e.id=d.id; return e; }));
            var m=s.metadata||{};
            h.status(m.fromCache?'local':m.hasPendingWrites?'':'ok', m.fromCache ? 'בלי קליטה · יסונכרן כשתחזור' : m.hasPendingWrites ? 'מסנכרן…' : 'מסונכרן עם '+S.people[1].name);
          }, err);
          (env.docs||[]).forEach(function(n){ base.collection('fin').doc(n).onSnapshot(function(s){ if(s.exists && env.onDoc) env.onDoc(n, s.data()); }, function(){}); });
        }).catch(function(){ h.status('off','לא הצלחתי לטעון את הסנכרון. בדקו אינטרנט.'); });
      },
      // Firestore keeps writes made without signal and sends them later, so these never wait for the server
      setSettings:function(s){ if(!base) return Promise.resolve(false); base.collection('fin').doc('settings').set(clone(s)).catch(function(){}); return Promise.resolve(true); },
      setExpense:function(id,e){ if(!base) return Promise.resolve(false); base.collection('expenses').doc(id).set(strip(e)).catch(function(){}); return Promise.resolve(true); },
      delExpense:function(id){ if(!base) return Promise.resolve(false); base.collection('expenses').doc(id).delete().catch(function(){}); return Promise.resolve(true); },
      setDoc:function(n,o){ if(!base) return Promise.resolve(false); base.collection('fin').doc(n).set(o).catch(function(){}); return Promise.resolve(true); }
    };
  }
  H={
    settings:function(d, exists){
      var dirty=lg('fin_sdirty')==='1';
      if(exists && d && d.people && d.cats && !dirty){ S=norm(d); cache(); render(true); }
      else if(!exists || dirty) store.setSettings(S).then(function(ok){ if(ok) ls('fin_sdirty','0'); });
    },
    expenses:function(list){
      if(store.kind==='fire' && lg('fin_merged_'+store.key)!=='1'){
        // first time on this trip: send up what was written on this phone before connecting
        ls('fin_merged_'+store.key, '1');
        var have={}; list.forEach(function(e){ have[e.id]=1; });
        EX.forEach(function(e){ if(!have[e.id]){ store.setExpense(e.id, e); list.push(e); } });
      }
      EX=list; cache(); render(true);
    },
    status:function(s,t){ $f('fSync').setAttribute('data-s', s); $f('fSyncTx').textContent=t; }
  };
  // a join link (…#join=RTSYNC1:…) connects this phone to the same trip
  (function(){
    var m=/[#&]join=([^&]+)/.exec(location.hash||''); if(!m) return;
    var o=parseCfg(decodeURIComponent(m[1]));
    try{ history.replaceState(null, '', location.href.split('#')[0]); }catch(e){}
    if(!o){ toast('קישור ההצטרפות לא שלם. בקשו אותו שוב.', 4500); return; }
    ls('fin_sync', JSON.stringify(o)); setTimeout(function(){ toast('מחוברים לטיול המשותף. כל שינוי מתעדכן אצל כולם.', 4500); }, 1200);
  })();
  var sc=syncCfg();
  store = env.claude ? claudeStore() : (env.fire && sc && sc.c && sc.t ? fireStore(sc.c, sc.t) : localStore());
  showTab(['add','bal','tab','bud','set'].indexOf(tab)>=0 ? tab : 'add');
  store.start(H);
  return {
    setDoc:function(n,o){ return store.setDoc(n,o); },
    synced:function(){ return store.kind!=='local'; },
    refresh:function(){ render(false); }
  };
}
