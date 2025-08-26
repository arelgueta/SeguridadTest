const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io para Render
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.static('public'));

// Almacenamiento de dispositivos y streams
const connectedDevices = new Map();
const activeStreams = new Map();

// Ruta principal - Página para los usuarios
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para el panel de administración
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check para Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    connectedDevices: connectedDevices.size,
    activeStreams: activeStreams.size
  });
});

// Configuración de Socket.io
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);
  
  // Enviar lista actual de dispositivos al admin
  if (socket.handshake.headers.referer && socket.handshake.headers.referer.includes('admin')) {
    socket.emit('devices-updated', Array.from(connectedDevices.values()));
  }
  
  // Cuando un cliente se conecta con su cámara
  socket.on('register-device', (deviceData) => {
    connectedDevices.set(socket.id, {
      id: socket.id,
      name: deviceData.name || 'Dispositivo Móvil',
      timestamp: new Date(),
      streamActive: true
    });
    
    io.emit('devices-updated', Array.from(connectedDevices.values()));
    console.log(`Dispositivo registrado: ${socket.id}`);
  });
  
  // Cuando un admin solicita ver un dispositivo
  socket.on('request-view', (deviceId) => {
    socket.to(deviceId).emit('start-streaming');
    console.log(`Solicitando transmisión del dispositivo: ${deviceId}`);
  });
  
  // Cuando un dispositivo envía un frame de video
  socket.on('video-frame', (data) => {
    // Almacenar el frame más reciente
    activeStreams.set(socket.id, {
      frame: data.frame,
      timestamp: new Date()
    });
    
    // Enviar a los administradores
    socket.broadcast.emit('video-frame', {
      deviceId: socket.id,
      frame: data.frame,
      timestamp: new Date().toISOString()
    });
  });
  
  // Cuando un admin solicita el estado de un stream
  socket.on('get-stream', (deviceId) => {
    const streamData = activeStreams.get(deviceId);
    if (streamData) {
      socket.emit('video-frame', {
        deviceId: deviceId,
        frame: streamData.frame,
        timestamp: streamData.timestamp.toISOString()
      });
    }
  });
  
  // Cuando un dispositivo se desconecta
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    connectedDevices.delete(socket.id);
    activeStreams.delete(socket.id);
    io.emit('devices-updated', Array.from(connectedDevices.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});
