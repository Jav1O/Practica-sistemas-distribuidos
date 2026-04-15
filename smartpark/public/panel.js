// ═══════════════════════════════════════════════════════════════════
// SmartPark — Panel del Parking: Mapa en tiempo real + Socket.IO
// ═══════════════════════════════════════════════════════════════════

const socket = io();

// ─── Estado ─────────────────────────────────────────────────────────
const state = {
  parkings: [],
  currentParkingId: 0,
  spots: [],
  previousSpotStates: {},  // Para detectar cambios y animar
};

// ─── Elementos DOM ──────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const els = {
  connectionBadge: $('#connectionBadge'),
  connText: $('#connText'),
  clock: $('#clock'),
  parkingTabs: $('#parkingTabs'),
  statsBar: $('#statsBar'),
  statFree: $('#statFree'),
  statReserved: $('#statReserved'),
  statOccupied: $('#statOccupied'),
  statTotal: $('#statTotal'),
  mapTitle: $('#mapTitle'),
  mapGrid: $('#mapGrid'),
  logEntries: $('#logEntries'),
};

// ═══════════════════════════════════════════════════════════════════
// 1. CONEXIÓN SOCKET.IO
// ═══════════════════════════════════════════════════════════════════

socket.on('connect', () => {
  els.connectionBadge.classList.add('connected');
  els.connText.textContent = 'Conectado';
  addLog('Sistema conectado al servidor', 'info');
  // Pedir lista de parkings
  socket.emit('requestParkingList');
});

socket.on('disconnect', () => {
  els.connectionBadge.classList.remove('connected');
  els.connText.textContent = 'Desconectado';
  addLog('Conexión perdida', 'cancel');
});

// Recibir lista de parkings
socket.on('parkingList', (list) => {
  state.parkings = list;
  renderParkingTabs();
  // Cargar detalle del primer parking
  if (list.length > 0) {
    selectParking(list[0].id);
  }
});

// Recibir detalle de un parking
socket.on('parkingDetail', (data) => {
  updateStats(data);
  renderMap(data.spots);
  state.spots = data.spots;
});

// Actualizaciones en tiempo real
socket.on('parkingUpdate', (data) => {
  // Actualizar la lista local
  const idx = state.parkings.findIndex(p => p.id === data.parkingId);
  if (idx >= 0 && data.parking) {
    state.parkings[idx] = data.parking;
    renderParkingTabs();
  }

  // Si es el parking que estamos viendo, actualizar mapa
  if (data.parkingId === state.currentParkingId) {
    if (data.parking) updateStats(data.parking);
    if (data.spots) {
      // Guardar estado anterior para animar cambios
      state.spots.forEach(s => {
        state.previousSpotStates[s.id] = s.status;
      });
      renderMap(data.spots);
      state.spots = data.spots;
    }
  }

  // Log
  if (data.message) {
    let logType = 'info';
    if (data.message.includes('reservada')) logType = 'reserve';
    if (data.message.includes('confirmada')) logType = 'confirm';
    if (data.message.includes('liberada') || data.message.includes('cancelada')) logType = 'cancel';
    if (data.message.includes('expirado')) logType = 'expired';
    addLog(data.message, logType);
  }
});

// ═══════════════════════════════════════════════════════════════════
// 2. RENDERIZADO
// ═══════════════════════════════════════════════════════════════════

function renderParkingTabs() {
  els.parkingTabs.innerHTML = state.parkings.map(p => {
    const active = p.id === state.currentParkingId ? 'active' : '';
    return `
      <button class="parking-tab ${active}" data-id="${p.id}">
        🅿️ ${p.name}
        <span class="tab-free-count">${p.freeSpots} libres</span>
      </button>
    `;
  }).join('');

  // Eventos click
  document.querySelectorAll('.parking-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectParking(parseInt(tab.dataset.id));
    });
  });
}

function selectParking(parkingId) {
  state.currentParkingId = parkingId;
  state.previousSpotStates = {};
  socket.emit('requestParkingDetail', parkingId);
  renderParkingTabs();

  const parking = state.parkings.find(p => p.id === parkingId);
  if (parking) {
    els.mapTitle.textContent = `Mapa de plazas — ${parking.name}`;
  }
}

function updateStats(data) {
  const total = data.totalSpots || (data.freeSpots + data.reservedSpots + data.occupiedSpots);

  // Números
  els.statFree.querySelector('.stat-number').textContent = data.freeSpots;
  els.statReserved.querySelector('.stat-number').textContent = data.reservedSpots;
  els.statOccupied.querySelector('.stat-number').textContent = data.occupiedSpots;
  els.statTotal.querySelector('.stat-number').textContent = total;

  // Barras de progreso
  const freeP = (data.freeSpots / total * 100).toFixed(0);
  const resP = (data.reservedSpots / total * 100).toFixed(0);
  const occP = (data.occupiedSpots / total * 100).toFixed(0);

  els.statFree.querySelector('.stat-bar-fill').style.width = freeP + '%';
  els.statReserved.querySelector('.stat-bar-fill').style.width = resP + '%';
  els.statOccupied.querySelector('.stat-bar-fill').style.width = occP + '%';
  els.statTotal.querySelector('.stat-bar-fill').style.width = '100%';
}

function renderMap(spots) {
  // Agrupar por fila (letra)
  const rows = {};
  spots.forEach(spot => {
    const rowLetter = spot.label.replace(/[0-9]/g, '');
    if (!rows[rowLetter]) rows[rowLetter] = [];
    rows[rowLetter].push(spot);
  });

  const rowKeys = Object.keys(rows).sort();

  let html = '';
  rowKeys.forEach((rowKey, rowIndex) => {
    // Pasillo cada 2 filas
    if (rowIndex > 0 && rowIndex % 2 === 0) {
      html += `
        <div class="map-aisle">
          <span class="aisle-label">← Pasillo →</span>
        </div>
      `;
    }

    html += `
      <div class="map-row">
        <div class="map-row-label">${rowKey}</div>
        <div class="map-row-spots">
          ${rows[rowKey].map(spot => {
            const changed = state.previousSpotStates[spot.id] && state.previousSpotStates[spot.id] !== spot.status;
            return `
              <div class="map-spot ${spot.status} ${changed ? 'just-changed' : ''}" title="${spot.label} — ${getStatusText(spot.status)}">
                ${spot.label}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  els.mapGrid.innerHTML = html;
}

function getStatusText(status) {
  switch (status) {
    case 'free': return 'Libre';
    case 'occupied': return 'Ocupada';
    case 'reserved': return 'Reservada';
    case 'confirmed': return 'Confirmada';
    default: return status;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. LOG DE ACTIVIDAD
// ═══════════════════════════════════════════════════════════════════

function addLog(message, type = 'info') {
  const now = new Date();
  const time = now.toLocaleTimeString('es-ES');

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message">${message}</span>
  `;

  // Insertar al principio
  els.logEntries.insertBefore(entry, els.logEntries.firstChild);

  // Limitar a 50 entradas
  while (els.logEntries.children.length > 50) {
    els.logEntries.removeChild(els.logEntries.lastChild);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. RELOJ
// ═══════════════════════════════════════════════════════════════════

function updateClock() {
  const now = new Date();
  els.clock.textContent = now.toLocaleTimeString('es-ES');
}
setInterval(updateClock, 1000);
updateClock();

console.log('🅿️ SmartPark Panel inicializado');
