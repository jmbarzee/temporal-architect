import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Config for building as a single bundle for VSCode webview
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // Toolchain-local output. The webview bundle is a release asset the
    // distribution repo downloads and embeds into the VSIX — it no longer
    // writes into a packages/ extension tree (which now lives in the dist repo).
    outDir: '../../dist/webview',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/webview.tsx'),
      output: {
        entryFileNames: 'visualizer.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'visualizer.css'
          }
          return 'assets/[name].[ext]'
        },
        format: 'iife',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
