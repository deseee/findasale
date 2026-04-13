/**
 * useVoiceTag.ts — Feature #42: Voice-to-Tag Hook
 *
 * High-level hook that wraps useVoiceInput and handles API calls to backend
 * voice-extract endpoint. Provides:
 * - Voice input state (isListening, transcript, isSupported)
 * - API call state (isProcessing, error)
 * - Extracted result (name, tags, category, estimatedPrice)
 * - Methods: startRecording(), stopRecording()
 *
 * Usage in components:
 * const { isSupported, isListening, isProcessing, startRecording, stopRecording, result } = useVoiceTag();
 */

import { useState, useCallback } from 'react';
import { useVoiceInput } from './useVoiceInput';
import api from '../lib/api';

export interface VoiceExtractionResult {
  name: string;
  tags: string[];
  category: string;
  estimatedPrice?: number;
}

interface UseVoiceTagReturn {
  isSupported: boolean;
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  result: VoiceExtractionResult | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  clearResult: () => void;
}

export function useVoiceTag(): UseVoiceTagReturn {
  const { isSupported, isListening, transcript, startListening, stopListening } = useVoiceInput();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<VoiceExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);
    if (isSupported) {
      await startListening();
    }
  }, [isSupported, startListening]);

  const stopRecording = useCallback(async () => {
    await stopListening();
    setIsProcessing(true);
    setError(null);

    try {
      if (!transcript.trim()) {
        setError('No speech detected');
        setIsProcessing(false);
        return;
      }

      const response = await api.post('/voice/extract', {
        transcript,
      });

      const extractedResult: VoiceExtractionResult = response.data;

      if (!extractedResult.name) {
        setError('Could not extract item information from speech');
        setIsProcessing(false);
        return;
      }

      setResult(extractedResult);
      setError(null);
    } catch (err: any) {
      console.error('[useVoiceTag] Error processing voice:', err);
      const message =
        err.response?.status === 400
          ? 'Could not extract item information from speech'
          : 'An error occurred while processing your voice';
      setError(message);
      setResult(null);
    } finally {
      setIsProcessing(false);
    }
  }, [stopListening, transcript]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    isProcessing,
    transcript,
    result,
    error,
    startRecording,
    stopRecording,
    clearResult,
  };
}
