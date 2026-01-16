/**
 * Image Color Analysis Utility
 * Analyzes image brightness to determine optimal text color for readability
 */

export interface ColorAnalysisResult {
  brightness: number; // 0-255, where 0 is darkest and 255 is brightest
  isDark: boolean; // true if image is predominantly dark
  recommendedTextColor: 'light' | 'dark';
  contrastRatio: number; // estimated contrast ratio
}

/**
 * Analyzes an image and returns color information for adaptive text styling
 * Uses canvas to sample pixels and calculate average brightness
 */
export async function analyzeImageBrightness(imageUrl: string): Promise<ColorAnalysisResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      try {
        // Create canvas to analyze image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        // Scale down for performance (analyze at max 200x200)
        const maxSize = 200;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // Draw image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Calculate average brightness using luminance formula
        // Focus on center region (where text typically appears)
        const centerX = Math.floor(canvas.width * 0.25);
        const centerY = Math.floor(canvas.height * 0.25);
        const centerWidth = Math.floor(canvas.width * 0.5);
        const centerHeight = Math.floor(canvas.height * 0.5);

        let totalBrightness = 0;
        let pixelCount = 0;

        for (let y = centerY; y < centerY + centerHeight; y++) {
          for (let x = centerX; x < centerX + centerWidth; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Use relative luminance formula (ITU-R BT.709)
            const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            totalBrightness += brightness;
            pixelCount++;
          }
        }

        const avgBrightness = totalBrightness / pixelCount;

        // Determine if image is dark (threshold at 127.5, middle of 0-255 range)
        // Use slightly lower threshold (115) to prefer light text more often for better readability
        const isDark = avgBrightness < 115;

        // Calculate estimated contrast ratio
        // For light text on dark bg: (255 + 0.05) / (avgBrightness + 0.05)
        // For dark text on light bg: (avgBrightness + 0.05) / (0 + 0.05)
        const contrastRatio = isDark
          ? (255 + 0.05) / (avgBrightness + 0.05)
          : (avgBrightness + 0.05) / (0 + 0.05);

        resolve({
          brightness: Math.round(avgBrightness),
          isDark,
          recommendedTextColor: isDark ? 'light' : 'dark',
          contrastRatio: Math.round(contrastRatio * 100) / 100,
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = imageUrl;
  });
}

/**
 * Determines if additional contrast enhancement is needed
 * Returns true if contrast ratio is below WCAG AA standard (4.5:1 for normal text)
 */
export function needsContrastEnhancement(analysis: ColorAnalysisResult): boolean {
  return analysis.contrastRatio < 4.5;
}

/**
 * Gets the optimal gradient overlay opacity based on contrast ratio
 * Returns 0 if no overlay needed, 0.1-0.4 for low contrast scenarios
 */
export function getOptimalOverlayOpacity(analysis: ColorAnalysisResult): number {
  if (analysis.contrastRatio >= 7) return 0; // WCAG AAA - no overlay needed
  if (analysis.contrastRatio >= 4.5) return 0; // WCAG AA - no overlay needed
  if (analysis.contrastRatio >= 3) return 0.15; // Slight enhancement
  if (analysis.contrastRatio >= 2) return 0.25; // Moderate enhancement
  return 0.35; // Strong enhancement for very low contrast
}
