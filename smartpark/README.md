# SmartPark — Sistema Ubicuo de Parking Inteligente

**Proyecto P2 — Sistemas Interactivos y Ubicuos**  
*Jose Palacios, Javier Olozaga, Alejandro Gómez*

## Descripción

SmartPark es un prototipo funcional de un sistema de parking inteligente que permite al conductor buscar, navegar y reservar plazas de aparcamiento **sin tocar dispositivos**, utilizando **comandos de voz** y **gestos con la mano** como mecanismos principales de interacción.

El sistema se distribuye en **dos dispositivos conectados en tiempo real**:

1. **Dispositivo del Conductor** (`conductor.html`) — Interfaz móvil/laptop con:
   - Reconocimiento de voz (Web Speech API)
   - Detección de gestos con la mano (MediaPipe HandLandmarker + Webcam)
   - Síntesis de voz (Text-to-Speech) para guía auditiva

2. **Panel del Parking** (`panel.html`) — Pantalla de control con:
   - Mapa de plazas en tiempo real
   - Estadísticas de ocupación
   - Registro de actividad

## Tecnologías

| Tecnología | Uso |
|-----------|-----|
| **Node.js + Express** | Servidor web |
| **Socket.IO** | Comunicación bidireccional en tiempo real |
| **Web Speech API** (SpeechRecognition) | Reconocimiento de voz |
| **Web Speech API** (SpeechSynthesis) | Respuestas por voz del sistema |
| **MediaPipe HandLandmarker** | Detección de gestos con la mano |
| **HTML/CSS/JS** | Interfaces web |

## Cómo ejecutar

### Requisitos previos
- **Node.js** (v18 o superior)
- **Navegador moderno** (Chrome recomendado para Web Speech API)

### Instalación

```bash
# Entrar en la carpeta del proyecto
cd smartpark

# Instalar dependencias
npm install
```

### Ejecución

```bash
# Iniciar el servidor
npm start
```

El servidor se iniciará en `http://localhost:3000`.

### Acceso

- **Conductor**: Abrir `http://localhost:3000/conductor.html` en un dispositivo (o pestaña)
- **Panel Parking**: Abrir `http://localhost:3000/panel.html` en otro dispositivo (o pestaña)

> **Nota**: Para acceder desde otro dispositivo en la misma red WiFi, usa la IP local del servidor (ej: `http://192.168.1.XX:3000/conductor.html`).

## Funcionalidades

### Comandos de voz (Conductor)
| Comando | Acción |
|---------|--------|
| "buscar aparcamiento" | Buscar parkings cercanos |
| "siguiente" / "anterior" | Navegar entre parkings |
| "reservar" | Reservar plaza en el parking seleccionado |
| "confirmar" | Confirmar la reserva |
| "cancelar" | Cancelar la reserva |
| "modo urgente" | Encontrar el parking con más plazas libres |
| "ver detalle" | Ver mapa de plazas del parking |
| "volver" | Volver a la lista de parkings |
| "ayuda" | Escuchar comandos disponibles |

### Gestos con la mano (Conductor)
| Gesto | Acción |
|-------|--------|
| 👍 Pulgar arriba | Reservar plaza |
| ✋ Mano abierta | Cancelar |
| ✌️ Dos dedos (victoria) | Siguiente parking |
| 👌 OK | Confirmar reserva |
| ☝️ Señalar (índice) | Ver detalle |
| ✊ Puño | Volver |

### Sistema
- Reservas temporales de 3 minutos (con cuenta atrás)
- Actualización en tiempo real del mapa de plazas
- Guía por voz (Text-to-Speech)
- Modo urgente para encontrar parking con más disponibilidad
- 3 parkings simulados con plazas distribuidas

## Arquitectura

```
┌─────────────────────┐     Socket.IO      ┌─────────────────────┐
│   Conductor          │◄──────────────────►│  Servidor Node.js   │
│   (Móvil/Laptop)     │                    │  (Express+Socket.IO)│
│                      │                    │                     │
│ - Web Speech API     │                    │ - Estado parkings   │
│ - MediaPipe Hands    │                    │ - Gestión reservas  │
│ - TTS                │                    │ - Timer expiración  │
└─────────────────────┘                    └──────────┬──────────┘
                                                       │
                                                Socket.IO
                                                       │
                                           ┌───────────▼──────────┐
                                           │  Panel del Parking   │
                                           │  (Pantalla grande)   │
                                           │                      │
                                           │ - Mapa de plazas     │
                                           │ - Stats tiempo real  │
                                           │ - Log de actividad   │
                                           └──────────────────────┘
```

## Estructura del proyecto

```
smartpark/
├── server.mjs              # Servidor Express + Socket.IO
├── package.json            # Dependencias
├── README.md               # Este archivo
└── public/
    ├── conductor.html      # Interfaz del conductor
    ├── conductor.css       # Estilos del conductor
    ├── conductor.js        # Lógica: voz + gestos + Socket.IO
    ├── panel.html          # Interfaz del panel de parking
    ├── panel.css           # Estilos del panel
    └── panel.js            # Lógica: mapa + Socket.IO
```
