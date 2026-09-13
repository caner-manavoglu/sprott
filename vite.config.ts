import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], root: 'web', resolve: {alias: {'@': new URL('./web/src', import.meta.url).pathname}}, server: {port: 5173, proxy: {'/api': 'http://127.0.0.1:3000'}}, build: {outDir: '../dist', emptyOutDir: true} });
