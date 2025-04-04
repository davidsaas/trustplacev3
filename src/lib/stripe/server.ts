import Stripe from 'stripe';

// Ensure the Stripe secret key is loaded from environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error('Missing Stripe secret key environment variable: STRIPE_SECRET_KEY');
}

// Initialize Stripe with the API version and secret key
// It's good practice to pin the API version
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-03-31.basil', // Use the version expected by the installed types
  typescript: true, // Enable TypeScript support if needed
});