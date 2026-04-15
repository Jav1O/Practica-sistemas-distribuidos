// ═══════════════════════════════════════════════════════════════════
// SmartPark — Conductor: Voz + Gestos + Socket.IO
// ═══════════════════════════════════════════════════════════════════

import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

// ─── Socket.IO ──────────────────────────────────────────────────────
const socket = io();

// ─── Estado de la app ───────────────────────────────────────────────
const state = {
  parkings: [],
  currentParkingIndex: 0,
  currentParking: null,
  currentSpots: [],
  reservation: null,          // { parkingId, parkingName, spot }
  reservationTimerInterval: null,
  reservationEndTime: null,

  voiceActive: false,
  gesturesActive: false,
  urgentMode: false,

  // Gestos
  lastGestureTime: 0,
  gestureDelay: 1500,         // ms entre gestos para evitar repetición
  handLandmarker: null,
  webcamRunning: false,
};

// ─── Elementos del DOM ──────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  connectionStatus: $('#connectionStatus'),
  voiceIndicator: $('#voiceIndicator'),
  voiceStatus: $('#voiceStatus'),
  gestureIndicator: $('#gestureIndicator'),
  gestureStatus: $('#gestureStatus'),
  commandFeedback: $('#commandFeedback'),
  commandText: $('#commandText'),

  viewParkingList: $('#viewParkingList'),
  viewParkingDetail: $('#viewParkingDetail'),
  viewReservation: $('#viewReservation'),
  parkingCards: $('#parkingCards'),
  parkingDetailCard: $('#parkingDetailCard'),
  spotsGrid: $('#spotsGrid'),

  reservationCard: $('#reservationCard'),
  reservationTitle: $('#reservationTitle'),
  reservationDetail: $('#reservationDetail'),
  reservationTimer: $('#reservationTimer'),

  btnUrgent: $('#btnUrgent'),
  btnBack: $('#btnBack'),
  btnConfirm: $('#btnConfirm'),
  btnCancel: $('#btnCancel'),
  btnVoice: $('#btnVoice'),
  btnGestures: $('#btnGestures'),
  btnSearch: $('#btnSearch'),
  btnToggleCam: $('#btnToggleCam'),

  webcamContainer: $('#webcamContainer'),
  webcam: $('#webcam'),
  gestureCanvas: $('#gestureCanvas'),
  gestureLabel: $('#gestureLabel'),
  micIcon: $('#micIcon'),
};

// ═══════════════════════════════════════════════════════════════════
// 1. CONEXIÓN SOCKET.IO
// ═══════════════════════════════════════════════════════════════════

socket.on('connect', () => {
  els.connectionStatus.classList.add('connected');
  els.connectionStatus.querySelector('span:last-child').textContent = 'Conectado';
  console.log('✅ Conectado al servidor');
});

socket.on('disconnect', () => {
  els.connectionStatus.classList.remove('connected');
  els.connectionStatus.querySelector('span:last-child').textContent = 'Desconectado';
});

// Recibir lista de parkings
socket.on('parkingList', (list) => {
  state.parkings = list;
  state.currentParkingIndex = 0;
  renderParkingList();
  speak(`He encontrado ${list.length} parkings cercanos. ${list[0].name} tiene ${list[0].freeSpots} plazas libres.`);
});

// Recibir detalle de parking
socket.on('parkingDetail', (data) => {
  state.currentParking = data;
  state.currentSpots = data.spots;
  renderParkingDetail(data);
  showView('detail');
});

// Reserva confirmada por servidor
socket.on('reservationConfirmed', (data) => {
  state.reservation = {
    parkingId: data.parkingId,
    parkingName: data.parkingName,
    spot: data.spot,
  };
  renderReservation(data);
  showView('reservation');
  startReservationTimer();
  speak(data.message);
});

// Confirmación exitosa
socket.on('confirmationSuccess', (data) => {
  state.reservation.spot = data.spot;
  els.reservationTitle.textContent = '✅ Plaza confirmada';
  els.reservationDetail.textContent = `${data.parkingName} — Plaza ${data.spot.label}. ¡Dirígete al parking!`;
  stopReservationTimer();
  els.reservationTimer.textContent = '✔️';
  els.reservationTimer.className = 'reservation-timer';
  els.btnConfirm.style.display = 'none';
  speak(data.message);
});

// Cancelación exitosa
socket.on('cancellationSuccess', (data) => {
  state.reservation = null;
  stopReservationTimer();
  showView('list');
  speak(data.message);
  socket.emit('requestParkingList');
});

// Actualización de parking en tiempo real
socket.on('parkingUpdate', (data) => {
  // Actualizar la lista local
  const idx = state.parkings.findIndex(p => p.id === data.parkingId);
  if (idx >= 0 && data.parking) {
    state.parkings[idx] = data.parking;
  }
  // Si estamos viendo la lista, re-renderizar
  if (els.viewParkingList.classList.contains('active')) {
    renderParkingList();
  }
  // Si estamos viendo el detalle de este parking
  if (els.viewParkingDetail.classList.contains('active') && state.currentParking && state.currentParking.id === data.parkingId) {
    state.currentSpots = data.spots;
    renderSpotsGrid(data.spots);
  }
});

// Modo urgente
socket.on('urgentResult', (data) => {
  state.urgentMode = true;
  els.btnUrgent.classList.add('active');
  speak(data.message);

  // Navegar al parking urgente
  const idx = state.parkings.findIndex(p => p.id === data.parking.id);
  if (idx >= 0) {
    state.currentParkingIndex = idx;
    renderParkingList();
    showCommandFeedback(`🚨 ${data.parking.name} — ${data.parking.freeSpots} libres`);
  }
});

// Errores
socket.on('error', (data) => {
  speak(data.message);
  showCommandFeedback(`⚠️ ${data.message}`);
});

// ═══════════════════════════════════════════════════════════════════
// 2. RECONOCIMIENTO DE VOZ (Web Speech API)
// ═══════════════════════════════════════════════════════════════════

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function startVoiceRecognition() {
  if (!SpeechRecognition) {
    speak('Tu navegador no soporta reconocimiento de voz.');
    return;
  }

  if (state.voiceActive) {
    stopVoiceRecognition();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    state.voiceActive = true;
    els.voiceIndicator.classList.add('active');
    els.voiceStatus.textContent = 'Escuchando...';
    els.btnVoice.classList.add('active');
    console.log('🎙️ Reconocimiento de voz iniciado');
  };

  recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const command = event.results[last][0].transcript.toLowerCase().trim();
    console.log(`🎙️ Comando: "${command}"`);
    showCommandFeedback(`🎙️ "${command}"`);
    handleVoiceCommand(command);
  };

  recognition.onerror = (event) => {
    console.log('❌ Error de voz:', event.error);
    if (event.error === 'no-speech') {
      // Reiniciar silenciosamente
    } else {
      els.voiceStatus.textContent = `Error: ${event.error}`;
    }
  };

  recognition.onend = () => {
    // Reiniciar automáticamente si sigue activo
    if (state.voiceActive) {
      try {
        recognition.start();
      } catch (e) {
        console.log('Reintentando reconocimiento...');
        setTimeout(() => {
          if (state.voiceActive) {
            try { recognition.start(); } catch (e2) { /* silenciar */ }
          }
        }, 300);
      }
    }
  };

  recognition.start();
}

function stopVoiceRecognition() {
  state.voiceActive = false;
  if (recognition) {
    recognition.abort();
  }
  els.voiceIndicator.classList.remove('active');
  els.voiceStatus.textContent = 'Voz desactivada';
  els.btnVoice.classList.remove('active');
}

function handleVoiceCommand(command) {
  // ── Buscar aparcamiento
  if (command.includes('buscar') && (command.includes('aparcamiento') || command.includes('parking') || command.includes('aparcar'))) {
    socket.emit('requestParkingList');
    showCommandFeedback('🔍 Buscando parkings...');
    return;
  }

  // ── Siguiente parking
  if (command.includes('siguiente')) {
    navigateParking(1);
    return;
  }

  // ── Anterior parking
  if (command.includes('anterior')) {
    navigateParking(-1);
    return;
  }

  // ── Reservar
  if (command.includes('reservar') || command.includes('reserva')) {
    actionReserve();
    return;
  }

  // ── Confirmar
  if (command.includes('confirmar') || command.includes('confirma') || command.includes('sí') || command.includes('afirmativo')) {
    actionConfirm();
    return;
  }

  // ── Cancelar
  if (command.includes('cancelar') || command.includes('cancela') || command.includes('salir') || command.includes('no')) {
    actionCancel();
    return;
  }

  // ── Modo urgente
  if (command.includes('urgente') || command.includes('urgencia') || command.includes('prisa')) {
    actionUrgent();
    return;
  }

  // ── Ver detalle
  if (command.includes('ver') || command.includes('detalle') || command.includes('entrar')) {
    actionViewDetail();
    return;
  }

  // ── Volver
  if (command.includes('volver') || command.includes('atrás')) {
    actionGoBack();
    return;
  }

  // ── Ayuda
  if (command.includes('ayuda') || command.includes('comandos')) {
    speak('Puedes decir: buscar aparcamiento, siguiente, anterior, reservar, confirmar, cancelar, modo urgente, ver detalle, o volver.');
    return;
  }

  // No reconocido
  speak('No he entendido. Di ayuda para ver los comandos disponibles.');
}

// ─── Text-to-Speech ─────────────────────────────────────────────────
function speak(text) {
  const synth = window.speechSynthesis;
  // Cancelar cualquier síntesis previa
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  synth.speak(utterance);
  console.log(`🔊 TTS: "${text}"`);
}

// ═══════════════════════════════════════════════════════════════════
// 3. GESTOS CON MEDIAPIPE HandLandmarker
// ═══════════════════════════════════════════════════════════════════

async function initHandLandmarker() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });

    console.log('✋ HandLandmarker inicializado');
    return true;
  } catch (error) {
    console.error('Error inicializando HandLandmarker:', error);
    speak('No se pudo inicializar la detección de gestos.');
    return false;
  }
}

async function startGestureDetection() {
  if (state.gesturesActive) {
    stopGestureDetection();
    return;
  }

  // Inicializar HandLandmarker si no está listo
  if (!state.handLandmarker) {
    showCommandFeedback('⏳ Cargando detector de gestos...');
    const ok = await initHandLandmarker();
    if (!ok) return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });

    els.webcam.srcObject = stream;
    state.gesturesActive = true;
    state.webcamRunning = true;

    els.webcamContainer.classList.add('active');
    els.gestureIndicator.classList.add('active');
    els.gestureStatus.textContent = 'Gestos: activos';
    els.btnGestures.classList.add('active');

    // Esperar a que el video cargue
    els.webcam.addEventListener('loadeddata', () => {
      els.gestureCanvas.width = els.webcam.videoWidth;
      els.gestureCanvas.height = els.webcam.videoHeight;
      predictGestures();
    });

  } catch (error) {
    console.error('Error accediendo a la cámara:', error);
    speak('No se pudo acceder a la cámara.');
  }
}

function stopGestureDetection() {
  state.gesturesActive = false;
  state.webcamRunning = false;

  if (els.webcam.srcObject) {
    els.webcam.srcObject.getTracks().forEach(t => t.stop());
    els.webcam.srcObject = null;
  }

  els.webcamContainer.classList.remove('active');
  els.gestureIndicator.classList.remove('active');
  els.gestureStatus.textContent = 'Gestos: desactivados';
  els.btnGestures.classList.remove('active');
}

async function predictGestures() {
  if (!state.gesturesActive || !state.handLandmarker) return;

  const now = performance.now();

  try {
    const results = state.handLandmarker.detectForVideo(els.webcam, now);
    const ctx = els.gestureCanvas.getContext('2d');
    ctx.clearRect(0, 0, els.gestureCanvas.width, els.gestureCanvas.height);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      drawHandLandmarks(ctx, landmarks);

      // Clasificar gesto
      const gesture = classifyGesture(landmarks);
      if (gesture && (now - state.lastGestureTime > state.gestureDelay)) {
        state.lastGestureTime = now;
        handleGesture(gesture);
      }
    }
  } catch (e) {
    // Silenciar errores de predicción
  }

  if (state.webcamRunning) {
    requestAnimationFrame(predictGestures);
  }
}

function drawHandLandmarks(ctx, landmarks) {
  const w = els.gestureCanvas.width;
  const h = els.gestureCanvas.height;

  // Conexiones de la mano
  const connections = [
    [0,1],[1,2],[2,3],[3,4],       // Pulgar
    [0,5],[5,6],[6,7],[7,8],       // Índice
    [0,9],[9,10],[10,11],[11,12],   // Medio
    [0,13],[13,14],[14,15],[15,16], // Anular
    [0,17],[17,18],[18,19],[19,20], // Meñique
    [5,9],[9,13],[13,17],           // Palma
  ];

  // Líneas
  ctx.strokeStyle = '#00e676';
  ctx.lineWidth = 2;
  connections.forEach(([s, e]) => {
    ctx.beginPath();
    ctx.moveTo(landmarks[s].x * w, landmarks[s].y * h);
    ctx.lineTo(landmarks[e].x * w, landmarks[e].y * h);
    ctx.stroke();
  });

  // Puntos
  landmarks.forEach((lm) => {
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#00e676';
    ctx.fill();
  });
}

// ─── Clasificación de gestos ────────────────────────────────────────
function classifyGesture(landmarks) {
  // Calcular si cada dedo está extendido
  const fingers = getFingerStates(landmarks);
  const [thumb, index, middle, ring, pinky] = fingers;

  // 👍 Pulgar arriba: solo pulgar extendido
  if (thumb && !index && !middle && !ring && !pinky) {
    showGestureLabel('👍 Reservar');
    return 'thumbs_up';
  }

  // ✋ Mano abierta: todos los dedos extendidos
  if (thumb && index && middle && ring && pinky) {
    showGestureLabel('✋ Cancelar');
    return 'open_hand';
  }

  // ✌️ Victoria / Dos dedos: índice y medio extendidos
  if (!thumb && index && middle && !ring && !pinky) {
    showGestureLabel('✌️ Siguiente');
    return 'victory';
  }

  // ☝️ Un dedo: solo índice extendido
  if (!thumb && index && !middle && !ring && !pinky) {
    showGestureLabel('☝️ Seleccionar');
    return 'pointing';
  }

  // 👌 OK: pulgar e índice juntos, otros extendidos
  if (isOKGesture(landmarks)) {
    showGestureLabel('👌 Confirmar');
    return 'ok';
  }

  // ✊ Puño: ningún dedo extendido
  if (!thumb && !index && !middle && !ring && !pinky) {
    showGestureLabel('✊ Volver');
    return 'fist';
  }

  hideGestureLabel();
  return null;
}

function getFingerStates(landmarks) {
  // Cada dedo: comparar la punta con la articulación
  // Pulgar: comparar en eje X (considerando orientación)
  const isRightHand = landmarks[17].x < landmarks[5].x;

  const thumbExtended = isRightHand
    ? landmarks[4].x < landmarks[3].x
    : landmarks[4].x > landmarks[3].x;

  // Otros dedos: comparar en eje Y (hacia arriba = menor Y)
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[10].y;
  const ringExtended = landmarks[16].y < landmarks[14].y;
  const pinkyExtended = landmarks[20].y < landmarks[18].y;

  return [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended];
}

function isOKGesture(landmarks) {
  // Distancia entre punta del pulgar (4) y punta del índice (8)
  const dist = Math.hypot(
    landmarks[4].x - landmarks[8].x,
    landmarks[4].y - landmarks[8].y,
    landmarks[4].z - landmarks[8].z
  );
  // Los dedos medio, anular y meñique deben estar extendidos
  const middleUp = landmarks[12].y < landmarks[10].y;
  const ringUp = landmarks[16].y < landmarks[14].y;
  const pinkyUp = landmarks[20].y < landmarks[18].y;

  return dist < 0.06 && middleUp && ringUp && pinkyUp;
}

function handleGesture(gesture) {
  console.log(`✋ Gesto detectado: ${gesture}`);

  switch (gesture) {
    case 'thumbs_up':
      showCommandFeedback('👍 Reservar plaza');
      actionReserve();
      break;
    case 'open_hand':
      showCommandFeedback('✋ Cancelar');
      actionCancel();
      break;
    case 'victory':
      showCommandFeedback('✌️ Siguiente parking');
      navigateParking(1);
      break;
    case 'ok':
      showCommandFeedback('👌 Confirmar');
      actionConfirm();
      break;
    case 'pointing':
      showCommandFeedback('☝️ Ver detalle');
      actionViewDetail();
      break;
    case 'fist':
      showCommandFeedback('✊ Volver');
      actionGoBack();
      break;
  }
}

function showGestureLabel(text) {
  els.gestureLabel.textContent = text;
  els.gestureLabel.classList.add('visible');
}

function hideGestureLabel() {
  els.gestureLabel.classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════════
// 4. ACCIONES DEL SISTEMA
// ═══════════════════════════════════════════════════════════════════

function navigateParking(direction) {
  if (state.parkings.length === 0) {
    speak('Primero busca parkings. Di buscar aparcamiento.');
    return;
  }

  state.currentParkingIndex += direction;
  if (state.currentParkingIndex < 0) state.currentParkingIndex = state.parkings.length - 1;
  if (state.currentParkingIndex >= state.parkings.length) state.currentParkingIndex = 0;

  renderParkingList();
  const p = state.parkings[state.currentParkingIndex];
  speak(`${p.name}. ${p.freeSpots} plazas libres. ${p.pricePerHour} euros por hora.`);
}

function actionReserve() {
  if (state.reservation) {
    speak('Ya tienes una reserva activa.');
    return;
  }

  if (state.parkings.length === 0) {
    speak('Primero busca parkings.');
    return;
  }

  const parking = state.parkings[state.currentParkingIndex];
  if (parking.freeSpots === 0) {
    speak(`${parking.name} no tiene plazas libres.`);
    return;
  }

  socket.emit('reserveSpot', { parkingId: parking.id });
  showCommandFeedback(`🎫 Reservando en ${parking.name}...`);
}

function actionConfirm() {
  if (!state.reservation) {
    speak('No tienes ninguna reserva para confirmar.');
    return;
  }
  socket.emit('confirmReservation', { parkingId: state.reservation.parkingId });
  showCommandFeedback('✅ Confirmando...');
}

function actionCancel() {
  if (!state.reservation) {
    // Si estamos en detalle, volver atrás
    if (els.viewParkingDetail.classList.contains('active')) {
      actionGoBack();
      return;
    }
    speak('No tienes ninguna reserva para cancelar.');
    return;
  }
  socket.emit('cancelReservation', { parkingId: state.reservation.parkingId });
  showCommandFeedback('❌ Cancelando...');
}

function actionUrgent() {
  socket.emit('urgentMode');
  showCommandFeedback('🚨 Modo urgente activado');
}

function actionViewDetail() {
  if (state.parkings.length === 0) {
    speak('Primero busca parkings.');
    return;
  }
  const parking = state.parkings[state.currentParkingIndex];
  socket.emit('requestParkingDetail', parking.id);
  showCommandFeedback(`📋 Viendo ${parking.name}...`);
}

function actionGoBack() {
  if (els.viewReservation.classList.contains('active') && state.reservation) {
    speak('Tienes una reserva activa. Di cancelar para cancelarla.');
    return;
  }
  showView('list');
  speak('Volviendo a la lista de parkings.');
}

// ═══════════════════════════════════════════════════════════════════
// 5. RENDERIZADO
// ═══════════════════════════════════════════════════════════════════

function showView(view) {
  els.viewParkingList.classList.remove('active');
  els.viewParkingDetail.classList.remove('active');
  els.viewReservation.classList.remove('active');

  switch (view) {
    case 'list':
      els.viewParkingList.classList.add('active');
      break;
    case 'detail':
      els.viewParkingDetail.classList.add('active');
      break;
    case 'reservation':
      els.viewReservation.classList.add('active');
      break;
  }
}

function renderParkingList() {
  if (state.parkings.length === 0) {
    els.parkingCards.innerHTML = `
      <div class="loading-placeholder">
        <p>Di <em style="color: var(--accent-green)">"buscar aparcamiento"</em> o pulsa 🔍</p>
      </div>
    `;
    return;
  }

  els.parkingCards.innerHTML = state.parkings.map((p, i) => {
    const selected = i === state.currentParkingIndex ? 'selected' : '';
    const availability = p.freeSpots === 0 ? 'no-availability' : p.freeSpots <= 3 ? 'low-availability' : '';

    return `
      <div class="parking-card ${selected} ${availability}" data-index="${i}">
        <div class="parking-card-index">${i + 1} / ${state.parkings.length}</div>
        <div class="parking-card-header">
          <span class="parking-name">${p.name}</span>
          <span class="parking-price">${p.pricePerHour.toFixed(2)} €/h</span>
        </div>
        <div class="parking-address">📍 ${p.address}</div>
        <div class="parking-stats">
          <div class="stat">
            <span class="stat-dot free"></span>
            <span class="stat-value">${p.freeSpots}</span>
            <span class="stat-label">libres</span>
          </div>
          <div class="stat">
            <span class="stat-dot reserved"></span>
            <span class="stat-value">${p.reservedSpots}</span>
            <span class="stat-label">reservadas</span>
          </div>
          <div class="stat">
            <span class="stat-dot occupied"></span>
            <span class="stat-value">${p.occupiedSpots}</span>
            <span class="stat-label">ocupadas</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Eventos click en tarjetas
  $$('.parking-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index);
      state.currentParkingIndex = idx;
      renderParkingList();
      actionViewDetail();
    });
  });
}

function renderParkingDetail(data) {
  const freePercent = Math.round((data.freeSpots / data.totalSpots) * 100);
  let badgeClass = 'available';
  let badgeText = 'Disponible';
  if (freePercent < 20) { badgeClass = 'limited'; badgeText = 'Limitado'; }
  if (freePercent === 0) { badgeClass = 'full'; badgeText = 'Completo'; }

  els.parkingDetailCard.innerHTML = `
    <div class="detail-header">
      <span class="detail-name">${data.name}</span>
      <span class="detail-badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="detail-info">
      <div class="detail-info-item">
        <div class="detail-info-label">Dirección</div>
        <div class="detail-info-value">📍 ${data.address}</div>
      </div>
      <div class="detail-info-item">
        <div class="detail-info-label">Precio</div>
        <div class="detail-info-value">${data.pricePerHour.toFixed(2)} €/h</div>
      </div>
      <div class="detail-info-item">
        <div class="detail-info-label">Plantas</div>
        <div class="detail-info-value">${data.floors}</div>
      </div>
      <div class="detail-info-item">
        <div class="detail-info-label">Plazas libres</div>
        <div class="detail-info-value" style="color: var(--accent-green)">${data.freeSpots} / ${data.totalSpots}</div>
      </div>
    </div>
  `;

  renderSpotsGrid(data.spots);
}

function renderSpotsGrid(spots) {
  els.spotsGrid.innerHTML = `
    <div class="spots-grid-title">
      <span>Mapa de plazas</span>
      <div class="spots-legend">
        <div class="legend-item"><span class="stat-dot free"></span> Libre</div>
        <div class="legend-item"><span class="stat-dot reserved"></span> Reservada</div>
        <div class="legend-item"><span class="stat-dot occupied"></span> Ocupada</div>
      </div>
    </div>
    <div class="spots-container">
      ${spots.map(s => `
        <div class="spot ${s.status}" data-spot-id="${s.id}" title="${s.label} — ${s.status}">
          ${s.label}
        </div>
      `).join('')}
    </div>
  `;

  // Click en plazas libres para reservar
  $$('.spot.free').forEach(spot => {
    spot.addEventListener('click', () => {
      const spotId = spot.dataset.spotId;
      const parking = state.parkings[state.currentParkingIndex];
      socket.emit('reserveSpot', { parkingId: parking.id, spotId });
    });
  });
}

function renderReservation(data) {
  els.reservationTitle.textContent = '🎫 Plaza reservada';
  els.reservationDetail.textContent = `${data.parkingName} — Plaza ${data.spot.label}`;
  els.reservationTimer.textContent = '03:00';
  els.reservationTimer.className = 'reservation-timer';
  els.btnConfirm.style.display = 'inline-block';
}

// ─── Timer de reserva ───────────────────────────────────────────────
function startReservationTimer() {
  stopReservationTimer();

  state.reservationEndTime = Date.now() + 3 * 60 * 1000; // 3 minutos

  state.reservationTimerInterval = setInterval(() => {
    const remaining = state.reservationEndTime - Date.now();

    if (remaining <= 0) {
      stopReservationTimer();
      els.reservationTimer.textContent = '00:00';
      speak('Tu reserva ha expirado.');
      state.reservation = null;
      showView('list');
      socket.emit('requestParkingList');
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    els.reservationTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Cambiar color según urgencia
    if (remaining < 30000) {
      els.reservationTimer.className = 'reservation-timer critical';
    } else if (remaining < 60000) {
      els.reservationTimer.className = 'reservation-timer warning';
    }
  }, 1000);
}

function stopReservationTimer() {
  if (state.reservationTimerInterval) {
    clearInterval(state.reservationTimerInterval);
    state.reservationTimerInterval = null;
  }
}

// ─── Feedback visual de comandos ────────────────────────────────────
function showCommandFeedback(text) {
  els.commandText.textContent = text;
  els.commandFeedback.classList.add('visible');
  setTimeout(() => els.commandFeedback.classList.remove('visible'), 2000);
}

// ═══════════════════════════════════════════════════════════════════
// 6. EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════

// Botones de la barra inferior
els.btnVoice.addEventListener('click', startVoiceRecognition);
els.btnGestures.addEventListener('click', startGestureDetection);
els.btnSearch.addEventListener('click', () => {
  socket.emit('requestParkingList');
  showCommandFeedback('🔍 Buscando parkings...');
});

// Botones de acción
els.btnUrgent.addEventListener('click', actionUrgent);
els.btnBack.addEventListener('click', actionGoBack);
els.btnConfirm.addEventListener('click', actionConfirm);
els.btnCancel.addEventListener('click', actionCancel);
els.btnToggleCam.addEventListener('click', () => {
  if (state.gesturesActive) {
    stopGestureDetection();
  } else {
    startGestureDetection();
  }
});

// ═══════════════════════════════════════════════════════════════════
// 7. INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════

// Pedir la lista de parkings al conectarse
socket.on('connect', () => {
  setTimeout(() => {
    socket.emit('requestParkingList');
  }, 500);
});

console.log('🚗 SmartPark Conductor inicializado');
