import dns from "node:dns";

/**
 * Validates whether an email address is an authentic Google email account.
 * - Supports standard Google accounts: @gmail.com, @googlemail.com
 * - Supports custom domains powered by Google Workspace by verifying Google MX records.
 */
export async function validateGoogleEmail(
  email: string
): Promise<{ valid: boolean; reason?: string; isWorkspace?: boolean }> {
  if (!email || typeof email !== "string") {
    return { valid: false, reason: "Email address is required." };
  }

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: "Invalid email format." };
  }

  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return { valid: false, reason: "Invalid email address structure." };
  }

  const domain = parts[1].trim();

  // 1. Standard Google Consumer Domains
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { valid: true, isWorkspace: false };
  }

  // 2. Google Workspace Custom Domains via DNS MX Lookup
  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: `Domain '@${domain}' has no valid mail exchange (MX) records.`,
      };
    }

    const hasGoogleMx = mxRecords.some((record) => {
      const exchange = (record.exchange || "").toLowerCase();
      return (
        exchange.endsWith("google.com") ||
        exchange.endsWith("google.com.") ||
        exchange.endsWith("googlemail.com") ||
        exchange.endsWith("googlemail.com.") ||
        exchange.includes("aspmx.l.google.com") ||
        exchange.includes("smtp.google.com")
      );
    });

    if (hasGoogleMx) {
      return { valid: true, isWorkspace: true };
    }

    return {
      valid: false,
      reason: `'@${domain}' is not an authentic Google or Google Workspace email domain.`,
    };
  } catch (err: any) {
    // If DNS query fails or times out
    return {
      valid: false,
      reason: `Could not verify domain '@${domain}': ${err.message || "Domain lookup failed"}`,
    };
  }
}
