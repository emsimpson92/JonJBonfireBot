import { config } from '../config.js';
import { linkCommand } from './linkCommand.js';

export const faqCommand = linkCommand({
  name: 'faq',
  description: 'Links the FAQ channel.',
  channelId: config.faqChannelId,
  title: 'Frequently Asked Questions',
  blurb: 'PLACEHOLDER',
});

// TODO: Implement this