# Feature #42: Voice-to-Tag Integration Guide

## Overview
Voice-to-Tag allows organizers to speak item descriptions and automatically extract:
- Item name (extracted from speech)
- Category (furniture, jewelry, etc.)
- Tags (mid-century-modern, walnut, vintage, etc.)
- Estimated price (based on keywords)

## Components Created

### 1. `VoiceTagButton.tsx`
**Location:** `packages/frontend/components/VoiceTagButton.tsx`

A ready-to-use microphone button component with:
- State indicators: idle (blue) → listening (red pulsing) → processing (amber)
- Browser compatibility detection (Chrome, Edge, Safari)
- Fallback message for unsupported browsers
- Accessible: aria-labels, keyboard activation
- Toast notifications for user feedback

**Props:**
```typescript
interface VoiceTagButtonProps {
  onExtraction: (result: VoiceExtractionResult) => void;
  className?: string;
  disabled?: boolean;
}

interface VoiceExtractionResult {
  name: string;
  tags: string[];
  category: string;
  estimatedPrice?: number;
}
```

**Usage Example:**
```tsx
import VoiceTagButton from '../components/VoiceTagButton';

const MyComponent = () => {
  const handleExtraction = (result) => {
    console.log('Extracted:', result);
    // Populate form fields with result.name, result.tags, result.category
  };

  return (
    <VoiceTagButton
      onExtraction={handleExtraction}
      className="mr-2"
    />
  );
};
```

### 2. `useVoiceTag` Hook
**Location:** `packages/frontend/hooks/useVoiceTag.ts`

Higher-level hook for voice extraction state management and API calls.

**Hook API:**
```typescript
const {
  isSupported,        // bool: Web Speech API available
  isListening,        // bool: currently recording
  isProcessing,       // bool: API call in progress
  transcript,         // string: accumulated speech text
  result,             // VoiceExtractionResult | null
  error,              // string | null
  startRecording,     // () => Promise<void>
  stopRecording,      // () => Promise<void>
  clearResult,        // () => void
} = useVoiceTag();
```

**Usage Example (with custom UI):**
```tsx
import { useVoiceTag } from '../hooks/useVoiceTag';

const CustomVoiceUI = () => {
  const { isListening, isProcessing, result, startRecording, stopRecording } = useVoiceTag();

  if (!result) return <button onClick={startRecording}>Start</button>;

  return (
    <div>
      <h3>{result.name}</h3>
      <p>Category: {result.category}</p>
      <p>Tags: {result.tags.join(', ')}</p>
      {result.estimatedPrice && <p>Est. Price: ${result.estimatedPrice}</p>}
    </div>
  );
};
```

## Integration Points

### Add Items Page (`/organizer/add-items/[saleId]`)
The page already imports `useVoiceInput`. Add `VoiceTagButton` to the form:

```tsx
import VoiceTagButton from '../../../components/VoiceTagButton';

// In the form JSX:
<div className="flex gap-2">
  <input type="text" placeholder="Item name" {...formState.name} />
  <VoiceTagButton
    onExtraction={(result) => {
      // Auto-populate form fields
      formState.name.setValue(result.name);
      formState.tags.setValue(result.tags);
      formState.category.setValue(result.category);
      formState.estimatedPrice.setValue(result.estimatedPrice);
    }}
  />
</div>
```

### Edit Item Page
Same integration pattern as add-items page.

## Backend Endpoint

**POST /api/voice/extract**

Request body:
```json
{
  "transcript": "Victorian mahogany dresser with brass pulls, excellent condition"
}
```

Response:
```json
{
  "name": "Victorian mahogany dresser",
  "category": "Furniture",
  "tags": ["victorian", "walnut", "brass"],
  "estimatedPrice": 120.50
}
```

Error responses:
- `400`: Missing/empty transcript or extraction failed
- `500`: Server error

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Uses `webkitSpeechRecognition` |
| Edge | ✅ Full | Uses `webkitSpeechRecognition` |
| Safari | ⚠️ Limited | iOS 14.5+, requires user gesture |
| Firefox | ❌ No | No Web Speech API support |
| Chrome Mobile | ✅ Full | Works on Android |
| Safari iOS | ✅ Full | Requires iOS 14.5+ |

Component shows graceful fallback message for unsupported browsers.

## Quality Checklist (QA)

- [ ] Test microphone permissions prompt (should appear on first use)
- [ ] Test recording accuracy with various accents/speech patterns
- [ ] Test category detection (e.g., "walnut dresser" → Furniture)
- [ ] Test tag extraction (e.g., "mid-century modern" → mid-century-modern tag)
- [ ] Test price estimation (antique + excellent condition multiplier)
- [ ] Test form population after extraction
- [ ] Test error handling (empty transcript, API failure)
- [ ] Test browser compatibility (Chrome, Edge, Safari)
- [ ] Test mobile responsiveness (button placement on small screens)
- [ ] Test accessibility (keyboard focus, aria-labels)
- [ ] Test multiple recordings in same session
- [ ] Test clearing results and starting new recording

## Known Limitations

1. **No auth required** — Backend endpoint is public (MVP decision)
2. **English-only** — Speech recognition set to `en-US` language
3. **No audio storage** — Transcripts sent to backend, no recordings saved
4. **Single-use recording** — Component expects one transcription per extraction
5. **Internet required** — Web Speech API requires active network connection
6. **Real-time feedback** — Interim results shown as tooltip (may be distracting)

## Future Enhancements

1. Add language selection dropdown
2. Add manual transcript editing before submission
3. Add microphone level indicator (audio waveform)
4. Add retry/re-record flow without clearing form
5. Add confidence scoring for extracted fields
6. Add AI validation (check extracted items against inventory)
7. Add audio storage for quality analysis

## Testing Endpoints

Local development:
- Frontend: `http://localhost:3000/organizer/add-items/[saleId]`
- Backend: `http://localhost:5000/api/voice/extract`

Production:
- Frontend: `https://findasale.vercel.app/organizer/add-items/[saleId]`
- Backend: `https://api.findasale.com/api/voice/extract` (Railway)
