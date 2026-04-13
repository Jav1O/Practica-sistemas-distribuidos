const socket = io();

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (event) => {
    // event.beta corresponde al pitch (inclinación adelante/atrás)
    // event.gamma corresponde al roll (balanceo lateral)
    const pitch = event.beta;
    const roll = event.gamma;
    socket.emit('orientation', { pitch, roll });
  });
} else {
  alert("La API de orientación no es soportada en este dispositivo.");
}