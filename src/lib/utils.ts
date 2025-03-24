import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Ensure the URL always has a protocol
export const getBaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'https://trustplacev3-one.vercel.app';
  // Add https:// protocol if URL doesn't have one
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};
