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

function parseColor(raw: string): number {
  const parsed = Number.parseInt(raw.replace(/^#/, ''), 16);
  return Number.isNaN(parsed) ? 0xe25822 : parsed;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildId: snowflake('GUILD_ID'),
  /** Where /createlobby works. Unset, it works in any channel. */
  lobbyChannelId: snowflake('LOBBY_CHANNEL_ID'),
  embedColor: parseColor(optional('EMBED_COLOR', '#E25822')),
  maxRequests: positiveInt('MAX_REQUESTS_PER_MINUTE', 15),
  maxRequestsPerUser: positiveInt('MAX_REQUESTS_PER_USER_PER_MINUTE', 5),
  imageBaseUrl: optional('IMAGE_BASE_URL', 'https://raw.githubusercontent.com/emsimpson92/JonJBonfireBot/main/'),
} as const;

/** Direct jump link. Needs a real GUILD_ID; without one the channel mention stands alone. */
export function channelUrl(channelId: string): string | undefined {
  return config.guildId ? `https://discord.com/channels/${config.guildId}/${channelId}` : undefined;
}
