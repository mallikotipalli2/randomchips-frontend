# RandomChips Frontend

Anonymous chat application frontend built with SvelteKit.

## Live Demo
- **Backend**: https://randomchips-backend.onrender.com
- **Frontend**: https://randomchips-frontend.vercel.app

## Features
- Real-time anonymous chat
- WebRTC peer-to-peer connections
- Image sharing
- Mobile responsive
- Dark/Light theme

## Tech Stack
- SvelteKit
- TailwindCSS
- Socket.IO Client
- WebRTC

## Environment Variables
```env
VITE_API_URL=https://randomchips-backend.onrender.com
VITE_WS_URL=wss://randomchips-backend.onrender.com
```

## Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
```