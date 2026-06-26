import { log } from '../utils/logger.js';

export interface WebhookEvent {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      message?: {
        text: string;
        mid: string;
      };
    }>;
  }>;
}

export const validateWebhookEvent = (event: WebhookEvent): boolean => {
  if (!event.object || event.object !== 'instagram') {
    log.warn('Invalid webhook object type', { object: event.object });
    return false;
  }

  if (!Array.isArray(event.entry) || event.entry.length === 0) {
    log.warn('Invalid webhook entry');
    return false;
  }

  return true;
};

export const processWebhookEvent = async (event: WebhookEvent): Promise<void> => {
  if (!validateWebhookEvent(event)) {
    throw new Error('Invalid webhook event');
  }

  for (const entry of event.entry) {
    log.info('Processing webhook entry', { entryId: entry.id });
    // TODO: Implement event processing logic
  }
};
