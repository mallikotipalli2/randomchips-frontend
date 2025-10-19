<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { 
    initializeSocket,
    connected,
    matchFound,
    partnerInfo,
    messages,
    webrtcConnected,
    connectionQuality,
    sendMessage,
    sendImage,
    requestPhoto,
    leaveChat,
    reportPartner,
    disconnectSocket
  } from '$lib/socket.js';
  
  // Import SVG icons
  import ChatIcon from '$lib/icons/ChatIcon.svelte';
  import ImageIcon from '$lib/icons/ImageIcon.svelte';
  import LoadingIcon from '$lib/icons/LoadingIcon.svelte';
  import DotIcon from '$lib/icons/DotIcon.svelte';

  let messageInput = '';
  let messagesContainer;
  let fileInput;
  let showImagePreview = false;
  let selectedFile = null;
  let imagePreviewUrl = '';
  let isTyping = false;
  let typingTimeout;
  let connectionAttempts = 0;
  let maxRetries = 3;
  let isSendingImage = false;
  let messageIdCounter = 0;
  let showImageModal = false;
  let currentImageData = null;
  let pendingPhotoRequestId = null; // Track which request is being fulfilled

  onMount(() => {
    // Only redirect on page refresh (when there's no navigation state)
    if (typeof window !== 'undefined' && window.location.pathname !== '/' && !document.referrer.includes(window.location.origin)) {
      goto('/');
      return;
    }
    
    initializeSocket();

    // Clear messages when entering chat (ensures fresh start)
    messages.set([]);

    const unsubscribeMatch = matchFound.subscribe(hasMatch => {
      if (!hasMatch) {
        goto('/');
      }
    });

    const unsubscribeMessages = messages.subscribe((currentMessages) => {
      tick().then(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    });

    const unsubscribeQuality = connectionQuality.subscribe(quality => {
      if (quality === 'poor' && connectionAttempts < maxRetries) {
        setTimeout(() => {
          connectionAttempts++;
          console.log(`Attempting to improve connection (${connectionAttempts}/${maxRetries})`);
        }, 2000);
      }
    });

    return () => {
      unsubscribeMatch();
      unsubscribeMessages();
      unsubscribeQuality();
    };
  });

  onDestroy(() => {
    cleanupImagePreview();
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
  });

  function generateMessageId() {
    return `msg_${Date.now()}_${++messageIdCounter}`;
  }

  function handleSendMessage() {
    if (!messageInput.trim() || !$connected || !$matchFound) return;

    const lastMessage = $messages[$messages.length - 1];
    if (lastMessage && lastMessage.type === 'sent' && lastMessage.text === messageInput.trim()) {
      const timeDiff = Date.now() - new Date(lastMessage.timestamp).getTime();
      if (timeDiff < 2000) {
        return;
      }
    }

    sendMessage(messageInput);
    messageInput = '';
    
    isTyping = false;
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    } else {
      isTyping = true;
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      typingTimeout = setTimeout(() => {
        isTyping = false;
      }, 2000);
    }
  }

  function handleNewChat() {
    if (confirm('Are you sure you want to start a new chat? this will disconnect from the current Chip.')) {
      cleanupImagePreview();
      leaveChat();
      goto('/waiting');
    }
  }

  function handleRequestPhoto() {
    console.log('Req Photo button clicked');
    requestPhoto();
  }

  function handleReport() {
    if (confirm('Are you sure you want to report this user? This will end the chat and may help improve the platform.')) {
      cleanupImagePreview();
      reportPartner();
      goto('/');
    }
  }

  // Handle clicking on photo request button
  function handlePhotoRequestClick(messageId) {
    if (!$connected || !$matchFound) {
      alert('Connection lost. Please try again.');
      return;
    }
    
    console.log('Photo request clicked:', messageId);
    pendingPhotoRequestId = messageId; // Remember which request this is for
    fileInput.click();
  }

  function handleImageUpload() {
    if (!$connected || !$matchFound) {
      alert('Please wait for connection to be established.');
      return;
    }
    
    if (!$webrtcConnected) {
      if (!confirm('Image sharing works best with P2P connection. Your connection is currently using server relay. Continue anyway?')) {
        return;
      }
    }
    fileInput.click();
  }

  function handleFileSelect(event = null) {
    let file;
    if (event && event.target) {
      file = event.target.files[0];
    } else if (event instanceof DataTransferEvent) {
      file = event.dataTransfer.files[0];
    }
    if (!file) {
      pendingPhotoRequestId = null;
      return;
    }

    // Block GIFs and only allow static images
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 20 * 1024 * 1024; // 20MB hard limit
    const warnSize = 10 * 1024 * 1024; // 10MB warning

    if (!allowedTypes.includes(file.type)) {
      alert('Please select a valid image file (JPEG, PNG, or WebP only). GIF files are not allowed.');
      resetFileInput();
      pendingPhotoRequestId = null;
      return;
    }

    if (file.size > maxSize) {
      alert('File size must be less than 20MB. Please choose a smaller image or compress it.');
      resetFileInput();
      pendingPhotoRequestId = null;
      return;
    }

    if (file.size > warnSize) {
      if (!confirm(`This image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Large files take longer to send and may fail on slow connections. Continue?`)) {
        resetFileInput();
        pendingPhotoRequestId = null;
        return;
      }
    }

    cleanupImagePreview();

    selectedFile = file;
    imagePreviewUrl = URL.createObjectURL(file);
    showImagePreview = true;
    isSendingImage = false;
  }

  function resetFileInput() {
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function cleanupImagePreview() {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    selectedFile = null;
    imagePreviewUrl = '';
    showImagePreview = false;
    isSendingImage = false;
    resetFileInput();
  }

  function cancelImageUpload() {
    if (isSendingImage) {
      if (!confirm('Image is being sent. Are you sure you want to cancel?')) {
        return;
      }
    }
    pendingPhotoRequestId = null;
    cleanupImagePreview();
  }

  async function handleSendImage() {
    if (!selectedFile || isSendingImage) return;

    if (!$connected || !$matchFound) {
      alert('Connection lost. Please try again.');
      return;
    }

    isSendingImage = true;

    try {
      const imageData = await readFileAsDataURL(selectedFile);
      
      // If this is responding to a photo request, replace that message
      if (pendingPhotoRequestId) {
        sendImage(selectedFile, imageData, pendingPhotoRequestId);
        pendingPhotoRequestId = null;
      } else {
        sendImage(selectedFile, imageData);
      }
      
      setTimeout(() => {
        cleanupImagePreview();
      }, 500);
      
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image. Please try again.');
      isSendingImage = false;
      pendingPhotoRequestId = null;
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  function formatTime(timestamp = Date.now()) {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  function handleImageClick(imageData) {
    currentImageData = imageData;
    showImageModal = true;
  }

  function closeImageModal() {
    showImageModal = false;
    currentImageData = null;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (showImageModal) {
        closeImageModal();
      } else if (showImagePreview && !isSendingImage) {
        cancelImageUpload();
      }
    }
  }
</script>

<svelte:head>
  <title>Chat with {$partnerInfo?.name || 'Partner'} - RandomChips</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<input
  bind:this={fileInput}
  type="file"
  accept="image/jpeg,image/jpg,image/png,image/webp"
  on:change={handleFileSelect}
  class="hidden"
/>

<div class="flex flex-col h-[calc(100vh-73px)]">
  <div class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <DotIcon size={12} color="#10b981" />
        <div>
          <h2 class="text-lg font-semibold">
            {$partnerInfo?.name || 'Partner'}
          </h2>
          {#if isTyping}
            <div class="text-xs text-gray-500 dark:text-gray-400 animate-pulse">
              typing...
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div 
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-800"
  >
    {#if $messages.length === 0}
      <div class="text-center text-gray-500 dark:text-gray-400 py-8">
        <div class="flex items-center justify-center mb-2">
          <ChatIcon size={24} color="#9ca3af" />
        </div>
        <p>Say hello to start the conversation!</p>
      </div>
    {/if}

    {#each $messages as message (message.id)}
      <div class="flex {message.type === 'sent' ? 'justify-end' : message.type === 'system' ? 'justify-center' : 'justify-start'}">
        {#if message.type === 'system'}
          <div class="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full max-w-md text-center">
            {message.text}
          </div>
        {:else if message.type === 'photo-request'}
          <!-- Simple photo request button that gets replaced by image -->
          <div class="max-w-xs lg:max-w-md">
            <button
              on:click={() => handlePhotoRequestClick(message.id)}
              class="chat-bubble-other hover:opacity-80 transition-opacity cursor-pointer"
            >
              📷 requested a photo
            </button>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 text-left">
              {formatTime(message.timestamp)}
            </div>
          </div>
        {:else}
          <div class="max-w-xs lg:max-w-md">
            <div class="{message.type === 'sent' ? 'chat-bubble-self' : 'chat-bubble-other'}">
              {#if message.imageData}
                <button
                  type="button"
                  on:click={() => handleImageClick(message.imageData)}
                  class="block max-w-full focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                >
                  <img 
                    src={message.imageData} 
                    alt="Click to view full size"
                    class="max-w-full h-auto rounded-lg mb-2 max-h-64 object-contain hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                </button>
              {/if}
              <p class="break-words whitespace-pre-wrap">{message.text}</p>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 {message.type === 'sent' ? 'text-right' : 'text-left'}">
              {formatTime(message.timestamp)}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if showImagePreview}
    <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-auto">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold">Send Image</h3>
          {#if !isSendingImage}
            <button 
              on:click={cancelImageUpload}
              class="text-gray-500 hover:text-gray-700 text-xl"
              title="Close"
            >
              ×
            </button>
          {/if}
        </div>
        
        <img 
          src={imagePreviewUrl} 
          alt="Preview"
          class="w-full h-auto rounded-lg mb-4 max-h-64 object-contain"
        />
        
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          <div><strong>File:</strong> {selectedFile?.name}</div>
          <div><strong>Size:</strong> {(selectedFile?.size / 1024 / 1024).toFixed(2)} MB</div>
          <div><strong>Type:</strong> {selectedFile?.type}</div>
          <div><strong>Transfer:</strong> {$webrtcConnected ? 'P2P (Direct)' : 'Server Relay'}</div>
          {#if isSendingImage}
            <div class="text-blue-600 dark:text-blue-400 mt-2">
              <strong>Status:</strong> Processing image...
            </div>
          {/if}
        </div>
        
        <div class="flex space-x-3">
          <button 
            on:click={handleSendImage} 
            disabled={isSendingImage}
            class="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isSendingImage}
              <span class="flex items-center justify-center">
                <LoadingIcon size={16} class="animate-spin mr-2" />
                Sending...
              </span>
            {:else}
              Send Image
            {/if}
          </button>
          <button 
            on:click={cancelImageUpload} 
            disabled={isSendingImage}
            class="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSendingImage ? 'Wait...' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Image viewing modal (in-page) -->
  {#if showImageModal && currentImageData}
    <div class="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div class="relative max-w-full max-h-full">
        <button 
          on:click={closeImageModal}
          class="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70 z-10"
          title="Close (Press Escape)"
        >
          ×
        </button>
        
        <img 
          src={currentImageData} 
          alt="Full size image"
          class="max-w-full max-h-full object-contain"
          on:click={closeImageModal}
        />
      </div>
    </div>
  {/if}

  <div class="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4">
    <div class="flex space-x-2 mb-3">
      <input
        bind:value={messageInput}
        on:keypress={handleKeyPress}
        placeholder="Type a message..."
        disabled={!$connected || !$matchFound}
        maxlength="1000"
        class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
               focus:ring-2 focus:ring-brand-blue focus:border-transparent
               placeholder-gray-500 dark:placeholder-gray-400
               disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        on:click={handleSendMessage}
        disabled={!messageInput.trim() || !$connected || !$matchFound}
        class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>

    {#if messageInput.length > 800}
      <div class="text-xs text-gray-500 dark:text-gray-400 mb-2 text-right">
        {messageInput.length}/1000 characters
      </div>
    {/if}

    <div class="flex space-x-2 text-sm">
      <button
        on:click={handleNewChat}
        class="btn-secondary text-sm py-2 px-4"
      >
        New Chat
      </button>
      <button
        on:click={handleRequestPhoto}
        disabled={!$connected || !$matchFound}
        class="btn-info text-sm py-2 px-4 disabled:opacity-50"
      >
        Req Photo
      </button>
      <button
        on:click={handleReport}
        class="btn-danger text-sm py-2 px-4"
      >
        Report
      </button>
    </div>
  </div>
</div>