const env = (key: string, fallback: string): string => {
  const v = process.env[key];
  if (!v || v.includes("cryptox")) return fallback;
  return v;
};

export const COMPANY_NAME    = env("COMPANY_NAME",    "Zebvix Technologies Private Limited");
export const COMPANY_SHORT   = env("COMPANY_SHORT",   "Zebvix");
export const COMPANY_CIN     = env("COMPANY_CIN",     "U66190UW2026PTC251591");
export const COMPANY_PAN     = env("COMPANY_PAN",     "AACCZ9728R");
export const COMPANY_TAN     = env("COMPANY_TAN",     "MRTZ01489F");
export const COMPANY_GST     = env("COMPANY_GST",     "29AACCZ9728R1ZK");
export const COMPANY_ADDRESS = env("COMPANY_ADDRESS", "105, Vill Subari, Shamli, Jhinjhana, Kairana, Muzaffarnagar — 247773, Uttar Pradesh, India");
export const COMPANY_EMAIL   = env("COMPANY_EMAIL",   "support@zebvix.com");
export const COMPANY_WEBSITE = env("COMPANY_WEBSITE", "https://zebvix.com");
