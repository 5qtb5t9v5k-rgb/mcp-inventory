/**
 * Categorization config — direct port of finance_notebook/src/config.py.
 *
 * This is the authoritative mapping that turns raw Curve CSV categories
 * into Finnish hierarchical categories (with 2nd category derived from notes).
 *
 * Keep in sync with the source repo:
 * https://github.com/5qtb5t9v5k-rgb/finance_notebook/blob/main/src/config.py
 */

/** card_last4 → friendly card name */
export const CARD_MAPPING: Record<number, string> = {
  6334: "crypto.com",
  9264: "norwegian",
  8529: "norwegian",
  829: "OP",
};

/**
 * Main category → { note_letter → English subcategory }.
 * Notes from Curve are typically a single letter like "F" (Family), "P" (Personal).
 */
export const CATEGORY_MAPPING: Record<string, Record<string, string>> = {
  General: {},
  Bills: {},
  "Business Services": {},
  Entertainment: { F: "Family", P: "Personal" },
  Transport: { G: "Car Gas", M: "Car Maintenance", P: "Public" },
  Shopping: {
    H: "Home / House",
    P: "Personal",
    RT: "Renovating & Tools",
    F: "Family",
    G: "Gifts",
    K: "Kids",
  },
  "Eating Out": { S: "Snacks & Soda", R: "Restaurants" },
  Groceries: {},
  Health: { F: "Family", P: "Personal" },
  Travel: { F: "Family", P: "Personal" },
};

export const CATEGORY_EN_TO_FI: Record<string, string> = {
  General: "Harrastukset",
  "Business Services": "Koulutus, Kirjallisuus & Kehittäminen",
  Entertainment: "Tapahtumat & Viihde",
  Transport: "Autoilu & Liikkuminen",
  Shopping: "Ostokset",
  "Eating Out": "Ulkona syöminen",
  Groceries: "Ruokakauppa",
  Subscriptions: "Striimaus & Palvelut",
  Health: "Terveys",
  Travel: "Matkailu",
  Bills: "Striimaus & Palvelut",
};

export const SUBCATEGORY_EN_TO_FI: Record<string, string> = {
  Family: "Perhe",
  "Renovating & Tools": "Remontointi",
  Gifts: "Lahjat",
  Personal: "Henkilökohtainen",
  "Car Gas": "Auton Polttoaine",
  "Car Maintenance": "Auton Huollot & Ylläpito",
  Public: "Julkinen liikenne",
  "Home / House": "Koti",
  Kids: "Lapset",
  "Snacks & Soda": "Välipalat & Virvoikkeet",
  Restaurants: "Ravintolat",
};

/** Categories where empty 2nd category gets a specific default. */
export const EMPTY_2ND_CATEGORY_RULES: Record<string, string> = {
  "Autoilu & Liikkuminen": "Julkinen liikenne",
  Ostokset: "Henkilökohtainen",
  "Tapahtumat & Viihde": "Henkilökohtainen",
  Terveys: "Henkilökohtainen",
  Matkailu: "Henkilökohtainen",
};

/** Categories where empty 2nd becomes "Yleinen". */
export const GENERAL_2ND_CATEGORIES: string[] = [
  "Harrastukset",
  "Koulutus, Kirjallisuus & Kehittäminen",
  "Remontointi",
  "Ruokakauppa",
  "Striimaus & Palvelut",
];

/** Default earliest date — drop transactions older than this. */
export const DEFAULT_START_DATE = "2025-01-01";

/** Cleaning filters from the Python pipeline. */
export const EXCLUDE_TYPES = ["REFUNDED"] as const;
export const EXCLUDE_NOTE_FRAGMENTS = [" del"] as const;
export const EXCLUDE_CURRENCIES = [" CPT", "CPT"] as const;
export const EXCLUDE_CARD_LAST4: number[] = [2033];
