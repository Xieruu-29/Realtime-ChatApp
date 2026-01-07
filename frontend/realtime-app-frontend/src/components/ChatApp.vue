<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { io } from 'socket.io-client'

const socket = ref(null)
const userName = ref('')
const messageInput = ref('')
const messages = ref([])
const users = ref([])
const isConnected = ref(false)
const loginPhase = ref(true)
const showConnectionModal = ref(false)
const showInitialConnectPrompt = ref(false)

const formatTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

const shouldShowTimeSeparator = (index) => {
  if (index === 0) return false // Don't show separator for first message
  
  const currentMsg = messages.value[index]
  const prevMsg = messages.value[index - 1]
  
  if (!currentMsg || !prevMsg) return false
  
  // Show separator if timestamps are different (different minute or hour)
  const currentTime = currentMsg.timestamp
  const prevTime = prevMsg.timestamp
  
  // Compare entire timestamp (already HH:MM format)
  const currentTimeKey = currentTime
  const prevTimeKey = prevTime
  
  return currentTimeKey !== prevTimeKey
}

const joinChat = () => {
  if (userName.value.trim()) {
    loginPhase.value = false
    showInitialConnectPrompt.value = true
  }
}

const sendMessage = () => {
  if (messageInput.value.trim()) {
    socket.value.emit('send_message', { message: messageInput.value })
    messageInput.value = ''
  }
}

const leaveChat = () => {
  socket.value.disconnect()
  loginPhase.value = true
  messages.value = []
  users.value = []
  userName.value = ''
  isConnected.value = false
}

const toggleConnectionModal = () => {
  showConnectionModal.value = false
}

const connectFromPrompt = () => {
  if (!socket.value.connected) {
    socket.value.connect()
  }
  // Emit after a small delay to ensure connection
  setTimeout(() => {
    socket.value.emit('user_join', userName.value)
    showInitialConnectPrompt.value = false
  }, 100)
}

const toggleConnection = () => {
  if (isConnected.value) {
    // Disconnect
    socket.value.disconnect()
    isConnected.value = false
    showConnectionModal.value = true
  } else {
    // Reconnect
    if (userName.value.trim()) {
      socket.value.connect()
      // Emit user_join after connection is established
      setTimeout(() => {
        socket.value.emit('user_join', userName.value)
        showConnectionModal.value = false
      }, 200)
    }
  }
}

const setupSocketListeners = () => {
  // Remove old listeners to prevent duplicates
  socket.value.removeAllListeners()

  socket.value.on('connect', () => {
    console.log('Connected to server')
    isConnected.value = true
  })

  socket.value.on('load_history', (history) => {
    // Extract currently online users from the message history
    const userJoins = {};
    const userLefts = new Set();
    
    history.forEach((msg) => {
      if (msg.message && msg.message.includes('joined')) {
        userJoins[msg.userName] = msg.userId;
        userLefts.delete(msg.userName);
      } else if (msg.message && msg.message.includes('left')) {
        userLefts.add(msg.userName);
        delete userJoins[msg.userName];
      }
    });
    
    // Rebuild users list from join/left history
    users.value = Object.entries(userJoins).map(([name, id]) => ({
      id,
      name
    }));
    
    messages.value = history.map((msg) => {
      if (msg.message && (msg.message.includes('joined') || msg.message.includes('left'))) {
        return {
          type: 'system',
          message: msg.message,
          timestamp: msg.timestamp
        }
      }
      return {
        type: 'message',
        userId: msg.userId,
        userName: msg.userName,
        message: msg.message,
        timestamp: msg.timestamp,
        isOwn: msg.userName === userName.value
      }
    })
  })

  socket.value.on('user_joined', (data) => {
    // Check if user already exists by socket ID or username
    const userExists = users.value.find(u => u.id === data.userId || u.name === data.userName)
    if (!userExists) {
      users.value.push({ id: data.userId, name: data.userName })
    }
    messages.value.push({
      type: 'system',
      message: data.message,
      timestamp: data.timestamp
    })
  })

  socket.value.on('user_reconnected', (data) => {
    // Remove old entry with same username if exists
    users.value = users.value.filter(u => u.name !== data.userName)
    // Add user with new socket ID
    users.value.push({ id: data.userId, name: data.userName })
  })

  socket.value.on('receive_message', (data) => {
    messages.value.push({
      type: 'message',
      userId: data.userId,
      userName: data.userName,
      message: data.message,
      timestamp: data.timestamp,
      isOwn: data.userName === userName.value
    })
  })

  socket.value.on('user_left', (data) => {
    users.value = users.value.filter(u => u.id !== data.userId)
    messages.value.push({
      type: 'system',
      message: data.message,
      timestamp: data.timestamp
    })
  })

  socket.value.on('disconnect', () => {
    console.log('Disconnected from server')
    isConnected.value = false
    // Don't clear users or messages - keep them visible for reference
  })

  socket.value.on('connect_error', (error) => {
    console.error('Connection error:', error)
  })
}

onMounted(() => {
  socket.value = io('http://localhost:3000', {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  })

  setupSocketListeners()
})

onUnmounted(() => {
  if (socket.value) {
    socket.value.disconnect()
  }
})
</script>

<template>
  <div class="chat-app">
    <!-- Login Screen -->
    <div v-if="loginPhase" class="login-screen">
      <div class="login-container">
        <h1>Shinkai</h1>
        <p class="subtitle">Where conversations come to life</p>
        
        <div class="login-form">
          <input
            v-model="userName"
            type="text"
            placeholder="Enter your username"
            class="username-input"
            @keyup.enter="joinChat"
          />
          <button @click="joinChat" class="join-btn">
            <span class="btn-text">Join Chat</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Chat Screen -->
    <div v-else class="chat-container">
      <!-- Header -->
      <header class="chat-header">
        <div class="header-content">
          <div class="header-left">
            <div class="app-logo">
              <h2>Shinkai</h2>
            </div>
          </div>
          <div class="header-controls">
            <div class="connection-status" :class="{ connected: isConnected }" @click="toggleConnection">
              <span class="status-dot"></span>
              <span class="status-text">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
            </div>
            <button @click="leaveChat" class="leave-btn">
              <span class="btn-text">Leave</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Initial Connect Prompt Modal -->
      <div v-if="showInitialConnectPrompt" class="connection-modal-overlay" @click.stop>
        <div class="connection-modal" @click.stop>
          <h3>Ready to Connect?</h3>
          <p>Join the conversation as <strong>{{ userName }}</strong></p>
          <div class="modal-actions">
            <button @click="connectFromPrompt" class="modal-connect-btn">
              <span>Join Chat</span>
            </button>
            <button @click="leaveChat" class="modal-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Connection Modal -->
      <div v-if="showConnectionModal" class="connection-modal-overlay" @click="toggleConnectionModal">
        <div class="connection-modal" @click.stop>
          <h3>Connection Lost</h3>
          <p>You've been disconnected from the chat</p>
          <div class="modal-actions">
            <button @click="toggleConnection" class="modal-connect-btn">Reconnect</button>
            <button @click="toggleConnectionModal" class="modal-cancel-btn">Dismiss</button>
          </div>
        </div>
      </div>

      <!-- Main Chat Area -->
      <div class="main-content">
        <!-- Users Sidebar (Left) -->
        <aside class="users-panel">
          <div class="users-header">
            <h3>Online Users</h3>
            <span class="user-count">{{ users.length }}</span>
          </div>
          <div class="users-list">
            <div v-for="user in users" :key="user.id" class="user-item">
              <div class="user-avatar">
                <span class="avatar-text">{{ user.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="user-info">
                <span class="user-name">{{ user.name }}</span>
                <span class="user-status online"></span>
              </div>
            </div>
          </div>
        </aside>

        <!-- Messages Area -->
        <div class="messages-wrapper">
          <!-- Messages -->
          <div class="messages-area">
            <div
              v-for="(msg, idx) in messages"
              :key="idx"
              class="message-item"
              :class="{ 'system-msg': msg.type === 'system', 'own-msg': msg.isOwn }"
            >
              <!-- Time separator line -->
              <div v-if="shouldShowTimeSeparator(idx)" class="time-separator">
                <span class="time-separator-text">{{ msg.timestamp }}</span>
              </div>

              <div v-if="msg.type === 'system'" class="system-message">
                <div class="system-content">
                  {{ msg.message }}
                  <span class="system-time">{{ msg.timestamp }}</span>
                </div>
              </div>
              <div v-else class="chat-message">
                <div class="message-avatar">
                  <span class="avatar-text">{{ msg.userName.charAt(0).toUpperCase() }}</span>
                </div>
                <div class="message-content-wrapper">
                  <div class="message-header">
                    <span class="message-user">{{ msg.userName }}</span>
                    <span class="message-time">{{ msg.timestamp }}</span>
                  </div>
                  <div class="message-content">{{ msg.message }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Message Input -->
          <footer class="chat-footer">
            <div class="input-container">
              <input
                v-model="messageInput"
                type="text"
                placeholder="Type your message..."
                class="message-input"
                @keyup.enter="sendMessage"
              />
              <button @click="sendMessage" class="send-btn">
                <span class="send-text">Send</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.chat-app {
  width: 100%;
  height: 100vh;
  background: #0f0f1a;
  font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Login Screen */
.login-screen {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  background-size: 400% 400%;
  animation: gradientShift 8s ease infinite;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.login-container {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  padding: 60px 50px;
  border-radius: 24px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
  text-align: center;
  max-width: 480px;
  width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.login-container h1 {
  font-size: 48px;
  font-weight: 800;
  color: #1a1a2e;
  margin-bottom: 12px;
  letter-spacing: -1.5px;
  background: linear-gradient(135deg, #667eea, #764ba2, #f093fb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: #666;
  margin-bottom: 48px;
  font-size: 16px;
  line-height: 1.6;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.username-input {
  padding: 18px 20px;
  border: 2px solid #e8e8e8;
  border-radius: 16px;
  font-size: 16px;
  font-family: inherit;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: #f8f9fa;
  font-weight: 500;
}

.username-input:hover {
  border-color: #667eea;
  background: white;
  transform: translateY(-2px);
}

.username-input:focus {
  outline: none;
  border-color: #667eea;
  background: white;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.username-input::placeholder {
  color: #aaa;
  font-weight: 500;
}

.join-btn {
  padding: 18px 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  letter-spacing: 0.5px;
}

.join-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 35px rgba(102, 126, 234, 0.4);
}

.join-btn:active {
  transform: translateY(-1px);
}

/* Chat Container */
.chat-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f0f1a;
}

.chat-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: white;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header h2 {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #fff, #e2e8f0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.connection-status:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff6b6b;
  animation: pulse 2s infinite;
}

.connection-status.connected .status-dot {
  background: #51cf66;
  animation: none;
}

.status-text {
  font-weight: 600;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.leave-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #ff6b6b, #ff5252);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0.3px;
}

.leave-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 107, 107, 0.4);
}

.leave-btn:active {
  transform: translateY(0);
}

.connection-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 15, 26, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
  backdrop-filter: blur(10px);
}

.connection-modal {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border-radius: 24px;
  padding: 48px 40px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  max-width: 420px;
  width: 90%;
  text-align: center;
  animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.connection-modal h3 {
  font-size: 28px;
  font-weight: 800;
  color: white;
  margin: 0 0 12px 0;
  letter-spacing: -0.5px;
}

.connection-modal p {
  color: #a0a0b0;
  font-size: 16px;
  margin: 0 0 32px 0;
  line-height: 1.6;
  font-weight: 500;
}

.connection-modal strong {
  color: #667eea;
  font-weight: 700;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-connect-btn {
  width: 100%;
  padding: 16px 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s ease;
  letter-spacing: 0.3px;
}

.modal-connect-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(102, 126, 234, 0.4);
}

.modal-cancel-btn {
  width: 100%;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.1);
  color: #a0a0b0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s ease;
}

.modal-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  transform: translateY(-1px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.messages-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 24px;
  background: #0f0f1a;
  gap: 16px;
}

.message-item {
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
}

.message-item.own-msg {
  align-items: flex-end;
}

.message-item.own-msg .time-separator {
  justify-content: flex-end;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.system-message {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}

.system-content {
  background: rgba(255, 255, 255, 0.05);
  color: #a0a0b0;
  padding: 12px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.system-time {
  font-size: 11px;
  color: #666;
  font-weight: 500;
}

.time-separator {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  opacity: 0.7;
}

.time-separator::before,
.time-separator::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #667eea, transparent);
}

.time-separator-text {
  font-size: 12px;
  color: #667eea;
  font-weight: 700;
  padding: 0 12px;
  white-space: nowrap;
  letter-spacing: 0.3px;
  background: #0f0f1a;
}

/* FIXED: Message box alignment */
.chat-message {
  display: flex;
  gap: 12px;
  max-width: 100%;
  padding: 4px 0;
  align-items: flex-start;
}

.message-item.own-msg .chat-message {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: 700;
  color: white;
  font-size: 13px;
  margin-top: 2px;
}

.avatar-text {
  font-weight: 700;
}

.message-content-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 70%;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  gap: 12px;
}

.message-user {
  font-weight: 700;
  font-size: 13px;
  color: #a0a0b0;
  letter-spacing: 0.2px;
}

.message-time {
  font-size: 11px;
  color: #666;
  font-weight: 600;
  flex-shrink: 0;
}

.message-content {
  background: #1a1a2e;
  color: #e2e8f0;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.4;
  word-wrap: break-word;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  /* Remove fixed width and let it expand naturally */
  width: fit-content;
  max-width: 100%;
  min-width: auto;
}

/* Other user's messages align to the left with natural width */
.message-item:not(.own-msg) .message-content {
  align-self: flex-start;
}

/* Your own messages align to the right with natural width */
.message-item.own-msg .message-content {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  align-self: flex-end;
}

/* For your own messages, align the entire wrapper to the right */
.message-item.own-msg .message-content-wrapper {
  align-items: flex-end;
}

.message-item.own-msg .message-header {
  flex-direction: row-reverse;
}

.message-item.own-msg .message-user {
  color: rgba(255, 255, 255, 0.8);
}

.message-item.own-msg .message-time {
  color: rgba(255, 255, 255, 0.6);
}

.users-panel {
  width: 280px;
  background: #1a1a2e;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.users-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
}

.users-header h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: #e2e8f0;
  letter-spacing: 0.3px;
}

.user-count {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 12px;
  min-width: 32px;
  text-align: center;
}

.users-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  transition: all 0.3s ease;
  cursor: default;
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
}

.user-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: 700;
  color: white;
  font-size: 13px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.user-name {
  font-weight: 600;
  color: #e2e8f0;
}

.user-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #51cf66;
  flex-shrink: 0;
}

.chat-footer {
  padding: 20px 24px;
  background: #1a1a2e;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.input-container {
  display: flex;
  gap: 12px;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.input-container:focus-within {
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.message-input {
  flex: 1;
  padding: 14px 20px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-family: inherit;
  transition: all 0.3s ease;
  background: transparent;
  color: #e2e8f0;
  font-weight: 500;
}

.message-input:hover {
  background: transparent;
}

.message-input:focus {
  outline: none;
  background: transparent;
}

.message-input::placeholder {
  color: #666;
  font-weight: 500;
}

.send-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
}

.send-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.send-btn:active {
  transform: translateY(0);
}

.send-text {
  font-weight: 600;
}

/* Scrollbar styling */
.messages-area::-webkit-scrollbar,
.users-list::-webkit-scrollbar {
  width: 6px;
}

.messages-area::-webkit-scrollbar-track,
.users-list::-webkit-scrollbar-track {
  background: transparent;
}

.messages-area::-webkit-scrollbar-thumb,
.users-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.messages-area::-webkit-scrollbar-thumb:hover,
.users-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

@media (max-width: 768px) {
  .users-panel {
    width: 240px;
  }

  .message-content-wrapper {
    max-width: 80%;
  }

  .chat-header {
    padding: 14px 20px;
  }

  .header-content {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .header-controls {
    gap: 12px;
  }

  .messages-area {
    padding: 20px;
  }

  .message-input {
    font-size: 16px;
  }
}

@media (max-width: 600px) {
  .users-panel {
    display: none;
  }

  .login-container {
    padding: 40px 24px;
  }

  .login-container h1 {
    font-size: 36px;
  }

  .header-content {
    flex-direction: column;
    gap: 10px;
  }
  
  .message-content-wrapper {
    max-width: 90%;
  }
}
</style>