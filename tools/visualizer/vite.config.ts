import { defineConfig } from 'vite'
import { libraryResolve } from './vite.shared'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: libraryResolve(),
})
