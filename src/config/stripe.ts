import Stripe from "stripe";
import { env } from "./env";

// Cast to Stripe.LatestApiVersion: the `stripe` npm package pins this to a
// literal string union tied to its own version, which can drift from the
// version string below as the SDK is upgraded. If `npm install` resolves a
// newer `stripe` package than was available when this file was written,
// TypeScript may reject a stale literal here — the cast keeps a build from
// breaking on that mismatch while still sending an explicit, pinned
// API version to Stripe. Update the string (and drop the cast to verify
// it) whenever you bump the `stripe` dependency.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
});
