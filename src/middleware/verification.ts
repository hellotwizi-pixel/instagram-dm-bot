import { log } from '../utils/logger.js';

export const verifyWebhookToken = (token: string | undefined, verifyToken: string): boolean => {
  if (!token) {
    log.warn('Missing verification token');
    return false;
  }

  if (token !== verifyToken) {
    log.warn('Invalid verification token');
    return false;
  }

  return true;
};

export const validateRequestBody = (body: unknown): body is Record<string, unknown> => {
  return typeof body === 'object' && body !== null;
};
