import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Placeholder ids from .env.example are not real snowflakes; treat them as unset. */
function snowflake(name: string): string | undefined {
  const value = (process.env[name] ?? '').trim();
  return /^[1-9]\d{16,19}$/.test(value) ? value : undefined;
}

/** Counts must be whole and positive; anything else falls back rather than disabling the limit. */
function positiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt((process.env[name] ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildId: snowflake('GUILD_ID'),
  /** Where /createlobby works. Unset, it works in any channel. */
  lobbyChannelId: snowflake('LOBBY_CHANNEL_ID'),
  maxRequests: positiveInt('MAX_REQUESTS_PER_MINUTE', 50),
  maxRequestsPerUser: positiveInt('MAX_REQUESTS_PER_USER_PER_MINUTE', 10),
  imageBaseUrl: optional('IMAGE_BASE_URL', 'https://raw.githubusercontent.com/emsimpson92/JonJBonfireBot/main/'),
} as const;
