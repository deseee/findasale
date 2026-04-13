/**
 * VoiceTagButton.tsx — Feature #42: Voice-to-Tag UI Component
 *
 * A microphone button that:
 * - Records voice input via Web Speech API (useVoiceInput hook)
 * - Sends transcript to backend voice-extract endpoint
 * - Returns extracted tags/category/name/price via callback
 * - Shows recording state (idle → listening → processing)
 * - Accessible: aria-labels, keyboard activation
 * - Graceful degradation for unsupported browsers
 */

import React, { useState } from 'react';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useToast } from './ToastContext';
import api from '../lib/api';

interface VoiceExtractionResult {
  name: string;
  tags: string[];
  category: string;
  estimatedPrice?: number;
}

interface VoiceTagButtonProps {
  onExtraction: (result: VoiceExtractionResult) => void;
  className?: string;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'listening' | 'processing';

const VoiceTagButton: React.FC<VoiceTagButtonProps> = ({
  onExtraction,
  className = '',
  disabled = false,
}) => {
  const { showToast } = useToast();
  const { isSupported, isListening, transcript, startListening, stopListening } = useVoiceInput();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [isProcessing, setIsProcessing] = useState(false);

  // Determine button disabled state
  const isDisabled = disabled || !isSupported || isProcessing;

  const handleStartRecording = async () => {
    if (!isSupported) {
      showToast('Voice input is not supported in your browser. Try Chrome or Edge.', 'error');
      return;
    }

    setRecordingState('listening');
    await startListening();
  };

  const handleStopRecording = async () => {
    await stopListening();
    setRecordingState('processing');
    setIsProcessing(true);

    try {
      if (!transcript.trim()) {
        showToast('No speech detected. Please try again.', 'info');
        setRecordingState('idle');
        setIsProcessing(false);
        return;
      }

      // Send transcript to backend for extraction
      const response = await api.post('/voice/extract', {
        transcript,
      });

      const result: VoiceExtractionResult = response.data;

      // Validate response
      if (!result.name) {
        showToast('Could not extract item information. Please try again.', 'info');
        setRecordingState('idle');
        setIsProcessing(false);
        return;
      }

      // Return to idle state
      setRecordingState('idle');
      setIsProcessing(false);

      // Call parent callback with extracted data
      onExtraction(result);
      showToast(`Extracted: ${result.name}`, 'success');
    } catch (error: any) {
      console.error('[VoiceTagButton] Error processing voice:', error);
      setRecordingState('idle');
      setIsProcessing(false);

      const message =
        error.response?.status === 400
          ? 'Could not extract item information from speech.'
          : 'An error occurred while processing your voice. Please try again.';
      showToast(message, 'error');
    }
  };

  const handleToggle = () => {
    if (recordingState === 'idle') {
      handleStartRecording();
    } else if (recordingState === 'listening') {
      handleStopRecording();
    }
  };

  // Render unsupported message
  if (!isSupported) {
    return (
      <button
        disabled
        className={`relative inline-flex items-center justify-center rounded-lg bg-gray-200 p-2 text-gray-400 cursor-not-allowed ${className}`}
        aria-label="Voice input not supported"
        title="Voice input is not supported in your browser"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 9a1 1 0 10-2 0 5 5 0 11-5.88-4.868 1 1 0 10-1.24 1.736A7.001 7.001 0 0011 14.93z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    );
  }

  // Render microphone button with state indicators
  return (
    <div className="relative inline-block">
      <button
        onClick={handleToggle}
        disabled={isDisabled}
        className={`relative inline-flex items-center justify-center rounded-lg p-2 transition-all ${
          isDisabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : recordingState === 'listening'
              ? 'bg-red-500 text-white animate-pulse'
              : recordingState === 'processing'
                ? 'bg-amber-500 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
        } ${className}`}
        aria-label={
          recordingState === 'listening'
            ? 'Stop recording'
            : recordingState === 'processing'
              ? 'Processing voice...'
              : 'Start voice recording'
        }
        title={
          recordingState === 'listening'
            ? 'Click to stop recording'
            : recordingState === 'processing'
              ? 'Processing...'
              : 'Click to start voice recording'
        }
      >
        {recordingState === 'processing' ? (
          // Spinner icon for processing state
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="10" strokeWidth="2" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 0 20" strokeWidth="2" />
          </svg>
        ) : (
          // Microphone icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" />
            <path d="M5.5 9.643a5.5 5.5 0 0 0 9 0M12 12c0 .464-.084.908-.243 1.328a.75.75 0 1 0 1.454.385c.179-.598.286-1.222.286-1.863 0-.464.084-.908.243-1.328a.75.75 0 0 0-1.454-.385c-.179.598-.286 1.222-.286 1.863z" />
            <path d="M16 12a4 4 0 0 1-8 0M2 12a10 10 0 1 1 20 0 10 10 0 0 1-20 0z" />
          </svg>
        )}
      </button>

      {/* Status text for accessibility/clarity */}
      {recordingState === 'listening' && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-red-600 font-semibold whitespace-nowrap">
          Listening...
        </span>
      )}
      {recordingState === 'processing' && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-amber-600 font-semibold whitespace-nowrap">
          Processing...
        </span>
      )}

      {/* Live transcript display (debug/UX feedback) */}
      {isListening && transcript && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-100 text-gray-800 text-xs rounded px-2 py-1 max-w-xs whitespace-normal break-words z-10 shadow-sm">
          {transcript}
        </div>
      )}
    </div>
  );
};

export default VoiceTagButton;
