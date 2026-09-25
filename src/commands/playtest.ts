import { config } from '../config.js';
import { linkCommand } from './linkCommand.js';

export const playtestCommand = linkCommand({
  name: 'playtest',
  description: 'Links the playtest channel.',
  channelId: config.playtestChannelId,
  title: 'Playtest Information',
  blurb: 'PLACEHOLDER',
});

// TODO: Implement this