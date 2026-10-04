import type { SocialLink } from '../types.js';
import { baseEmbed } from './general.js';

export function socialsEmbed(socials: SocialLink[]) {
  const lines = socials.map((social) => `[${social.name}](${social.url})`).join('\n');
  return baseEmbed('Socials', lines);
}
