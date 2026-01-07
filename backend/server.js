const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const users = new Map();
const messageHistory = [];
const MAX_HISTORY = 100;

app.get('/', (req, res) => {
  res.send('Real-Time Chat Server is running');
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  socket.emit('load_history', messageHistory);

  socket.on('user_join', (userName) => {
    const userAlreadyExists = Array.from(users.values()).includes(userName);
    
    users.set(socket.id, userName);
    console.log(`${userName} joined the chat`);
    
    if (!userAlreadyExists) {
      const joinEvent = {
        userId: socket.id,
        userName: userName,
        message: `${userName} joined the chat`,
        timestamp: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit'
        })
      };
      
      messageHistory.push(joinEvent);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }
      
      io.emit('user_joined', joinEvent);
    } else {
      io.emit('user_reconnected', {
        userId: socket.id,
        userName: userName
      });
    }
  });

  socket.on('send_message', (data) => {
    const userName = users.get(socket.id);
    if (userName) {
      const messageEvent = {
        userId: socket.id,
        userName: userName,
        message: data.message,
        timestamp: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit'
        })
      };
      
      messageHistory.push(messageEvent);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }
      
      io.emit('receive_message', messageEvent);
      console.log(`Message from ${userName}: ${data.message}`);
    }
  });

  socket.on('get_users', () => {
    const usersList = Array.from(users.entries()).map(([id, name]) => ({
      id,
      name
    }));
    socket.emit('users_list', usersList);
  });

  socket.on('disconnect', () => {
    const userName = users.get(socket.id);
    users.delete(socket.id);
    
    if (userName) {
      console.log(`${userName} disconnected`);
      const leftEvent = {
        userId: socket.id,
        userName: userName,
        message: `${userName} left the chat`,
        timestamp: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit'
        }),
        totalUsers: users.size
      };
      
      messageHistory.push(leftEvent);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }
      
      io.emit('user_left', leftEvent);
    }
  });

  socket.on('connect_error', (error) => {
    console.error(`Connection error for ${socket.id}:`, error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket is ready for connections`);
});
