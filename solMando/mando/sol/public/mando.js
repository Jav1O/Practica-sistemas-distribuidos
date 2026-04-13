const socket = io();

window.addEventListener('load', () => {
  console.log("Página cargada, inicializando eventos de botones.");
  document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', (e) => {
      let color = getComputedStyle(button).backgroundColor;
      document.getElementById("pantalla").innerText = "Has pulsado: " + color;
      console.log(`Enviando: ${color}`);
      socket.emit('buttonPress', color);  
    });
  });

});