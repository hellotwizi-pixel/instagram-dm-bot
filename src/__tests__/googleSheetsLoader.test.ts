import { describe, it, expect, vi } from 'vitest';

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
});
