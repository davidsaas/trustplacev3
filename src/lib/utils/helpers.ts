/**
 * Constructs the absolute base URL for the application.
 * Handles Vercel deployment URLs and local development.
 */
export const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_APP_URL ?? // Use the variable defined in .env
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Fallback for production env.
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Fallback for Vercel.
    'http://localhost:3000/'; // Default to localhost for development

  // Make sure to include `https://` when not localhost.
  url = url.includes('http') ? url : `https://${url}`;
  // Make sure to include a trailing `/`.
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;

  // Optional: If you need to remove a potential double slash from the end
  // url = url.replace(/\/$/, ''); 

  return url;
};