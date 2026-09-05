/**
 * Utility to generate a universally viewable URL for resumes across Web & Mobile (Capacitor)
 */
export function getResumeViewerUrl(url: string | null | undefined, origin: string): string {
  if (!url) return '#';
  
  let absoluteUrl = url.trim();
  if (absoluteUrl.startsWith('/')) {
    try {
      absoluteUrl = new URL(absoluteUrl, origin).href;
    } catch {
      absoluteUrl = `${origin.replace(/\/$/, '')}/${absoluteUrl.replace(/^\//, '')}`;
    }
  }

  // If it's a PDF or stored in our resume API/uploads, route through Google Docs Viewer for mobile WebView support
  if (
    absoluteUrl.toLowerCase().endsWith('.pdf') || 
    absoluteUrl.includes('/api/resumes/') || 
    absoluteUrl.includes('/uploads/')
  ) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}`;
  }

  return absoluteUrl;
}
