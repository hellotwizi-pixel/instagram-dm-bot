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
  rules: KeywordRule[],
  mediaId?: string
): KeywordRule | null {
  // 이 게시물에 한정된 규칙을 일반 규칙보다 먼저 확인
  const scopedToThisPost = rules.filter(rule => rule.postId && rule.postId === mediaId);
  const generalRules = rules.filter(rule => !rule.postId);

  for (const rule of [...scopedToThisPost, ...generalRules]) {
    if (matchKeyword(commentText, rule)) {
      return rule;
    }
  }
  return null;
}

export function formatReplyMessage(rule: KeywordRule): string {
  return `${rule.replyText}\n\n${rule.url}`;
}
