const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, '/')));

const users = {}; // socket.id -> { username, avatar, peerId }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Register User
    socket.on('register_user', ({ username, avatar, peerId }) => {
        users[socket.id] = { username, avatar, peerId, id: socket.id };
        io.emit('update_user_list', Object.values(users));
    });

    // Send Direct Message
    socket.on('send_direct_message', ({ toSocketId, message }) => {
        socket.to(toSocketId).emit('receive_direct_message', {
            senderSocketId: socket.id,
            senderName: users[socket.id]?.username || 'User',
            message
        });
    });

    // Room Support
    socket.on('join_room', (roomName) => {
        socket.join(roomName);
    });

    socket.on('send_room_message', ({ roomName, message }) => {
        socket.to(roomName).emit('receive_room_message', {
            roomName,
            senderName: users[socket.id]?.username || 'User',
            message
        });
    });

    // Add Reaction
    socket.on('send_reaction', ({ targetSocketId, messageId, emoji }) => {
        socket.to(targetSocketId).emit('receive_reaction', { messageId, emoji });
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('update_user_list', Object.values(users));
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NeonChat Server running on port ${PORT}`));