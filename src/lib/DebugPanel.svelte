<!-- Enhanced WebRTC Debug Component with Performance Monitoring -->
<script>
  import { webrtcConnected, connected, matchFound, connectionQuality, getPerformanceStats } from '$lib/socket.js';
  import { onMount, onDestroy } from 'svelte';
  
  let showDebug = false;
  let performanceStats = {};
  let updateInterval;
  let debugInfo = {
    browser: '',
    webrtcSupport: false,
    networkType: 'unknown',
    timestamp: new Date().toLocaleTimeString()
  };

  onMount(() => {
    // Check WebRTC support
    debugInfo.webrtcSupport = !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
    debugInfo.browser = getBrowserInfo();
    debugInfo.networkType = getNetworkType();
    
    // Show debug panel in development or if debug=true in URL
    const urlParams = new URLSearchParams(window.location.search);
    showDebug = import.meta.env.DEV || urlParams.get('debug') === 'true';

    // Update performance stats every 2 seconds
    if (showDebug) {
      updateInterval = setInterval(() => {
        if (typeof getPerformanceStats === 'function') {
          performanceStats = getPerformanceStats();
        }
        debugInfo.timestamp = new Date().toLocaleTimeString();
      }, 2000);
    }
  });

  onDestroy(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });

  function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  function getNetworkType() {
    if ('connection' in navigator) {
      return navigator.connection?.effectiveType || 'unknown';
    }
    return 'unknown';
  }

  function toggleDebug() {
    showDebug = !showDebug;
  }

  function getConnectionStatusColor(status) {
    switch (status) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }

  function formatLatency(latency) {
    return latency ? `${Math.round(latency)}ms` : 'N/A';
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
</script>

{#if showDebug}
  <div class="fixed bottom-4 right-4 bg-black bg-opacity-90 text-white text-xs p-4 rounded-lg max-w-sm z-50 font-mono">
    <div class="flex justify-between items-center mb-3">
      <span class="font-bold text-green-400">?? Debug Panel</span>
      <button on:click={toggleDebug} class="text-white hover:text-gray-300 text-lg leading-none">×</button>
    </div>
    
    <!-- Connection Status -->
    <div class="space-y-2 mb-4">
      <div class="text-yellow-400 font-semibold">Connection Status</div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>Socket:</div>
        <div class="{$connected ? 'text-green-400' : 'text-red-400'}">
          {$connected ? 'Connected' : 'Disconnected'}
        </div>
        
        <div>Match:</div>
        <div class="{$matchFound ? 'text-green-400' : 'text-red-400'}">
          {$matchFound ? 'Found' : 'None'}
        </div>
        
        <div>WebRTC:</div>
        <div class="{$webrtcConnected ? 'text-green-400' : 'text-yellow-400'}">
          {$webrtcConnected ? 'P2P Active' : 'Server Relay'}
        </div>
        
        <div>Quality:</div>
        <div class="{getConnectionStatusColor($connectionQuality)}">
          {$connectionQuality}
        </div>
      </div>
    </div>

    <!-- Performance Metrics -->
    <div class="space-y-2 mb-4">
      <div class="text-yellow-400 font-semibold">Performance</div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>Sent:</div>
        <div class="text-blue-400">{performanceStats.messagesSent || 0}</div>
        
        <div>Received:</div>
        <div class="text-green-400">{performanceStats.messagesReceived || 0}</div>
        
        <div>Avg Latency:</div>
        <div class="{getConnectionStatusColor($connectionQuality)}">
          {formatLatency(performanceStats.averageLatency)}
        </div>
        
        <div>WebRTC Time:</div>
        <div class="text-cyan-400">
          {performanceStats.webrtcConnectionTime ? `${Math.round(performanceStats.webrtcConnectionTime)}ms` : 'N/A'}
        </div>
      </div>
    </div>

    <!-- System Info -->
    <div class="space-y-2 mb-4">
      <div class="text-yellow-400 font-semibold">System Info</div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>Browser:</div>
        <div class="text-cyan-400">{debugInfo.browser}</div>
        
        <div>WebRTC:</div>
        <div class="{debugInfo.webrtcSupport ? 'text-green-400' : 'text-red-400'}">
          {debugInfo.webrtcSupport ? 'Supported' : 'Not Supported'}
        </div>
        
        <div>Network:</div>
        <div class="text-purple-400">{debugInfo.networkType}</div>
        
        <div>Updated:</div>
        <div class="text-gray-400">{debugInfo.timestamp}</div>
      </div>
    </div>

    <!-- Connection Reliability -->
    <div class="space-y-2">
      <div class="text-yellow-400 font-semibold">Reliability</div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>Attempts:</div>
        <div class="text-blue-400">{performanceStats.connectionAttempts || 0}</div>
        
        <div>Failed:</div>
        <div class="text-red-400">{performanceStats.failedConnections || 0}</div>
        
        <div>Success Rate:</div>
        <div class="text-green-400">
          {performanceStats.connectionAttempts > 0 
            ? `${Math.round(((performanceStats.connectionAttempts - performanceStats.failedConnections) / performanceStats.connectionAttempts) * 100)}%`
            : 'N/A'}
        </div>
        
        <div>Cache Size:</div>
        <div class="text-purple-400">{performanceStats.cacheSize || 0}</div>
      </div>
    </div>
  </div>
{:else}
  <!-- Debug toggle button -->
  {#if import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === 'true'}
    <button 
      on:click={toggleDebug}
      class="fixed bottom-4 right-4 bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded-lg z-50 transition-colors"
      title="Show debug information"
    >
      ?? Debug
    </button>
  {/if}
{/if}