import type { FaqTopic } from '../types.js';
import { truncate } from '../utils/general.js';
import { baseEmbed } from './general.js';

export function faqTopicEmbed(entry: FaqTopic) {
  return baseEmbed(entry.topic).addFields(
    entry.entries.map((qa, index) => ({ name: truncate(`${index + 1}. ${qa.question}`, 256), value: qa.answer })),
  );
}

export function faqListEmbed(faq: FaqTopic[]) {
  const list = faq.length ?
    `**${faq.length} ${faq.length === 1 ? 'topic' : 'topics'}:**\n${faq.map((entry) => `\`${entry.topic}\``).join('\n')}` :
    'No FAQ topics have been added yet.';

  return baseEmbed('Frequently Asked Questions', list).setFooter({ text: 'Use /faq <topic> to read one.' });
}
