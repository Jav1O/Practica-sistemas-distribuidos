SmartPark — prototipo de parking ubicuo

SmartPark es un prototipo de sistema de parking inteligente que permite buscar, reservar y confirmar plazas mediante comandos de voz y gestos con la mano, con una interfaz distribuida en dos pantallas sincronizadas en tiempo real.

Componentes
Servidor (Node.js + Express + Socket.IO): gestiona el estado de los parkings y sincroniza a los clientes.
Conductor (/conductor.html): interfaz tipo HUD con voz/gestos y feedback por voz.
Panel (/panel.html): dashboard para pantalla grande con mapa de plazas, estadísticas y log de eventos.
Requisitos
Node.js 18+
Google Chrome recomendado (Web Speech API + cámara/WebRTC)
Instalación y ejecución
npm install
npm start
# opcional en desarrollo
npm run dev

Abrir:

Conductor: http://localhost:3000/conductor.html
Panel: http://localhost:3000/panel.html

Recomendación: abrir Panel en un PC/monitor grande y Conductor en otro dispositivo (móvil o portátil).
Acepta permisos de micrófono y cámara cuando el navegador lo pida.

Interacciones principales
Voz (SpeechRecognition)
“buscar aparcamiento”
“siguiente” / “anterior”
“ver detalle”
“reservar”
“confirmar” / “sí”
“cancelar” / “salir”
“urgente” / “prisa”
“volver” / “atrás”
“ayuda”
Gestos (MediaPipe HandLandmarker)
👍 reservar
✌️ siguiente
☝️ ver detalle
👌 confirmar
✋ cancelar
✊ volver
Estabilidad de gestos (anti falsos positivos)

Para evitar ejecuciones accidentales, el sistema usa:

confirmación por estabilidad (varios frames consecutivos con el mismo gesto),
barra visual de progreso,
cooldown tras ejecutar un gesto,
márgenes/umbrales para reducir errores en transiciones.
Tecnologías

Node.js, Express, Socket.IO, MediaPipe HandLandmarker, Web Speech API (SpeechRecognition/SpeechSynthesis), HTML/CSS/JS.

Autores

Jose Palacios, Javier Olozaga, Alejandro Gómez