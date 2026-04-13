import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = 3000;

// Servir archivos estáticos de la carpeta "public"
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  // Recibe los datos de orientación del móvil y los reenvía a los demás clientes
  socket.on('orientation', (data) => {
    socket.broadcast.emit('orientation', data);
  });

  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});