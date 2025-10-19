<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { initAnalytics } from '$lib/analytics.js';
  import ChipIcon from '$lib/icons/ChipIcon.svelte';
  import SunIcon from '$lib/icons/SunIcon.svelte';
  import MoonIcon from '$lib/icons/MoonIcon.svelte';

  // Theme store
  export const theme = writable('dark');

  onMount(() => {
    // Initialize privacy-focused analytics
    initAnalytics();
    
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'dark';
    theme.set(savedTheme);
    
    // Apply theme to document
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  });

  function toggleTheme() {
    theme.update(currentTheme => {
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      
      return newTheme;
    });
  }
</script>

<div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  <!-- Header with theme toggle -->
  <header class="p-4 border-b border-gray-200 dark:border-gray-700">
    <div class="max-w-4xl mx-auto flex justify-between items-center">
      <div class="flex items-center gap-2">
        <ChipIcon size={24} color="#10b981" />
        <h1 class="text-xl font-bold">RandomChips</h1>
      </div>
      <button 
        on:click={toggleTheme}
        class="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="Toggle theme"
      >
        {#if $theme === 'dark'}
          <SunIcon size={18} />
        {:else}
          <MoonIcon size={18} />
        {/if}
      </button>
    </div>
  </header>

  <!-- Main content -->
  <main class="min-h-[calc(100vh-73px)]">
    <slot />
  </main>
</div>