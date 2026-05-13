/**
 * useVoiceInput.ts — Feature #42: Web Speech API Hook
 *
 * Provides browser-based voice recording abstraction.
 * - SSR-safe: checks typeof window before accessing SpeechRecognition
 * - Feature detection: isSupported flag for browsers without Web Speech support
 * - State management: isListening, transcript (accumulated text)
 * - Methods: startListening(), stopListening()
 *
 * stopListening() resolves with the FINAL transcript so callers can avoid
 * the React-state stale-closure bug (S724 / 2026-05-12). The transcript state
 * is also updated for UI consumers; the ref guarantees correctness for callers
 * that read the value inside the same tick as stopListening().
 */

import { useState, useRef, useEffect } from 'react';

interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  /** Resolves with the final accumulated transcript (closure-safe). */
  startListening: () => Promise<void>;
  stopListening: () => Promise<string>;
  /** Last error code from the SpeechRecognition API ('' = none). */
  errorCode: string;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const endResolverRef = useRef<((value: string) => void) | null>(null);

  // Initialize on mount (after hydration)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      transcriptRef.current = '';
      setErrorCode('');
    };

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const segment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          // Append final result to both state and ref (ref is closure-safe)
          transcriptRef.current = transcriptRef.current
            ? transcriptRef.current + ' ' + segment
            : segment;
          setTranscript(transcriptRef.current);
        }
        // Interim results aren't committed — UI watches transcript state
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Resolve any pending stopListening promise with the final transcript
      if (endResolverRef.current) {
        endResolverRef.current(transcriptRef.current);
        endResolverRef.current = null;
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('[useVoiceInput] Speech recognition error:', event.error);
      setErrorCode(event.error || 'unknown');
      setIsListening(false);
      if (endResolverRef.current) {
        endResolverRef.current(transcriptRef.current);
        endResolverRef.current = null;
      }
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = async () => {
    if (!recognitionRef.current || !isSupported) return;
    setTranscript('');
    transcriptRef.current = '';
    setErrorCode('');
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.warn('[useVoiceInput] Error starting recognition:', error);
      setErrorCode('start-failed');
    }
  };

  const stopListening = async (): Promise<string> => {
    if (!recognitionRef.current || !isSupported) {
      return transcriptRef.current;
    }
    // Already stopped — return immediately
    if (!isListening) {
      return transcriptRef.current;
    }
    return new Promise<string>((resolve) => {
      endResolverRef.current = resolve;
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.warn('[useVoiceInput] Error stopping recognition:', error);
        endResolverRef.current = null;
        resolve(transcriptRef.current);
      }
    });
  };

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
    errorCode,
  };
}
