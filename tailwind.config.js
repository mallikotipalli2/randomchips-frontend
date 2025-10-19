/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#3b82f6',
        'brand-green': '#10b981',
        'brand-teal': '#14b8a6',
        'brand-red': '#ef4444'
      }
    },
  },
  plugins: [],
  darkMode: 'class'
}