import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // config.ts throws without a token, and the embeds import it for image URLs. Tests never log in.
    // The lobby server is fixed so a GUILD_ID in a local .env can't change which commands are found.
    env: { DISCORD_TOKEN: 'test-token', LOBBY_GUILD_ID: '100000000000000001' },
  },
});
