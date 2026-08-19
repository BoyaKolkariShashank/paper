import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Infinite Paper',
        short_name: 'Infinite Paper',
        description: 'An editable infinite workspace for text, drawings, tables, images, and files.',
        theme_color: '#f7f7f5',
        background_color: '#f7f7f5',
        display: 'standalone',
        start_url: '/',
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/x-infinite-paper': ['.paper'],
            },
          },
        ],
      },
    }),
  ],
})