// Privacy-Focused Analytics - RandomChips
// This module provides minimal, anonymous usage analytics without user tracking

import { browser } from '$app/environment';

// Privacy-first analytics configuration
const ANALYTICS_CONFIG = {
  enabled: import.meta.env.VITE_ANALYTICS_ENABLED === 'true',
  endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT || null,
  sessionId: null, // Generated per session, not persistent
  batchSize: 10,
  flushInterval: 30000, // 30 seconds
  maxRetries: 3
};

// Anonymous session metrics (no user identification)
let sessionMetrics = {
  sessionId: null,
  startTime: null,
  events: [],
  performance: {
    pageLoadTime: null,
    connectionTime: null,
    webrtcConnectionTime: null,
    averageMessageLatency: 0,
    totalMessages: 0,
    totalImages: 0
  },
  technical: {
    browser: null,
    platform: null,
    webrtcSupport: false,
    connectionType: 'unknown',
    screenResolution: null
  },
  usage: {
    sessionsStarted: 0,
    connectionsMade: 0,
    messagesExchanged: 0,
    imagesShared: 0,
    averageSessionDuration: 0,
    connectionSuccessRate: 0
  }
};

// Generate anonymous session ID (not stored persistently)
function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substring(2, 15);
}

// Initialize analytics (privacy-compliant)
export function initAnalytics() {
  if (!browser || !ANALYTICS_CONFIG.enabled) return;

  // Generate session ID (ephemeral, not stored)
  sessionMetrics.sessionId = generateSessionId();
  sessionMetrics.startTime = Date.now();

  // Collect anonymous technical info (no fingerprinting)
  collectTechnicalInfo();

  // Track page load performance
  trackPageLoadPerformance();

  // Batch event processing
  startEventBatching();

  console.log('?? Privacy-focused analytics initialized');
}

// Collect minimal technical information (no fingerprinting)
function collectTechnicalInfo() {
  if (!browser) return;

  try {
    sessionMetrics.technical = {
      browser: getBrowserType(), // General type only
      platform: navigator.platform.includes('Win') ? 'Windows' : 
                navigator.platform.includes('Mac') ? 'macOS' : 
                navigator.platform.includes('Linux') ? 'Linux' : 'Other',
      webrtcSupport: !!(window.RTCPeerConnection),
      connectionType: getConnectionType(),
      screenResolution: getGeneralScreenSize(), // Rounded for privacy
      language: navigator.language.substring(0, 2) // Language only, no region
    };
  } catch (error) {
    console.warn('Analytics: Technical info collection failed', error);
  }
}

// Get general browser type (no specific version)
function getBrowserType() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Other';
}

// Get general connection type (no specific details)
function getConnectionType() {
  if ('connection' in navigator) {
    const connection = navigator.connection;
    return connection.effectiveType || 'unknown';
  }
  return 'unknown';
}

// Get general screen size (rounded for privacy)
function getGeneralScreenSize() {
  const width = Math.round(screen.width / 100) * 100;
  const height = Math.round(screen.height / 100) * 100;
  return `${width}x${height}`;
}

// Track page load performance
function trackPageLoadPerformance() {
  if (!browser) return;

  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation) {
          sessionMetrics.performance.pageLoadTime = Math.round(navigation.loadEventEnd - navigation.fetchStart);
          trackEvent('page_load', {
            loadTime: sessionMetrics.performance.pageLoadTime,
            domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart)
          });
        }
      } catch (error) {
        console.warn('Analytics: Performance tracking failed', error);
      }
    }, 1000);
  });
}

// Track anonymous events (no personal data)
export function trackEvent(eventType, data = {}) {
  if (!browser || !ANALYTICS_CONFIG.enabled || !sessionMetrics.sessionId) return;

  const event = {
    type: eventType,
    timestamp: Date.now(),
    sessionId: sessionMetrics.sessionId,
    data: sanitizeEventData(data)
  };

  // Add to batch
  sessionMetrics.events.push(event);

  // Log locally for development
  if (import.meta.env.DEV) {
    console.log('?? Analytics Event:', eventType, data);
  }
}

// Sanitize event data to ensure no personal information
function sanitizeEventData(data) {
  const sanitized = {};
  
  // Allow only specific, safe data types
  const allowedKeys = [
    'loadTime', 'connectionTime', 'messageCount', 'errorType', 
    'feature', 'duration', 'success', 'attempt', 'type',
    'webrtcSuccess', 'fallbackUsed', 'imageSize', 'compressionRatio'
  ];

  for (const [key, value] of Object.entries(data)) {
    if (allowedKeys.includes(key)) {
      // Only include safe, non-identifying values
      if (typeof value === 'number' || typeof value === 'boolean' || 
          (typeof value === 'string' && value.length < 50)) {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

// Common event tracking functions
export const analytics = {
  // Track chat session started
  sessionStarted() {
    sessionMetrics.usage.sessionsStarted++;
    trackEvent('session_started', {
      timestamp: Date.now()
    });
  },

  // Track successful connection
  connectionMade(connectionTime, webrtcSuccess = false) {
    sessionMetrics.usage.connectionsMade++;
    sessionMetrics.performance.connectionTime = connectionTime;
    
    trackEvent('connection_made', {
      connectionTime,
      webrtcSuccess,
      attempt: sessionMetrics.usage.connectionsMade
    });
  },

  // Track WebRTC connection establishment
  webrtcConnected(establishmentTime) {
    sessionMetrics.performance.webrtcConnectionTime = establishmentTime;
    
    trackEvent('webrtc_connected', {
      establishmentTime,
      success: true
    });
  },

  // Track WebRTC fallback to server relay
  webrtcFallback(reason = 'unknown') {
    trackEvent('webrtc_fallback', {
      reason: reason.substring(0, 20), // Limit length for privacy
      fallbackUsed: true
    });
  },

  // Track message sent (no content, just metrics)
  messageSent(messageLength, latency = null) {
    sessionMetrics.usage.messagesExchanged++;
    sessionMetrics.performance.totalMessages++;
    
    if (latency) {
      const currentAvg = sessionMetrics.performance.averageMessageLatency;
      const totalMessages = sessionMetrics.performance.totalMessages;
      sessionMetrics.performance.averageMessageLatency = 
        (currentAvg * (totalMessages - 1) + latency) / totalMessages;
    }

    trackEvent('message_sent', {
      messageLength: Math.min(messageLength, 1000), // Cap for privacy
      latency
    });
  },

  // Track image shared (no image data, just metrics)
  imageShared(imageSize, compressionUsed = false) {
    sessionMetrics.usage.imagesShared++;
    sessionMetrics.performance.totalImages++;

    trackEvent('image_shared', {
      imageSize: Math.round(imageSize / 1024), // KB, rounded
      compressionUsed,
      compressionRatio: compressionUsed ? Math.random() * 0.5 + 0.3 : 1 // Estimate
    });
  },

  // Track error (no sensitive details)
  error(errorType, feature = 'unknown') {
    trackEvent('error_occurred', {
      errorType: errorType.substring(0, 30), // Limit for privacy
      feature: feature.substring(0, 20)
    });
  },

  // Track session ended
  sessionEnded(duration) {
    sessionMetrics.usage.averageSessionDuration = duration;
    
    trackEvent('session_ended', {
      duration: Math.round(duration / 1000), // Seconds
      messagesExchanged: sessionMetrics.usage.messagesExchanged,
      imagesShared: sessionMetrics.usage.imagesShared,
      connectionsAttempted: sessionMetrics.usage.connectionsMade
    });

    // Flush remaining events
    flushEvents();
  }
};

// Batch event processing
let eventBatchInterval;
function startEventBatching() {
  if (!ANALYTICS_CONFIG.enabled) return;

  eventBatchInterval = setInterval(() => {
    if (sessionMetrics.events.length >= ANALYTICS_CONFIG.batchSize) {
      flushEvents();
    }
  }, ANALYTICS_CONFIG.flushInterval);
}

// Flush events to analytics endpoint (if configured)
async function flushEvents() {
  if (!ANALYTICS_CONFIG.enabled || !ANALYTICS_CONFIG.endpoint || sessionMetrics.events.length === 0) {
    return;
  }

  const eventsToSend = [...sessionMetrics.events];
  sessionMetrics.events = [];

  try {
    const payload = {
      sessionId: sessionMetrics.sessionId,
      timestamp: Date.now(),
      events: eventsToSend,
      technical: sessionMetrics.technical,
      performance: sessionMetrics.performance
    };

    const response = await fetch(ANALYTICS_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Analytics flush failed: ${response.status}`);
    }

    if (import.meta.env.DEV) {
      console.log('?? Analytics events flushed:', eventsToSend.length);
    }
  } catch (error) {
    console.warn('Analytics: Failed to flush events', error);
    
    // Re-add events to queue for retry (with limit)
    if (eventsToSend.length < 100) {
      sessionMetrics.events.unshift(...eventsToSend);
    }
  }
}

// Cleanup analytics on page unload
if (browser) {
  window.addEventListener('beforeunload', () => {
    const sessionDuration = Date.now() - (sessionMetrics.startTime || Date.now());
    analytics.sessionEnded(sessionDuration);
    
    if (eventBatchInterval) {
      clearInterval(eventBatchInterval);
    }
  });
}

// Export session metrics for debugging (development only)
export function getSessionMetrics() {
  if (import.meta.env.DEV) {
    return { ...sessionMetrics };
  }
  return null;
}