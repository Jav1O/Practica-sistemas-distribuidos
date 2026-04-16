// Panel del parking: mapa en tiempo real con Socket.IO

const socket = io();

// Estado del panel
const state = {
  parkings: [],
  currentParkingId: 0,
  spots: [],
  previousSpotStates: {},  // para detectar cambios y animar
};

// Elementos del DOM
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

// Conexion con el servidor

socket.on('connect', () => {
  els.connectionBadge.classList.add('connected');
  els.connText.textContent = 'Conectado';
  addLog('Sistema conectado al servidor', 'info');
  // pedir lista de parkings
  socket.emit('requestParkingList');
});

socket.on('disconnect', () => {
  els.connectionBadge.classList.remove('connected');
  els.connText.textContent = 'Desconectado';
  addLog('Conexión perdida', 'cancel');
});

// Lista de parkings recibida
socket.on('parkingList', (list) => {
  state.parkings = list;
  renderParkingTabs();
  // cargar el primero por defecto
  if (list.length > 0) {
    selectParking(list[0].id);
  }
});

// Detalle de un parking
socket.on('parkingDetail', (data) => {
  updateStats(data);
  renderMap(data.spots);
  state.spots = data.spots;
});

// Actualizacion en tiempo real
socket.on('parkingUpdate', (data) => {
  // actualizar lista local
  const idx = state.parkings.findIndex(p => p.id === data.parkingId);
  if (idx >= 0 && data.parking) {
    state.parkings[idx] = data.parking;
    renderParkingTabs();
  }

  // si estamos viendo este parking, actualizar mapa
  if (data.parkingId === state.currentParkingId) {
    if (data.parking) updateStats(data.parking);
    if (data.spots) {
      // guardar estado previo para animar
      state.spots.forEach(s => {
        state.previousSpotStates[s.id] = s.status;
      });
      renderMap(data.spots);
      state.spots = data.spots;
    }
  }

  // registrar en el log
  if (data.message) {
    let logType = 'info';
    if (data.message.includes('reservada')) logType = 'reserve';
    if (data.message.includes('confirmada')) logType = 'confirm';
    if (data.message.includes('liberada') || data.message.includes('cancelada')) logType = 'cancel';
    if (data.message.includes('expirado')) logType = 'expired';
    addLog(data.message, logType);
  }
});

// Renderizado de la interfaz

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

  // click en las pestañas
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

  // actualizar numeros
  els.statFree.querySelector('.stat-number').textContent = data.freeSpots;
  els.statReserved.querySelector('.stat-number').textContent = data.reservedSpots;
  els.statOccupied.querySelector('.stat-number').textContent = data.occupiedSpots;
  els.statTotal.querySelector('.stat-number').textContent = total;

  // barras de progreso
  const freeP = (data.freeSpots / total * 100).toFixed(0);
  const resP = (data.reservedSpots / total * 100).toFixed(0);
  const occP = (data.occupiedSpots / total * 100).toFixed(0);

  els.statFree.querySelector('.stat-bar-fill').style.width = freeP + '%';
  els.statReserved.querySelector('.stat-bar-fill').style.width = resP + '%';
  els.statOccupied.querySelector('.stat-bar-fill').style.width = occP + '%';
  els.statTotal.querySelector('.stat-bar-fill').style.width = '100%';
}

function renderMap(spots) {
  // agrupar por fila
  const rows = {};
  spots.forEach(spot => {
    const rowLetter = spot.label.replace(/[0-9]/g, '');
    if (!rows[rowLetter]) rows[rowLetter] = [];
    rows[rowLetter].push(spot);
  });

  const rowKeys = Object.keys(rows).sort();

  let html = '';
  rowKeys.forEach((rowKey, rowIndex) => {
    // separador de pasillo cada 2 filas
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

// Log de actividad

function addLog(message, type = 'info') {
  const now = new Date();
  const time = now.toLocaleTimeString('es-ES');

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message">${message}</span>
  `;

  // poner arriba del todo
  els.logEntries.insertBefore(entry, els.logEntries.firstChild);

  // maximo 50 entradas
  while (els.logEntries.children.length > 50) {
    els.logEntries.removeChild(els.logEntries.lastChild);
  }
}

// Reloj en el header

function updateClock() {
  const now = new Date();
  els.clock.textContent = now.toLocaleTimeString('es-ES');
}
setInterval(updateClock, 1000);
updateClock();

console.log('🅿️ SmartPark Panel inicializado');
