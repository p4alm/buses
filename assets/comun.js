/* Utilidades compartidas por la home y las páginas de línea. */
(function(){
  'use strict';

  const DAYTYPES = ["Lunes a Viernes (laborables)","Sábados (laborables)","Domingos y Festivos"];
  const DAYLABEL = {
    "Lunes a Viernes (laborables)":"Laborables",
    "Sábados (laborables)":"Sábados",
    "Domingos y Festivos":"Domingos y fest."
  };
  const DIRLABEL = {ida:"Ida", vuelta:"Vuelta"};

  function todayDayType(){
    const d = new Date().getDay();
    if(d===0) return DAYTYPES[2];
    if(d===6) return DAYTYPES[1];
    return DAYTYPES[0];
  }
  function nowMinutes(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
  function timeToMin(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
  function fmtDelta(mins){
    if(mins<60) return mins+' min';
    const h=Math.floor(mins/60), m=mins%60;
    return h+'h '+(m?m+'m':'').trim();
  }
  function norm(s){
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  function escapeHtml(s){
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function slugify(s){
    return norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  /* {label, soon, sub, times:[{t,passed,isNext}]} */
  function computeTimes(dayTimes, dayType){
    const times = (dayTimes && dayTimes[dayType]) || [];
    const isToday = dayType === todayDayType();
    const nm = nowMinutes();
    let nextIdx = -1;
    const out = times.map((t,i)=>{
      const mins = timeToMin(t);
      const passed = isToday && mins < nm;
      if(isToday && nextIdx===-1 && mins>=nm) nextIdx = i;
      return {t, mins, passed};
    });
    out.forEach((o,i)=> o.isNext = (i===nextIdx));
    return {times: out, isToday, nextIdx};
  }
  function nextLabel(dayTimes){
    const dt = todayDayType();
    const {times, isToday, nextIdx} = computeTimes(dayTimes, dt);
    if(!isToday || !dayTimes || !dayTimes[dt]) return {text:'—', soon:false, sub: DAYLABEL[dt]+' no aplica hoy'};
    if(nextIdx===-1) return {text:'Sin más buses hoy', soon:false, sub:''};
    const delta = times[nextIdx].mins - nowMinutes();
    return {text: (delta<=1?'Ahora':'en '+fmtDelta(delta)), soon: delta<=15, sub: times[nextIdx].t};
  }

  /* tipos de día con horario para una línea/dirección */
  function availableDayTypes(line, dir){
    const stops = line[dir] || {};
    const set = new Set();
    Object.values(stops).forEach(info=>{
      Object.keys(info.General||{}).forEach(dt=>set.add(dt));
    });
    return DAYTYPES.filter(dt=>set.has(dt));
  }

  /* favoritos antiguos (por servicio), solo para migrar a paradas */
  function getFavs(){
    try{ return JSON.parse(localStorage.getItem('movibus_favs')||'[]'); }catch(e){ return []; }
  }

  /* favoritos de parada unificada */
  const CLAVE_FAVS_PARADAS = 'movibus_paradas';
  function getFavsParadas(){
    try{ return JSON.parse(localStorage.getItem(CLAVE_FAVS_PARADAS)||'[]'); }catch(e){ return []; }
  }
  function setFavsParadas(ids){
    try{ localStorage.setItem(CLAVE_FAVS_PARADAS, JSON.stringify(ids)); }catch(e){}
  }
  function isFavParada(id){ return getFavsParadas().includes(id); }
  function toggleFavParada(id){
    let f = getFavsParadas();
    f = f.includes(id) ? f.filter(x=>x!==id) : f.concat(id);
    setFavsParadas(f);
  }
  /* traduce "linea|dir|parada" del formato antiguo al id de parada unificada */
  function migrarFavoritos(servicioAParada){
    let yaMigrado = null;
    try{ yaMigrado = localStorage.getItem(CLAVE_FAVS_PARADAS); }catch(e){ return; }
    if(yaMigrado !== null) return;
    const ids = [];
    for(const clave of getFavs()){
      const id = servicioAParada[clave];
      if(id && !ids.includes(id)) ids.push(id);
    }
    setFavsParadas(ids);
  }

  /* todas las salidas (de todos los servicios) de un tipo de día, ordenadas */
  function proximasSalidas(servicios, dayType){
    const salidas = [];
    for(const s of servicios || []){
      const tiempos = ((s.General||{})[dayType]) || [];
      for(const t of tiempos){
        salidas.push({
          linea: s.linea, dir: s.dir, parada: s.parada, destino: s.destino,
          color: s.color, t, min: timeToMin(t)
        });
      }
    }
    salidas.sort((a,b)=> a.min-b.min || String(a.linea).localeCompare(String(b.linea),'es'));
    return salidas;
  }
  /* primera salida futura (o la primera del día si no es hoy) */
  function proximoBus(servicios, dayType){
    const salidas = proximasSalidas(servicios, dayType);
    if(dayType !== todayDayType()) return salidas[0] || null;
    const nm = nowMinutes();
    return salidas.find(s=> s.min >= nm) || null;
  }

  /* enlace a Google Maps a partir de la ubicación normalizada del generador */
  function mapLink(ubicacion){
    return (ubicacion && ubicacion.mapa) || null;
  }
  function paradaUrl(id){
    return 'paradas/'+id+'/';
  }

  async function loadJSON(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error('No se pudo cargar '+url+' ('+res.status+')');
    return res.json();
  }

  function tickClock(){
    const el = document.getElementById('clock');
    if(!el) return;
    const d = new Date();
    el.textContent = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }

  window.Buses = {
    DAYTYPES, DAYLABEL, DIRLABEL,
    todayDayType, nowMinutes, timeToMin, fmtDelta, norm, escapeHtml, slugify,
    computeTimes, nextLabel, availableDayTypes,
    getFavsParadas, setFavsParadas, isFavParada, toggleFavParada, migrarFavoritos,
    proximasSalidas, proximoBus,
    mapLink, paradaUrl, loadJSON, tickClock
  };
})();
