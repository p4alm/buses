/* Página de una parada unificada: todas las líneas que pasan y sus salidas. */
(function(){
  'use strict';
  const B = window.Buses;

  const mainEl = document.getElementById('main');
  const ID = document.body.dataset.parada;
  const state = { dia: B.todayDayType(), parada: null };

  function tiposDisponibles(p){
    const set = new Set();
    for(const s of p.servicios){
      Object.keys(s.General||{}).forEach(dt=>set.add(dt));
    }
    return B.DAYTYPES.filter(dt=>set.has(dt));
  }

  function salidasDe(p, dia){
    return B.proximasSalidas(p.servicios, dia);
  }

  function tarjetaResumen(p, dia, salidas){
    if(!salidas.length){
      const hayAlgunHorario = p.servicios.some(s =>
        Object.values(s.General||{}).some(t => Array.isArray(t) && t.length)
      );
      const msg = !hayAlgunHorario
        ? 'Sin horario cargado para esta parada.'
        : (dia === B.todayDayType() ? 'Hoy no hay servicio en esta parada.' : 'Sin salidas para este tipo de día.');
      return '<div class="notice">'+msg+'</div>';
    }

    const hoy = dia === B.todayDayType();
    const prox = B.proximoBus(p.servicios, dia);

    if(!prox){
      return '<div class="notice">No quedan buses hoy en esta parada.</div>';
    }

    const delta = prox.min - B.nowMinutes();
    const etiqueta = hoy ? 'Próximo bus' : 'Primera salida';
    const cuando = hoy ? (delta<=1 ? 'Ahora' : 'en '+B.fmtDelta(delta)) : '';

    return '<div class="nextcard">'
      + '<div class="nextcard-label">'+etiqueta+' · '+B.DAYLABEL[dia]+'</div>'
      + '<div class="nextcard-main">'
      +   '<span class="badge-sm" style="background:'+B.escapeHtml(prox.color||'#888')+'">'+B.escapeHtml(prox.linea)+'</span>'
      +   '<span class="nextcard-time">'+B.escapeHtml(prox.t)+'</span>'
      +   (cuando ? '<span class="nextcard-delta">'+B.escapeHtml(cuando)+'</span>' : '')
      + '</div>'
      + '<div class="nextcard-dest">→ '+B.escapeHtml(prox.destino)+'</div>'
      + '</div>';
  }

  function filaSalida(s, opciones){
    const { passed, next, hoy } = opciones;
    const href = '../../lineas/'+encodeURIComponent(s.linea)+'/?dir='+s.dir
      + '#parada-'+B.slugify(s.parada);
    let delta = '';
    if(hoy && !passed){
      const mins = s.min - B.nowMinutes();
      delta = mins<=1 ? 'Ahora' : 'en '+B.fmtDelta(mins);
    }
    return '<a class="salida'+(passed?' pasada':'')+(next?' next':'')+'" href="'+href+'">'
      + '<span class="hora">'+B.escapeHtml(s.t)+'</span>'
      + '<span class="badge-sm" style="background:'+B.escapeHtml(s.color||'#888')+'">'+B.escapeHtml(s.linea)+'</span>'
      + '<span class="destino">→ '+B.escapeHtml(s.destino)+'</span>'
      + '<span class="delta">'+B.escapeHtml(delta)+'</span>'
      + '</a>';
  }

  function render(){
    const p = state.parada;
    const tipos = tiposDisponibles(p);
    if(!tipos.includes(state.dia)) state.dia = tipos[0] || state.dia;
    const dia = state.dia;
    const hoy = dia === B.todayDayType();
    const salidas = salidasDe(p, dia);
    const nm = B.nowMinutes();
    const lineas = [...new Set(p.servicios.map(s=>s.linea))];
    const color = (p.servicios[0] && p.servicios[0].color) || '#888';
    const favorita = B.isFavParada(p.id);

    document.title = 'Parada '+p.nombre+' · Buses Molina';

    let html = '<div class="linehead">'
      + '<button class="backbtn" data-home aria-label="Volver al inicio">←</button>'
      + '<div class="badge" style="background:'+B.escapeHtml(color)+';color:#0d1016">🚏</div>'
      + '<div><h2>'+B.escapeHtml(p.nombre)+'</h2>'
      + (p.mapa
          ? '<a href="'+B.escapeHtml(p.mapa)+'" target="_blank" rel="noopener">📍 Abrir en Google Maps ↗</a>'
          : '<span style="color:var(--text-dim);font-size:12px">'+B.escapeHtml(lineas.join(' · '))+'</span>')
      + '</div>'
      + '<button class="star '+(favorita?'on':'')+'" data-parada="'+B.escapeHtml(p.id)+'"'
      +   ' aria-label="'+(favorita?'Quitar de favoritos':'Añadir a favoritos')+'"'
      +   ' aria-pressed="'+(favorita?'true':'false')+'">★</button>'
      + '</div>';

    const disponibles = tipos;
    if(!disponibles.length){
      html += '<div class="notice">No tenemos horarios cargados para esta parada.</div>';
      mainEl.innerHTML = html;
      return;
    }

    html += '<div class="sect-title" style="margin-top:14px"><span class="dot"></span>'+B.escapeHtml(lineas.join(' · '))+'</div>';
    html += tarjetaResumen(p, dia, salidas);

    html += '<div class="tabs">';
    disponibles.forEach((dt, i)=>{
      html += '<button class="tab '+(dia===dt?'active':'')+'" style="--line-color:'+B.escapeHtml(color)+'"'
        + ' data-dia="'+i+'">'+B.DAYLABEL[dt]+'</button>';
    });
    html += '</div>';

    let futuras = [], pasadas = [];
    let primera = -1;
    salidas.forEach((s, i)=>{
      const passed = hoy && s.min < nm;
      if(passed) pasadas.push(s);
      else{
        if(primera === -1) primera = futuras.length;
        futuras.push(s);
      }
    });

    if(futuras.length){
      html += '<div class="sect-title"><span class="dot"></span>'
        + (hoy ? 'Próximas salidas' : 'Salidas del día') + ' · '+futuras.length+'</div>';
      html += '<div class="salidalist">'
        + futuras.map((s,i)=> filaSalida(s, { passed:false, next: i===primera, hoy })).join('')
        + '</div>';
    } else if(hoy && salidas.length){
      if(!pasadas.length) html += '<div class="notice">No quedan buses hoy.</div>';
    } else if(!salidas.length){
      html += '<div class="notice">Sin salidas para este tipo de día.</div>';
    }

    if(hoy && pasadas.length){
      html += '<details class="pasadas"><summary>Salidas ya pasadas ('+pasadas.length+')</summary>'
        + '<div class="salidalist">'
        + pasadas.map(s=> filaSalida(s, { passed:true, next:false, hoy })).join('')
        + '</div></details>';
    }

    mainEl.innerHTML = html;
  }

  mainEl.addEventListener('click', e=>{
    const home = e.target.closest('[data-home]');
    if(home){ location.href = '../../'; return; }

    const diaBtn = e.target.closest('[data-dia]');
    if(diaBtn){
      const tipos = tiposDisponibles(state.parada);
      state.dia = tipos[Number(diaBtn.dataset.dia)] || state.dia;
      render();
      return;
    }

    const star = e.target.closest('.star');
    if(star && star.dataset.parada){
      B.toggleFavParada(star.dataset.parada);
      const on = !star.classList.contains('on');
      star.classList.toggle('on', on);
      star.setAttribute('aria-pressed', on ? 'true' : 'false');
      star.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Añadir a favoritos');
    }
  });

  async function init(){
    B.tickClock();
    setInterval(B.tickClock, 30000);
    try{
      state.parada = await B.loadJSON('../../data/paradas/'+encodeURIComponent(ID)+'.json');
      const disponibles = tiposDisponibles(state.parada);
      state.dia = disponibles.includes(B.todayDayType()) ? B.todayDayType() : (disponibles[0] || state.dia);

      const diaParam = new URLSearchParams(location.search).get('dia');
      if(diaParam !== null){
        const idx = Number(diaParam);
        if(Number.isInteger(idx) && disponibles[idx]) state.dia = disponibles[idx];
      }
      render();
    }catch(err){
      console.error(err);
      mainEl.innerHTML = '<div class="notice">No se pudo cargar la parada '+B.escapeHtml(ID)+'.<br>'
        + 'Sirve la carpeta por HTTP (por ejemplo <code>python3 -m http.server</code>).</div>';
    }
  }
  init();
})();
