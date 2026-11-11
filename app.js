/*
 * app.js — Interfaz de "LRU con bits — paso a paso".
 * Usa window.Motor (engine.js). Sin librerías.
 */
(function () {
  'use strict';

  const M = window.Motor;
  const $ = (id) => document.getElementById(id);

  // pausa: tiempo mínimo que se queda cada paso en pantalla al reproducir.
  // dur: duración de cada animación. En un reemplazo se suma el tiempo que tardan
  // en aparecer las reglas, para que la explicación se alcance a leer completa.
  const VELOCIDADES = {
    lenta: { pausa: 3800, dur: 1000 },
    normal: { pausa: 2400, dur: 700 },
    rapida: { pausa: 1100, dur: 350 }
  };
  const ALTO_PILA = 54;
  const reducirMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const E = {
    seq: [], semilla: null, profesor: false, revelado: -1,
    marcos: 3, modo: 'mia', k: 2, c: 2, orden: 'HCL',
    pasos: [], paso: 0,
    jugando: false, timer: null, vel: 'normal'
  };

  /* ------------------------------------------------------------ */
  /* Configuración                                                 */
  /* ------------------------------------------------------------ */
  function config() {
    if (E.modo === 'puro') return { k: 0, c: 0, orden: 'HCL' };
    if (E.modo === 'mia') return { k: 2, c: 2, orden: 'HCL' };
    return { k: E.k, c: E.c, orden: E.orden };
  }
  function textoOrden(o) { return o === 'CHL' ? 'C→H→LRU' : 'H→C→LRU'; }
  function nombreConfig() {
    const cfg = config();
    if (E.modo === 'puro') return 'LRU puro (k=0, c=0)';
    const base = E.modo === 'mia' ? 'Mi configuración' : 'Personalizada';
    return base + ' (k=' + cfg.k + ', c=' + cfg.c + ', ' + textoOrden(cfg.orden) + ')';
  }
  function hayBits() { const c = config(); return c.k > 0 || c.c > 0; }
  function dur() { return reducirMovimiento ? 1 : VELOCIDADES[E.vel].dur; }

  /* ------------------------------------------------------------ */
  /* URL                                                            */
  /* ------------------------------------------------------------ */
  function leerURL() {
    const q = new URLSearchParams(location.search);
    const m = parseInt(q.get('marcos'), 10);
    if (m >= 1 && m <= 6) E.marcos = m;
    const cfg = q.get('config');
    if (cfg === 'puro' || cfg === 'mia') E.modo = cfg;
    else if (cfg && /^k[0234]c[0123](HCL|CHL)$/.test(cfg)) {
      E.modo = 'custom'; E.k = +cfg[1]; E.c = +cfg[3]; E.orden = cfg.slice(4);
    }
    if (q.get('secuencia') === 'profesor') { E.profesor = true; return; }
    const s = parseInt(q.get('semilla'), 10);
    E.semilla = Number.isFinite(s) && s >= 0 ? s : M.semillaAleatoria();
  }
  function escribirURL() {
    const q = new URLSearchParams();
    if (E.profesor) q.set('secuencia', 'profesor'); else q.set('semilla', E.semilla);
    if (E.marcos !== 3) q.set('marcos', E.marcos);
    if (E.modo === 'puro') q.set('config', 'puro');
    if (E.modo === 'custom') q.set('config', 'k' + E.k + 'c' + E.c + E.orden);
    try { history.replaceState(null, '', '?' + q.toString()); } catch (e) { /* file:// en algunos navegadores */ }
  }

  /* ------------------------------------------------------------ */
  /* Secuencia y simulación                                         */
  /* ------------------------------------------------------------ */
  function cargarSecuencia() {
    E.seq = E.profesor ? M.SECUENCIA_PROFESOR.slice() : M.generarSecuencia(E.semilla, { minDistintas: E.marcos + 2 });
  }
  function nuevaSecuencia() {
    pausar();
    E.profesor = false;
    E.semilla = M.semillaAleatoria();
    cargarSecuencia();
    recalcular(true);
  }
  function usarProfesor() {
    pausar();
    E.profesor = true;
    cargarSecuencia();
    recalcular(true);
  }
  function recalcular(volverACero) {
    E.pasos = M.simulate(E.seq, E.marcos, 'LRU_BITS', config());
    E.revelado = -1;
    if (volverACero) E.paso = 0;
    E.paso = Math.min(E.paso, E.pasos.length);
    escribirURL();
    $('res100').innerHTML = '';
    render(false);
    renderResultados();
  }

  /* ------------------------------------------------------------ */
  /* Navegación                                                     */
  /* ------------------------------------------------------------ */
  function avanzar() {
    if (E.paso >= E.pasos.length) return false;
    E.paso++;
    E.revelado = -1;
    render(true);
    return true;
  }
  function retroceder() {
    pausar();
    E.revelado = -1;
    if (E.paso > 0) { E.paso--; render(false); }
  }
  function saltar(n) {
    pausar();
    E.revelado = -1;
    E.paso = Math.max(0, Math.min(n, E.pasos.length));
    render(false);
  }
  function reiniciar() { saltar(0); }

  function reproducir() {
    if (E.paso >= E.pasos.length) { E.paso = 0; render(false); }
    E.jugando = true;
    renderControles();
    const tick = () => {
      if (!E.jugando) return;
      const ok = avanzar();
      if (!ok || E.paso >= E.pasos.length) { pausar(); return; }
      E.timer = setTimeout(tick, tiempoEnPantalla(pasoActual()));
    };
    tick();
  }
  function pausar() {
    E.jugando = false;
    clearTimeout(E.timer);
    renderControles();
  }
  function alternar() { E.jugando ? pausar() : reproducir(); }

  // Cuánto se queda un paso en pantalla al reproducir.
  function tiempoEnPantalla(st) {
    const v = VELOCIDADES[E.vel];
    if (!st || st.decision.tipo !== 'reemplazo') return v.pausa;
    const animacionReglas = (st.decision.reglas.length * 0.9 + 1.3) * v.dur;
    return v.pausa + animacionReglas;
  }

  /* ------------------------------------------------------------ */
  /* Render general                                                 */
  /* ------------------------------------------------------------ */
  function pasoActual() { return E.paso > 0 ? E.pasos[E.paso - 1] : null; }
  function pasoPrevio() { return E.paso > 1 ? E.pasos[E.paso - 2] : null; }

  function render(animar) {
    if (reducirMovimiento) animar = false;
    renderTira();
    renderControles();
    renderPila(animar);
    renderRegistro(animar);
    renderDecision(animar);
    renderMatriz();
    // Los resultados solo aparecen cuando el algoritmo ya procesó toda la secuencia.
    $('resultados').hidden = E.paso < E.pasos.length;
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function renderTira() {
    const tira = $('tira');
    // Las casillas se crean una vez por secuencia; en cada paso solo cambian sus clases
    // (así no se pierde el foco al recorrerlas con el teclado).
    const clave = E.seq.join(',');
    if (tira.dataset.clave !== clave) {
      tira.innerHTML = '';
      E.seq.forEach((p, i) => {
        const li = el('li', '', '<span class="n">' + (i + 1) + '</span>' + p);
        li.dataset.i = i;
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', 'Paso ' + (i + 1) + ': página ' + p);
        tira.appendChild(li);
      });
      tira.dataset.clave = clave;
    }
    Array.prototype.forEach.call(tira.children, (li, i) => {
      const hecha = i < E.paso;
      li.classList.toggle('hecha', hecha);
      li.classList.toggle('acierto', hecha && E.pasos[i].acierto);
      li.classList.toggle('fallo', hecha && !E.pasos[i].acierto);
      li.classList.toggle('actual', i === E.paso - 1);
      if (i === E.paso - 1) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('btnProfesor').hidden = E.profesor;
  }

  function renderControles() {
    const st = pasoActual();
    $('pasoInfo').textContent = 'Paso ' + E.paso + ' de ' + E.pasos.length;
    const f = st ? st.fallos : 0;
    $('fallosInfo').textContent = 'Fallos: ' + f;
    $('btnAnterior').disabled = E.paso === 0;
    $('btnSiguiente').disabled = E.paso >= E.pasos.length;
    $('btnPlay').textContent = E.jugando ? 'Pausar' : (E.paso >= E.pasos.length ? 'Repetir' : 'Reproducir');
    $('personalizada').hidden = E.modo !== 'custom';
  }

  /* ---------- Pila LRU ---------- */
  const nodosPila = new Map();

  function ultimoUso(p, hasta) {
    for (let i = hasta; i >= 0; i--) if (E.seq[i] === p) return i;
    return -1;
  }

  function renderPila(animar) {
    const pila = $('pila');
    pila.style.height = (E.marcos * ALTO_PILA - 8) + 'px';
    pila.style.setProperty('--alto-pila', ALTO_PILA + 'px');

    if (pila.dataset.n !== String(E.marcos)) {
      pila.innerHTML = '';
      nodosPila.clear();
      for (let i = 0; i < E.marcos; i++) {
        const r = el('div', 'ranura');
        r.style.top = (i * ALTO_PILA) + 'px';
        pila.appendChild(r);
      }
      pila.dataset.n = String(E.marcos);
    }
    pila.querySelectorAll('.pag.sale').forEach((n) => n.remove());

    const st = pasoActual();
    const orden = st ? st.pila : [];

    if (!animar) {
      pila.classList.add('sin-anim');
      nodosPila.forEach((n) => n.remove());
      nodosPila.clear();
    }

    nodosPila.forEach((n, p) => {
      if (orden.indexOf(p) !== -1) return;
      nodosPila.delete(p);
      if (animar && st && st.sale === p) {
        n.classList.remove('usada', 'nueva', 'entrando', 'marcada');
        n.classList.add('sale');
        n.querySelector('.meta').textContent = 'sale';
        setTimeout(() => n.remove(), dur() * 1.3 + 60);
      } else n.remove();
    });

    orden.forEach((p, idx) => {
      let n = nodosPila.get(p);
      const esNueva = !n;
      if (!n) {
        n = el('div', 'pag', '<span class="dig">' + p + '</span><span class="meta"></span>');
        n.style.top = (idx * ALTO_PILA) + 'px';
        pila.appendChild(n);
        nodosPila.set(p, n);
        if (animar) n.classList.add('entrando');
      }
      n.style.top = (idx * ALTO_PILA) + 'px';
      const esRef = st && p === st.ref;
      n.classList.toggle('usada', !!(esRef && st.acierto));
      n.classList.toggle('nueva', !!(esRef && !st.acierto));
      if (!esNueva) n.classList.remove('entrando');
      const u = ultimoUso(p, E.paso - 1);
      // La que sacaría LRU puro (cuando los bits deciden otra cosa) se marca con borde punteado.
      const marcada = !!(st && st.decision.tipo === 'reemplazo' && st.lruSacaria !== st.sale && p === st.lruSacaria);
      n.classList.toggle('marcada', marcada);
      n.querySelector('.meta').textContent = marcada ? 'LRU puro sacaría esta'
        : esRef ? (st.acierto ? 'acierto, sube' : 'entra') : 'último uso: paso ' + (u + 1);
    });

    if (!animar) {
      requestAnimationFrame(() => requestAnimationFrame(() => pila.classList.remove('sin-anim')));
    }
  }

  /* ---------- Registro de bits ---------- */
  function cajasBits(valor, n, clases) {
    let html = '';
    const s = M.bitsATexto(valor, n);
    for (let i = 0; i < n; i++) {
      const cls = ['bit', s[i] === '1' ? 'uno' : ''];
      if (i === 0 && clases.msb) cls.push('msb');
      if (i === 0 && clases.nuevo1) cls.push('nuevo1');
      html += '<span class="' + cls.join(' ') + '">' + s[i] + '</span>';
    }
    if (clases.cae != null) html += '<span class="bit cae' + (clases.cae ? ' uno' : '') + '" aria-hidden="true">' + clases.cae + '</span>';
    return html;
  }

  function renderRegistro(animar) {
    const cont = $('registro');
    const cfg = config();
    const st = pasoActual();
    const prev = pasoPrevio();

    let html = '<table><thead><tr><th>Marco</th><th>Página</th><th>H' + (cfg.k ? ' (' + cfg.k + ' bits)' : '') + '</th><th>C' + (cfg.c ? ' (' + cfg.c + ' bits)' : '') + '</th></tr></thead><tbody>';
    for (let j = 0; j < E.marcos; j++) {
      const p = st ? st.marcos[j] : null;
      if (p === null) {
        html += '<tr><td>' + (j + 1) + '</td><td colspan="3" class="vacio">marco libre</td></tr>';
        continue;
      }
      const b = st.bits[p];
      const esRef = p === st.ref;
      const entro = esRef && !st.acierto;
      const estaba = prev && prev.marcos.indexOf(p) !== -1 && !entro;
      const clsFila = [esRef ? 'ref' : '', animar && entro ? 'fila-nueva' : ''].join(' ');
      let hHtml, cHtml;
      if (cfg.k > 0) {
        const anim = animar && estaba;
        const clases = { msb: anim, nuevo1: animar && esRef, cae: anim ? (prev.bits[p].H & 1) : null };
        hHtml = '<span class="bits h' + (anim ? ' desplaza' : '') + '">' + cajasBits(b.H, cfg.k, clases) + '</span>';
      } else hHtml = '<span class="sin-bits">—</span>';
      if (cfg.c > 0) {
        const subio = animar && estaba && prev.bits[p].C !== b.C;
        cHtml = '<span class="bits c' + (subio ? ' sube' : '') + '">' + cajasBits(b.C, cfg.c, {}) + '</span><span class="dec">= ' + b.C + '</span>';
      } else cHtml = '<span class="sin-bits">—</span>';
      html += '<tr class="' + clsFila + '"><td>' + (j + 1) + '</td><td class="pg">' + p + '</td><td>' + hHtml + '</td><td>' + cHtml + '</td></tr>';
    }
    html += '</tbody></table>';
    cont.innerHTML = html;
  }

  /* ---------- Decisión ---------- */
  // Se escribe como un ejercicio resuelto: primero el veredicto, luego por qué.
  const NOMBRE_CORTO = { H: 'Historia', C: 'Contador', LRU: 'Uso más antiguo' };
  const CRITERIO = {
    H: 'quedan las de historia más baja',
    C: 'quedan las de menos usos',
    LRU: 'sale la usada hace más tiempo'
  };

  function valorCorto(r, p) {
    const v = String(r.valores[p]);
    if (r.clave === 'H') return '=' + v;
    if (r.clave === 'C') return '=' + v.replace('C = ', '');
    return ' (' + v.replace('último uso: ', '') + ')';
  }
  function sinPrefijo(frase) {
    const s = frase.replace(/^Sale la \d+: /, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Desglose de un fallo: solo números (H antes, H desplazado, C).
  function desglose(st, revelar) {
    const cfg = config();
    const caja = el('div', 'desglose');
    const rH = st.decision.reglas.find((r) => r.clave === 'H');
    const minH = rH ? rH.sobreviven : [];
    const rC = st.decision.reglas.find((r) => r.clave === 'C');
    const minC = rC ? rC.sobreviven : [];
    let t = '<table class="tabla-h"><thead><tr><th>Pág.</th>' + (cfg.k > 0 ? '<th>H →</th>' : '') + (cfg.c > 0 ? '<th>C</th>' : '') + '</tr></thead><tbody>';
    st.decision.previo.forEach((x) => {
      const hmin = minH.indexOf(x.p) !== -1;
      const cmin = revelar && minC.indexOf(x.p) !== -1 && (cfg.k === 0 || (minH.length > 1 && hmin));
      t += '<tr class="' + (revelar && x.p === st.sale ? 'sale' : '') + '"><td class="pg">' + x.p + '</td>' +
        (cfg.k > 0 ? '<td class="hd' + (hmin ? ' min' : '') + '">' + M.bitsATexto(x.H, cfg.k) + '</td>' : '') +
        (cfg.c > 0 ? '<td class="hd' + (cmin ? ' min' : '') + '">' + x.C + '</td>' : '') + '</tr>';
    });
    caja.innerHTML = t + '</tbody></table>';
    return caja;
  }

  function renderDecision(animar) {
    const cont = $('decision');
    cont.innerHTML = '';
    const d = dur();

    const st = pasoActual();
    if (!st) {
      cont.appendChild(el('p', 'titular', 'Memoria vacía.'));
      cont.appendChild(el('p', 'explica', 'Pulsa <b>Siguiente</b> o <b>Reproducir</b> para empezar.'));
      return;
    }

    if (st.decision.tipo === 'acierto') {
      cont.appendChild(el('p', 'titular', '<span class="verde">Acierto.</span>'));
      const cfg = config();
      const b = st.bits[st.ref];
      let texto = 'La ' + st.ref + ' ya estaba en memoria y sube a la cima de la pila.';
      if (cfg.k > 0) texto += ' Su historia queda en ' + M.bitsATexto(b.H, cfg.k) + '.';
      if (cfg.c > 0) texto += ' Su contador sube a ' + b.C + (b.C === (1 << cfg.c) - 1 ? ' (el máximo).' : '.');
      cont.appendChild(el('p', 'explica', texto));
      return;
    }

    if (st.decision.tipo === 'carga') {
      cont.appendChild(el('p', 'titular', '<span class="rojo">Fallo.</span>'));
      cont.appendChild(el('p', 'explica', 'La ' + st.ref + ' entra en un marco libre (marco ' + (st.posicion + 1) + ').'));
      return;
    }

    // Reemplazo
    if (!hayBits()) {
      cont.appendChild(el('p', 'titular', 'Sale la <span class="rojo">' + st.sale + '</span>.'));
      return;
    }
    const revelar = E.revelado === st.indice || !!resp;
    if (revelar) cont.appendChild(el('p', 'titular', 'Sale la <span class="rojo">' + st.sale + '</span>.'));
    const fila = el('div', 'fila-desglose');
    fila.appendChild(desglose(st, revelar));
    if (!revelar) {
      const b = el('button', 'btn flecha', '→');
      b.type = 'button';
      b.title = 'Mostrar qué página sale';
      b.setAttribute('aria-label', 'Mostrar qué página sale');
      b.addEventListener('click', () => { E.revelado = st.indice; renderDecision(true); });
      fila.appendChild(b);
    }
    cont.appendChild(fila);
    if (revelar) {
      const c = el('p', 'contraste', st.lruSacaria !== st.sale
        ? 'LRU puro habría sacado la ' + st.lruSacaria + ', la de abajo de la pila. Aquí los bits cambian la decisión.'
        : 'LRU puro habría sacado la misma.');
      cont.appendChild(c);
    }
  }

  /* ---------- Matriz ---------- */
  function textoHC(b) {
    const cfg = config();
    const partes = [];
    if (cfg.k > 0) partes.push(M.bitsATexto(b.H, cfg.k));
    if (cfg.c > 0) partes.push(String(b.C));
    return partes.join('·');
  }

  function renderMatriz() {
    const t = $('matriz');
    const n = E.pasos.length;
    const cls = (i) => 'col' + (i >= E.paso ? ' futuro' : '') + (i === E.paso - 1 ? ' actual' : '');
    let h = '<thead><tr><th scope="row">Referencia</th>';
    for (let i = 0; i < n; i++) h += '<th scope="col" class="' + cls(i) + '" data-i="' + i + '">' + E.seq[i] + '</th>';
    h += '</tr></thead><tbody>';
    for (let j = 0; j < E.marcos; j++) {
      h += '<tr><th scope="row">Marco ' + (j + 1) + '</th>';
      for (let i = 0; i < n; i++) {
        let c = '';
        let extra = '';
        if (i < E.paso) {
          const st = E.pasos[i];
          const p = st.marcos[j];
          if (p !== null) {
            c = '<span class="p">' + p + '</span>' + (hayBits() ? '<span class="hc">' + textoHC(st.bits[p]) + '</span>' : '');
            if (st.posicion === j) extra = st.acierto ? ' cambio-a' : ' cambio-f';
          }
        }
        h += '<td class="celda ' + cls(i) + extra + '" data-i="' + i + '">' + c + '</td>';
      }
      h += '</tr>';
    }
    h += '<tr><th scope="row">Fallo</th>';
    for (let i = 0; i < n; i++) {
      const v = i < E.paso ? (E.pasos[i].acierto ? '<span class="marca-a">·</span>' : '<span class="marca-f">F</span>') : '';
      h += '<td class="' + cls(i) + '" data-i="' + i + '">' + v + '</td>';
    }
    h += '</tr><tr><th scope="row">Sale</th>';
    for (let i = 0; i < n; i++) {
      const s = i < E.paso && E.pasos[i].sale !== null ? '<span class="sale-v">' + E.pasos[i].sale + '</span>' : '';
      h += '<td class="' + cls(i) + '" data-i="' + i + '">' + s + '</td>';
    }
    h += '</tr></tbody>';
    t.innerHTML = h;

    // mantener visible la columna actual (sin mover la página verticalmente)
    const act = t.querySelector('thead .actual');
    const wrap = t.parentElement;
    if (act) {
      const izq = act.offsetLeft - 90, der = act.offsetLeft + act.offsetWidth;
      if (izq < wrap.scrollLeft) wrap.scrollLeft = izq;
      else if (der > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = der - wrap.clientWidth + 20;
    } else if (E.paso === 0) wrap.scrollLeft = 0;
  }

  function exportarCSV() {
    const n = E.pasos.length;
    const filas = [];
    filas.push(['Paso'].concat(E.seq.map((_, i) => i + 1)));
    filas.push(['Referencia'].concat(E.seq));
    for (let j = 0; j < E.marcos; j++) {
      filas.push(['Marco ' + (j + 1)].concat(E.pasos.map((st) => st.marcos[j] === null ? '' : st.marcos[j])));
      if (hayBits()) filas.push(['H·C marco ' + (j + 1)].concat(E.pasos.map((st) => st.marcos[j] === null ? '' : textoHC(st.bits[st.marcos[j]]))));
    }
    filas.push(['Fallo'].concat(E.pasos.map((st) => st.acierto ? '' : 'F')));
    filas.push(['Sale'].concat(E.pasos.map((st) => st.sale === null ? '' : st.sale)));
    filas.push([]);
    filas.push(['Configuración', nombreConfig()]);
    filas.push(['Marcos', E.marcos]);
    filas.push(['Fallos', n ? E.pasos[n - 1].fallos : 0]);
    filas.push(['Secuencia', E.profesor ? 'profesor' : 'semilla ' + E.semilla]);
    const csv = '﻿' + filas.map((f) => f.map((v) => {
      const s = String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'lru-bits-' + (E.profesor ? 'profesor' : E.semilla) + '-m' + E.marcos + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ------------------------------------------------------------ */
  /* Resultados                                                     */
  /* ------------------------------------------------------------ */
  // Sin colores decorativos: la configuración propia en negro, el resto en grises.
  const COLORES = { mia: '#111111', LRU: '#4d4d4d', FIFO: '#a6a6a6', MRU: '#a6a6a6', OPT: '#7a7a7a' };

  function algoritmos() {
    const cfg = config();
    return [
      { id: 'mia', nombre: E.modo === 'mia' ? 'Mi configuración' : nombreConfig().replace(/ \(.*/, ''), sub: 'k=' + cfg.k + ', c=' + cfg.c + ', ' + textoOrden(cfg.orden), alg: 'LRU_BITS', cfg: cfg, bits: String(cfg.k + cfg.c) },
      { id: 'LRU', nombre: 'LRU puro', sub: 'exacto', alg: 'LRU', bits: 'orden exacto*' },
      { id: 'FIFO', nombre: 'FIFO', sub: '', alg: 'FIFO', bits: '0' },
      { id: 'MRU', nombre: 'MRU', sub: '', alg: 'MRU', bits: 'orden exacto*' },
      { id: 'OPT', nombre: 'Óptimo', sub: 'Belady', alg: 'OPT', bits: 'no realizable' }
    ];
  }

  function renderResultados() {
    const n = E.seq.length;
    const lista = algoritmos().map((a) => Object.assign(a, { fallos: M.contarFallos(E.seq, E.marcos, a.alg, a.cfg) }));
    // Con "LRU puro" la primera fila sería idéntica a la de LRU: no se repite.
    const visibles = E.modo === 'puro' ? lista.slice(1) : lista;
    let h = '<thead><tr><th>Algoritmo</th><th>Fallos</th><th>% fallos</th><th>Aciertos</th><th>Bits/página</th></tr></thead><tbody>';
    visibles.forEach((a) => {
      h += '<tr class="' + (a.id === 'mia' ? 'mia' : '') + '"><td>' + a.nombre + (a.sub ? '<span class="sub">' + a.sub + '</span>' : '') + '</td>' +
        '<td class="num">' + a.fallos + '</td><td class="num">' + Math.round((a.fallos / n) * 100) + ' %</td>' +
        '<td class="num">' + (n - a.fallos) + '</td><td class="num">' + a.bits + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><td colspan="5" class="ayuda" style="text-align:left">* LRU y MRU exactos necesitan mantener el orden completo de uso (pila o marca de tiempo) y reordenarlo en cada acceso.</td></tr></tfoot>';
    $('tablaRes').innerHTML = h;

    dibujarBarras(visibles, n);
    dibujarLineas();

    const mia = lista[0].fallos, lru = lista[1].fallos;
    const fr = $('fraseFinal');
    const dif = lru - mia;
    if (E.modo === 'puro') {
      fr.className = 'frase-final';
      fr.textContent = 'Estás viendo LRU puro (' + lru + ' fallos). Escoge “Mi configuración” para comparar con bits.';
    } else if (dif > 0) {
      fr.className = 'frase-final gana';
      fr.textContent = 'Con ' + (lista[0].bits) + ' bits por página, la configuración evita ' + dif + (dif === 1 ? ' fallo' : ' fallos') + ' frente a LRU puro (' + mia + ' vs. ' + lru + '). El óptimo hace ' + lista[4].fallos + '.';
    } else if (dif === 0) {
      fr.className = 'frase-final empata';
      fr.textContent = 'En esta secuencia la configuración empata con LRU puro (' + mia + ' fallos). El óptimo hace ' + lista[4].fallos + '.';
    } else {
      fr.className = 'frase-final pierde';
      fr.textContent = 'La configuración hace ' + (-dif) + (dif === -1 ? ' fallo' : ' fallos') + ' más que LRU puro en esta secuencia (' + mia + ' vs. ' + lru + ').';
    }
  }

  function svgTexto(x, y, txt, extra) {
    return '<text x="' + x + '" y="' + y + '" ' + (extra || '') + '>' + txt + '</text>';
  }

  function dibujarBarras(lista, n) {
    const W = 420, izq = 128, der = 36, alto = 30, gap = 8, top = 8;
    const maxV = Math.max(n, 1);
    const ancho = W - izq - der;
    let s = '';
    for (let v = 0; v <= maxV; v += 4) {
      const x = izq + (v / maxV) * ancho;
      s += '<line class="rejilla" x1="' + x + '" x2="' + x + '" y1="' + top + '" y2="' + (top + lista.length * (alto + gap)) + '"/>';
      s += svgTexto(x, top + lista.length * (alto + gap) + 12, v, 'class="eje-t" text-anchor="middle"');
    }
    lista.forEach((a, i) => {
      const y = top + i * (alto + gap);
      const w = Math.max(2, (a.fallos / maxV) * ancho);
      s += svgTexto(izq - 8, y + alto / 2 + 4, a.nombre, 'text-anchor="end"' + (a.id === 'mia' ? ' font-weight="700"' : ''));
      s += '<rect class="barra" x="' + izq + '" y="' + y + '" width="' + w + '" height="' + alto + '" style="fill:' + COLORES[a.id] + '"/>';
      s += svgTexto(izq + w + 6, y + alto / 2 + 4, a.fallos, 'font-weight="700"');
    });
    const svg = $('barras');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (top + lista.length * (alto + gap) + 18));
    svg.innerHTML = s;
  }

  function dibujarLineas() {
    const W = 420, H = 220, izq = 34, der = 12, arriba = 34, abajo = 30;
    const n = E.seq.length;
    const series = [
      { nombre: 'LRU puro', color: '#9a9a9a', f: (m) => M.contarFallos(E.seq, m, 'LRU') },
      { nombre: E.modo === 'puro' ? 'Config. actual' : 'Con bits', color: '#111111', f: (m) => M.contarFallos(E.seq, m, 'LRU_BITS', config()), grueso: true },
      { nombre: 'Óptimo', color: '#4d4d4d', f: (m) => M.contarFallos(E.seq, m, 'OPT'), punteada: true }
    ];
    const x = (m) => izq + ((m - 1) / 5) * (W - izq - der);
    const y = (v) => arriba + (1 - v / n) * (H - arriba - abajo);
    let s = '';
    for (let v = 0; v <= n; v += 4) {
      s += '<line class="rejilla" x1="' + izq + '" x2="' + (W - der) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += svgTexto(izq - 6, y(v) + 4, v, 'class="eje-t" text-anchor="end"');
    }
    for (let m = 1; m <= 6; m++) {
      s += svgTexto(x(m), H - abajo + 16, m, 'class="eje-t" text-anchor="middle"' + (m === E.marcos ? ' font-weight="700"' : ''));
    }
    s += svgTexto((izq + W - der) / 2, H - 2, 'marcos', 'class="eje-t" text-anchor="middle"');
    s += '<line x1="' + x(E.marcos) + '" x2="' + x(E.marcos) + '" y1="' + arriba + '" y2="' + (H - abajo) + '" stroke="#111111" stroke-width="1" stroke-dasharray="2 4"/>';
    let lx = izq;
    // Se dibujan en orden LRU → con bits → Óptimo: la punteada queda encima y se distingue
    // aunque las líneas coincidan.
    series.forEach((se) => {
      const pts = [];
      for (let m = 1; m <= 6; m++) pts.push([x(m), y(se.f(m))]);
      s += '<polyline fill="none" stroke="' + se.color + '" stroke-width="' + (se.grueso ? 3.5 : 2) + '"' + (se.punteada ? ' stroke-dasharray="6 4"' : '') +
        ' points="' + pts.map((p) => p[0] + ',' + p[1]).join(' ') + '"/>';
      pts.forEach((p) => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (se.grueso ? 4 : 3) + '" fill="' + se.color + '"/>'; });
      s += '<rect x="' + lx + '" y="8" width="14" height="4" rx="2" fill="' + se.color + '"/>';
      s += svgTexto(lx + 18, 14, se.nombre, 'class="eje-t"');
      lx += 30 + se.nombre.length * 6.4;
    });
    $('lineas').innerHTML = s;
  }

  function probar100() {
    const rnd = M.mulberry32((E.profesor ? 2024 : E.semilla) ^ 0x9e3779b9);
    const lista = algoritmos();
    const suma = {}; lista.forEach((a) => { suma[a.id] = 0; });
    let gana = 0, empata = 0, pierde = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      const seq = M.generarSecuencia(Math.floor(rnd() * 1e9), { minDistintas: E.marcos + 2 });
      const res = {};
      lista.forEach((a) => { res[a.id] = M.contarFallos(seq, E.marcos, a.alg, a.cfg); suma[a.id] += res[a.id]; });
      if (res.mia < res.LRU) gana++; else if (res.mia === res.LRU) empata++; else pierde++;
    }
    const puro = E.modo === 'puro';
    let h = '';
    if (puro) {
      h += '<p class="ayuda">Con “LRU puro” no hay nada que comparar contra LRU: escoge una configuración con bits para ver en cuántas gana, empata o pierde.</p>';
    } else {
      h += '<div class="resumen-100">' +
        '<span class="verde">Gana en ' + gana + '</span>' +
        '<span>Empata en ' + empata + '</span>' +
        '<span class="rojo">Pierde en ' + pierde + '</span>' +
        '<span class="ayuda" style="margin:0;align-self:center">frente a LRU puro · 100 secuencias de 16 referencias · ' + E.marcos + ' marcos</span></div>';
      h += '<div class="barra-gep" role="img" aria-label="Gana ' + gana + ', empata ' + empata + ', pierde ' + pierde + '">' +
        (gana ? '<span class="g" style="width:' + gana + '%">' + gana + '</span>' : '') +
        (empata ? '<span class="e" style="width:' + empata + '%">' + empata + '</span>' : '') +
        (pierde ? '<span class="p" style="width:' + pierde + '%">' + pierde + '</span>' : '') + '</div>';
    }
    h += '<table class="tabla"><thead><tr><th>Algoritmo</th><th>Fallos promedio</th><th>% fallos</th></tr></thead><tbody>';
    (puro ? lista.slice(1) : lista).forEach((a) => {
      const prom = suma[a.id] / N;
      h += '<tr class="' + (a.id === 'mia' ? 'mia' : '') + '"><td>' + a.nombre + (a.sub ? '<span class="sub">' + a.sub + '</span>' : '') + '</td><td class="num">' + prom.toFixed(2) + '</td><td class="num">' + Math.round(prom / 16 * 100) + ' %</td></tr>';
    });
    h += '</tbody></table>';
    $('res100').innerHTML = h;
  }

  /* ------------------------------------------------------------ */
  /* Eventos                                                        */
  /* ------------------------------------------------------------ */
  function fijarVelocidad(v) {
    E.vel = v;
    document.documentElement.style.setProperty('--dur', VELOCIDADES[v].dur + 'ms');
    document.querySelectorAll('[data-vel]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.vel === v)));
  }

  function enlazar() {
    $('btnNueva').addEventListener('click', nuevaSecuencia);
    $('btnProfesor').addEventListener('click', usarProfesor);
    $('btnReiniciar').addEventListener('click', reiniciar);
    $('btnAnterior').addEventListener('click', retroceder);
    $('btnSiguiente').addEventListener('click', () => { pausar(); avanzar(); });
    $('btnPlay').addEventListener('click', alternar);
    $('btnCSV').addEventListener('click', exportarCSV);
    $('btn100').addEventListener('click', probar100);
    document.querySelectorAll('[data-vel]').forEach((b) => b.addEventListener('click', () => fijarVelocidad(b.dataset.vel)));

    $('selMarcos').addEventListener('change', (e) => {
      E.marcos = parseInt(e.target.value, 10);
      pausar();
      cargarSecuencia(); // misma semilla; solo cambia si hace falta asegurar marcos + 2 páginas distintas
      recalcular(true);
    });
    $('selModo').addEventListener('change', (e) => { E.modo = e.target.value; pausar(); recalcular(false); });
    $('selK').addEventListener('change', (e) => { E.k = +e.target.value; pausar(); recalcular(false); });
    $('selC').addEventListener('change', (e) => { E.c = +e.target.value; pausar(); recalcular(false); });
    $('selOrden').addEventListener('change', (e) => { E.orden = e.target.value; pausar(); recalcular(false); });

    const clicPaso = (e) => {
      const c = e.target.closest('[data-i]');
      if (c) saltar(parseInt(c.dataset.i, 10) + 1);
    };
    $('tira').addEventListener('click', clicPaso);
    $('matriz').addEventListener('click', clicPaso);

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target.tagName;
      if (tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'checkbox') || tag === 'TEXTAREA') return;
      const casilla = e.target.dataset && e.target.dataset.i != null;
      if ((e.key === 'Enter' || e.key === ' ') && casilla) { e.preventDefault(); saltar(+e.target.dataset.i + 1); return; }
      // Espacio sobre un botón, enlace o casilla de verificación conserva su acción normal
      // (activar ese control); el atajo de reproducir/pausar solo aplica fuera de ellos.
      if (e.key === ' ' && e.target.closest('button, a, input, [role="button"], [role="radio"]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); pausar(); avanzar(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); retroceder(); }
      else if (e.key === ' ') { e.preventDefault(); alternar(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nuevaSecuencia(); }
    });
  }

  function sincronizarSelects() {
    $('selMarcos').value = String(E.marcos);
    $('selModo').value = E.modo;
    $('selK').value = String(E.k);
    $('selC').value = String(E.c);
    $('selOrden').value = E.orden;
  }

  function iniciar() {
    leerURL();
    sincronizarSelects();
    fijarVelocidad('normal');
    enlazar();
    cargarSecuencia();
    recalcular(true);
  }

  iniciar();
})();
