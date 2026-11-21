/* Home: rejilla de líneas, buscador de paradas unificadas y favoritos. */
(function(){
  'use strict';
  const B = window.Buses;

  const mainEl = document.getElementById('main');
  const searchEl = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');

  let DATOS = null;
  const PORID = new Map();
  const PARADAS = [];
  const state = { query: '' };

  function destinoDe(L, dir){
    const nombres = Object.keys(L[dir] || {});
    return nombres.length
      ? nombres[nombres.length-1].replace(/\s*(I{1,3}|IV)$/,'')
      : L.name;
  }

  /* agrupa los servicios por el id de parada que trae cada parada */
  function indexar(){
    for(const lid of DATOS.orden){
      const L = DATOS.lineas[lid];
      if(!L) continue;
      for(const dir of ['ida','vuelta']){
        const paradas = L[dir] || {};
        for(const [sname, info] of Object.entries(paradas)){
          const id = info.parada;
          if(!id) continue;
          let g = PORID.get(id);
          if(!g){
            g = {
              id, nombre: sname.trim(),
              mapa: (info.ubicacion||{}).mapa || null,
              servicios: []
            };
            PORID.set(id, g);
            PARADAS.push(g);
          }
          g.servicios.push({
            linea: lid, lineaNombre: L.name, dir, parada: sname,
            destino: destinoDe(L, dir), color: L.color, General: info.General || {}
          });
        }
      }
    }
    PARADAS.sort((a,b)=> a.nombre.localeCompare(b.nombre,'es'));
  }

  function migrar(){
    const mapa = {};
    for(const g of PARADAS){
      for(const s of g.servicios) mapa[s.linea+'|'+s.dir+'|'+s.parada] = g.id;
    }
    B.migrarFavoritos(mapa);
  }

  function lineasDe(g){
    const vistos = [];
    for(const s of g.servicios){
      if(!vistos.includes(s.linea)) vistos.push(s.linea);
    }
    return vistos;
  }

  function resumenParada(g){
    const dt = B.todayDayType();
    const hayHoy = g.servicios.some(s => ((s.General||{})[dt]||[]).length > 0);
    if(!hayHoy) return {text:'Hoy sin servicio', sub:'', soon:false};

    const prox = B.proximoBus(g.servicios, dt);
    if(!prox) return {text:'Sin más hoy', sub:'', soon:false};

    const delta = prox.min - B.nowMinutes();
    return {
      text: delta<=1 ? 'Ahora' : 'en '+B.fmtDelta(delta),
      sub: prox.linea+' · '+prox.t,
      soon: delta<=15
    };
  }

  function paradaRowHtml(g){
    const lineas = lineasDe(g);
    const nl = resumenParada(g);
    const prox = B.proximoBus(g.servicios, B.todayDayType());
    const color = (prox && prox.color) || (g.servicios[0] && g.servicios[0].color) || '#888';
    const icono = prox ? B.escapeHtml(prox.linea) : '🚏';
    const on = B.isFavParada(g.id);

    return '<div class="stoprow" style="--line-color:'+B.escapeHtml(color)+'">'
      + '<a class="stoplink" href="'+B.paradaUrl(g.id)+'">'
      +   '<div class="mini" style="background:'+B.escapeHtml(color)+'">'+icono+'</div>'
      +   '<div class="info">'
      +     '<div class="sname">'+B.escapeHtml(g.nombre)+'</div>'
      +     '<div class="sdir">'+B.escapeHtml(lineas.join(' · '))+'</div>'
      +   '</div>'
      +   '<div class="next '+(nl.soon?'soon':'')+'">'
      +     (nl.sub ? '<span class="lbl">'+B.escapeHtml(nl.sub)+'</span>' : '')
      +     B.escapeHtml(nl.text)
      +   '</div>'
      + '</a>'
      + '<button class="star '+(on?'on':'')+'" data-parada="'+B.escapeHtml(g.id)+'"'
      +   ' aria-label="'+(on?'Quitar de favoritos':'Añadir a favoritos')+'"'
      +   ' aria-pressed="'+(on?'true':'false')+'">★</button>'
      + '</div>';
  }

  function renderLineaCard(lid, L){
    const color = L.color || '#888';
    return '<a class="linecard'+(noData(L)?' nodata':'')+'" style="--line-color:'+B.escapeHtml(color)+'" href="lineas/'+encodeURIComponent(lid)+'/">'
      + '<div class="badge" style="background:'+B.escapeHtml(color)+'">'+B.escapeHtml(lid)+'</div>'
      + '<div class="lname">'+B.escapeHtml(L.name)+'</div>'
      + '</a>';
  }
  function noData(L){
    return Object.keys(L.ida||{}).length===0 && Object.keys(L.vuelta||{}).length===0;
  }

  function renderFavoritos(){
    const ids = B.getFavsParadas();
    if(!ids.length) return '';

    let html = '<div class="sect-title"><span class="dot"></span>Tus paradas</div><div class="rowlist">';
    let n = 0;
    for(const id of ids){
      const g = PORID.get(id);
      if(!g) continue;
      html += paradaRowHtml(g);
      n++;
    }
    html += '</div>';
    return n ? html : '';
  }

  function renderHome(){
    let html = renderFavoritos();
    html += '<div class="sect-title"><span class="dot"></span>Líneas</div><div class="linegrid">';
    for(const lid of DATOS.orden){
      const L = DATOS.lineas[lid];
      if(L) html += renderLineaCard(lid, L);
    }
    html += '</div>';
    mainEl.innerHTML = html;
  }

  function coincide(g, q){
    if(B.norm(g.nombre).includes(q)) return true;
    return g.servicios.some(s =>
      B.norm(s.linea).includes(q) || B.norm(s.lineaNombre).includes(q)
    );
  }

  function renderSearch(){
    const q = B.norm(state.query.trim());
    const matches = PARADAS.filter(g => coincide(g, q));

    let html = '<div class="sect-title"><span class="dot"></span>'+matches.length+' parada'+(matches.length!==1?'s':'')+'</div>';
    if(!matches.length){
      html += '<div class="empty">No hay paradas que coincidan con "'+B.escapeHtml(state.query)+'".<br>Prueba con otro nombre.</div>';
    } else {
      html += '<div class="rowlist">'+matches.slice(0,60).map(paradaRowHtml).join('')+'</div>';
    }
    mainEl.innerHTML = html;
  }

  function render(){
    if(!DATOS) return;
    if(state.query.trim().length>0) renderSearch();
    else renderHome();
  }

  searchEl.addEventListener('input', e=>{
    state.query = e.target.value;
    clearBtn.classList.toggle('show', state.query.length>0);
    render();
  });
  clearBtn.addEventListener('click', ()=>{
    searchEl.value = '';
    state.query = '';
    clearBtn.classList.remove('show');
    render();
    searchEl.focus();
  });

  mainEl.addEventListener('click', e=>{
    const btn = e.target.closest('.star');
    if(!btn || !btn.dataset.parada) return;
    B.toggleFavParada(btn.dataset.parada);
    render();
  });

  async function init(){
    B.tickClock();
    setInterval(B.tickClock, 30000);
    try{
      DATOS = await B.loadJSON('data/lineas.json');
      indexar();
      migrar();
      render();
    }catch(err){
      console.error(err);
      mainEl.innerHTML = '<div class="notice">No se pudieron cargar los horarios.<br>'
        + 'Sirve la carpeta por HTTP (por ejemplo <code>python3 -m http.server</code>).</div>';
    }
  }
  init();
})();
