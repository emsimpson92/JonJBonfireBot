import { config } from '../config.js';
import { linkCommand } from './linkCommand.js';

export const playtestCommand = linkCommand({
  name: 'playtest',
  description: 'Links the playtest channel.',
  channelId: config.playtestChannelId,
  title: 'Playtest',
  blurb: 'PLACEHOLDER blurb. Builds, signups, and bug reports for the current playtest live here.',
});

// TODO: Implement this