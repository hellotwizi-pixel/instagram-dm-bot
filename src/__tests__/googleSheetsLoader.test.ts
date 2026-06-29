import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadKeywordsFromGoogleSheets, clearCache } from '../services/googleSheetsLoader.js';

// Google Sheets 파싱 함수들을 테스트하기 위해 직접 구현 포함
function parseKeywords(keywordString: string): string[] {
  return keywordString
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

function parseCSV(csvContent: string) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const keywordsIdx = headers.indexOf('keywords');
  const replyTextIdx = headers.indexOf('replytext');
  const urlIdx = headers.indexOf('url');

  if (keywordsIdx === -1 || replyTextIdx === -1 || urlIdx === -1) {
    return [];
  }

  const rows = [];
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

describe('googleSheetsLoader', () => {
  describe('parseKeywords', () => {
    it('should parse comma-separated keywords', () => {
      const result = parseKeywords('가격, 비용, 가격표');
      expect(result).toEqual(['가격', '비용', '가격표']);
    });

    it('should trim whitespace', () => {
      const result = parseKeywords('  가격  ,  비용  ');
      expect(result).toEqual(['가격', '비용']);
    });

    it('should handle empty strings', () => {
      const result = parseKeywords('가격,,비용');
      expect(result).toEqual(['가격', '비용']);
    });

    it('should return empty array for empty input', () => {
      const result = parseKeywords('');
      expect(result).toEqual([]);
    });
  });

  describe('parseCSV', () => {
    it('should parse valid CSV format', () => {
      const csv = `keywords,replyText,url
가격,가격 정보입니다,https://example.com/pricing
구독,구독 안내입니다,https://example.com/subscribe`;

      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        keywords: '가격',
        replyText: '가격 정보입니다',
        url: 'https://example.com/pricing',
      });
    });

    it('should handle missing header', () => {
      const csv = `invalid,headers,here
data,data,data`;

      const result = parseCSV(csv);
      expect(result).toHaveLength(0);
    });

    it('should skip empty rows', () => {
      const csv = `keywords,replyText,url
가격,가격 정보입니다,https://example.com/pricing

구독,구독 안내입니다,https://example.com/subscribe`;

      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
    });

    it('should be case-insensitive for headers', () => {
      const csv = `KEYWORDS,ReplyText,URL
가격,가격 정보입니다,https://example.com/pricing`;

      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
    });

    it('should handle single row', () => {
      const csv = `keywords,replyText,url`;
      const result = parseCSV(csv);
      expect(result).toHaveLength(0);
    });
  });

  describe('loadKeywordsFromGoogleSheets (실제 구현)', () => {
    beforeEach(() => {
      clearCache();
      vi.unstubAllGlobals();
    });

    it('키워드 칸에 쉼표로 여러 단어가 들어가면 구글시트가 따옴표로 감싸는데, 이 경우도 컬럼이 밀리지 않고 올바르게 읽혀야 한다', async () => {
      const csv = [
        'keywords,replyText,url,postId',
        '"가격,비용,가격표",안녕하세요! 가격표는 여기입니다.,https://example.com/pricing,',
      ].join('\n');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(csv),
        })
      );

      const rules = await loadKeywordsFromGoogleSheets('dummy-sheet-id');

      expect(rules).toHaveLength(1);
      expect(rules[0].keywords).toEqual(['가격', '비용', '가격표']);
      expect(rules[0].url).toBe('https://example.com/pricing');
      expect(rules[0].postId).toBeUndefined();
    });

    it('postId 칸에 값이 있으면 해당 게시물에만 적용되는 규칙으로 읽혀야 한다', async () => {
      const csv = [
        'keywords,replyText,url,postId',
        '"가격,비용",할인 안내,https://example.com/discount,17999456919123456',
      ].join('\n');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(csv),
        })
      );

      const rules = await loadKeywordsFromGoogleSheets('dummy-sheet-id');

      expect(rules[0].postId).toBe('17999456919123456');
    });
  });
});
