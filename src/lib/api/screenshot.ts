

/**
 * Generates a Microlink URL for capturing screenshots
 * @param url The URL to screenshot
 * @param fullPage Whether to capture the full page or just the viewport
 */
export function getMicrolinkUrl(url: string, fullPage: boolean = false): string {
  const params = new URLSearchParams({
    url: url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    waitForTimeout: "6000", // Increased from 4000 to let JS load
    waitUntil: "networkidle0",
  });

  if (fullPage) {
    // Microlink's scroll params don't work reliably
    // Instead, force a VERY TALL viewport (4000px) to capture everything
    params.append("viewport.width", "1920");
    params.append("viewport.height", "4000"); // Force tall viewport to render all sections
    params.append("screenshot.fullPage", "true"); // Still try this
  }

  return `https://api.microlink.io/?${params.toString()}`;
}

/**
 * Generates a Microlink URL specifically for a Twitter/X profile
 * This is a workaround to "see" the profile without expensive APIs
 */
export function getTwitterScreenshotUrl(handleOrUrl: string): string {
  let handle = handleOrUrl;
  
  // Extract handle if full URL is provided
  if (handleOrUrl.includes("twitter.com/") || handleOrUrl.includes("x.com/")) {
    const parts = handleOrUrl.split("/");
    handle = parts[parts.length - 1].split("?")[0];
  }
  
  // Remove @ if present
  handle = handle.replace("@", "");
  
  const twitterUrl = `https://twitter.com/${handle}`;
  
  // For Twitter, we want the viewport, not full page, to focus on bio/stats
  return getMicrolinkUrl(twitterUrl, false);
}

/**
 * Fetches the screenshot image and returns it as a base64 string
 * This enables the AI to "see" the image without needing public URL access
 */
export async function fetchScreenshotAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log("[Veritas Paparazzi] 📸 Snapping photo...");
    // If the input is not a direct image URL (which Microlink returns), wrap it
    // But usually we pass the Microlink API URL directly here
    const fetchUrl = url.includes("api.microlink.io") ? url : getMicrolinkUrl(url);
    
    const response = await fetch(fetchUrl);
    
    if (!response.ok) {
      console.warn("[Veritas Paparazzi] Failed to capture screenshot:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    console.log(`[Veritas Paparazzi] Image captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
    return { base64, mimeType: contentType };
  } catch (error) {
    console.warn("[Veritas Paparazzi] Camera malfunction:", error);
    return null;
  }
}
