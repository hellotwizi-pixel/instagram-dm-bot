import type { KeywordRule } from '../types.js';

interface SheetRow {
  keywords: string;
  replyText: string;
  url: string;
}

interface CacheEntry {
  data: KeywordRule[];
  timestamp: number;
}

const CACHE_DURATION_MS = 5000; // 5초 캐싱
let cachedRules: CacheEntry | null = null;

function parseKeywords(keywordString: string): string[] {
  return keywordString
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

function parseCSV(csvContent: string): SheetRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  // 헤더 파싱 (첫 줄)
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const keywordsIdx = headers.indexOf('keywords');
  const replyTextIdx = headers.indexOf('replytext');
  const urlIdx = headers.indexOf('url');

  if (keywordsIdx === -1 || replyTextIdx === -1 || urlIdx === -1) {
    console.error('[GoogleSheets] CSV 헤더가 잘못되었습니다. keywords, replyText, url 필요');
    return [];
  }

  // 데이터 행 파싱 (2번째 줄부터)
  const rows: SheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length <= Math.max(keywordsIdx, replyTextIdx, urlIdx)) {
      continue;
    }

    const keywords = parts[keywordsIdx]?.trim();
    const replyText = parts[replyTextIdx]?.trim();
    const url = parts[urlIdx]?.trim();

    if (keywords && replyText && url) {
      rows.push({ keywords, replyText, url });
    }
  }

  return rows;
}

function convertRowsToRules(rows: SheetRow[]): KeywordRule[] {
  return rows.map(row => ({
    keywords: parseKeywords(row.keywords),
    replyText: row.replyText,
    url: row.url,
  }));
}

export async function loadKeywordsFromGoogleSheets(
  sheetsId: string
): Promise<KeywordRule[]> {
  // 캐시 확인
  if (cachedRules && Date.now() - cachedRules.timestamp < CACHE_DURATION_MS) {
    console.log('[GoogleSheets] 캐시에서 규칙 로드');
    return cachedRules.data;
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetsId}/export?format=csv`;

    console.log(`[GoogleSheets] ${csvUrl}에서 로드 중...`);
    const response = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error(
        `Google Sheets 접근 실패: ${response.status} ${response.statusText}`
      );
    }

    const csvContent = await response.text();
    const rows = parseCSV(csvContent);
    const rules = convertRowsToRules(rows);

    // 캐시 업데이트
    cachedRules = {
      data: rules,
      timestamp: Date.now(),
    };

    console.log(`[GoogleSheets] ${rules.length}개 규칙 로드 완료`);
    return rules;
  } catch (error) {
    console.error('[GoogleSheets] 로드 실패:', error);

    // 캐시가 있으면 캐시된 규칙 반환 (fallback)
    if (cachedRules) {
      console.log('[GoogleSheets] 캐시된 규칙으로 대체');
      return cachedRules.data;
    }

    return [];
  }
}

export function clearCache(): void {
  cachedRules = null;
}
