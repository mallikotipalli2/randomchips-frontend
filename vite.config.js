import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 3000
	},
	build: {
		target: 'es2020',
		chunkSizeWarningLimit: 1000
	}
});