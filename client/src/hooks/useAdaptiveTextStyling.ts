import { useState, useEffect } from 'react';
import {
  analyzeImageBrightness,
  needsContrastEnhancement,
  getOptimalOverlayOpacity,
  type ColorAnalysisResult,
} from '@/lib/imageColorAnalysis';

export interface AdaptiveTextStyle {
  textColorClass: string;
  gradientClass: string;
  overlayOpacity: number;
  isAnalyzing: boolean;
  analysis: ColorAnalysisResult | null;
  error: string | null;
}

/**
 * Hook that analyzes an image and returns adaptive styling classes
 * Automatically determines optimal text color, shadows, and overlay opacity
 */
export function useAdaptiveTextStyling(imageUrl: string | null | undefined): AdaptiveTextStyle {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ColorAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      // No image - use default light text styling
      setAnalysis(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const analyze = async () => {
      setIsAnalyzing(true);
      setError(null);

      try {
        const result = await analyzeImageBrightness(imageUrl);
        
        if (!cancelled) {
          setAnalysis(result);
          setIsAnalyzing(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Image analysis failed:', err);
          setError(err instanceof Error ? err.message : 'Analysis failed');
          setIsAnalyzing(false);
          
          // Fallback to light text on error
          setAnalysis({
            brightness: 50,
            isDark: true,
            recommendedTextColor: 'light',
            contrastRatio: 4.5,
          });
        }
      }
    };

    analyze();

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Determine styling classes based on analysis
  const getTextColorClass = (): string => {
    if (!analysis) {
      return 'adaptive-text-light'; // Default
    }

    const needsEnhancement = needsContrastEnhancement(analysis);
    const baseClass = analysis.recommendedTextColor === 'light' 
      ? 'adaptive-text-light' 
      : 'adaptive-text-dark';

    return needsEnhancement ? `${baseClass}-enhanced` : baseClass;
  };

  const getGradientClass = (): string => {
    if (!analysis) {
      return '';
    }

    const overlayOpacity = getOptimalOverlayOpacity(analysis);
    
    if (overlayOpacity === 0) {
      return '';
    }

    const gradientType = analysis.recommendedTextColor === 'light'
      ? 'adaptive-gradient-dark'
      : 'adaptive-gradient-light';

    return `adaptive-gradient-overlay ${gradientType}`;
  };

  const overlayOpacity = analysis ? getOptimalOverlayOpacity(analysis) : 0;

  return {
    textColorClass: getTextColorClass(),
    gradientClass: getGradientClass(),
    overlayOpacity,
    isAnalyzing,
    analysis,
    error,
  };
}
