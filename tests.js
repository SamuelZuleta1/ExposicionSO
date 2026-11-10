/*
 * tests.js — Pruebas del motor, sin librerías.
 * Node:      node tests.js
 * Navegador: abrir tests.html
 */
(function () {
  'use strict';

  var enNode = typeof module !== 'undefined' && module.exports;
  var Motor = enNode ? require('./engine.js') : window.Motor;

  var resultados = [];
  function assert(nombre, obtenido, esperado) {
    var ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
    resultados.push({ nombre: nombre, ok: ok, obtenido: obtenido, esperado: esperado });
  }

  var PROF = Motor.SECUENCIA_PROFESOR;
  var PROF20 = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
  var BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

  var tabla = [
    { seq: PROF, m: 3, FIFO: 12, LRU: 11, MRU: 14, OPT: 8 },
    { seq: PROF, m: 4, FIFO: 9, LRU: 7, MRU: 12, OPT: 7 },
    { seq: PROF20, m: 3, FIFO: 15, LRU: 12, MRU: 16, OPT: 9 },
    { seq: BELADY, m: 3, FIFO: 9, LRU: 10, MRU: 7, OPT: 7 }
  ];

  tabla.forEach(function (fila) {
    ['FIFO', 'LRU', 'MRU', 'OPT'].forEach(function (alg) {
      assert(alg + ' · ' + fila.seq.length + ' refs · ' + fila.m + ' marcos', Motor.contarFallos(fila.seq, fila.m, alg), fila[alg]);
    });
    assert('LRU_BITS k=0 c=0 = LRU · ' + fila.seq.length + ' refs · ' + fila.m + ' marcos',
      Motor.contarFallos(fila.seq, fila.m, 'LRU_BITS', { k: 0, c: 0 }), fila.LRU);
  });

  // LRU_BITS con k=0 y c=0 debe sacar exactamente las mismas víctimas que LRU.
  tabla.forEach(function (fila) {
    var a = Motor.simulate(fila.seq, fila.m, 'LRU', {}).map(function (s) { return s.sale; });
    var b = Motor.simulate(fila.seq, fila.m, 'LRU_BITS', { k: 0, c: 0 }).map(function (s) { return s.sale; });
    assert('LRU_BITS k=0 c=0 mismas víctimas que LRU · ' + fila.seq.length + ' refs · ' + fila.m + ' marcos', b, a);
  });

  var mia = { k: 2, c: 2, orden: 'HCL' };
  assert('Mi configuración (k=2 c=2 H→C→LRU) · profesor · 3 marcos', Motor.contarFallos(PROF, 3, 'LRU_BITS', mia), 9);
  assert('Mi configuración (k=2 c=2 H→C→LRU) · 20 refs · 3 marcos', Motor.contarFallos(PROF20, 3, 'LRU_BITS', mia), 10);
  assert('Costo en bits de k=2 c=2', Motor.costoBits(mia), 4);

  // Orden alternativo de reglas: Contador → Historia → LRU
  var chl = { k: 2, c: 2, orden: 'CHL' };
  assert('k=2 c=2 C→H→LRU · profesor · 3 marcos', Motor.contarFallos(PROF, 3, 'LRU_BITS', chl), 9);
  assert('k=2 c=2 C→H→LRU · 20 refs · 3 marcos', Motor.contarFallos(PROF20, 3, 'LRU_BITS', chl), 11);
  assert('C→H→LRU aplica primero el contador', Motor.simulate(PROF, 3, 'LRU_BITS', chl)[3].decision.reglas[0].clave, 'C');

  // Frases de la decisión
  var pasosMia = Motor.simulate(PROF, 3, 'LRU_BITS', mia);
  assert('Frase paso 10 (los bits cambian la víctima)', pasosMia[9].decision.frase,
    'Sale la 4: empataba con la 0 en historia (00), pero tenía menos usos (C = 0).');
  assert('Paso 10: LRU puro habría sacado la 0', [pasosMia[9].sale, pasosMia[9].lruSacaria], [4, 0]);
  assert('Frase de LRU puro', Motor.simulate(PROF, 3, 'LRU_BITS', { k: 0, c: 0 })[3].decision.frase,
    'Sale la 7: es la de uso más antiguo (la de abajo de la pila).');
  assert('Frase de acierto', pasosMia[4].decision.frase, 'Acierto: la 0 ya estaba en memoria.');

  // Estructura del paso
  var pasos = Motor.simulate(PROF, 3, 'LRU_BITS', mia);
  assert('Un paso por referencia', pasos.length, 16);
  assert('Paso 4 (ref 2) es fallo con víctima', [pasos[3].acierto, pasos[3].sale !== null], [false, true]);
  assert('Página que entra arranca con H=10 y C=0', pasos[0].bits[7], { H: 2, C: 0 });
  assert('Acierto pone el MSB en 1 y sube C (paso 5, ref 0)', pasos[4].bits[0], { H: 2, C: 1 });
  assert('Pila: la más reciente arriba', pasos[4].pila[0], 0);

  // Generador
  var todoBien = true, rango = true, dist = true;
  for (var s = 1; s <= 300; s++) {
    for (var m = 1; m <= 6; m++) {
      var g = Motor.generarSecuencia(s, { minDistintas: m + 2 });
      if (g.length !== 16) todoBien = false;
      g.forEach(function (p) { if (!(p >= 0 && p <= 9 && p === Math.floor(p))) rango = false; });
      var d = {}; g.forEach(function (p) { d[p] = 1; });
      if (Object.keys(d).length < m + 2) dist = false;
    }
  }
  assert('Generador: siempre 16 referencias', todoBien, true);
  assert('Generador: todas entre 0 y 9', rango, true);
  assert('Generador: al menos marcos + 2 páginas distintas', dist, true);
  // Localidad: en promedio una secuencia de 16 referencias usa bastante menos de 10 páginas
  // y repite páginas (si fuera ruido puro rondaría 8,1 distintas).
  var sumaDist = 0;
  for (var sl = 1; sl <= 500; sl++) {
    var gs = Motor.generarSecuencia(sl, { minDistintas: 5 }), dd = {};
    gs.forEach(function (p) { dd[p] = 1; });
    sumaDist += Object.keys(dd).length;
  }
  assert('Generador: hay localidad (promedio de páginas distintas < 7,5)', sumaDist / 500 < 7.5, true);
  assert('Generador: misma semilla → misma secuencia', Motor.generarSecuencia(12345), Motor.generarSecuencia(12345));
  var distintas = 0;
  for (var q = 1; q <= 50; q++) {
    if (JSON.stringify(Motor.generarSecuencia(q)) !== JSON.stringify(Motor.generarSecuencia(q + 1))) distintas++;
  }
  assert('Generador: semillas distintas → secuencias distintas', distintas, 50);

  /* ---------- salida ---------- */
  var aprobadas = resultados.filter(function (r) { return r.ok; }).length;
  if (enNode) {
    resultados.forEach(function (r) {
      console.log((r.ok ? '✔ ' : '✘ ') + r.nombre + (r.ok ? '' : '  → obtenido ' + JSON.stringify(r.obtenido) + ', esperado ' + JSON.stringify(r.esperado)));
    });
    console.log('\n' + aprobadas + ' de ' + resultados.length + ' pruebas pasan.');
    if (aprobadas !== resultados.length) process.exitCode = 1;
  } else {
    window.RESULTADOS_PRUEBAS = { resultados: resultados, aprobadas: aprobadas };
  }
})();
