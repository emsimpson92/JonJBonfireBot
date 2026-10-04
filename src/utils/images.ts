import { config } from '../config.js';

const baseUrl = config.imageBaseUrl.endsWith('/') ? config.imageBaseUrl : `${config.imageBaseUrl}/`;

export const publicUrl = (path: string): string => new URL(path, baseUrl).href;
