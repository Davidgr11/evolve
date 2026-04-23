import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Served by Firebase Hosting in production; we replicate it for local dev
  const firebaseInitPlugin = {
    name: 'firebase-init-dev',
    configureServer(server) {
      server.middlewares.use('/__/firebase/init.js', (_, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.end(
          `if(typeof firebase!=='undefined'&&!firebase.apps.length){firebase.initializeApp(${JSON.stringify({
            apiKey: env.VITE_FIREBASE_API_KEY,
            authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: env.VITE_FIREBASE_APP_ID,
          })});}`
        );
      });
    },
  };

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'Evolve - Build the Life You Envision',
          short_name: 'Evolve',
          description: 'Track your fitness, goals, nutrition, and reading progress',
          theme_color: '#14b8a6',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          importScripts: ['/firebase-messaging-sw.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'firebase-images',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
      firebaseInitPlugin,
    ],
  };
})
