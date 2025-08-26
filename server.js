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
  transports: ['websocket', 'polling'] // Añadir esto para Render
});

// Middleware
app.use(cors());
app.use(express.static('public'));

// Almacenamiento simple de dispositivos conectados
const connectedDevices = new Map();

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
    connectedDevices: connectedDevices.size
  });
});

// Configuración de Socket.io
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);
  
  // Enviar lista actual de dispositivos al nuevo cliente
  if (socket.handshake.headers.referer && socket.handshake.headers.referer.includes('admin')) {
    // Es el panel de admin
    socket.emit('devices-updated', Array.from(connectedDevices.values()));
  }
  
  // Cuando un cliente se conecta con su cámara
  socket.on('register-device', (deviceData) => {
    const deviceName = deviceData.name || 
                      (navigator.userAgentData ? navigator.userData.brands[0].brand : 'Dispositivo Móvil') || 
                      'Dispositivo Móvil';
    
    connectedDevices.set(socket.id, {
      id: socket.id,
      name: deviceName,
      timestamp: new Date(),
      streamActive: true,
      userAgent: deviceData.userAgent || 'Navegador desconocido'
    });
    
    // Notificar a todos los administradores
    io.emit('devices-updated', Array.from(connectedDevices.values()));
    console.log(`Dispositivo registrado: ${socket.id}. Total: ${connectedDevices.size}`);
  });
  
  // Cuando un administrador solicita ver un dispositivo
  socket.on('request-view', (deviceId) => {
    socket.to(deviceId).emit('start-streaming');
    console.log(`Solicitando transmisión del dispositivo: ${deviceId}`);
  });
  
  // Cuando un dispositivo envía su stream (simulación)
  socket.on('stream-data', (data) => {
    // Reenviar a los administradores
    socket.broadcast.emit('stream-frame', {
      deviceId: socket.id,
      data: data,
      timestamp: new Date().toISOString()
    });
  });
  
  // Cuando un administrador solicita la lista de dispositivos
  socket.on('get-devices', () => {
    socket.emit('devices-updated', Array.from(connectedDevices.values()));
  });
  
  // Cuando un dispositivo se desconecta
  socket.on('disconnect', (reason) => {
    console.log('Usuario desconectado:', socket.id, 'Razón:', reason);
    connectedDevices.delete(socket.id);
    io.emit('devices-updated', Array.from(connectedDevices.values()));
    console.log(`Dispositivo eliminado: ${socket.id}. Total: ${connectedDevices.size}`);
  });
});

// Obtener puerto de Render o usar 3000 localmente
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
  console.log(`URL principal: http://localhost:${PORT}`);
  console.log(`Panel de admin: http://localhost:${PORT}/admin`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
