import type { OwnedItem } from '../data.js';
import { baseEmbed } from './general.js';

function buildLine({ item, eternal }: OwnedItem): string {
  return `\`${item.slot}\`: **${item.name}**${eternal?.name ? ` - *${eternal.name}*` : ''}`;
}

export function randomBuildEmbed(build: OwnedItem[]) {
  return baseEmbed('Random Build', build.map(buildLine).join('\n'))
    .setFooter({ text: '/item name: for any item\'s abilities · run it again to reroll' });
}
