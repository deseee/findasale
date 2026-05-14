/**
 * VoiceDescriptionInput.tsx — Feature #42: Voice-to-Description UI Component
 *
 * A microphone button positioned alongside a description textarea that:
 * - Records voice input via Web Speech API (useVoiceInput hook)
 * - Sends transcript to backend voice-extract endpoint
 * - Always saves the full transcript/description
 * - Silent auto-fill: empty fields are populated immediately, no chip UX
 * - Single summary toast confirms what got filled
 * - Graceful degradation for unsupported browsers
 */

import React, { useState } from 'react';
import { Mic } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useToast } from './ToastContext';
import api from '../lib/api';

interface VoiceExtractionResult {
  name: string;
  tags: string[];
  category: string;
  estimatedPrice?: number;
  description?: string;
  weightOz?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
}

interface VoiceDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  onFieldUpdate?: (fields: {
    title?: string;
    category?: string;
    tags?: string[];
    price?: string;
    packageWeightOz?: string;
    packageLengthIn?: string;
    packageWidthIn?: string;
    packageHeightIn?: string;
    description: string;
  }) => void;
  existingFields?: {
    title?: string;
    category?: string;
    tags?: string[];
    price?: string;
    packageWeightOz?: string;
    packageLengthIn?: string;
    packageWidthIn?: string;
    packageHeightIn?: string;
  };
  disabled?: boolean;
  /**
   * Item ID for the append-description endpoint. When provided, voice transcripts
   * are POSTed to /items/:id/description/append (server-side merge, organizer-first
   * ordering, voice locks description against future AI overwrites). When omitted
   * (new-item drafts not yet saved), the component falls back to a local concat
   * that preserves any typed text in the textarea.
   */
  itemId?: string;
  /**
   * Fires after the server-side append endpoint successfully persists. The parent
   * can use this to sync external caches (e.g. react-query) so a subsequent refetch
   * or useEffect doesn't clobber the new description. Receives the composed description
   * returned by the server.
   */
  onAppendPersisted?: (description: string) => void;
}

type RecordingState = 'idle' | 'listening' | 'processing';

const VoiceDescriptionInput: React.FC<VoiceDescriptionInputProps> = ({
  value,
  onChange,
  onFieldUpdate,
  existingFields = {},
  disabled = false,
  itemId,
  onAppendPersisted,
}) => {
  const { showToast } = useToast();
  const { isSupported, isListening, transcript, startListening, stopListening, errorCode } = useVoiceInput();
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

  /** Try to coax Chrome to re-show the mic prompt (works when permission state
   * is 'prompt' rather than fully 'denied'). Pure browser API — web pages cannot
   * programmatically open chrome:// settings, so a hard 'denied' still requires
   * the user to unblock manually via the lock icon. */
  const attemptMicRecovery = async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  };

  const handleStopRecording = async () => {
    // S724 closure fix + 2026-05-12 append contract:
    // stopListening returns the final transcript, avoiding the stale-state race.
    const finalTranscript = await stopListening();
    setRecordingState('processing');
    setIsProcessing(true);

    try {
      // Surface permission/recognition errors that previously failed silently
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        const recovered = await attemptMicRecovery();
        if (recovered) {
          showToast('Mic permission granted. Tap the mic again to record.', 'success');
        } else {
          showToast(
            'Mic blocked. Click the 🔒 in your address bar → Site settings → Microphone → Allow, then reload.',
            'error',
          );
        }
        setRecordingState('idle');
        setIsProcessing(false);
        return;
      }

      if (!finalTranscript.trim()) {
        if (errorCode && errorCode !== 'no-speech' && errorCode !== '') {
          showToast(`Voice recognition error (${errorCode}). Please try again.`, 'error');
        } else {
          showToast('No speech detected. Please try again.', 'info');
        }
        setRecordingState('idle');
        setIsProcessing(false);
        return;
      }

      // Extract structured fields first so we can pass weight/dim context to append.
      // Backend uses them to strip shipping phrases from the saved description
      // (e.g. "12 oz" captured in weightOz → "12" stripped from the voice note text).
      // No chips/Accept/Keep UX — empty fields are filled immediately; filled fields are skipped.
      const response = await api.post('/voice/extract', {
        transcript: finalTranscript,
      });

      const result: VoiceExtractionResult = response.data;

      // Append the transcript to item.description.
      // If itemId is known, route through the server-side append endpoint so the
      // organizer-first ordering and voice-locks-description rules apply.
      // If no itemId (new draft not yet saved), concat locally to preserve typed text.
      let newDescription: string;
      if (itemId) {
        try {
          const appendRes = await api.post(`/items/${itemId}/description/append`, {
            text: finalTranscript,
            source: 'VOICE',
            // Forward extracted dims so backend can strip shipping phrases that were
            // captured in structured fields (e.g. "12 oz" → removes "12" from desc).
            ...(result.weightOz !== undefined ? { weightOz: result.weightOz } : {}),
            ...(result.lengthIn !== undefined ? { lengthIn: result.lengthIn } : {}),
            ...(result.widthIn !== undefined ? { widthIn: result.widthIn } : {}),
            ...(result.heightIn !== undefined ? { heightIn: result.heightIn } : {}),
          });
          newDescription = appendRes.data?.description ?? finalTranscript;
          // Notify parent so it can sync external caches (react-query) before any
          // useEffect-driven refetch clobbers formData with stale cached data.
          if (onAppendPersisted) {
            onAppendPersisted(newDescription);
          }
        } catch (appendErr: any) {
          console.error('[VoiceDescriptionInput] append failed:', appendErr);
          showToast(appendErr?.response?.data?.message || 'Could not save voice note.', 'error');
          setRecordingState('idle');
          setIsProcessing(false);
          return;
        }
      } else {
        // Local concat — preserves typed text instead of overwriting.
        // Adds a sentence separator only when prior text doesn't already end in punctuation.
        const prior = (value || '').trimEnd();
        if (!prior) {
          newDescription = finalTranscript;
        } else {
          newDescription = /[.!?]$/.test(prior)
            ? prior + ' ' + finalTranscript
            : prior + '. ' + finalTranscript;
        }
      }

      onChange(newDescription);

      // Build auto-fill update: only populate empty fields (never overwrite existing values)
      const autoUpdates: Parameters<NonNullable<typeof onFieldUpdate>>[0] = {
        description: newDescription,
      };
      const filledParts: string[] = [];

      if (result.name && !existingFields.title) {
        autoUpdates.title = result.name;
        filledParts.push('title');
      }

      if (result.category && !existingFields.category) {
        autoUpdates.category = result.category;
        filledParts.push('category');
      }

      if (result.tags && result.tags.length > 0) {
        const existingTags = existingFields.tags || [];
        const newTags = result.tags.filter((tag: string) => !existingTags.includes(tag));
        if (newTags.length > 0) {
          autoUpdates.tags = [...existingTags, ...newTags];
          filledParts.push(`tags +${newTags.length}`);
        }
      }

      if (result.estimatedPrice && !existingFields.price) {
        autoUpdates.price = result.estimatedPrice.toString();
        filledParts.push(`price $${result.estimatedPrice.toFixed(2)}`);
      }

      if (result.weightOz && !existingFields.packageWeightOz) {
        autoUpdates.packageWeightOz = result.weightOz.toString();
        filledParts.push(`weight ${result.weightOz}oz`);
      }

      if (result.lengthIn && !existingFields.packageLengthIn) {
        autoUpdates.packageLengthIn = result.lengthIn.toString();
      }
      if (result.widthIn && !existingFields.packageWidthIn) {
        autoUpdates.packageWidthIn = result.widthIn.toString();
      }
      if (result.heightIn && !existingFields.packageHeightIn) {
        autoUpdates.packageHeightIn = result.heightIn.toString();
      }

      // Include dims in summary if all three were filled
      if (result.lengthIn && !existingFields.packageLengthIn &&
          result.widthIn && !existingFields.packageWidthIn &&
          result.heightIn && !existingFields.packageHeightIn) {
        filledParts.push(`dims ${result.lengthIn}×${result.widthIn}×${result.heightIn} in`);
      }

      // Return to idle state
      setRecordingState('idle');
      setIsProcessing(false);

      // Fire one combined update to parent (description + all auto-filled fields)
      if (onFieldUpdate) {
        onFieldUpdate(autoUpdates);
      }

      // Show single summary toast
      const toastMsg = filledParts.length > 0
        ? `Voice saved. Filled: ${filledParts.join(', ')}`
        : 'Voice description saved.';
      showToast(toastMsg, 'success');

    } catch (error: any) {
      console.error('[VoiceDescriptionInput] Error processing voice:', error);
      setRecordingState('idle');
      setIsProcessing(false);

      const message =
        error.response?.status === 400
          ? 'Could not extract information from speech.'
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

  return (
    <div className="space-y-2">
      {/* Mic button positioned in the label area */}
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300">Description</label>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isDisabled}
          className={`inline-flex items-center justify-center rounded p-1.5 transition-all ${
            isDisabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : recordingState === 'listening'
                ? 'bg-red-500 text-white animate-pulse'
                : recordingState === 'processing'
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300 active:bg-gray-400 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
          aria-label={
            recordingState === 'listening'
              ? 'Stop recording'
              : recordingState === 'processing'
                ? 'Processing voice...'
                : 'Record description with voice'
          }
          title={
            recordingState === 'listening'
              ? 'Click to stop recording'
              : recordingState === 'processing'
                ? 'Processing...'
                : 'Click to record description'
          }
        >
          {recordingState === 'processing' ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 0 20" strokeWidth="2" />
            </svg>
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        disabled={disabled}
        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      />

      {/* Recording state indicator */}
      {recordingState === 'listening' && (
        <div className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-red-600 dark:bg-red-400 rounded-full animate-pulse" />
          Listening...
        </div>
      )}
      {recordingState === 'processing' && (
        <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold">Processing...</div>
      )}

      {/* Live transcript display during recording */}
      {isListening && transcript && (
        <div className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded px-3 py-2 max-w-full break-words">
          <strong>Transcript:</strong> {transcript}
        </div>
      )}
    </div>
  );
};

export default VoiceDescriptionInput;
