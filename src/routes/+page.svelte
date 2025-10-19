<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { messages } from '$lib/socket.js';
  import ChipIcon from '$lib/icons/ChipIcon.svelte';
  
  let name = '';
  let isConnecting = false;
  
  onMount(() => {
    // Clear any existing connection state and messages
    localStorage.removeItem('chatState');
    messages.set([]);
  });

  async function startChat() {
    if (isConnecting) return;
    
    isConnecting = true;
    
    // Store name for the chat session
    const chatName = name.trim() || `RandomChip${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('chatName', chatName);
    
    // Navigate to waiting page
    await goto('/waiting');
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter') {
      startChat();
    }
  }
</script>

<svelte:head>
  <title>RandomChips - Anonymous Chat</title>
  <meta name="description" content="Connect with random strangers for anonymous text chats. No registration required." />
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-73px)] p-4">
  <div class="max-w-md w-full space-y-8">
    <!-- Logo/Header -->
    <div class="text-center">
      <div class="mb-4 flex justify-center">
        <ChipIcon size={72} color="#10b981" />
      </div>
      <h2 class="text-3xl font-bold mb-2">RandomChips</h2>
      <p class="text-gray-600 dark:text-gray-400">
		  Connect with RandomChips anonymously
	  </p>
    </div>

    <!-- Chat form -->
    <div class="space-y-6">
      <div>
        <label for="name" class="block text-sm font-medium mb-2">
       
        </label>
        <input
          id="name"
          type="text"
          bind:value={name}
          on:keypress={handleKeyPress}
          placeholder="Random Chip"
          maxlength="20"
          class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                 focus:ring-2 focus:ring-brand-green focus:border-transparent
                 placeholder-gray-500 dark:placeholder-gray-400"
          disabled={isConnecting}
        />
      </div>

      <button
        on:click={startChat}
        disabled={isConnecting}
        class="w-full btn-primary text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if isConnecting}
          Connecting...
        {:else}
          START CHAT
        {/if}
      </button>
    </div>

    <!-- Features -->
    <div class="text-center space-y-2 text-sm text-gray-600 dark:text-gray-400">
      <p>• Completely anonymous</p>
      <p>• No registration required</p>
      <p>• Instant connections</p>
      <p>• Send images & text</p>
    </div>
  </div>
</div>