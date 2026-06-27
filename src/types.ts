export interface KeywordRule {
  keywords: string[];
  replyText: string;
  url: string;
  /** 특정 게시물(미디어)에만 적용하고 싶을 때 해당 게시물의 media id를 지정. 없으면 모든 게시물에 적용. */
  postId?: string;
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
        media?: {
          id: string;
          media_product_type?: string;
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
