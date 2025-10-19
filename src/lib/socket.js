// file: frontend/src/lib/socket-fixed.js
import { writable } from 'svelte/store';
import { io } from 'socket.io-client';
import { browser } from '$app/environment';
import { analytics } from './analytics.js';

let socket = null;
let peerConnection = null;
let dataChannel = null;
let isInitiator = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let messageIdCounter = 0;
let connectionMetrics = {
  startTime: null,
  webrtcConnectionTime: null,
  messagesSent: 0,
  messagesReceived: 0
};

function generateUniqueId() {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

export const connected = writable(false);
export const matchFound = writable(false);
export const partnerInfo = writable(null);
export const messages = writable([]);
export const connectionError = writable(null);
export const webrtcConnected = writable(false);
export const connectionQuality = writable('unknown');
//export const photoRequestReceived = writable(false);

let performanceMonitor = {
  messageLatencies: [],
  connectionAttempts: 0,
  failedConnections: 0
};

const messageCache = new Set();
const MAX_CACHE_SIZE = 1000;

export function initializeSocket() {
  if (!browser || socket?.connected) return socket;

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  
  socket = io(apiUrl, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: maxReconnectAttempts,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    maxReconnectionAttempts: maxReconnectAttempts,
    forceNew: false
  });

  connectionMetrics.startTime = Date.now();
  performanceMonitor.connectionAttempts++;

  socket.on('connect', () => {
    console.log('Connected to server');
    connected.set(true);
    connectionError.set(null);
    reconnectAttempts = 0;
    
    const connectionTime = Date.now() - connectionMetrics.startTime;
    analytics.connectionMade(connectionTime, false);
    startConnectionQualityMonitoring();
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    connected.set(false);
    matchFound.set(false);
    partnerInfo.set(null);
    cleanupWebRTC();
    analytics.error('socket_disconnect', 'connection');
    if (reason === 'io server disconnect') {
      connectionError.set('Server disconnected. Please refresh the page.');
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    reconnectAttempts++;
    performanceMonitor.failedConnections++;
    analytics.error('connection_failed', 'socket');
    if (reconnectAttempts >= maxReconnectAttempts) {
      connectionError.set('Unable to connect to server. Please check your internet connection and try again.');
    } else {
      connectionError.set(`Connection failed. Retrying... (${reconnectAttempts}/${maxReconnectAttempts})`);
    }
    connected.set(false);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    connectionError.set(null);
    reconnectAttempts = 0;
    analytics.connectionMade(Date.now() - connectionMetrics.startTime, false);
  });

  socket.on('matched', async (data) => {
    console.log('Matched with partner:', data);
    matchFound.set(true);
    partnerInfo.set({
      id: data.partnerId,
      name: data.partnerName,
      roomId: data.roomId
    });
    analytics.connectionMade(Date.now() - connectionMetrics.startTime, false);
    isInitiator = socket.id < data.partnerId;
    try {
      if (isInitiator) {
        console.log('Initiating WebRTC connection...');
        await initializeWebRTC(true);
      } else {
        console.log('Waiting for WebRTC offer...');
        await initializeWebRTC(false);
      }
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      analytics.error('webrtc_init_failed', 'webrtc');
      fallbackToSocketMessages();
    }
  });

  socket.on('partner-disconnected', (data) => {
    console.log('Partner disconnected:', data.reason);
    matchFound.set(false);
    partnerInfo.set(null);
    cleanupWebRTC();
    const sessionDuration = Date.now() - connectionMetrics.startTime;
    analytics.sessionEnded(sessionDuration);
  });

  socket.on('queue-timeout', () => {
    console.log('Queue timeout');
    connectionError.set('No other users are online right now. Try again in a few minutes.');
    analytics.error('queue_timeout', 'matchmaking');
  });

  socket.on('offer', async (data) => {
    if (!data.offer) return;
    console.log('Received WebRTC offer');
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer: answer });
      } catch (error) {
        console.error('Error handling offer:', error);
        analytics.error('webrtc_offer_failed', 'webrtc');
        fallbackToSocketMessages();
      }
    }
  });

  socket.on('answer', async (data) => {
    if (!data.answer) return;
    console.log('Received WebRTC answer');
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(data.answer);
      } catch (error) {
        console.error('Error handling answer:', error);
        analytics.error('webrtc_answer_failed', 'webrtc');
        fallbackToSocketMessages();
      }
    }
  });

  socket.on('ice-candidate', async (data) => {
    if (!data.candidate) return;
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  });

  socket.on('message', (data) => {
      if (!data.type || data.type === 'received') {
          const messageId = `${data.from}-${data.timestamp}-${data.text.substring(0, 50)}`;
          if (messageCache.has(messageId)) return;
          messageCache.add(messageId);
          if (messageCache.size > MAX_CACHE_SIZE) {
              messageCache.clear();
          }
      }
    performanceMonitor.messagesReceived++;
    messages.update(msgs => [...msgs, {
      id: generateUniqueId(),
      type: 'received',
      text: data.text,
      from: data.from,
      timestamp: data.timestamp
    }]);
  });

  // Fixed photo request handler - listens for 'req-photo' event
  socket.on('req-photo', (data) => {
    console.log('Photo request received via socket:', data);
    /*photoRequestReceived.set(true);*/
    messages.update(msgs => [...msgs, {
      id: generateUniqueId(),
      type: 'photo-request',
      text: 'requested a photo',
      timestamp: new Date().toISOString()
    }]);
  });

  // Keep legacy handler for compatibility
  socket.on('photo-request', (data) => {
    console.log('Photo request received (legacy):', data);
    /*photoRequestReceived.set(true);*/
    messages.update(msgs => [...msgs, {
      id: generateUniqueId(),
      type: 'photo-request',
      text: 'requested a photo',
      timestamp: new Date().toISOString()
    }]);
  });

  socket.on('rate-limited', (data) => {
    analytics.error('rate_limited', 'messaging');
  });

  return socket;
}

async function initializeWebRTC(initiator) {
  try {
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate });
      }
    };
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      switch (state) {
        case 'connected':
          webrtcConnected.set(true);
          connectionMetrics.webrtcConnectionTime = Date.now() - connectionMetrics.startTime;
          updateConnectionQuality();
          analytics.webrtcConnected(connectionMetrics.webrtcConnectionTime);
          break;
        case 'disconnected':
        case 'failed':
          webrtcConnected.set(false);
          connectionQuality.set('poor');
          analytics.webrtcFallback(state);
          setTimeout(() => {
            if (peerConnection && peerConnection.connectionState === 'failed') {
              fallbackToSocketMessages();
            }
          }, 5000);
          break;
        case 'connecting':
          connectionQuality.set('unknown');
          break;
      }
    };
    if (initiator) {
      dataChannel = peerConnection.createDataChannel('chat', {
        ordered: true,
        maxRetransmits: 3
      });
      setupDataChannel(dataChannel);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { offer: offer });
    } else {
      peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
      };
    }
  } catch (error) {
    console.error('Error initializing WebRTC:', error);
    performanceMonitor.failedConnections++;
    analytics.error('webrtc_init_error', 'webrtc');
    fallbackToSocketMessages();
  }
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    webrtcConnected.set(true);
    updateConnectionQuality();
  };
  channel.onclose = () => {
    webrtcConnected.set(false);
    connectionQuality.set('unknown');
  };
  channel.onerror = (error) => {
    console.error('Data channel error:', error);
    analytics.error('data_channel_error', 'webrtc');
    fallbackToSocketMessages();
  };
  channel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.sentAt) {
        const latency = Date.now() - data.sentAt;
        performanceMonitor.messageLatencies.push(latency);
        if (performanceMonitor.messageLatencies.length > 100) {
          performanceMonitor.messageLatencies = performanceMonitor.messageLatencies.slice(-100);
        }
        updateConnectionQuality();
      }
      if (data.type === 'message') {
        performanceMonitor.messagesReceived++;
        messages.update(msgs => [...msgs, {
          id: generateUniqueId(),
          type: 'received',
          text: data.text,
          timestamp: new Date().toISOString()
        }]);
      } else if (data.type === 'image') {
          messages.update(msgs => {
              if (data.replaceMessageId) {
                  const idx = msgs.findIndex(m => m.id === data.replaceMessageId);
                  if (idx !== -1) {
                      const updated = [...msgs];
                      updated[idx] = {
                          id: msgs[idx].id,
                          type: 'received',
                          text: `Image: ${data.filename}`,
                          imageData: data.data,
                          timestamp: new Date().toISOString()
                      };
                      return updated;
                  }
              }
              // If no replaceMessageId or no matching message found, add as new message
              return [...msgs, {
                  id: generateUniqueId(),
                  type: 'received',
                  text: `Image: ${data.filename}`,
                  imageData: data.data,
                  timestamp: new Date().toISOString()
              }];
          });
      } else if (data.type === 'photo-request') {
        console.log('Photo request received via WebRTC');
        /*photoRequestReceived.set(true);*/
        messages.update(msgs => [...msgs, {
          id: generateUniqueId(),
          type: 'photo-request',
          text: 'requested a photo',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Error parsing data channel message:', error);
      analytics.error('message_parse_error', 'webrtc');
    }
  };
}

function updateConnectionQuality() {
  if (performanceMonitor.messageLatencies.length === 0) {
    connectionQuality.set('unknown');
    return;
  }
  const avgLatency = performanceMonitor.messageLatencies.reduce((a, b) => a + b, 0) / performanceMonitor.messageLatencies.length;
  if (avgLatency < 50) {
    connectionQuality.set('excellent');
  } else if (avgLatency < 150) {
    connectionQuality.set('good');
  } else {
    connectionQuality.set('poor');
  }
}

function startConnectionQualityMonitoring() {
  const pingInterval = setInterval(() => {
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify({
          type: 'ping',
          sentAt: Date.now()
        }));
      } catch (error) {
        clearInterval(pingInterval);
      }
    } else {
      clearInterval(pingInterval);
    }
  }, 10000);
}

function fallbackToSocketMessages() {
  webrtcConnected.set(false);
  connectionQuality.set('poor');
  analytics.webrtcFallback('connection_failed');
}

export function joinQueue(name) {
  if (!socket) return;
  messages.set([]);
  socket.emit('join', { name });
  analytics.sessionStarted();
}

export function sendMessage(text) {
  if (!text.trim()) return;
  const timestamp = new Date().toISOString();
  const sentAt = Date.now();
  const message = {
    id: generateUniqueId(),
    type: 'sent',
    text: text.trim(),
    timestamp: timestamp
  };
  messages.update(msgs => [...msgs, message]);
  performanceMonitor.messagesSent++;
  analytics.messageSent(text.length);
  if (dataChannel && dataChannel.readyState === 'open') {
    try {
      dataChannel.send(JSON.stringify({
        type: 'message',
        text: text.trim(),
        sentAt: sentAt
      }));
    } catch (error) {
      console.error('Error sending via data channel:', error);
      analytics.error('webrtc_send_failed', 'messaging');
      socket?.emit('message', { text: text.trim() });
    }
  } else {
    socket?.emit('message', { text: text.trim() });
  }
}

export function sendImage(file, imageData, replaceMessageId = null) {
  if (!file || !imageData) return;
  const message = {
    id: replaceMessageId || generateUniqueId(),
    type: 'sent',
    text: `Image: ${file.name}`,
    imageData: imageData,
    timestamp: new Date().toISOString()
  };
  if (replaceMessageId) {
    messages.update(msgs => msgs.map(msg => 
      msg.id === replaceMessageId ? message : msg
    ));
  } else {
    messages.update(msgs => [...msgs, message]);
  }
  analytics.imageShared(file.size, file.size > 1024 * 1024);
  if (file.size > 1024 * 1024) {
    compressImage(imageData, 0.7).then(compressedData => {
      sendImageData(file.name, compressedData || imageData, replaceMessageId);
    }).catch(() => {
      sendImageData(file.name, imageData, replaceMessageId);
    });
  } else {
    sendImageData(file.name, imageData, replaceMessageId);
  }
}

function sendImageData(filename, imageData, replaceMessageId = null) {
  if (dataChannel && dataChannel.readyState === 'open') {
    try {
      dataChannel.send(JSON.stringify({
        type: 'image',
        filename: filename,
        data: imageData,
        replaceMessageId: replaceMessageId
      }));
    } catch (error) {
      console.error('Error sending image via data channel:', error);
      analytics.error('image_send_failed', 'webrtc');
    }
  } else {
    analytics.error('image_send_no_p2p', 'webrtc');
  }
}

function compressImage(dataUrl, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const maxSize = 1024;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function requestPhoto() {
  console.log('Requesting photo...');
  if (dataChannel && dataChannel.readyState === 'open') {
    try {
      console.log('Sending photo request via WebRTC');
      dataChannel.send(JSON.stringify({
        type: 'photo-request'
      }));
    } catch (error) {
      console.error('Error sending photo request via data channel:', error);
      console.log('Fallback to socket for photo request');
      socket?.emit('req-photo');
    }
  } else {
    console.log('Sending photo request via socket');
    socket?.emit('req-photo');
  }
}

export function leaveChat() {
  if (!socket) return;
  socket.emit('leave');
  matchFound.set(false);
  partnerInfo.set(null);
  messages.set([]);
  cleanupWebRTC();
  resetMetrics();
}

export function reportPartner() {
  if (!socket) return;
  socket.emit('report');
  matchFound.set(false);
  partnerInfo.set(null);
  messages.set([]);
  cleanupWebRTC();
  resetMetrics();
}

function cleanupWebRTC() {
  webrtcConnected.set(false);
  connectionQuality.set('unknown');
  if (dataChannel) {
    if (dataChannel.readyState === 'open') {
      dataChannel.close();
    }
    dataChannel = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  isInitiator = false;
}

function resetMetrics() {
  connectionMetrics = {
    startTime: null,
    webrtcConnectionTime: null,
    messagesSent: 0,
    messagesReceived: 0
  };
  performanceMonitor.messageLatencies = [];
  messageCache.clear();
  messageIdCounter = 0;
}

export function getPerformanceStats() {
  return {
    ...connectionMetrics,
    ...performanceMonitor,
    averageLatency: performanceMonitor.messageLatencies.length > 0 
      ? performanceMonitor.messageLatencies.reduce((a, b) => a + b, 0) / performanceMonitor.messageLatencies.length 
      : 0,
    cacheSize: messageCache.size
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  connected.set(false);
  matchFound.set(false);
  partnerInfo.set(null);
  messages.set([]);
  cleanupWebRTC();
  resetMetrics();
}

export function clearMessages() {
  messages.set([]);
}