/* Página de una línea: pestañas ida/vuelta, tipos de día y paradas con horarios. */
(function(){
  'use strict';
  const B = window.Buses;

  const mainEl = document.getElementById('main');
  const ID = document.body.dataset.linea;
  const state = { dir: 'ida', dayType: B.todayDayType(), linea: null };
  let yaSaltado = false;

  function inicial(){
    const params = new URLSearchParams(location.search);
    const dir = params.get('dir');
    if(dir === 'ida' || dir === 'vuelta') state.dir = dir;
  }

  function endpoint(stops){
    const nombres = Object.keys(stops);
    if(!nombres.length) return '';
    return nombres[nombres.length-1].replace(/\s*(I{1,3}|IV)$/,'');
  }

  function tabsDireccion(L, color){
    return '<div class="tabs">' + ['ida','vuelta'].map(dir=>{
      const stops = L[dir] || {};
      const fin = endpoint(stops);
      return '<button class="tab '+(state.dir===dir?'active':'')+'"'
        + ' style="--line-color:'+B.escapeHtml(color)+'"'
        + ' data-dir="'+dir+'">'+B.DIRLABEL[dir]
        + (fin ? '<small>→ '+B.escapeHtml(fin)+'</small>' : '')
        + '</button>';
    }).join('') + '</div>';
  }

  function tabsDia(disponibles, color){
    return '<div class="tabs">' + disponibles.map((dt, i)=>{
      return '<button class="tab '+(state.dayType===dt?'active':'')+'"'
        + ' style="--line-color:'+B.escapeHtml(color)+'"'
        + ' data-day="'+i+'">'+B.DAYLABEL[dt]+'</button>';
    }).join('') + '</div>';
  }

  function enlaceMapa(ubicacion){
    const url = B.mapLink(ubicacion);
    if(!url) return '';
    return '<a class="maplink" href="'+B.escapeHtml(url)+'" target="_blank" rel="noopener"'
      + ' title="Abrir la parada en Google Maps">📍 Mapa</a>';
  }

  function render(){
    const L = state.linea;
    const color = L.color || '#888';
    const dia = state.dayType;

    document.title = 'Línea '+ID+' · '+L.name;

    let html = '<div class="linehead">'
      + '<button class="backbtn" data-home aria-label="Volver al inicio">←</button>'
      + '<div class="badge" style="background:'+B.escapeHtml(color)+'">'+B.escapeHtml(ID)+'</div>'
      + '<div><h2>Línea '+B.escapeHtml(ID)+'</h2>'
      + (L.url
          ? '<a href="'+B.escapeHtml(L.url)+'" target="_blank" rel="noopener">'+B.escapeHtml(L.name)+' · web oficial ↗</a>'
          : '<span style="color:var(--text-dim);font-size:12px">'+B.escapeHtml(L.name)+'</span>')
      + '</div></div>';

    const vacia = Object.keys(L.ida||{}).length===0 && Object.keys(L.vuelta||{}).length===0;
    if(vacia){
      html += '<div class="notice">No tenemos horarios cargados para esta línea todavía.'
        + (L.url ? ' Consulta <a href="'+B.escapeHtml(L.url)+'" target="_blank" rel="noopener">la web oficial</a>.' : '')
        + '</div>';
      mainEl.innerHTML = html;
      return;
    }

    const disponibles = B.availableDayTypes(L, state.dir);
    if(!disponibles.includes(dia)) state.dayType = disponibles[0] || dia;
    const diaFinal = state.dayType;

    html += tabsDireccion(L, color);
    html += tabsDia(disponibles, color);

    const paradas = L[state.dir] || {};
    html += '<div class="stoplist">';
    Object.keys(paradas).forEach((sname, i)=>{
      const info = paradas[sname];
      if(!(info.General||{})[diaFinal]) return;

      const {times} = B.computeTimes(info.General||{}, diaFinal);
      const on = B.isFav({line:ID, dir:state.dir, stopName:sname});

      html += '<div class="stopitem" id="parada-'+B.slugify(sname)+'" data-stop="'+B.escapeHtml(sname)+'">'
        + '<div class="head">'
        +   '<span class="idx">'+(i+1)+'</span>'
        +   '<span class="sname">'+B.escapeHtml(sname)+'</span>'
        +   enlaceMapa(info.ubicacion)
        +   '<button class="star '+(on?'on':'')+'"'
        +     ' data-line="'+B.escapeHtml(ID)+'"'
        +     ' data-dir="'+B.escapeHtml(state.dir)+'"'
        +     ' data-stop="'+B.escapeHtml(sname)+'"'
        +     ' aria-label="'+(on?'Quitar de favoritos':'Añadir a favoritos')+'"'
        +     ' aria-pressed="'+(on?'true':'false')+'">★</button>'
        + '</div>'
        + '<div class="chips">'
        +   times.map(t=>'<span class="chip '+(t.isNext?'next':'')+(t.passed?' passed':'')+'">'+B.escapeHtml(t.t)+'</span>').join('')
        + '</div></div>';
    });
    html += '</div>';

    mainEl.innerHTML = html;
  }

  function paradaPorSlug(dir, slug){
    const paradas = (state.linea && state.linea[dir]) || {};
    return Object.keys(paradas).find(s => B.slugify(s) === slug) || null;
  }

  function irAParadaDelHash(){
    if(yaSaltado || !location.hash) return;
    const slug = decodeURIComponent(location.hash.slice(1)).replace(/^parada-/,'');
    let el = document.getElementById('parada-'+slug);

    /* si la parada no tiene servicio en el tipo de día elegido, buscamos uno en el que sí */
    if(!el){
      const nombre = paradaPorSlug(state.dir, slug);
      if(nombre){
        const disponibles = B.availableDayTypes(state.linea, state.dir);
        const alternativo = disponibles.find(dt => ((state.linea[state.dir][nombre].General||{})[dt]||[]).length);
        if(alternativo && alternativo !== state.dayType){
          state.dayType = alternativo;
          render();
          el = document.getElementById('parada-'+slug);
        }
      }
    }
    if(!el) return;

    yaSaltado = true;
    setTimeout(()=>{
      el.scrollIntoView({behavior:'smooth', block:'center'});
      el.classList.add('flash');
      setTimeout(()=>el.classList.remove('flash'), 2200);
    }, 80);
  }

  mainEl.addEventListener('click', e=>{
    const home = e.target.closest('[data-home]');
    if(home){ location.href = '../'; return; }

    const dirTab = e.target.closest('[data-dir]');
    if(dirTab){
      state.dir = dirTab.dataset.dir;
      const disponibles = B.availableDayTypes(state.linea, state.dir);
      if(!disponibles.includes(state.dayType)){
        state.dayType = disponibles.includes(B.todayDayType()) ? B.todayDayType() : (disponibles[0] || state.dayType);
      }
      render();
      return;
    }

    const dayTab = e.target.closest('[data-day]');
    if(dayTab){
      const disponibles = B.availableDayTypes(state.linea, state.dir);
      state.dayType = disponibles[Number(dayTab.dataset.day)] || state.dayType;
      render();
      return;
    }

    const star = e.target.closest('.star');
    if(star){
      B.toggleFav({line: star.dataset.line, dir: star.dataset.dir, stopName: star.dataset.stop});
      const on = !star.classList.contains('on');
      star.classList.toggle('on', on);
      star.setAttribute('aria-pressed', on ? 'true' : 'false');
      star.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Añadir a favoritos');
    }
  });

  async function init(){
    B.tickClock();
    setInterval(B.tickClock, 30000);
    inicial();
    try{
      state.linea = await B.loadJSON('../data/'+encodeURIComponent(ID)+'.json');
      const disponibles = B.availableDayTypes(state.linea, state.dir);
      state.dayType = disponibles.includes(B.todayDayType()) ? B.todayDayType() : (disponibles[0] || state.dayType);
      render();
      irAParadaDelHash();
    }catch(err){
      console.error(err);
      mainEl.innerHTML = '<div class="notice">No se pudieron cargar los horarios de la línea '+B.escapeHtml(ID)+'.<br>'
        + 'Sirve la carpeta por HTTP (por ejemplo <code>python3 -m http.server</code>).</div>';
    }
  }
  init();
})();
