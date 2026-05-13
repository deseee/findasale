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
  // Last seen interim transcript. Web Speech API doesn't always promote the in-flight
  // utterance to `isFinal: true` before recognition.stop() fires — especially on mobile
  // or when the user taps stop while still speaking. We retain the latest interim so
  // stopListening can resolve with SOMETHING rather than an empty string.
  const latestInterimRef = useRef<string>('');
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
      latestInterimRef.current = '';
      setErrorCode('');
    };

    recognition.onresult = (event: any) => {
      // Rebuild transcript from the authoritative results array on every event,
      // rather than appending. Web Speech in continuous mode can re-emit the same
      // final result across multiple events (especially when Chrome internally
      // restarts the recognition session on brief silence), and append-based
      // accumulation caused the "2 lb 222 lb 2 lb 8 2 lb 8 oz..." duplication.
      // event.results is the SR API's source of truth — iterate it whole each time.
      const finalParts: string[] = [];
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const segment = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          if (segment) finalParts.push(segment);
        } else {
          interim += segment + ' ';
        }
      }
      // Collapse consecutive identical segments (e.g., "2 lb 2 lb")
      const deduped: string[] = [];
      for (const p of finalParts) {
        if (deduped.length === 0 || deduped[deduped.length - 1].toLowerCase() !== p.toLowerCase()) {
          deduped.push(p);
        }
      }
      transcriptRef.current = deduped.join(' ');
      latestInterimRef.current = interim.trim();
      setTranscript(transcriptRef.current || latestInterimRef.current);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (endResolverRef.current) {
        // Prefer accumulated final results; fall back to the latest interim if the
        // user stopped before the API promoted the current utterance to isFinal.
        const result = transcriptRef.current || latestInterimRef.current;
        endResolverRef.current(result);
        endResolverRef.current = null;
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('[useVoiceInput] Speech recognition error:', event.error);
      setErrorCode(event.error || 'unknown');
      setIsListening(false);
      if (endResolverRef.current) {
        // Same interim fallback as onend
        const result = transcriptRef.current || latestInterimRef.current;
        endResolverRef.current(result);
        endResolverRef.current = null;
      }
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = async () => {
    if (!recognitionRef.current || !isSupported) return;
    setTranscript('');
    transcriptRef.current = '';
    latestInterimRef.current = '';
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
