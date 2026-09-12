/**
 * Site-wide identity and contact constants.
 *
 * SquareRate is a DBA of Timberwolf Development LLC, a Washington State limited
 * liability company. Both names appear in the legal pages, so they live here
 * rather than being retyped per page.
 */
export const COMPANY_LEGAL_NAME = "Timberwolf Development LLC";
export const PRODUCT_NAME = "SquareRate";
export const GOVERNING_STATE = "Washington";
export const GOVERNING_LAW = "the State of Washington, United States";

/** Support inbox. Also the fallback when the in-app form can't reach n8n. */
export const SUPPORT_EMAIL = "support@squarerate.app";

/** Days within which a refund is granted, no questions asked. */
export const REFUND_WINDOW_DAYS = 14;

/** Days within which account data is purged after a deletion request. */
export const DATA_DELETION_WINDOW_DAYS = 30;

/** Last substantive edit to the Terms and Privacy pages. */
export const LEGAL_LAST_UPDATED = "September 12, 2026";

/**
 * Discord invite for faster support and bug reports.
 *
 * Set `NEXT_PUBLIC_DISCORD_INVITE_URL` in `.env.local`. Generate the invite
 * with "Never expire" and no use limit — Discord defaults invites to 7 days,
 * after which this link silently rots. Every Discord link in the UI is hidden
 * while this is unset, so shipping without it degrades cleanly.
 */
export const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "";

/**
 * n8n webhook that receives support and bug-report submissions and forwards
 * them to {@link SUPPORT_EMAIL}. When unset, the support form falls back to a
 * prefilled mailto so the user is never left without a way to reach us.
 *
 * Payload: `{ topic, name, email, message, context, attachment }`. `attachment`
 * is `null` or `{ name, type, size, dataUrl }`, where `dataUrl` is a base64
 * image (capped at 5 MB pre-encoding) that the workflow should decode into a
 * real email attachment.
 */
export const SUPPORT_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_N8N_SUPPORT_WEBHOOK_URL ?? "";
