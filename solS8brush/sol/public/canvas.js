const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // Ajustar el canvas al tamaño de la ventana
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const socket = io();
    // Posición inicial (se inicializa con el centro, pero se actualizará con el primer evento)
    let lastX = canvas.width / 2, lastY = canvas.height / 2;
    let pointerInitialized = false;

    // Recibir los datos de orientación del móvil y dibujar líneas
    socket.on('orientation', (data) => {
      // Suponemos rangos aproximados de -45 a 45 para pitch (inclinación adelante/atrás)
      // y para roll (inclinación lateral)
      const rollMin = -45, rollMax = 45;
      const pitchMin = -45, pitchMax = 45;

      // Mapeo lineal de roll y pitch a coordenadas en el canvas
      const newX = ((data.roll - rollMin) / (rollMax - rollMin)) * canvas.width;
      const newY = ((data.pitch - pitchMin) / (pitchMax - pitchMin)) * canvas.height;

      if (!pointerInitialized) {
        // Si es el primer evento, inicializamos la posición sin dibujar
        lastX = newX;
        lastY = newY;
        pointerInitialized = true;
      } else {
        // Dibujar una línea desde la posición anterior hasta la nueva
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(newX, newY);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();
        lastX = newX;
        lastY = newY;
      }
    });