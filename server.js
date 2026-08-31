const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Almacén de salas de juego
const rooms = {};

// Sistema Anti-Sleep para Render (se hace ping a sí mismo cada 10 minutos)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        https.get(RENDER_URL, (res) => {
            console.log(`[Anti-Sleep] Ping enviado, estado: ${res.statusCode}`);
        }).on('err', (err) => {
            console.error('[Anti-Sleep] Error en ping:', err.message);
        });
    }, 600000); // 10 minutos
}

io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);

    // Crear sala con ID personalizado o aleatorio
    socket.on('create_room', (callback) => {
        const roomId = Math.random().toString(36.substring(2, 8).toUpperCase();
        rooms[roomId] = {
            host: socket.id,
            players: {},
            state: 'waiting', // waiting, playing
            storm: { x: 500, y: 500, radius: 1000 }
        };
        socket.join(roomId);
        socket.roomId = roomId;
        rooms[roomId].players[socket.id] = { id: socket.id, x: 100, y: 100, hp: 100, color: '#ff4757' };
        callback({ success: true, roomId });
    });

    // Unirse a sala existente por ID
    socket.on('join_room', ({ roomId }, callback) => {
        roomId = roomId.toUpperCase();
        if (rooms[roomId] && rooms[roomId].state === 'waiting') {
            socket.join(roomId);
            socket.roomId = roomId;
            rooms[roomId].players[socket.id] = { id: socket.id, x: 200, y: 200, hp: 100, color: '#2ed573' };
            callback({ success: true });
            
            // Notificar a la sala
            io.to(roomId).emit('update_players', rooms[roomId].players);
        } else {
            callback({ success: false, message: 'Sala no encontrada o partida iniciada.' });
        }
    });

    // Iniciar partida (solo host)
    socket.on('start_game', () => {
        const roomId = socket.roomId;
        if (rooms[roomId] && rooms[roomId].host === socket.id) {
            rooms[roomId].state = 'playing';
            io.to(roomId).emit('game_started');
        }
    });

    // Movimiento y Acciones en partida
    socket.on('player_move', (data) => {
        const roomId = socket.roomId;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].x = data.x;
            rooms[roomId].players[socket.id].y = data.y;
            socket.to(roomId).emit('player_moved', { id: socket.id, x: data.x, y: data.y });
        }
    });

    // Chat del juego estilo Fortnite
    socket.on('send_chat', (message) => {
        const roomId = socket.roomId;
        if (roomId) {
            io.to(roomId).emit('receive_chat', { sender: socket.id.substring(0, 4), message });
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            delete rooms[roomId].players[socket.id];
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId]; // Borrar sala si está vacía
            } else {
                io.to(roomId).emit('update_players', rooms[roomId].players);
            }
        }
        console.log(`Jugador desconectado: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
