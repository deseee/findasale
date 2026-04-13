/**
 * useVoiceInput.ts — Feature #42: Web Speech API Hook
 *
 * Provides browser-based voice recording abstraction.
 * - SSR-safe: checks typeof window before accessing SpeechRecognition
 * - Feature detection: isSupported flag for browsers without Web Speech support
 * - State management: isListening, transcript (accumulated text)
 * - Methods: startListening(), stopListening()
 */

import { useState, useRef, useEffect } from 'react';

interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

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

    // Accumulate interim + final results
    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          // Append final result
          setTranscript((prev) => (prev ? prev + ' ' + transcriptSegment : transcriptSegment));
        } else {
          // Show interim (don't commit)
          interim += transcriptSegment;
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.warn('[useVoiceInput] Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = async () => {
    if (!recognitionRef.current || !isSupported) return;
    setTranscript('');
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.warn('[useVoiceInput] Error starting recognition:', error);
    }
  };

  const stopListening = async () => {
    if (!recognitionRef.current || !isSupported) return;
    try {
      recognitionRef.current.stop();
    } catch (error) {
      console.warn('[useVoiceInput] Error stopping recognition:', error);
    }
  };

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
  };
}
