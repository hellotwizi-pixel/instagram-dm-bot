import type { KeywordRule } from '../types.js';

export function loadKeywordRules(rulesJson: KeywordRule[]): KeywordRule[] {
  return rulesJson;
}

export function matchKeyword(commentText: string, rule: KeywordRule): boolean {
  const normalizedComment = commentText.toLowerCase().trim();
  return rule.keywords.some(keyword =>
    normalizedComment.includes(keyword.toLowerCase())
  );
}

export function findMatchingRule(
  commentText: string,
  rules: KeywordRule[]
): KeywordRule | null {
  for (const rule of rules) {
    if (matchKeyword(commentText, rule)) {
      return rule;
    }
  }
  return null;
}

export function formatReplyMessage(rule: KeywordRule): string {
  return `${rule.replyText}\n\n${rule.url}`;
}
