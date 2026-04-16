import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = 3000;

// Datos de los parkings en memoria
const parkingData = [
  {
    id: 0,
    name: 'Parking Centro',
    address: 'Calle Mayor, 12',
    floors: 2,
    pricePerHour: 2.50,
    spots: generateSpots(30, 0),
  },
  {
    id: 1,
    name: 'Parking Estación',
    address: 'Av. de la Estación, 5',
    floors: 3,
    pricePerHour: 1.80,
    spots: generateSpots(40, 1),
  },
  {
    id: 2,
    name: 'Parking Plaza Mayor',
    address: 'Plaza Mayor, s/n',
    floors: 1,
    pricePerHour: 3.00,
    spots: generateSpots(20, 2),
  },
];

// Genera las plazas de un parking con estado aleatorio
function generateSpots(count, parkingId) {
  const rows = ['A', 'B', 'C', 'D', 'E'];
  const spots = [];
  for (let i = 0; i < count; i++) {
    const row = rows[Math.floor(i / Math.ceil(count / rows.length))];
    const num = (i % Math.ceil(count / rows.length)) + 1;
    // aprox 60% ocupadas para simular uso real
    const isOccupied = Math.random() < 0.6;
    spots.push({
      id: `${parkingId}-${i}`,
      label: `${row}${num}`,
      status: isOccupied ? 'occupied' : 'free', // free | occupied | reserved | confirmed
      reservedBy: null,
      reservedAt: null,
    });
  }
  return spots;
}

// Devuelve resumen de un parking sin las plazas individuales
function getParkingSummary(parking) {
  const free = parking.spots.filter(s => s.status === 'free').length;
  const reserved = parking.spots.filter(s => s.status === 'reserved' || s.status === 'confirmed').length;
  const occupied = parking.spots.filter(s => s.status === 'occupied').length;
  return {
    id: parking.id,
    name: parking.name,
    address: parking.address,
    floors: parking.floors,
    pricePerHour: parking.pricePerHour,
    totalSpots: parking.spots.length,
    freeSpots: free,
    reservedSpots: reserved,
    occupiedSpots: occupied,
  };
}

// Cada 10s, liberar reservas que lleven mas de 3 min sin confirmar
setInterval(() => {
  const now = Date.now();
  parkingData.forEach(parking => {
    parking.spots.forEach(spot => {
      if (spot.status === 'reserved' && spot.reservedAt && (now - spot.reservedAt > 3 * 60 * 1000)) {
        console.log(`⏰ Reserva expirada: ${spot.label} en ${parking.name}`);
        spot.status = 'free';
        spot.reservedBy = null;
        spot.reservedAt = null;
        io.emit('parkingUpdate', {
          parkingId: parking.id,
          parking: getParkingSummary(parking),
          spots: parking.spots,
          message: `La reserva de la plaza ${spot.label} ha expirado`,
        });
      }
    });
  });
}, 10000);

// Archivos estaticos
app.use(express.static('public'));

// Conexiones Socket.IO
io.on('connection', (socket) => {
  console.log(`✅ Usuario conectado: ${socket.id}`);

  // Lista de parkings
  socket.on('requestParkingList', () => {
    const list = parkingData.map(p => getParkingSummary(p));
    socket.emit('parkingList', list);
    console.log(`📋 Lista de parkings enviada a ${socket.id}`);
  });

  // Detalle de un parking concreto
  socket.on('requestParkingDetail', (parkingId) => {
    const parking = parkingData.find(p => p.id === parkingId);
    if (parking) {
      socket.emit('parkingDetail', {
        ...getParkingSummary(parking),
        spots: parking.spots,
      });
      console.log(`🅿️ Detalle de ${parking.name} enviado a ${socket.id}`);
    }
  });

  // Reservar plaza
  socket.on('reserveSpot', ({ parkingId, spotId }) => {
    const parking = parkingData.find(p => p.id === parkingId);
    if (!parking) {
      socket.emit('error', { message: 'Parking no encontrado' });
      return;
    }

    // Si no viene spotId, coger la primera libre
    let spot;
    if (spotId) {
      spot = parking.spots.find(s => s.id === spotId);
    } else {
      spot = parking.spots.find(s => s.status === 'free');
    }

    if (!spot || spot.status !== 'free') {
      socket.emit('error', { message: 'Plaza no disponible' });
      return;
    }

    spot.status = 'reserved';
    spot.reservedBy = socket.id;
    spot.reservedAt = Date.now();

    console.log(`🎫 Plaza ${spot.label} reservada en ${parking.name} por ${socket.id}`);

    // Responder al conductor
    socket.emit('reservationConfirmed', {
      parkingId: parking.id,
      parkingName: parking.name,
      spot: spot,
      message: `Plaza ${spot.label} reservada por 3 minutos`,
    });

    // Avisar a todos los clientes
    io.emit('parkingUpdate', {
      parkingId: parking.id,
      parking: getParkingSummary(parking),
      spots: parking.spots,
      message: `Plaza ${spot.label} reservada en ${parking.name}`,
    });
  });

  // Confirmar una reserva
  socket.on('confirmReservation', ({ parkingId }) => {
    const parking = parkingData.find(p => p.id === parkingId);
    if (!parking) return;

    const spot = parking.spots.find(s => s.reservedBy === socket.id && s.status === 'reserved');
    if (!spot) {
      socket.emit('error', { message: 'No tienes reserva activa en este parking' });
      return;
    }

    spot.status = 'confirmed';
    console.log(`✅ Reserva confirmada: ${spot.label} en ${parking.name}`);

    socket.emit('confirmationSuccess', {
      parkingId: parking.id,
      parkingName: parking.name,
      spot: spot,
      message: `Plaza ${spot.label} confirmada. ¡Dirígete al parking!`,
    });

    io.emit('parkingUpdate', {
      parkingId: parking.id,
      parking: getParkingSummary(parking),
      spots: parking.spots,
      message: `Plaza ${spot.label} confirmada en ${parking.name}`,
    });
  });

  // Cancelar reserva activa
  socket.on('cancelReservation', ({ parkingId }) => {
    const parking = parkingData.find(p => p.id === parkingId);
    if (!parking) return;

    const spot = parking.spots.find(
      s => s.reservedBy === socket.id && (s.status === 'reserved' || s.status === 'confirmed')
    );
    if (!spot) {
      socket.emit('error', { message: 'No tienes reserva activa' });
      return;
    }

    console.log(`❌ Reserva cancelada: ${spot.label} en ${parking.name}`);
    spot.status = 'free';
    spot.reservedBy = null;
    spot.reservedAt = null;

    socket.emit('cancellationSuccess', {
      parkingId: parking.id,
      message: `Reserva de plaza ${spot.label} cancelada`,
    });

    io.emit('parkingUpdate', {
      parkingId: parking.id,
      parking: getParkingSummary(parking),
      spots: parking.spots,
      message: `Plaza ${spot.label} liberada en ${parking.name}`,
    });
  });

  // Modo urgente: buscar el parking con mas plazas
  socket.on('urgentMode', () => {
    const summaries = parkingData.map(p => getParkingSummary(p));
    const best = summaries.reduce((a, b) => (a.freeSpots > b.freeSpots ? a : b));
    socket.emit('urgentResult', {
      parking: best,
      message: `Modo urgente: ${best.name} tiene ${best.freeSpots} plazas libres`,
    });
    console.log(`🚨 Modo urgente para ${socket.id}: ${best.name}`);
  });

  socket.on('disconnect', () => {
    // Si se desconecta, liberar sus reservas
    parkingData.forEach(parking => {
      parking.spots.forEach(spot => {
        if (spot.reservedBy === socket.id && spot.status === 'reserved') {
          spot.status = 'free';
          spot.reservedBy = null;
          spot.reservedAt = null;
          io.emit('parkingUpdate', {
            parkingId: parking.id,
            parking: getParkingSummary(parking),
            spots: parking.spots,
          });
        }
      });
    });
    console.log(`❌ Usuario desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚗 SmartPark servidor iniciado`);
  console.log(`   → http://localhost:${PORT}/conductor.html  (Dispositivo del conductor)`);
  console.log(`   → http://localhost:${PORT}/panel.html      (Panel del parking)\n`);
});
