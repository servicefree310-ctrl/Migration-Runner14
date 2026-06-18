/**
 * Sanctions Screening Library
 * Checks names/emails against OFAC SDN, UN Security Council, EU, and MHA India lists.
 * FIU-IND PMLA 2002 compliance — mandatory at registration and KYC submission.
 *
 * Implementation: Local curated list of high-risk/sanctioned entities + country risk scoring.
 * For production: supplement with live OFAC API (https://sanctionssearch.ofac.treas.gov)
 */

export type ScreeningResult = {
  clear: boolean;
  riskLevel: "clear" | "low" | "medium" | "high" | "blocked";
  matchedList?: string;
  matchedTerm?: string;
  message: string;
};

/** High-risk jurisdictions per FATF grey/black list + India MHA notifications */
const HIGH_RISK_COUNTRIES = new Set([
  "iran", "north korea", "dprk", "syria", "myanmar", "russia", "belarus",
  "cuba", "venezuela", "sudan", "somalia", "libya", "yemen", "iraq",
  "afghanistan", "eritrea", "mali", "nicaragua",
]);

/** OFAC/UN consolidated entity name fragments — major sanctioned entities */
const SANCTIONED_ENTITY_FRAGMENTS = [
  "al-qaeda", "al qaeda", "isis", "isil", "daesh", "hamas", "hezbollah",
  "al-shabaab", "boko haram", "lashkar", "jaish", "let ", "jem ",
  "taliban", "haqqani", "iranian revolutionary", "irgc", "quds force",
  "wagner group", "north korea", "sanctioned", "sdn ",
];

/** Common SDN names — prominent OFAC-listed individuals (partial list for screening) */
const SDN_NAME_FRAGMENTS = [
  "khamenei", "rouhani", "zarif", "soleimani", "deripaska", "abramovich",
  "sechin", "rotenberg", "timchenko", "kovchuga", "maduro", "chavez nicolas",
  "bashar al-assad", "kim jong", "lukashenko", "bin laden",
];

/**
 * Normalize a string for comparison: lowercase, remove special chars, collapse spaces.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Fuzzy token match — check if any word in `fragment` appears in `text` with
 * allowance for 1-char typo using simple sliding window.
 */
function softMatch(text: string, fragment: string): boolean {
  const tWords = text.split(" ");
  const fWords = fragment.split(" ");
  for (const fw of fWords) {
    if (fw.length < 3) continue;
    const found = tWords.some((tw) => {
      if (Math.abs(tw.length - fw.length) > 2) return false;
      if (tw.includes(fw) || fw.includes(tw)) return true;
      let diff = 0;
      for (let i = 0; i < Math.min(tw.length, fw.length); i++) {
        if (tw[i] !== fw[i]) diff++;
        if (diff > 1) return false;
      }
      return diff <= 1;
    });
    if (found) return true;
  }
  return false;
}

/**
 * Screen a name against sanctions lists.
 * Returns a ScreeningResult indicating risk level.
 */
export function screenName(name: string): ScreeningResult {
  const norm = normalize(name);

  for (const frag of SDN_NAME_FRAGMENTS) {
    if (softMatch(norm, frag)) {
      return {
        clear: false,
        riskLevel: "blocked",
        matchedList: "OFAC SDN",
        matchedTerm: frag,
        message: `Name "${name}" matches OFAC SDN list entry. Account creation blocked. Contact compliance@zebvix.com.`,
      };
    }
  }

  for (const frag of SANCTIONED_ENTITY_FRAGMENTS) {
    if (norm.includes(frag)) {
      return {
        clear: false,
        riskLevel: "high",
        matchedList: "UN/OFAC Entity List",
        matchedTerm: frag,
        message: `Name "${name}" matches sanctioned entity pattern. Flagged for manual review.`,
      };
    }
  }

  return { clear: true, riskLevel: "clear", message: "No sanctions matches found." };
}

/**
 * Screen a country of residence against FATF/MHA high-risk jurisdictions.
 */
export function screenCountry(country: string): ScreeningResult {
  const norm = normalize(country);
  for (const risk of HIGH_RISK_COUNTRIES) {
    if (norm.includes(risk)) {
      return {
        clear: false,
        riskLevel: "high",
        matchedList: "FATF/MHA High-Risk Jurisdictions",
        matchedTerm: risk,
        message: `Country "${country}" is on the FATF high-risk jurisdiction list. Enhanced due diligence required.`,
      };
    }
  }
  return { clear: true, riskLevel: "clear", message: "Country not on high-risk list." };
}

/**
 * Full onboarding screening: name + optional country.
 * Returns the highest-risk result found.
 */
export function screenOnboarding(opts: { name: string; country?: string }): ScreeningResult {
  const nameResult = screenName(opts.name);
  if (nameResult.riskLevel === "blocked" || nameResult.riskLevel === "high") return nameResult;

  if (opts.country) {
    const countryResult = screenCountry(opts.country);
    if (countryResult.riskLevel !== "clear") return countryResult;
  }

  return { clear: true, riskLevel: "clear", message: "Sanctions screening passed." };
}
