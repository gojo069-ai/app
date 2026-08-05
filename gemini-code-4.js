/**
 * NeonChat - Real-Time Chat Engine
 */

const AppState = {
    currentUser: null,
    socket: null,
    peer: null,
    myPeerId: null,
    activePeerCall: null,
    currentChat: null,
    onlineUsers: [],
    rooms: [{ id: 'global', name: 'Global Lounge', members: 'All', privacy: 'public' }],
    messages: {},
    stickers: {
        default: ['😀', '😂', '🥰', '😎', '🤔', '🥳', '😭', '👍', '❤️', '🔥', '✨', '🎉', '💯', '🚀'],
        custom: []
    },
    settings: { theme: 'neon', wallpaper: 'default', soundEnabled: true }
};

const DOM = {
    loginScreen: document.getElementById('login-screen'),
    mainScreen: document.getElementById('main-screen'),
    usernameInput: document.getElementById('username-input'),
    loginBtn: document.getElementById('login-btn'),
    currentUsername: document.getElementById('current-username'),
    userAvatar: document.getElementById('user-avatar'),
    myPeerId: document.getElementById('my-peer-id'),
    friendsContainer: document.getElementById('friends-container'),
    roomsContainer: document.getElementById('rooms-container'),
    chatMessages: document.getElementById('chat-messages'),
    chatAvatar: document.getElementById('chat-avatar'),
    chatName: document.getElementById('chat-name'),
    chatStatus: document.getElementById('chat-status'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    stickerBtn: document.getElementById('sticker-btn'),
    stickerModal: document.getElementById('sticker-modal'),
    stickerGrid: document.getElementById('sticker-grid'),
    uploadFileBtn: document.getElementById('upload-file-btn'),
    fileInput: document.getElementById('file-input'),
    voiceCallBtn: document.getElementById('voice-call-btn'),
    videoCallBtn: document.getElementById('video-call-btn'),
    voiceModal: document.getElementById('voice-modal'),
    callName: document.getElementById('call-name'),
    callStatus: document.getElementById('call-status'),
    endCallBtn: document.getElementById('end-call-btn'),
    remoteAudio: document.getElementById('remote-audio'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    themeSelect: document.getElementById('theme-select'),
    wallpaperSelect: document.getElementById('wallpaper-select'),
    chatAreaBg: document.getElementById('chat-area-bg'),
    closeBtns: document.querySelectorAll('.close-btn')
};

function init() {
    setupEventListeners();
    renderDefaultStickers();
}

function setupEventListeners() {
    DOM.loginBtn.addEventListener('click', handleLogin);
    DOM.sendBtn.addEventListener('click', sendMessage);
    DOM.messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    
    // File/Image Attachments
    DOM.uploadFileBtn.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput.addEventListener('change', handleFileUpload);

    // Call and Modals
    DOM.stickerBtn.addEventListener('click', () => openModal(DOM.stickerModal));
    DOM.voiceCallBtn.addEventListener('click', startVoiceCall);
    DOM.endCallBtn.addEventListener('click', endCall);
    DOM.settingsBtn.addEventListener('click', () => openModal(DOM.settingsModal));
    
    DOM.themeSelect.addEventListener('change', (e) => {
        document.body.setAttribute('data-theme', e.target.value);
    });
    DOM.wallpaperSelect.addEventListener('change', (e) => {
        DOM.chatAreaBg.setAttribute('data-wallpaper', e.target.value);
    });

    DOM.closeBtns.forEach(btn => btn.addEventListener('click', closeAllModals));
}

// LOGIN & NETWORKING SETUP
function handleLogin() {
    const username = DOM.usernameInput.value.trim();
    if (!username) return;

    AppState.currentUser = { name: username, avatar: '👨‍💻' };
    DOM.currentUsername.textContent = username;

    // Connect Socket.io
    AppState.socket = io();

    // Connect PeerJS for Audio/Screen Streaming
    AppState.peer = new Peer();

    AppState.peer.on('open', (id) => {
        AppState.myPeerId = id;
        DOM.myPeerId.textContent = `Peer ID: ${id.slice(0, 6)}...`;

        // Register user to backend socket
        AppState.socket.emit('register_user', {
            username: username,
            avatar: AppState.currentUser.avatar,
            peerId: id
        });
    });

    setupSocketListeners();
    setupPeerCallListeners();

    DOM.loginScreen.classList.remove('active');
    DOM.mainScreen.classList.add('active');
}

function setupSocketListeners() {
    // Receive updated user list
    AppState.socket.on('update_user_list', (users) => {
        AppState.onlineUsers = users.filter(u => u.id !== AppState.socket.id);
        renderFriends();
    });

    // Receive Direct Messages
    AppState.socket.on('receive_direct_message', ({ senderSocketId, senderName, message }) => {
        if (!AppState.messages[senderSocketId]) AppState.messages[senderSocketId] = [];
        AppState.messages[senderSocketId].push(message);

        if (AppState.currentChat && AppState.currentChat.id === senderSocketId) {
            renderMessages(senderSocketId);
        }
    });

    // Receive Reactions
    AppState.socket.on('receive_reaction', ({ messageId, emoji }) => {
        const msgEl = document.querySelector(`[data-msg-id="${messageId}"] .message-reactions`);
        if (msgEl) msgEl.innerHTML += `<span>${emoji}</span>`;
    });
}

// RENDER ONLINE FRIENDS
function renderFriends() {
    DOM.friendsContainer.innerHTML = AppState.onlineUsers.map(user => `
        <div class="friend-item" onclick="selectFriend('${user.id}')">
            <div class="friend-avatar">${user.avatar}<span class="status-indicator"></span></div>
            <div class="friend-info">
                <div class="friend-name">${user.username}</div>
                <div class="friend-status">Online</div>
            </div>
        </div>
    `).join('');
}

function selectFriend(socketId) {
    const friend = AppState.onlineUsers.find(u => u.id === socketId);
    if (!friend) return;

    AppState.currentChat = { id: socketId, name: friend.username, peerId: friend.peerId };
    DOM.chatName.textContent = friend.username;
    DOM.chatStatus.textContent = 'Online';
    DOM.messageInput.disabled = false;
    DOM.sendBtn.disabled = false;

    renderMessages(socketId);
}

// SENDING MESSAGES & FILES
function sendMessage() {
    const content = DOM.messageInput.value.trim();
    if (!content || !AppState.currentChat) return;

    const msg = {
        id: Date.now(),
        sender: 'You',
        type: 'text',
        content,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sent: true
    };

    saveAndSendMsg(msg);
    DOM.messageInput.value = '';
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || !AppState.currentChat) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const msg = {
            id: Date.now(),
            sender: 'You',
            type: 'image',
            content: event.target.result,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sent: true
        };
        saveAndSendMsg(msg);
    };
    reader.readAsDataURL(file);
}

function saveAndSendMsg(msg) {
    const chatId = AppState.currentChat.id;
    if (!AppState.messages[chatId]) AppState.messages[chatId] = [];
    AppState.messages[chatId].push(msg);

    // Broadcast over Socket
    AppState.socket.emit('send_direct_message', {
        toSocketId: chatId,
        message: { ...msg, sent: false, sender: AppState.currentUser.name }
    });

    renderMessages(chatId);
}

// RENDER MESSAGES & REACTIONS
function renderMessages(chatId) {
    const msgs = AppState.messages[chatId] || [];
    DOM.chatMessages.innerHTML = msgs.map(msg => `
        <div class="message ${msg.sent ? 'sent' : ''}" data-msg-id="${msg.id}">
            <div class="message-content">
                <div class="message-bubble">
                    <div class="reaction-bar">
                        <span class="reaction-btn" onclick="addReaction(${msg.id}, '❤️')">❤️</span>
                        <span class="reaction-btn" onclick="addReaction(${msg.id}, '🔥')">🔥</span>
                        <span class="reaction-btn" onclick="addReaction(${msg.id}, '👍')">👍</span>
                    </div>
                    ${msg.type === 'image' ? `<div class="message-image"><img src="${msg.content}"/></div>` : msg.content}
                </div>
                <div class="message-reactions"></div>
                <span class="message-time">${msg.time}</span>
            </div>
        </div>
    `).join('');
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

function addReaction(msgId, emoji) {
    if (!AppState.currentChat) return;
    const msgEl = document.querySelector(`[data-msg-id="${msgId}"] .message-reactions`);
    if (msgEl) msgEl.innerHTML += `<span>${emoji}</span>`;

    AppState.socket.emit('send_reaction', {
        targetSocketId: AppState.currentChat.id,
        messageId: msgId,
        emoji
    });
}

// WebRTC REAL-TIME VOICE CALLS
function startVoiceCall() {
    if (!AppState.currentChat || !AppState.currentChat.peerId) return alert('Select an online user to call');

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        openModal(DOM.voiceModal);
        DOM.callName.textContent = AppState.currentChat.name;
        DOM.callStatus.textContent = 'Calling...';

        const call = AppState.peer.call(AppState.currentChat.peerId, stream);
        AppState.activePeerCall = call;

        call.on('stream', (remoteStream) => {
            DOM.remoteAudio.srcObject = remoteStream;
            DOM.callStatus.textContent = 'Connected';
        });
    });
}

function setupPeerCallListeners() {
    AppState.peer.on('call', (call) => {
        if (confirm('Incoming voice call. Accept?')) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                openModal(DOM.voiceModal);
                call.answer(stream);
                AppState.activePeerCall = call;

                call.on('stream', (remoteStream) => {
                    DOM.remoteAudio.srcObject = remoteStream;
                    DOM.callStatus.textContent = 'Connected';
                });
            });
        }
    });
}

function endCall() {
    if (AppState.activePeerCall) AppState.activePeerCall.close();
    closeAllModals();
}

// UTILS & STICKERS
function renderDefaultStickers() {
    DOM.stickerGrid.innerHTML = AppState.stickers.default.map(s => 
        `<div class="sticker-item" onclick="sendSticker('${s}')">${s}</div>`
    ).join('');
}

function sendSticker(sticker) {
    if (!AppState.currentChat) return;
    const msg = {
        id: Date.now(),
        sender: 'You',
        type: 'text',
        content: sticker,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sent: true
    };
    saveAndSendMsg(msg);
    closeAllModals();
}

function openModal(m) { closeAllModals(); m.classList.add('active'); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }

document.addEventListener('DOMContentLoaded', init);