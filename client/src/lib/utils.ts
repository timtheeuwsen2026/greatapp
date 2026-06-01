import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Gets the cover image URL with fallback to first gallery image.
 * Returns null if no images are available.
 * 
 * @param coverImageUrl - The primary cover image URL
 * @param gallery - Array of gallery image URLs (fallback source)
 * @returns Normalized image URL or null
 */
export function getCoverImage(
  coverImageUrl: string | null | undefined,
  gallery?: string[] | null
): string | null {
  // First, try the cover image
  if (coverImageUrl && coverImageUrl.trim() !== '') {
    return normalizeImageUrl(coverImageUrl);
  }
  
  // Fallback to first gallery image
  if (gallery && Array.isArray(gallery) && gallery.length > 0) {
    const firstImage = gallery[0];
    if (firstImage && firstImage.trim() !== '') {
      return normalizeImageUrl(firstImage);
    }
  }
  
  return null;
}

/**
 * Converts a Google Cloud Storage private URL to a local /objects/ path
 * that can be served by the backend's object storage endpoint.
 * 
 * Example:
 * Input:  https://storage.googleapis.com/replit-objstore-xxx/.private/uploads/uuid
 * Output: /objects/uploads/uuid
 * 
 * If the URL is not a GCS private URL, it's returned unchanged.
 */
export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // If it's already a relative /objects/ path, return as-is
  if (url.startsWith('/objects/')) {
    return url;
  }
  
  // If it's a regular HTTPS URL (like Unsplash), return as-is
  if (!url.includes('storage.googleapis.com') || !url.includes('.private/')) {
    return url;
  }
  
  try {
    // Extract the path from GCS URL
    // Format: https://storage.googleapis.com/bucket-name/.private/uploads/uuid
    const urlObj = new URL(url);
    const pathname = urlObj.pathname; // e.g., /bucket-name/.private/uploads/uuid
    
    // Find the .private/ part and extract what comes after
    const privateIndex = pathname.indexOf('.private/');
    if (privateIndex === -1) {
      return url; // Not a private path, return original
    }
    
    // Get everything after .private/
    const entityPath = pathname.slice(privateIndex + '.private/'.length);
    
    // Return as /objects/ path
    return `/objects/${entityPath}`;
  } catch (e) {
    // If URL parsing fails, return original
    return url;
  }
}
