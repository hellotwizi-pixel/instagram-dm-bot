export class InstagramDMBotError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'InstagramDMBotError';
  }
}

export class ConfigError extends InstagramDMBotError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
  }
}

export class APIError extends InstagramDMBotError {
  constructor(message: string, public statusCode?: number) {
    super(message, 'API_ERROR');
  }
}

export class ValidationError extends InstagramDMBotError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
