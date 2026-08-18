import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Must cover .tsx as well — component tests live next to the components
    // they cover, and a bare '*.test.ts' glob silently skips every one of them.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
