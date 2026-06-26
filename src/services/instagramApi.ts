import type { PrivateReplyResponse, GraphAPIError } from '../types.js';

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_API_BASE = 'https://graph.facebook.com';

export async function sendPrivateReply(
  commentId: string,
  message: string,
  accessToken: string
): Promise<PrivateReplyResponse> {
  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${commentId}/private_replies`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        access_token: accessToken,
      }),
    });

    const data = (await response.json()) as unknown;

    if (!response.ok) {
      const errorData = data as { error?: unknown };
      console.error('[Instagram API Error]', {
        commentId,
        status: response.status,
        error: errorData.error,
      });
      return { error: errorData.error as GraphAPIError['error'] };
    }

    console.log('[Instagram API Success]', { commentId, messageLength: message.length });
    return { success: true as const };
  } catch (error) {
    console.error('[Instagram API Exception]', {
      commentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: 'network_error',
        code: 0,
      },
    };
  }
}

export function validateAccessToken(token: string): boolean {
  return Boolean(token && token.length > 0);
}
