import { defineConfig } from 'vite'
import { libraryResolve } from './vite.shared'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: libraryResolve(__dirname),
})
