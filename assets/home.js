/* Home: rejilla de líneas, buscador de paradas y favoritos. */
(function(){
  'use strict';
  const B = window.Buses;

  const mainEl = document.getElementById('main');
  const searchEl = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');

  let DATOS = null;
  const STOPS = [];
  const state = { query: '' };

  function indexar(){
    for(const lid of DATOS.orden){
      const L = DATOS.lineas[lid];
      if(!L) continue;
      for(const dir of ['ida','vuelta']){
        const paradas = L[dir] || {};
        Object.keys(paradas).forEach((sname, idx)=>{
          STOPS.push({
            line: lid, lineName: L.name, dir, stopName: sname, idx,
            dayTimes: paradas[sname].General || {}
          });
        });
      }
    }
  }

  function noData(L){
    return Object.keys(L.ida||{}).length===0 && Object.keys(L.vuelta||{}).length===0;
  }

  function renderLineaCard(lid, L){
    const color = L.color || '#888';
    return '<a class="linecard'+(noData(L)?' nodata':'')+'" style="--line-color:'+B.escapeHtml(color)+'" href="lineas/'+encodeURIComponent(lid)+'/">'
      + '<div class="badge" style="background:'+B.escapeHtml(color)+'">'+B.escapeHtml(lid)+'</div>'
      + '<div class="lname">'+B.escapeHtml(L.name)+'</div>'
      + '</a>';
  }

  function stopRowHtml(s){
    const color = (DATOS.lineas[s.line] && DATOS.lineas[s.line].color) || '#888';
    const nl = B.nextLabel(s.dayTimes);
    const on = B.isFav(s);
    return '<div class="stoprow" style="--line-color:'+B.escapeHtml(color)+'">'
      + '<a class="stoplink" href="'+B.stopUrl(s)+'">'
      +   '<div class="mini" style="background:'+B.escapeHtml(color)+'">'+B.escapeHtml(s.line)+'</div>'
      +   '<div class="info">'
      +     '<div class="sname">'+B.escapeHtml(s.stopName)+'</div>'
      +     '<div class="sdir">'+B.escapeHtml(s.lineName)+' · '+B.DIRLABEL[s.dir]+'</div>'
      +   '</div>'
      +   '<div class="next '+(nl.soon?'soon':'')+'">'
      +     (nl.sub ? '<span class="lbl">'+B.escapeHtml(nl.sub)+'</span>' : '')
      +     B.escapeHtml(nl.text)
      +   '</div>'
      + '</a>'
      + '<button class="star '+(on?'on':'')+'"'
      +   ' data-line="'+B.escapeHtml(s.line)+'"'
      +   ' data-dir="'+B.escapeHtml(s.dir)+'"'
      +   ' data-stop="'+B.escapeHtml(s.stopName)+'"'
      +   ' aria-label="'+(on?'Quitar de favoritos':'Añadir a favoritos')+'"'
      +   ' aria-pressed="'+(on?'true':'false')+'">★</button>'
      + '</div>';
  }

  function renderFavoritos(){
    const favs = B.getFavs();
    if(!favs.length) return '';

    let html = '<div class="sect-title"><span class="dot"></span>Tus paradas</div><div class="rowlist">';
    let n = 0;
    for(const clave of favs){
      const [lid, dir, ...resto] = clave.split('|');
      const sname = resto.join('|');
      const L = DATOS.lineas[lid];
      if(!L) continue;
      const info = (L[dir]||{})[sname];
      if(!info) continue;
      html += stopRowHtml({line:lid, lineName:L.name, dir, stopName:sname, dayTimes:info.General||{}});
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

  function renderSearch(){
    const q = B.norm(state.query.trim());
    const matches = STOPS.filter(s =>
      B.norm(s.stopName).includes(q) || B.norm(s.lineName).includes(q) || B.norm(s.line).includes(q)
    );

    let html = '<div class="sect-title"><span class="dot"></span>'+matches.length+' resultado'+(matches.length!==1?'s':'')+'</div>';
    if(!matches.length){
      html += '<div class="empty">No hay paradas que coincidan con "'+B.escapeHtml(state.query)+'".<br>Prueba con otro nombre.</div>';
    } else {
      html += '<div class="rowlist">'+matches.slice(0,60).map(stopRowHtml).join('')+'</div>';
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
    if(!btn) return;
    B.toggleFav({line: btn.dataset.line, dir: btn.dataset.dir, stopName: btn.dataset.stop});
    render();
  });

  async function init(){
    B.tickClock();
    setInterval(B.tickClock, 30000);
    try{
      DATOS = await B.loadJSON('data/lineas.json');
      indexar();
      render();
    }catch(err){
      console.error(err);
      mainEl.innerHTML = '<div class="notice">No se pudieron cargar los horarios.<br>'
        + 'Sirve la carpeta por HTTP (por ejemplo <code>python3 -m http.server</code>).</div>';
    }
  }
  init();
})();
