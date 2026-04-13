const socket = io();
window.addEventListener('load', () => {
  // Recibir los datos y cambiar color de fondo
  socket.on('buttonPress', (data) => {
    console.log(`Datos de botón recibidos:`, data);
    //Pone el color de fondo del canvas al color recibido
    document.body.style.backgroundColor = data;
  });
});