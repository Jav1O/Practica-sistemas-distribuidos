# SmartPark — Sistema Ubicuo de Parking Inteligente

Sistema de parking inteligente que permite a los conductores buscar, reservar y confirmar plazas de aparcamiento mediante **gestos con la mano**, **comandos de voz** y una interfaz visual distribuida en múltiples dispositivos.

## Arquitectura

- **Servidor**: Node.js + Express + Socket.IO (comunicación en tiempo real)
- **Conductor** (`conductor.html`): Interfaz móvil del conductor con interacciones por voz y gestos
- **Panel** (`panel.html`): Panel de control del parking para monitorización en pantalla grande

## Requisitos

- Node.js v18 o superior
- Navegador con soporte para WebRTC (cámara) y Web Speech API (Chrome recomendado)

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Iniciar el servidor
npm start

# O con recarga automática en desarrollo
npm run dev
```

Una vez iniciado, acceder a:
- **Conductor**: http://localhost:3000/conductor.html
- **Panel del parking**: http://localhost:3000/panel.html

## Interacciones Implementadas

### Comandos de Voz
| Comando | Acción |
|---------|--------|
| *"buscar aparcamiento"* | Busca parkings cercanos |
| *"siguiente"* / *"anterior"* | Navega entre parkings |
| *"reservar"* | Reserva plaza en el parking seleccionado |
| *"confirmar"* / *"sí"* | Confirma la reserva activa |
| *"cancelar"* / *"salir"* | Cancela la reserva o vuelve atrás |
| *"urgente"* / *"prisa"* | Activa modo urgente (parking con más plazas) |
| *"ver detalle"* / *"entrar"* | Muestra detalle del parking seleccionado |
| *"volver"* / *"atrás"* | Vuelve a la vista anterior |
| *"ayuda"* | Lista los comandos disponibles |

### Gestos con la Mano (MediaPipe)
| Gesto | Acción |
|-------|--------|
| 👍 Pulgar arriba | Reservar plaza |
| ✌️ Victoria (dos dedos) | Siguiente parking |
| ☝️ Índice extendido | Ver detalle |
| 👌 OK (pulgar e índice juntos) | Confirmar reserva |
| ✋ Mano abierta | Cancelar |
| ✊ Puño cerrado | Volver atrás |

### Sistema de Estabilidad de Gestos
Para evitar falsos positivos, el sistema implementa:
- **Buffer de estabilidad**: Se requieren 7 frames consecutivos con el mismo gesto antes de activarlo
- **Barra de confianza visual**: Muestra el progreso de detección del gesto en tiempo real
- **Cooldown con liberación**: Tras ejecutar un gesto, se requiere quitar la mano o cambiar de gesto antes de poder ejecutar otro
- **Umbrales de detección**: Margen de seguridad en la clasificación de dedos extendidos para evitar detecciones incorrectas durante el movimiento

## Tecnologías

- **Node.js** + **Express** — Servidor HTTP
- **Socket.IO** — Comunicación en tiempo real bidireccional
- **MediaPipe HandLandmarker** — Detección de gestos con la mano
- **Web Speech API** — Reconocimiento de voz (SpeechRecognition) y síntesis (SpeechSynthesis)
- **CSS Custom Properties** — Sistema de diseño con tema HUD oscuro

## Autores

Jose Palacios, Javier Olozaga, Alejandro Gómez
