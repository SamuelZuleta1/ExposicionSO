/*
 * engine.js — Motor de simulación de reemplazo de páginas.
 * No toca el DOM. Funciona en el navegador (window.Motor) y en Node (module.exports).
 *
 * Algoritmos: FIFO, LRU, MRU, OPT (Belady) y LRU_BITS (LRU apoyado con bits de referencia).
 */
(function (root) {
  'use strict';

  var SECUENCIA_PROFESOR = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0];

  var ORDENES = {
    HCL: ['H', 'C', 'LRU'], // Historia → Contador → LRU (por defecto)
    CHL: ['C', 'H', 'LRU']  // Contador → Historia → LRU
  };

  var NOMBRE_REGLA = {
    H: 'Historia (H)',
    C: 'Contador (C)',
    LRU: 'LRU exacto (uso más antiguo)',
    FIFO: 'FIFO (la que entró primero)',
    MRU: 'MRU (la usada más recientemente)',
    OPT: 'Óptimo (la que se usará más tarde)'
  };

  function normalizarConfig(config) {
    config = config || {};
    var k = config.k == null ? 0 : Number(config.k);
    var c = config.c == null ? 0 : Number(config.c);
    var orden = config.orden && ORDENES[config.orden] ? config.orden : 'HCL';
    return { k: k, c: c, orden: orden };
  }

  function bitsATexto(valor, k) {
    if (k <= 0) return '';
    var s = valor.toString(2);
    while (s.length < k) s = '0' + s;
    return s;
  }

  function listaPaginas(arr) {
    if (arr.length === 1) return 'la ' + arr[0];
    return 'las ' + arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
  }

  /* ------------------------------------------------------------------ */
  /* Simulación                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * simulate(seq, frames, algorithm, config) → Step[]
   * Step = {
   *   indice, ref, acierto, marcos (por posición, null = vacío),
   *   pila (MRU → LRU), bits {pagina: {H, C}}, sale (página o null), posicion (marco usado),
   *   lruSacaria (lo que sacaría LRU puro en ese mismo estado), fallos (acumulados),
   *   decision { tipo: 'acierto'|'carga'|'reemplazo', reglas: [...], frase }
   * }
   */
  function simulate(seq, frames, algorithm, config) {
    var cfg = normalizarConfig(config);
    var maxH = cfg.k > 0 ? (1 << cfg.k) - 1 : 0;
    var msb = cfg.k > 0 ? 1 << (cfg.k - 1) : 0;
    var maxC = cfg.c > 0 ? (1 << cfg.c) - 1 : 0;

    var marcos = [];           // contenido por posición
    for (var f = 0; f < frames; f++) marcos.push(null);
    var ultimoUso = {};        // página → instante del último uso
    var entrada = {};          // página → instante de carga (FIFO)
    var H = {}, C = {};        // registros por página en memoria
    var pasos = [];
    var fallos = 0;

    for (var t = 0; t < seq.length; t++) {
      var ref = seq[t];
      var enMemoria = marcos.filter(function (p) { return p !== null; });
      var acierto = enMemoria.indexOf(ref) !== -1;
      var sale = null, posicion = -1, lruSacaria = null;
      var decision;

      // 1) Desplazar H de todas las páginas en memoria (solo LRU_BITS).
      if (algorithm === 'LRU_BITS' && cfg.k > 0) {
        enMemoria.forEach(function (p) { H[p] = (H[p] >> 1) & maxH; });
      }

      if (acierto) {
        posicion = marcos.indexOf(ref);
        if (algorithm === 'LRU_BITS') {
          if (cfg.k > 0) H[ref] = H[ref] | msb;
          if (cfg.c > 0) C[ref] = Math.min(C[ref] + 1, maxC);
        }
        decision = { tipo: 'acierto', reglas: [], frase: 'Acierto: la ' + ref + ' ya estaba en memoria.' };
      } else {
        fallos++;
        var libre = marcos.indexOf(null);
        if (libre !== -1) {
          posicion = libre;
          decision = { tipo: 'carga', reglas: [], frase: 'Fallo: la ' + ref + ' entra en un marco libre (marco ' + (libre + 1) + ').' };
        } else {
          lruSacaria = masAntigua(enMemoria, ultimoUso);
          var eleccion = escogerVictima(algorithm, cfg, enMemoria, {
            ultimoUso: ultimoUso, entrada: entrada, H: H, C: C, seq: seq, t: t
          });
          sale = eleccion.victima;
          posicion = marcos.indexOf(sale);
          decision = { tipo: 'reemplazo', reglas: eleccion.reglas, frase: eleccion.frase,
            previo: enMemoria.map(function (p) { return { p: p, H: H[p], C: C[p] }; }) };
          delete H[sale]; delete C[sale]; delete ultimoUso[sale]; delete entrada[sale];
        }
        marcos[posicion] = ref;
        entrada[ref] = t;
        if (algorithm === 'LRU_BITS') {
          H[ref] = msb;
          C[ref] = 0;
        }
      }
      ultimoUso[ref] = t;

      var actuales = marcos.filter(function (p) { return p !== null; });
      var pila = actuales.slice().sort(function (a, b) { return ultimoUso[b] - ultimoUso[a]; });
      var bits = {};
      actuales.forEach(function (p) {
        bits[p] = { H: algorithm === 'LRU_BITS' ? H[p] : 0, C: algorithm === 'LRU_BITS' ? C[p] : 0 };
      });

      pasos.push({
        indice: t,
        ref: ref,
        acierto: acierto,
        marcos: marcos.slice(),
        pila: pila,
        bits: bits,
        sale: sale,
        posicion: posicion,
        lruSacaria: lruSacaria,
        fallos: fallos,
        decision: decision
      });
    }
    return pasos;
  }

  function masAntigua(paginas, ultimoUso) {
    var mejor = paginas[0];
    paginas.forEach(function (p) { if (ultimoUso[p] < ultimoUso[mejor]) mejor = p; });
    return mejor;
  }

  function filtrarMin(candidatas, valorDe) {
    var min = Infinity;
    candidatas.forEach(function (p) { min = Math.min(min, valorDe(p)); });
    return candidatas.filter(function (p) { return valorDe(p) === min; });
  }

  function filtrarMax(candidatas, valorDe) {
    var max = -Infinity;
    candidatas.forEach(function (p) { max = Math.max(max, valorDe(p)); });
    return candidatas.filter(function (p) { return valorDe(p) === max; });
  }

  function proximoUso(seq, t, p) {
    for (var i = t + 1; i < seq.length; i++) if (seq[i] === p) return i;
    return Infinity;
  }

  function escogerVictima(algorithm, cfg, enMemoria, est) {
    var cands = enMemoria.slice();
    var reglas = [];

    function registrar(clave, valores, sobreviven, mostrar) {
      var vals = {};
      cands.forEach(function (p) { vals[p] = mostrar(valores(p)); });
      reglas.push({ clave: clave, nombre: NOMBRE_REGLA[clave], candidatas: cands.slice(), valores: vals, sobreviven: sobreviven.slice() });
      cands = sobreviven;
    }

    if (algorithm === 'FIFO') {
      var vf = function (p) { return est.entrada[p]; };
      registrar('FIFO', vf, filtrarMin(cands, vf), function (v) { return 'entró en el paso ' + (v + 1); });
      return { victima: cands[0], reglas: reglas, frase: 'Sale la ' + cands[0] + ': es la que lleva más tiempo en memoria.' };
    }
    if (algorithm === 'LRU') {
      var vl = function (p) { return est.ultimoUso[p]; };
      registrar('LRU', vl, filtrarMin(cands, vl), function (v) { return 'último uso: paso ' + (v + 1); });
      return { victima: cands[0], reglas: reglas, frase: 'Sale la ' + cands[0] + ': es la de uso más antiguo.' };
    }
    if (algorithm === 'MRU') {
      var vm = function (p) { return est.ultimoUso[p]; };
      registrar('MRU', vm, filtrarMax(cands, vm), function (v) { return 'último uso: paso ' + (v + 1); });
      return { victima: cands[0], reglas: reglas, frase: 'Sale la ' + cands[0] + ': es la usada más recientemente.' };
    }
    if (algorithm === 'OPT') {
      var vo = function (p) { return proximoUso(est.seq, est.t, p); };
      var sobr = filtrarMax(cands, vo);
      // Desempate determinista: la que entró primero.
      sobr = filtrarMin(sobr, function (p) { return est.entrada[p]; });
      registrar('OPT', vo, sobr, function (v) { return v === Infinity ? 'no se vuelve a usar' : 'próximo uso: paso ' + (v + 1); });
      return { victima: cands[0], reglas: reglas, frase: 'Sale la ' + cands[0] + ': es la que más tarda en volver a usarse.' };
    }

    // LRU_BITS
    var orden = ORDENES[cfg.orden].filter(function (r) {
      return (r === 'H' && cfg.k > 0) || (r === 'C' && cfg.c > 0) || r === 'LRU';
    });
    orden.forEach(function (r) {
      if (cands.length === 1 && r !== 'LRU') return; // ya está decidido
      if (r === 'H') {
        var vh = function (p) { return est.H[p]; };
        registrar('H', vh, filtrarMin(cands, vh), function (v) { return bitsATexto(v, cfg.k); });
      } else if (r === 'C') {
        var vc = function (p) { return est.C[p]; };
        registrar('C', vc, filtrarMin(cands, vc), function (v) { return 'C = ' + v; });
      } else if (cands.length > 1 || reglas.length === 0) {
        var vu = function (p) { return est.ultimoUso[p]; };
        registrar('LRU', vu, filtrarMin(cands, vu), function (v) { return 'último uso: paso ' + (v + 1); });
      }
    });

    var victima = cands[0];
    return { victima: victima, reglas: reglas, frase: fraseBits(victima, reglas, cfg) };
  }

  function descripcionValor(clave, valor) {
    if (clave === 'H') return 'historia (' + valor + ')';
    if (clave === 'C') return 'usos (' + valor + ')';
    return valor;
  }

  function fraseBits(victima, reglas, cfg) {
    var ultima = reglas[reglas.length - 1];
    if (reglas.length === 1) {
      var r = reglas[0];
      if (r.clave === 'LRU') return 'Sale la ' + victima + ': es la de uso más antiguo (la de abajo de la pila).';
      var otras = r.candidatas.filter(function (p) { return p !== victima; });
      var texto = otras.map(function (p) { return p + ' (' + r.valores[p] + ')'; }).join(', ');
      if (r.clave === 'H') return 'Sale la ' + victima + ': tiene la historia más baja (' + r.valores[victima] + ') frente a ' + texto + '.';
      return 'Sale la ' + victima + ': tiene menos usos (' + r.valores[victima] + ') frente a ' + texto + '.';
    }
    var previa = reglas[reglas.length - 2];
    var empatadas = previa.sobreviven.filter(function (p) { return p !== victima; });
    var base = 'Sale la ' + victima + ': empataba con ' + listaPaginas(empatadas) + ' en ' +
      descripcionValor(previa.clave, previa.valores[victima]);
    if (reglas.length > 2) {
      base = 'Sale la ' + victima + ': seguía empatada con ' + listaPaginas(empatadas) + ' tras ' +
        reglas.slice(0, -1).map(function (r) { return r.clave === 'H' ? 'historia' : 'contador'; }).join(' y ');
    }
    if (ultima.clave === 'C') return base + ', pero tenía menos usos (' + ultima.valores[victima] + ').';
    if (ultima.clave === 'H') return base + ', pero tenía la historia más baja (' + ultima.valores[victima] + ').';
    return base + ', y es la de uso más antiguo.';
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function contarFallos(seq, frames, algorithm, config) {
    var pasos = simulate(seq, frames, algorithm, config);
    return pasos.length ? pasos[pasos.length - 1].fallos : 0;
  }

  function costoBits(config) {
    var cfg = normalizarConfig(config);
    return cfg.k + cfg.c;
  }

  // Generador pseudoaleatorio con semilla (mulberry32).
  function mulberry32(semilla) {
    var a = semilla >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Genera una secuencia de 16 referencias (páginas 0–9) con localidad:
   * ~75 % sale de un grupo de 3–4 páginas "activas" que cambia 1 o 2 veces,
   * el resto de cualquier página. Garantiza al menos `minDistintas` páginas distintas.
   */
  function generarSecuencia(semilla, opciones) {
    opciones = opciones || {};
    var largo = opciones.largo || 16;
    var minDistintas = Math.min(opciones.minDistintas || 5, 10);
    var rnd = mulberry32(semilla);
    var entero = function (n) { return Math.floor(rnd() * n); };

    var cambios = 1 + entero(2);            // 1 o 2 cambios → 2 o 3 fases
    var fases = cambios + 1;
    var cortes = [];
    for (var i = 1; i < fases; i++) {
      var base = Math.round((largo * i) / fases);
      cortes.push(base + entero(3) - 1);    // pequeño desplazamiento aleatorio
    }

    var activas = [];
    function nuevoGrupo(anterior) {
      var tam = 3 + entero(2);
      var grupo = [];
      // conserva 1 página del grupo anterior para que el cambio sea gradual
      if (anterior.length) grupo.push(anterior[entero(anterior.length)]);
      while (grupo.length < tam) {
        var p = entero(10);
        if (grupo.indexOf(p) === -1 && (anterior.indexOf(p) === -1 || grupo.length === 0)) grupo.push(p);
      }
      return grupo;
    }
    activas = nuevoGrupo([]);

    var seq = [];
    var deRuido = [];
    for (var t = 0; t < largo; t++) {
      if (cortes.indexOf(t) !== -1) activas = nuevoGrupo(activas);
      if (rnd() < 0.75) {
        seq.push(activas[entero(activas.length)]);
      } else {
        seq.push(entero(10));
        deRuido.push(t);
      }
    }

    // Reparación: asegurar suficientes páginas distintas.
    var distintas = function () {
      var s = {}; seq.forEach(function (p) { s[p] = 1; }); return Object.keys(s).length;
    };
    var guardas = 0;
    while (distintas() < minDistintas && guardas++ < 50) {
      var cuenta = {};
      seq.forEach(function (p) { cuenta[p] = (cuenta[p] || 0) + 1; });
      var faltan = [];
      for (var q = 0; q < 10; q++) if (!cuenta[q]) faltan.push(q);
      // posiciones reemplazables: preferir las de ruido, y cuya página se repite
      var posibles = [];
      for (var j = 0; j < largo; j++) if (cuenta[seq[j]] > 1) posibles.push(j);
      var preferidas = posibles.filter(function (j) { return deRuido.indexOf(j) !== -1; });
      var lista = preferidas.length ? preferidas : posibles;
      var pos = lista[entero(lista.length)];
      seq[pos] = faltan[entero(faltan.length)];
    }
    return seq;
  }

  function semillaAleatoria() {
    return Math.floor(Math.random() * 900000) + 100000;
  }

  var Motor = {
    SECUENCIA_PROFESOR: SECUENCIA_PROFESOR,
    ORDENES: ORDENES,
    NOMBRE_REGLA: NOMBRE_REGLA,
    simulate: simulate,
    contarFallos: contarFallos,
    costoBits: costoBits,
    bitsATexto: bitsATexto,
    mulberry32: mulberry32,
    generarSecuencia: generarSecuencia,
    semillaAleatoria: semillaAleatoria
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
  if (root) root.Motor = Motor;
})(typeof window !== 'undefined' ? window : this);
