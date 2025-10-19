import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		serviceWorker: {
			register: true
		},
		env: {
			publicPrefix: 'VITE_'
		}
	}
};

export default config;