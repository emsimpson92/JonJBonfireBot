import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // config.ts throws without a token, and the embeds import it for image URLs. Tests never log in.
    env: { DISCORD_TOKEN: 'test-token' },
  },
});
