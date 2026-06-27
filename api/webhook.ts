import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { InstagramWebhookPayload, KeywordRule } from '../src/types.js';
import {
  findMatchingRule,
  formatReplyMessage,
  loadKeywordRules,
} from '../src/services/keywordMatcher.js';
import { loadKeywordsFromGoogleSheets } from '../src/services/googleSheetsLoader.js';
import { sendPrivateReply, validateAccessToken } from '../src/services/instagramApi.js';

const PAGE_ACCESS_TOKEN = process.env.IG_PAGE_ACCESS_TOKEN || '';
const VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN || '';
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID || '';

let cachedKeywordRules: KeywordRule[] | null = null;

async function loadKeywords(): Promise<KeywordRule[]> {
  if (cachedKeywordRules && cachedKeywordRules.length > 0) {
    return cachedKeywordRules;
  }

  try {
    // Google Sheets 사용 (설정된 경우)
    if (GOOGLE_SHEETS_ID) {
      console.log('[Webhook] Google Sheets에서 키워드 로드 시도');
      const sheetsKeywords = await loadKeywordsFromGoogleSheets(GOOGLE_SHEETS_ID);
      if (sheetsKeywords.length > 0) {
        cachedKeywordRules = sheetsKeywords;
        console.log(`[Webhook] Google Sheets에서 ${sheetsKeywords.length}개 규칙 로드`);
        return sheetsKeywords;
      }
      console.log('[Webhook] Google Sheets 규칙이 비어있음, JSON 파일로 폴백');
    }

    // Fallback: JSON 파일
    const keywordsPath = resolve('./src/config/keywords.json');
    const fileContent = readFileSync(keywordsPath, 'utf-8');
    cachedKeywordRules = loadKeywordRules(JSON.parse(fileContent));
    console.log(`[Webhook] JSON에서 ${cachedKeywordRules.length}개 규칙 로드`);
    return cachedKeywordRules;
  } catch (error) {
    console.error('[Webhook] 키워드 로드 실패:', error);
    return [];
  }
}

function handleGetRequest(
  req: VercelRequest,
  res: VercelResponse
): VercelResponse {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verification failed - invalid token');
  return res.status(403).json({ error: 'Forbidden' });
}

async function handlePostRequest(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  if (!validateAccessToken(PAGE_ACCESS_TOKEN)) {
    console.error('[Webhook] Missing IG_PAGE_ACCESS_TOKEN');
    return res.status(500).json({ error: 'Missing configuration' });
  }

  const payload = req.body as InstagramWebhookPayload;

  if (!payload.entry || payload.entry.length === 0) {
    return res.status(200).json({ received: true });
  }

  const keywordRules = await loadKeywords();

  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      if (change.field !== 'comments' || !change.value.text) {
        continue;
      }

      const commentId = change.value.id;
      const commentText = change.value.text;
      const mediaId = change.value.media?.id;

      console.log(`[Webhook] Processing comment: ${commentId}`);
      console.log(`[Webhook] Comment text: "${commentText}"`);

      const matchedRule = findMatchingRule(commentText, keywordRules, mediaId);

      if (!matchedRule) {
        console.log(`[Webhook] No matching rule found for comment: ${commentId}`);
        continue;
      }

      console.log(`[Webhook] Matched rule - sending private reply`);
      const replyMessage = formatReplyMessage(matchedRule);

      const result = await sendPrivateReply(
        commentId,
        replyMessage,
        PAGE_ACCESS_TOKEN
      );

      if (result.error) {
        console.error(`[Webhook] Failed to send reply: ${result.error.message}`);
      }
    }
  }

  return res.status(200).json({ received: true });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  if (req.method === 'GET') {
    return handleGetRequest(req, res);
  }

  if (req.method === 'POST') {
    return handlePostRequest(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
