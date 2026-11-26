// Nickname rules: 3 to 16 characters (letters of any language, digits, _ and -), and nothing from the banned list.
// The list is short and cannot be complete: reports (3 different players) turn a bad name back into a plain alias.

// Look-alike characters read as the letters they stand for, so "sh1t" or "f u c k" do not slip past.
const lookalikes = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

// Fragments that may not appear anywhere in a name once it is simplified (lower case, no spaces or marks).
const banned = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy', 'whore', 'slut', 'nigg', 'fagg', 'rape', 'nazi', 'hitler', 'bastard', 'cock',
  // Korean (written out in hangul)
  '시발', '씨발', '씹', '병신', '븅신', '지랄', '좆', '존나', '개새', '새끼', '미친', '꺼져', '엿먹', '창녀', '걸레', '섹스', '야동', '강간', '자살',
  // Names nobody else may pretend to be
  'admin', 'oddbirdle', 'studiyo', 'moderator', 'support', '운영자', '관리자'
];

export function simplify(text) {
  return String(text).normalize('NFKC').toLowerCase()
    .replace(/[0134578@$!]/g, char => lookalikes[char])
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function checkNickname(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'nickname-invalid' };
  const nickname = input.normalize('NFKC').trim();
  const length = [...nickname].length;
  if (length < 3 || length > 16) return { ok: false, reason: 'nickname-invalid' };
  if (!/^[\p{L}\p{N}_-]+$/u.test(nickname)) return { ok: false, reason: 'nickname-invalid' };
  // Only digits or only separators is not a name.
  if (!/\p{L}/u.test(nickname)) return { ok: false, reason: 'nickname-invalid' };
  const simple = simplify(nickname);
  if (banned.some(word => simple.includes(word))) return { ok: false, reason: 'nickname-banned' };
  return { ok: true, nickname };
}
