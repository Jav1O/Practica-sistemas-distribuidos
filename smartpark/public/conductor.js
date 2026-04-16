// Conductor: voz, gestos y comunicacion con el servidor

import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

// Conexion al servidor
const socket = io();

// Estado general de la app
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

  // Gestos — sistema de estabilidad robusto
  handLandmarker: null,
  webcamRunning: false,
  lastGestureTime: 0,
  gestureDelay: 1200,           // ms mínimo entre gestos

  // Buffer de estabilidad: exige N frames consecutivos con el MISMO gesto
  gestureBuffer: [],
  gestureBufferSize: 4,         // frames consecutivos necesarios para confirmar

  // Cooldown con liberación: tras disparar, exige M frames de "sin gesto" para rearmar
  gestureCooldownActive: false,
  nullFrameCount: 0,
  requiredNullFrames: 6,        // frames sin gesto para poder detectar otro

  // Bloqueo anti‑doble disparo
  processingAction: false,

  // Webcam listener registrado
  webcamListenerAttached: false,
};

// Elementos del DOM
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
  gestureConfidence: $('#gestureConfidence'),
  micIcon: $('#micIcon'),
};

// Eventos de conexion Socket.IO

socket.on('connect', () => {
  els.connectionStatus.classList.add('connected');
  els.connectionStatus.querySelector('span:last-child').textContent = 'Conectado';
  console.log('✅ Conectado al servidor');
  // Pedir lista al conectar
  setTimeout(() => {
    socket.emit('requestParkingList');
  }, 500);
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
  unlockProcessing();
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
  unlockProcessing();
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
  unlockProcessing();
});

// Cancelación exitosa
socket.on('cancellationSuccess', (data) => {
  state.reservation = null;
  stopReservationTimer();
  showView('list');
  speak(data.message);
  socket.emit('requestParkingList');
  unlockProcessing();
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
  unlockProcessing();
});

// Errores
socket.on('error', (data) => {
  speak(data.message);
  showCommandFeedback(`⚠️ ${data.message}`);
  unlockProcessing();
});

// Reconocimiento de voz

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
  // buscar aparcamiento
  if (command.includes('buscar') && (command.includes('aparcamiento') || command.includes('parking') || command.includes('aparcar'))) {
    socket.emit('requestParkingList');
    showCommandFeedback('🔍 Buscando parkings...');
    return;
  }

  // siguiente parking
  if (command.includes('siguiente')) {
    navigateParking(1);
    return;
  }

  // anterior
  if (command.includes('anterior')) {
    navigateParking(-1);
    return;
  }

  // reservar
  if (command.includes('reservar') || command.includes('reserva')) {
    actionReserve();
    return;
  }

  // confirmar
  if (command.includes('confirmar') || command.includes('confirma') || command.includes('sí') || command.includes('afirmativo')) {
    actionConfirm();
    return;
  }

  // cancelar
  if (command.includes('cancelar') || command.includes('cancela') || command.includes('salir') || command.includes('no')) {
    actionCancel();
    return;
  }

  // modo urgente
  if (command.includes('urgente') || command.includes('urgencia') || command.includes('prisa')) {
    actionUrgent();
    return;
  }

  // ver detalle
  if (command.includes('ver') || command.includes('detalle') || command.includes('entrar')) {
    actionViewDetail();
    return;
  }

  // volver
  if (command.includes('volver') || command.includes('atrás')) {
    actionGoBack();
    return;
  }

  // ayuda
  if (command.includes('ayuda') || command.includes('comandos')) {
    speak('Puedes decir: buscar aparcamiento, siguiente, anterior, reservar, confirmar, cancelar, modo urgente, ver detalle, o volver.');
    return;
  }

  // No reconocido
  speak('No he entendido. Di ayuda para ver los comandos disponibles.');
}

// Sintesis de voz
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

// Deteccion de gestos con MediaPipe

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

    // Resetear sistema de estabilidad
    state.gestureBuffer = [];
    state.gestureCooldownActive = false;
    state.nullFrameCount = 0;
    state.processingAction = false;

    els.webcamContainer.classList.add('active');
    els.gestureIndicator.classList.add('active');
    els.gestureStatus.textContent = 'Gestos: activos';
    els.btnGestures.classList.add('active');

    // Registrar listener solo una vez
    if (!state.webcamListenerAttached) {
      state.webcamListenerAttached = true;
      els.webcam.addEventListener('loadeddata', () => {
        els.gestureCanvas.width = els.webcam.videoWidth;
        els.gestureCanvas.height = els.webcam.videoHeight;
        if (state.gesturesActive) {
          predictGestures();
        }
      });
    } else {
      // Si ya se registró, esperar a que cargue y arrancar
      if (els.webcam.readyState >= 2) {
        els.gestureCanvas.width = els.webcam.videoWidth;
        els.gestureCanvas.height = els.webcam.videoHeight;
        predictGestures();
      }
    }

  } catch (error) {
    console.error('Error accediendo a la cámara:', error);
    speak('No se pudo acceder a la cámara.');
  }
}

function stopGestureDetection() {
  state.gesturesActive = false;
  state.webcamRunning = false;

  // Resetear sistema de estabilidad
  state.gestureBuffer = [];
  state.gestureCooldownActive = false;
  state.nullFrameCount = 0;

  if (els.webcam.srcObject) {
    els.webcam.srcObject.getTracks().forEach(t => t.stop());
    els.webcam.srcObject = null;
  }

  els.webcamContainer.classList.remove('active');
  els.gestureIndicator.classList.remove('active');
  els.gestureStatus.textContent = 'Gestos: desactivados';
  els.btnGestures.classList.remove('active');
  hideGestureLabel();
  updateConfidenceBar(0);
}

// Bucle de prediccion de gestos
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

      // Clasificar gesto (sin efectos, solo clasificación)
      const gesture = classifyGestureRaw(landmarks);

      if (gesture) {
        // Añadir al buffer de estabilidad
        state.gestureBuffer.push(gesture);
        if (state.gestureBuffer.length > state.gestureBufferSize) {
          state.gestureBuffer.shift();
        }
        state.nullFrameCount = 0;

        // Mostrar label según confianza
        const confidence = getBufferConfidence();
        showGestureLabel(getGestureLabel(gesture), confidence);
        updateConfidenceBar(confidence);

      } else {
        // Gesto nulo: incrementar contador y limpiar buffer
        state.nullFrameCount++;
        state.gestureBuffer = [];
        hideGestureLabel();
        updateConfidenceBar(0);

        // Liberar cooldown después de suficientes frames sin gesto
        if (state.gestureCooldownActive && state.nullFrameCount >= state.requiredNullFrames) {
          state.gestureCooldownActive = false;
        }
      }

      // comprobar si se puede disparar
      if (
        !state.gestureCooldownActive &&
        !state.processingAction &&
        state.gestureBuffer.length >= state.gestureBufferSize &&
        isBufferUniform() &&
        (now - state.lastGestureTime > state.gestureDelay)
      ) {
        const confirmedGesture = state.gestureBuffer[0];

        // Disparar acción
        state.lastGestureTime = now;
        state.gestureCooldownActive = true;
        state.gestureBuffer = [];
        state.processingAction = true;

        handleGesture(confirmedGesture);
      }

    } else {
      // No se detectó mano → resetear
      state.gestureBuffer = [];
      state.nullFrameCount++;
      hideGestureLabel();
      updateConfidenceBar(0);

      if (state.gestureCooldownActive && state.nullFrameCount >= state.requiredNullFrames) {
        state.gestureCooldownActive = false;
      }
    }
  } catch (e) {
    // Silenciar errores de predicción
  }

  if (state.webcamRunning) {
    requestAnimationFrame(predictGestures);
  }
}

// Comprueba que todo el buffer tenga el mismo gesto
function isBufferUniform() {
  if (state.gestureBuffer.length === 0) return false;
  const first = state.gestureBuffer[0];
  return state.gestureBuffer.every(g => g === first);
}

// Nivel de confianza segun el buffer (0 a 1)
function getBufferConfidence() {
  if (state.gestureBuffer.length === 0) return 0;
  const first = state.gestureBuffer[state.gestureBuffer.length - 1];
  const matching = state.gestureBuffer.filter(g => g === first).length;
  return matching / state.gestureBufferSize;
}

// Libera el bloqueo para aceptar nuevos gestos
function unlockProcessing() {
  // Dar un pequeño delay para que la UI se actualice antes de aceptar nuevos gestos
  setTimeout(() => {
    state.processingAction = false;
  }, 500);
}

// Dibuja los puntos y lineas de la mano en el canvas
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

  // Color según estado
  const color = state.gestureCooldownActive ? '#ff9800' : '#00e676';

  // Líneas
  ctx.strokeStyle = color;
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
    ctx.fillStyle = color;
    ctx.fill();
  });
}

// Clasificacion de gestos con umbrales

/**
 * Clasificación pura del gesto (sin side-effects).
 * Usa umbrales más estrictos para evitar falsos positivos.
 */
function classifyGestureRaw(landmarks) {
  const fingers = getFingerStates(landmarks);
  const [thumb, index, middle, ring, pinky] = fingers;

  // 👌 OK: pulgar e índice juntos, otros extendidos
  // Comprobar PRIMERO para evitar confusión con otros gestos
  if (isOKGesture(landmarks)) {
    return 'ok';
  }

  // diferenciar puño, pulgar arriba y pulgar abajo
  // segun la posicion vertical del pulgar
  if (!index && !middle && !ring && !pinky) {
    const thumbTipAbovePalm = landmarks[4].y < landmarks[5].y - 0.04;
    const thumbTipBelowWrist = landmarks[4].y > landmarks[0].y + 0.04;
    if (thumbTipAbovePalm) {
      return 'thumbs_up';
    } else if (thumbTipBelowWrist) {
      return 'thumbs_down';
    } else {
      return 'fist';
    }
  }

  // ☝️ Un dedo: solo índice extendido
  if (!thumb && index && !middle && !ring && !pinky) {
    return 'pointing';
  }

  // ✌️ Victoria / Dos dedos: índice y medio extendidos
  if (!thumb && index && middle && !ring && !pinky) {
    return 'victory';
  }

  // ✋ Mano abierta: todos los dedos extendidos
  if (thumb && index && middle && ring && pinky) {
    return 'open_hand';
  }

  return null;
}

/**
 * Detección de dedos extendidos con UMBRAL de margen.
 * El margen evita detecciones falsas cuando los dedos están cerca del límite.
 */
function getFingerStates(landmarks) {
  const THRESHOLD = 0.012; // Margen de seguridad normalizado

  // Determinar orientación de la mano
  const isRightHand = landmarks[17].x < landmarks[5].x;

  // Pulgar: comparar en eje X (con margen)
  const thumbExtended = isRightHand
    ? landmarks[4].x < landmarks[3].x - THRESHOLD
    : landmarks[4].x > landmarks[3].x + THRESHOLD;

  // Otros dedos: comparar en eje Y (hacia arriba = menor Y, con margen)
  const indexExtended  = landmarks[8].y  < landmarks[6].y  - THRESHOLD;
  const middleExtended = landmarks[12].y < landmarks[10].y - THRESHOLD;
  const ringExtended   = landmarks[16].y < landmarks[14].y - THRESHOLD;
  const pinkyExtended  = landmarks[20].y < landmarks[18].y - THRESHOLD;

  return [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended];
}

/**
 * Detección del gesto OK con umbral estricto.
 */
function isOKGesture(landmarks) {
  // Distancia entre punta del pulgar (4) y punta del índice (8)
  const dist = Math.hypot(
    landmarks[4].x - landmarks[8].x,
    landmarks[4].y - landmarks[8].y,
    landmarks[4].z - landmarks[8].z
  );

  // Umbral para distancia pulgar-índice
  if (dist >= 0.06) return false;

  const THRESHOLD = 0.012;
  // Los dedos medio, anular y meñique deben estar claramente extendidos
  const middleUp = landmarks[12].y < landmarks[10].y - THRESHOLD;
  const ringUp   = landmarks[16].y < landmarks[14].y - THRESHOLD;
  const pinkyUp  = landmarks[20].y < landmarks[18].y - THRESHOLD;

  return middleUp && ringUp && pinkyUp;
}

// Texto que se muestra en pantalla para cada gesto
function getGestureLabel(gesture) {
  switch (gesture) {
    case 'thumbs_up': return '👍 Reservar';
    case 'thumbs_down': return '👎 Cancelar';
    case 'open_hand': return '✋ Cancelar';
    case 'victory':   return '✌️ Siguiente';
    case 'pointing':  return '☝️ Seleccionar';
    case 'ok':        return '👌 Confirmar';
    case 'fist':      return '✊ Volver';
    default: return '';
  }
}

// Ejecuta la accion correspondiente al gesto detectado
function handleGesture(gesture) {
  console.log(`✋ Gesto confirmado: ${gesture}`);

  switch (gesture) {
    case 'thumbs_up':
      showCommandFeedback('👍 Reservar plaza');
      actionReserve();
      break;
    case 'thumbs_down':
      showCommandFeedback('👎 Cancelar');
      actionCancel();
      break;
    case 'open_hand':
      showCommandFeedback('✋ Cancelar');
      actionCancel();
      break;
    case 'victory':
      showCommandFeedback('✌️ Siguiente parking');
      navigateParking(1);
      unlockProcessing();
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
      unlockProcessing();
      break;
  }
}

// Funciones para mostrar/ocultar el label del gesto
function showGestureLabel(text, confidence) {
  if (state.gestureCooldownActive) {
    els.gestureLabel.textContent = '⏳ Espera...';
    els.gestureLabel.classList.add('visible', 'cooldown');
    return;
  }
  els.gestureLabel.textContent = confidence >= 1 ? `✅ ${text}` : text;
  els.gestureLabel.classList.remove('cooldown');
  els.gestureLabel.classList.add('visible');
}

function hideGestureLabel() {
  els.gestureLabel.classList.remove('visible', 'cooldown');
}

function updateConfidenceBar(value) {
  if (els.gestureConfidence) {
    const pct = Math.min(value * 100, 100);
    els.gestureConfidence.style.width = pct + '%';

    if (value >= 1) {
      els.gestureConfidence.className = 'confidence-fill ready';
    } else if (state.gestureCooldownActive) {
      els.gestureConfidence.className = 'confidence-fill cooldown';
    } else {
      els.gestureConfidence.className = 'confidence-fill';
    }
  }
}

// Acciones principales

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
    unlockProcessing();
    return;
  }

  if (state.parkings.length === 0) {
    speak('Primero busca parkings.');
    unlockProcessing();
    return;
  }

  const parking = state.parkings[state.currentParkingIndex];
  if (parking.freeSpots === 0) {
    speak(`${parking.name} no tiene plazas libres.`);
    unlockProcessing();
    return;
  }

  socket.emit('reserveSpot', { parkingId: parking.id });
  showCommandFeedback(`🎫 Reservando en ${parking.name}...`);
}

function actionConfirm() {
  if (!state.reservation) {
    speak('No tienes ninguna reserva para confirmar.');
    unlockProcessing();
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
    unlockProcessing();
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
    unlockProcessing();
    return;
  }
  const parking = state.parkings[state.currentParkingIndex];
  socket.emit('requestParkingDetail', parking.id);
  showCommandFeedback(`📋 Viendo ${parking.name}...`);
}

function actionGoBack() {
  if (els.viewReservation.classList.contains('active') && state.reservation) {
    speak('Tienes una reserva activa. Di cancelar para cancelarla.');
    unlockProcessing();
    return;
  }
  showView('list');
  speak('Volviendo a la lista de parkings.');
  unlockProcessing();
}

// Renderizado de vistas

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

// Temporizador de la reserva (3 min)
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

// Muestra feedback flotante en pantalla
let feedbackTimeout = null;
function showCommandFeedback(text) {
  els.commandText.textContent = text;
  els.commandFeedback.classList.add('visible');
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => els.commandFeedback.classList.remove('visible'), 2500);
}

// Listeners de los botones

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

// Inicio

console.log('🚗 SmartPark Conductor inicializado');
