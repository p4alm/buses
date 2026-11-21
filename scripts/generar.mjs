#!/usr/bin/env node
/*
 * Genera los datos y las páginas de línea y de parada a partir de:
 *   - datos/lineas.config.json  (qué líneas se publican, nombre, color y web oficial)
 *   - cache/<id>-horarios.json  (paradas y horarios)
 *   - scripts/plantilla-linea.html y scripts/plantilla-parada.html
 *
 * Uso: node scripts/generar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const MARCA = '<!-- generado por scripts/generar.mjs -->';
const CARPETA_LINEAS = 'lineas';
const CARPETA_PARADAS = 'paradas';
const DISTANCIA_GRUPO = 40; /* metros: misma parada si comparte nombre y está a menos de esto */

const COORD = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;
const EN_URL = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const CORTO_CON_COLA = /^([A-Za-z0-9_-]{8,})\?g_/;
const CORTO = /^[A-Za-z0-9_-]{10,}$/;

/* Devuelve {mapa} con un enlace listo para usar, o {mapa:null, raw} si no se reconoce. */
export function normalizaUbicacion(valor){
  const original = String(valor == null ? '' : valor).trim();
  if(!original) return {mapa:null};

  const limpio = original.replace(/%20/g,' ').replace(/\s+/g,' ').trim();

  if(/^https?:\/\//i.test(limpio)) return {mapa:limpio};

  const simple = limpio.match(COORD);
  if(simple) return coordenadas(simple[1], simple[2]);

  const dentro = limpio.match(EN_URL);
  if(dentro) return coordenadas(dentro[1], dentro[2]);

  const corto = limpio.match(CORTO_CON_COLA);
  if(corto) return {mapa:'https://maps.app.goo.gl/'+corto[1]};

  if(CORTO.test(limpio)) return {mapa:'https://maps.app.goo.gl/'+limpio};

  return {mapa:null, raw:original};
}
function coordenadas(lat, lng){
  return {mapa:'https://www.google.com/maps/search/?api=1&query='+lat+','+lng};
}

export function normalizaNombre(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}
function slugParada(s){
  return normalizaNombre(s).replace(/ /g,'-') || 'parada';
}
function distanciaMetros(a, b){
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const la1 = rad(a.lat), lo1 = rad(a.lng), la2 = rad(b.lat), lo2 = rad(b.lng);
  const h = Math.sin((la2-la1)/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/*
 * Recorre las paradas de todas las líneas, las agrupa por nombre normalizado
 * y distancia (<40 m) y devuelve los grupos con id estable. Además escribe
 * el campo `parada` en cada parada del maestro.
 */
export function agrupaParadas(maestro){
  const ocurrencias = [];

  for(const [linea, L] of Object.entries(maestro.lineas)){
    for(const dir of ['ida','vuelta']){
      const paradas = L[dir] || {};
      for(const [nombre, info] of Object.entries(paradas)){
        const m = /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec((info.ubicacion||{}).mapa || '');
        ocurrencias.push({
          linea, dir, nombre, info,
          clave: normalizaNombre(nombre),
          lat: m ? Number(m[1]) : null,
          lng: m ? Number(m[2]) : null
        });
      }
    }
  }

  const porClave = new Map();
  for(const o of ocurrencias){
    const clusters = porClave.get(o.clave) || [];
    let cluster = null;

    if(o.lat != null){
      cluster = clusters.find(c => c.lat != null && distanciaMetros(c, o) <= DISTANCIA_GRUPO) || null;
    } else {
      cluster = clusters[0] || null;
    }

    if(cluster){
      cluster.oc.push(o);
      if(cluster.lat == null && o.lat != null){ cluster.lat = o.lat; cluster.lng = o.lng; }
    } else {
      clusters.push({clave:o.clave, lat:o.lat, lng:o.lng, oc:[o]});
    }
    porClave.set(o.clave, clusters);
  }

  const grupos = [];
  for(const clusters of porClave.values()) grupos.push(...clusters);

  for(const g of grupos){
    const nombres = new Map();
    for(const o of g.oc){
      const n = o.nombre.trim();
      nombres.set(n, (nombres.get(n)||0)+1);
    }
    g.nombre = [...nombres.entries()]
      .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0],'es'))[0][0];
    const conMapa = g.oc.find(o => o.info.ubicacion && o.info.ubicacion.mapa);
    g.mapa = conMapa ? conMapa.info.ubicacion.mapa : null;
  }

  grupos.sort((a,b)=>
    a.clave.localeCompare(b.clave,'es') ||
    (a.lat ?? 0) - (b.lat ?? 0) ||
    (a.lng ?? 0) - (b.lng ?? 0)
  );

  const usados = new Map();
  for(const g of grupos){
    const base = slugParada(g.nombre);
    const n = (usados.get(base)||0) + 1;
    usados.set(base, n);
    g.id = n === 1 ? base : base+'-'+n;
    for(const o of g.oc) o.info.parada = g.id;
  }

  return grupos;
}

function destinoDe(L, dir){
  const nombres = Object.keys(L[dir] || {});
  return nombres.length
    ? nombres[nombres.length-1].replace(/\s*(I{1,3}|IV)$/,'')
    : L.name;
}

function datosParada(g, maestro){
  const servicios = g.oc.map(o => {
    const L = maestro.lineas[o.linea];
    return {
      linea: o.linea,
      dir: o.dir,
      parada: o.nombre.trim(),
      destino: destinoDe(L, o.dir),
      color: L.color,
      url: L.url,
      General: o.info.General || {}
    };
  });
  servicios.sort((a,b)=> a.linea.localeCompare(b.linea,'es') || a.dir.localeCompare(b.dir));
  return {id:g.id, nombre:g.nombre, mapa:g.mapa, servicios};
}

function limpiaCarpeta(base, soloLineas){
  if(!fs.existsSync(base)) return;
  const patron = /^\d{2}[A-D]?$/;
  for(const f of fs.readdirSync(base)){
    const ruta = path.join(base,f);
    if(!fs.statSync(ruta).isDirectory()) continue;
    if(soloLineas && !patron.test(f)) continue;
    const index = path.join(ruta,'index.html');
    if(fs.existsSync(index) && fs.readFileSync(index,'utf8').includes(MARCA)){
      fs.rmSync(ruta, {recursive:true, force:true});
    }
  }
}

function limpiaSalida(){
  const dataDir = path.join(RAIZ,'data');
  fs.mkdirSync(dataDir, {recursive:true});
  for(const f of fs.readdirSync(dataDir)){
    if(f.endsWith('.json')) fs.rmSync(path.join(dataDir,f));
  }
  fs.rmSync(path.join(dataDir,'paradas'), {recursive:true, force:true});

  /* carpetas de la estructura anterior (raíz) y de la actual */
  limpiaCarpeta(RAIZ, true);
  fs.mkdirSync(path.join(RAIZ,CARPETA_LINEAS), {recursive:true});
  limpiaCarpeta(path.join(RAIZ,CARPETA_LINEAS), false);
  fs.mkdirSync(path.join(RAIZ,CARPETA_PARADAS), {recursive:true});
  limpiaCarpeta(path.join(RAIZ,CARPETA_PARADAS), false);
}

function main(){
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ,'datos','lineas.config.json'),'utf8'));
  const plantillaLinea = fs.readFileSync(path.join(AQUI,'plantilla-linea.html'),'utf8');
  const plantillaParada = fs.readFileSync(path.join(AQUI,'plantilla-parada.html'),'utf8');

  limpiaSalida();

  const maestro = {orden: config.orden, lineas: {}};
  const incognitas = [];
  let paradasTotal = 0;
  let conMapa = 0;
  let quedan36 = false;

  for(const id of config.orden){
    if(id === '36'){ quedan36 = true; continue; }
    const meta = config.lineas[id];
    if(!meta) throw new Error('Falta la configuración de la línea '+id);

    const cacheFile = path.join(RAIZ,'cache',id+'-horarios.json');
    if(!fs.existsSync(cacheFile)) throw new Error('No existe '+cacheFile);

    const crudo = JSON.parse(fs.readFileSync(cacheFile,'utf8'));
    const linea = {
      id,
      name: meta.name,
      url: meta.url || '',
      color: meta.color || '#888',
      ida: {},
      vuelta: {}
    };

    for(const dir of ['ida','vuelta']){
      const paradas = crudo[dir] || {};
      for(const [nombre, info] of Object.entries(paradas)){
        const ubicacion = normalizaUbicacion(info.ubicacion);
        paradasTotal++;
        if(ubicacion.mapa) conMapa++;
        else incognitas.push({linea:id, dir, parada:nombre, raw:ubicacion.raw});

        const salida = {ubicacion};
        for(const [clave, valor] of Object.entries(info)){
          if(clave === 'ubicacion') continue;
          salida[clave] = valor;
        }
        linea[dir][nombre] = salida;
      }
    }

    maestro.lineas[id] = linea;
  }

  const grupos = agrupaParadas(maestro);

  /* líneas y páginas de línea (ya con el id de parada en cada parada) */
  for(const [id, linea] of Object.entries(maestro.lineas)){
    fs.writeFileSync(path.join(RAIZ,'data',id+'.json'), JSON.stringify(linea) + '\n');

    const html = plantillaLinea
      .replaceAll('__LINEA__', id)
      .replaceAll('__NOMBRE__', linea.name.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
    fs.mkdirSync(path.join(RAIZ,CARPETA_LINEAS,id), {recursive:true});
    fs.writeFileSync(path.join(RAIZ,CARPETA_LINEAS,id,'index.html'), html);
  }
  fs.writeFileSync(path.join(RAIZ,'data','lineas.json'), JSON.stringify(maestro) + '\n');

  /* paradas unificadas y sus páginas */
  fs.mkdirSync(path.join(RAIZ,'data','paradas'), {recursive:true});
  for(const g of grupos){
    const datos = datosParada(g, maestro);
    fs.writeFileSync(path.join(RAIZ,'data','paradas',g.id+'.json'), JSON.stringify(datos) + '\n');

    const html = plantillaParada
      .replaceAll('__PARADA__', g.id)
      .replaceAll('__NOMBRE__', g.nombre.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
    fs.mkdirSync(path.join(RAIZ,CARPETA_PARADAS,g.id), {recursive:true});
    fs.writeFileSync(path.join(RAIZ,CARPETA_PARADAS,g.id,'index.html'), html);
  }

  /* resumen */
  const conAmbosSentidos = grupos.filter(g => new Set(g.oc.map(o => o.dir)).size > 1).length;
  const porClave = new Map();
  for(const g of grupos) porClave.set(g.clave, (porClave.get(g.clave)||0)+1);
  const partidos = [...porClave.entries()].filter(([,n])=> n>1).map(([n])=> n);
  const sinHorario = grupos.filter(g =>
    g.oc.every(o => !Object.values(o.info.General || {}).some(t => Array.isArray(t) && t.length))
  ).length;

  console.log('Líneas generadas: '+Object.keys(maestro.lineas).length+' ('+config.orden.length+' configuradas)');
  console.log('Paradas-línea:    '+paradasTotal+' · con enlace de mapa: '+conMapa);
  console.log('Paradas unificadas: '+grupos.length+' · con ambos sentidos: '+conAmbosSentidos+' · sin horario General: '+sinHorario);
  if(partidos.length) console.log('Nombres partidos: '+partidos.join(', '));
  if(quedan36) console.log('Aviso: "36" sigue en datos/lineas.config.json y se ha ignorado.');
  if(incognitas.length){
    console.log('Formatos de ubicación no reconocidos: '+incognitas.length);
    for(const x of incognitas.slice(0,20)) console.log('  -', x.linea, x.dir, x.parada, '→', JSON.stringify(x.raw));
  } else {
    console.log('Todas las ubicaciones tienen enlace de mapa.');
  }
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  main();
}
