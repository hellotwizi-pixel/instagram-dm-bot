export interface KeywordRule {
  keywords: string[];
  replyText: string;
  url: string;
}

export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      value: {
        from?: {
          username: string;
          id: string;
        };
        id: string;
        text?: string;
        hidden?: boolean;
        like_count?: number;
        timestamp?: number;
      };
      field: 'comments' | string;
    }>;
  }>;
}

export interface GraphAPIError {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

export interface PrivateReplyResponse {
  success?: boolean;
  error?: GraphAPIError['error'];
}
