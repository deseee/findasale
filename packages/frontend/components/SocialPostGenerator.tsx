import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface Props {
  saleId: string;
  saleTitle: string;
  onClose: () => void;
}

type Platform = 'instagram' | 'facebook' | 'nextdoor';

const PLATFORMS: { id: Platform; label: string; icon: string; color: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: '📸', color: 'bg-pink-500' },
  { id: 'facebook', label: 'Facebook', icon: '👥', color: 'bg-blue-600' },
  { id: 'nextdoor', label: 'Nextdoor', icon: '🏘️', color: 'bg-green-600' },
];

const SocialPostGenerator: React.FC<Props> = ({ saleId, saleTitle, onClose }) => {
  const [platform, setPlatform] = useState<Platform>('facebook');
  const [highlights, setHighlights] = useState('');
  const [generatedPost, setGeneratedPost] = useState('');
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post('/social-post/generate', { saleId, platform, highlights }).then(r => r.data),
    onSuccess: (data) => {
      setGeneratedPost(data.post);
      setCopied(false);
    },
    onError: () => showToast('Failed to generate post', 'error'),
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleRegenerate = () => {
    setGeneratedPost('');
    generateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-warm-200">
          <div>
            <h2 className="text-xl font-bold text-warm-900">📣 Social Media Post</h2>
            <p className="text-sm text-warm-500 mt-0.5">{saleTitle}</p>
          </div>
          <button onClick={onClose} className="text-warm-400 hover:text-warm-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Platform selector */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-3">Choose platform</label>
            <div className="flex gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPlatform(p.id); setGeneratedPost(''); }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition flex flex-col items-center gap-1 border-2 ${
                    platform === p.id
                      ? 'border-amber-500 bg-amber-50 text-amber-800'
                      : 'border-warm-200 bg-white text-warm-700 hover:border-warm-300'
                  }`}
                >
                  <span className="text-xl">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional highlights */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Highlights to mention <span className="text-warm-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={highlights}
              onChange={e => setHighlights(e.target.value)}
              rows={2}
              placeholder="e.g. Rare mid-century furniture, early bird 20% off, free parking..."
              className="w-full border border-warm-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* Generate button */}
          {!generatedPost && (
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-60"
            >
              {generateMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Generating...
                </span>
              ) : '✨ Generate Post'}
            </button>
          )}

          {/* Generated post */}
          {generatedPost && (
            <div className="space-y-3">
              <div className="border-2 border-amber-200 rounded-xl p-4 bg-amber-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    {PLATFORMS.find(p => p.id === platform)?.icon} {platform} post
                  </span>
                  <span className="text-xs text-warm-400">{generatedPost.length} chars</span>
                </div>
                <p className="text-sm text-warm-900 whitespace-pre-wrap leading-relaxed">{generatedPost}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={generateMutation.isPending}
                  className="px-4 py-2.5 border border-warm-300 rounded-xl text-sm font-semibold text-warm-700 hover:bg-warm-50 transition disabled:opacity-60"
                >
                  🔄 Retry
                </button>
              </div>

              <p className="text-xs text-warm-400 text-center">
                Tip: Edit the text before posting to add your personal touch
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SocialPostGenerator;
