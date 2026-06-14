import Stripe from "stripe";

// Pinned to the API version bundled with the installed `stripe` SDK so the
// typed `LatestApiVersion` literal is satisfied and behaviour stays stable
// across SDK upgrades (bump deliberately, not implicitly).
const STRIPE_API_VERSION = "2026-05-27.dahlia";

let cachedClient: Stripe | null = null;

/**
 * Stripe is considered "enabled" iff a server secret key is present. All
 * payment surfaces gate on this so the app runs normally without Stripe.
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Lazy singleton Stripe client. Throws if called without a configured secret
 * key so misconfiguration fails loudly server-side rather than silently.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set; Stripe is not configured. Guard callers with isStripeConfigured().",
    );
  }
  if (!cachedClient) {
    cachedClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
  }
  return cachedClient;
}
