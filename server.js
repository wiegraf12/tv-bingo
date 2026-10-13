const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend files from a 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Game State Storage
// Structure: { [roomId]: { tvSocketId: string, calledNumbers: number[], players: { [socketId]: { name: string, card: number[][] } } } }
const rooms = {};

// Helper: Generate a valid 5x5 Bingo Card array
function generateBingoCard() {
    const card = [];
    const ranges = [
        { min: 1, max: 15 },   // B
        { min: 16, max: 30 },  // I
        { min: 31, max: 45 },  // N
        { min: 46, max: 60 },  // G
        { min: 61, max: 75 }   // O
    ];

    // Generate columns
    const columns = ranges.map(range => {
        const pool = [];
        for (let i = range.min; i <= range.max; i++) pool.push(i);
        // Shuffle pool
        const shuffled = pool.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 5); // Take 5 unique numbers
    });

    // Transpose columns to rows for a 5x5 grid layout
    for (let row = 0; row < 5; row++) {
        const rowData = [];
        for (let col = 0; col < 5; col++) {
            // Set the absolute middle index [2][2] as a FREE space (0)
            if (row === 2 && col === 2) {
                rowData.push(0); 
            } else {
                rowData.push(columns[col][row]);
            }
        }
        card.push(rowData);
    }
    return card;
}

// Socket.io Real-Time Orchestration
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. TV Host initializes a new game room
    socket.on('create-room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString(); // Simple 4-digit code
        rooms[roomId] = {
            tvSocketId: socket.id,
            calledNumbers: [],
            players: {}
        };
        socket.join(roomId);
        socket.emit('room-created', roomId);
        console.log(`Room ${roomId} created by TV: ${socket.id}`);
    });

    // 2. Mobile Player joins an active room
    socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error-message', 'Room not found. Check the code on the TV screen.');
            return;
        }

        socket.join(roomId);
        const playerCard = generateBingoCard();
        
        room.players[socket.id] = {
            name: playerName || `Player ${Object.keys(room.players).length + 1}`,
            card: playerCard
        };

        // Send the unique card back to the phone
        socket.emit('game-joined', { roomId, card: playerCard });

        // Notify the TV screen that a player joined
        io.to(room.tvSocketId).emit('player-updated', Object.values(room.players).map(p => p.name));
    });

    // 3. TV Host requests a new random number call
    socket.on('draw-number', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.tvSocketId !== socket.id) return;

        if (room.calledNumbers.length >= 75) {
            socket.emit('error-message', 'All numbers have been called!');
            return;
        }

        let nextNumber;
        do {
            nextNumber = Math.floor(1 + Math.random() * 75);
        } while (room.calledNumbers.includes(nextNumber));

        room.calledNumbers.push(nextNumber);

        // Broadcast the newly drawn number to both TV and all paired phones in the room
        io.to(roomId).emit('number-called', {
            current: nextNumber,
            history: room.calledNumbers
        });
    });

    // 4. Mobile Player clicks "BINGO!" button
    socket.on('claim-bingo', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player) return;

        // Broadcast to the whole room (including the TV) that someone claimed a win
        io.to(roomId).emit('bingo-claimed', {
            playerName: player.name,
            socketId: socket.id
        });
    });

// 5. TV Host requests to wipe states and start a clean match round
    socket.on('reset-game', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.tvSocketId !== socket.id) return;

        // Wipe tracked numeric data streams cleanly
        room.calledNumbers = [];

        // Generate brand new randomized board sets for every connected player card
        for (const playerId in room.players) {
            room.players[playerId].card = generateBingoCard();
            // Fire layout sync blocks directly out to mobile phone lines
            io.to(playerId).emit('game-joined', { roomId, card: room.players[playerId].card });
        }

        // Inform the TV dashboard map structure to wipe color layouts cleanly
        io.to(roomId).emit('game-was-reset');
    });

    // Handle Disconnections
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Clean up rooms if TV disconnects, or remove player from player tracking lists
        for (const roomId in rooms) {
            if (rooms[roomId].tvSocketId === socket.id) {
                io.to(roomId).emit('error-message', 'The host TV disconnected. Game over.');
                delete rooms[roomId];
                console.log(`Room ${roomId} closed because TV disconnected.`);
            } else if (rooms[roomId].players[socket.id]) {
                const name = rooms[roomId].players[socket.id].name;
                delete rooms[roomId].players[socket.id];
                io.to(rooms[roomId].tvSocketId).emit('player-updated', Object.values(rooms[roomId].players).map(p => p.name));
                console.log(`${name} left Room ${roomId}`);
            }
        }
    });
});

// Start listening
server.listen(PORT, () => {
    console.log(`Bingo Server running on http://localhost:${PORT}`);
});
