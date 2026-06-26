import { describe, it, expect } from 'vitest';
import {
  findMatchingRule,
  formatReplyMessage,
  loadKeywordRules,
  matchKeyword,
} from '../services/keywordMatcher';
import type { KeywordRule } from '../types';

describe('keywordMatcher', () => {
  const mockRules: KeywordRule[] = [
    {
      keywords: ['가격', '비용'],
      replyText: '가격 정보입니다.',
      url: 'https://example.com/pricing',
    },
    {
      keywords: ['구독', '가입'],
      replyText: '구독 방법입니다.',
      url: 'https://example.com/subscribe',
    },
  ];

  describe('loadKeywordRules', () => {
    it('should load rules correctly', () => {
      const rules = loadKeywordRules(mockRules);
      expect(rules).toEqual(mockRules);
      expect(rules).toHaveLength(2);
    });
  });

  describe('matchKeyword', () => {
    it('should match keyword case-insensitively', () => {
      const rule = mockRules[0];
      expect(matchKeyword('가격', rule)).toBe(true);
      expect(matchKeyword('가격입니다', rule)).toBe(true);
      expect(matchKeyword('가격 얼마예요?', rule)).toBe(true);
      expect(matchKeyword('PRICING', rule)).toBe(false);
    });

    it('should match partial text', () => {
      const rule = mockRules[0];
      expect(matchKeyword('상품의 가격을 알고 싶어요', rule)).toBe(true);
      expect(matchKeyword('비용이 어떻게 되나요?', rule)).toBe(true);
    });

    it('should ignore whitespace', () => {
      const rule = mockRules[0];
      expect(matchKeyword('  가격  ', rule)).toBe(true);
    });

    it('should not match unrelated text', () => {
      const rule = mockRules[0];
      expect(matchKeyword('안녕하세요', rule)).toBe(false);
      expect(matchKeyword('좋아요', rule)).toBe(false);
    });
  });

  describe('findMatchingRule', () => {
    it('should find first matching rule', () => {
      const comment = '가격이 얼마예요?';
      const matched = findMatchingRule(comment, mockRules);
      expect(matched).toEqual(mockRules[0]);
    });

    it('should find second rule when first does not match', () => {
      const comment = '구독하려면 어떻게 해야 하나요?';
      const matched = findMatchingRule(comment, mockRules);
      expect(matched).toEqual(mockRules[1]);
    });

    it('should return null when no rule matches', () => {
      const comment = '이 제품 좋아요!';
      const matched = findMatchingRule(comment, mockRules);
      expect(matched).toBeNull();
    });

    it('should return first matching rule when multiple match', () => {
      const rulesWithOverlap: KeywordRule[] = [
        {
          keywords: ['정보'],
          replyText: '일반 정보',
          url: 'https://example.com/info',
        },
        {
          keywords: ['가격', '정보'],
          replyText: '가격 정보',
          url: 'https://example.com/pricing',
        },
      ];
      const comment = '가격 정보를 원합니다';
      const matched = findMatchingRule(comment, rulesWithOverlap);
      expect(matched?.url).toBe('https://example.com/info');
    });
  });

  describe('formatReplyMessage', () => {
    it('should format reply with text and URL', () => {
      const rule = mockRules[0];
      const formatted = formatReplyMessage(rule);
      expect(formatted).toContain('가격 정보입니다.');
      expect(formatted).toContain('https://example.com/pricing');
      expect(formatted).toContain('\n\n');
    });

    it('should preserve URL correctly', () => {
      const rule = mockRules[1];
      const formatted = formatReplyMessage(rule);
      expect(formatted).toContain('https://example.com/subscribe');
      expect(formatted).toBe(`${rule.replyText}\n\n${rule.url}`);
    });
  });
});
