<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { 
    initializeSocket, 
    joinQueue, 
    connected, 
    matchFound, 
    connectionError,
    disconnectSocket,
    messages
  } from '$lib/socket.js';
  import LoadingIcon from '$lib/icons/LoadingIcon.svelte';
  import WarningIcon from '$lib/icons/WarningIcon.svelte';
  import DisconnectedIcon from '$lib/icons/DisconnectedIcon.svelte';

  let timeWaiting = 0;
  let interval;
  let chatName = '';

  onMount(() => {
    // Only redirect on page refresh (when there's no navigation state)
    if (typeof window !== 'undefined' && window.location.pathname !== '/' && !document.referrer.includes(window.location.origin)) {
      goto('/');
      return;
    }
    
    // Clear any previous messages when waiting for new chat
    messages.set([]);
    
    // Get the name from localStorage
    chatName = localStorage.getItem('chatName') || 'Anonymous';
    
    // Initialize socket connection
    const socket = initializeSocket();
    
    // Start timer
    interval = setInterval(() => {
      timeWaiting++;
      
      // If waiting too long, show timeout message
      if (timeWaiting >= 100) {
        clearInterval(interval);
      }
    }, 1000);

    // Join the queue once connected
    const unsubscribeConnected = connected.subscribe(isConnected => {
      if (isConnected && chatName) {
        joinQueue(chatName);
      }
    });

    // Redirect when match is found
    const unsubscribeMatch = matchFound.subscribe(hasMatch => {
      if (hasMatch) {
        clearInterval(interval);
        goto('/chat');
      }
    });

    return () => {
      unsubscribeConnected();
      unsubscribeMatch();
    };
  });

  onDestroy(() => {
    if (interval) {
      clearInterval(interval);
    }
  });

  function goHome() {
    disconnectSocket();
    goto('/');
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<svelte:head>
  <title>Finding a partner... - RandomChips</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-73px)] p-4">
  <div class="max-w-md w-full text-center space-y-8">
    
    {#if $connectionError}
      <!-- Error state -->
      <div class="space-y-6">
        <div class="flex justify-center">
          <DisconnectedIcon size={48} color="#ef4444" />
        </div>
        <h2 class="text-2xl font-bold text-red-500">Connection Failed</h2>
        <p class="text-gray-600 dark:text-gray-400">{$connectionError}</p>
        <button on:click={goHome} class="btn-primary">
          Try Again
        </button>
      </div>
    {:else if timeWaiting >= 100}
      <!-- Timeout state -->
      <div class="space-y-6">
        <div class="flex justify-center">
          <WarningIcon size={48} color="#f59e0b" />
        </div>
        <h2 class="text-2xl font-bold text-yellow-500">No Chips Available</h2>
        <p class="text-gray-600 dark:text-gray-400">
          No other users are online right now. Try again later!
        </p>
        <button on:click={goHome} class="btn-primary">
          Go Back
        </button>
      </div>
    {:else}
      <!-- Loading state -->
      <div class="space-y-6">
        <!-- Animated spinner -->
        <div class="relative flex justify-center">
          <LoadingIcon size={64} color="#10b981" class="animate-spin" />
        </div>
        
        <div class="space-y-2">
          <h2 class="text-2xl font-bold">Finding you a chat partner...</h2>
          <p class="text-gray-600 dark:text-gray-400">
            Connecting as <span class="font-semibold text-brand-green">{chatName}</span>
          </p>
        </div>

        <!-- Timer -->
        <div class="text-lg font-mono bg-gray-100 dark:bg-gray-800 rounded-lg py-2 px-4 inline-block">
          {formatTime(timeWaiting)}
        </div>

        <!-- Status -->
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {#if !$connected}
            Connecting to server...
          {:else}
            Searching for available partners...
          {/if}
        </div>

        <!-- Cancel button -->
        <button 
          on:click={goHome}
          class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
        >
          Cancel
        </button>
      </div>
    {/if}
  </div>
</div>