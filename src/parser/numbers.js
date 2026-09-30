// Spoken amounts: digits, Roman/Devanagari number words, "sau", "hazaar", "dhai", rupee markers.

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const WORDS = {
  ek: 1, 'एक': 1, do: 2, 'दो': 2, teen: 3, 'तीन': 3, char: 4, chaar: 4, 'चार': 4, paanch: 5, panch: 5, 'पांच': 5, 'पाँच': 5,
  chhe: 6, chhah: 6, 'छह': 6, 'छः': 6, saat: 7, 'सात': 7, aath: 8, 'आठ': 8, nau: 9, 'नौ': 9, das: 10, 'दस': 10,
  gyarah: 11, 'ग्यारह': 11, barah: 12, 'बारह': 12, terah: 13, 'तेरह': 13, chaudah: 14, 'चौदह': 14, pandrah: 15, 'पंद्रह': 15, 'पन्द्रह': 15,
  solah: 16, 'सोलह': 16, satrah: 17, 'सत्रह': 17, atharah: 18, 'अठारह': 18, unnis: 19, 'उन्नीस': 19,
  bees: 20, 'बीस': 20, pachchis: 25, pachis: 25, 'पच्चीस': 25, tees: 30, 'तीस': 30, chalis: 40, 'चालीस': 40,
  pachas: 50, 'पचास': 50, saath: 60, 'साठ': 60, sattar: 70, 'सत्तर': 70, assi: 80, 'अस्सी': 80, nabbe: 90, 'नब्बे': 90,
  'पैंतालीस': 45, paintalis: 45, 'पैंतीस': 35, paintis: 35, 'पचपन': 55,
};
const HALF = { dedh: 1.5, 'डेढ़': 1.5, 'डेढ': 1.5, dhai: 2.5, 'ढाई': 2.5, adhai: 2.5 };
const HUNDRED = ['sau', 'सौ', 'hundred'];
const THOUSAND = ['hazaar', 'hazar', 'हज़ार', 'हजार', 'thousand', 'k'];
const LAKH = ['lakh', 'lac', 'लाख'];
const RUPEE = ['rupaye', 'rupaya', 'rupay', 'rupees', 'rupee', 'rs', 'inr', 'रुपये', 'रुपया', 'रुपए', 'रूपये', 'रु', '₹'];

export function tokenKind(tok) {
  if (/^\d+(\.\d+)?$/.test(tok)) return 'num';
  if (hasOwn(WORDS, tok)) return 'num';
  if (hasOwn(HALF, tok)) return 'half';
  if (HUNDRED.includes(tok)) return 'hundred';
  if (THOUSAND.includes(tok)) return 'thousand';
  if (LAKH.includes(tok)) return 'lakh';
  if (RUPEE.includes(tok)) return 'rupee';
  return null;
}

/** Numeric value of a run of number tokens ("do sau pachas" -> 250). 0 if there is no number. */
export function valueOf(tokens) {
  let total = 0;
  let cur = 0;
  let seen = false;
  tokens.forEach((t) => {
    switch (tokenKind(t)) {
      case 'num': cur += /^\d/.test(t) ? parseFloat(t) : WORDS[t]; seen = true; break;
      case 'half': cur += HALF[t]; seen = true; break;
      case 'hundred': cur = (cur || 1) * 100; seen = true; break;
      case 'thousand': total += (cur || 1) * 1000; cur = 0; seen = true; break;
      case 'lakh': total += (cur || 1) * 100000; cur = 0; seen = true; break;
      default: break;
    }
  });
  return seen ? Math.round((total + cur) * 100) / 100 : 0;
}

/**
 * Find the amount in a segment. Prefers a run next to a rupee word, otherwise the last run.
 * Returns { amount, start, end } (token indexes, end exclusive) or null.
 */
export function findAmount(tokens) {
  const runs = [];
  for (let i = 0; i < tokens.length;) {
    if (!tokenKind(tokens[i])) { i++; continue; }
    const start = i;
    let hasRupee = false;
    while (i < tokens.length && tokenKind(tokens[i])) {
      if (tokenKind(tokens[i]) === 'rupee') hasRupee = true;
      i++;
    }
    const rupeeBefore = start > 0 && tokenKind(tokens[start - 1]) === 'rupee';
    runs.push({ start, end: i, rupeeAdjacent: hasRupee || rupeeBefore });
  }

  const preferred = runs.filter((r) => r.rupeeAdjacent);
  const pool = preferred.length ? preferred : runs;
  for (let p = pool.length - 1; p >= 0; p--) {
    const amount = valueOf(tokens.slice(pool[p].start, pool[p].end));
    if (amount > 0) return { amount, start: pool[p].start, end: pool[p].end };
  }
  return null;
}
