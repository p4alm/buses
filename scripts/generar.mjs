#!/usr/bin/env node
/*
 * Genera los datos y las páginas de línea a partir de:
 *   - datos/lineas.config.json  (qué líneas se publican, nombre, color y web oficial)
 *   - cache/<id>-horarios.json  (paradas y horarios)
 *   - scripts/plantilla-linea.html
 *
 * Uso: node scripts/generar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const MARCA = '<!-- generado por scripts/generar.mjs -->';

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

function limpiaSalida(){
  const dataDir = path.join(RAIZ,'data');
  fs.mkdirSync(dataDir, {recursive:true});
  for(const f of fs.readdirSync(dataDir)){
    if(f.endsWith('.json')) fs.rmSync(path.join(dataDir,f));
  }
  const generada = /^\d{2}[A-D]?$/;
  for(const f of fs.readdirSync(RAIZ)){
    const ruta = path.join(RAIZ,f);
    if(!generada.test(f) || !fs.statSync(ruta).isDirectory()) continue;
    const index = path.join(ruta,'index.html');
    if(fs.existsSync(index) && fs.readFileSync(index,'utf8').includes(MARCA)){
      fs.rmSync(ruta, {recursive:true, force:true});
    }
  }
}

function main(){
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ,'datos','lineas.config.json'),'utf8'));
  const plantilla = fs.readFileSync(path.join(AQUI,'plantilla-linea.html'),'utf8');

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

    fs.writeFileSync(path.join(RAIZ,'data',id+'.json'), JSON.stringify(linea) + '\n');

    const html = plantilla
      .replaceAll('__LINEA__', id)
      .replaceAll('__NOMBRE__', meta.name.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
    fs.mkdirSync(path.join(RAIZ,id), {recursive:true});
    fs.writeFileSync(path.join(RAIZ,id,'index.html'), html);
  }

  fs.writeFileSync(path.join(RAIZ,'data','lineas.json'), JSON.stringify(maestro) + '\n');

  console.log('Líneas generadas: '+Object.keys(maestro.lineas).length+' ('+config.orden.length+' configuradas)');
  console.log('Paradas totales:  '+paradasTotal+' · con enlace de mapa: '+conMapa);
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
