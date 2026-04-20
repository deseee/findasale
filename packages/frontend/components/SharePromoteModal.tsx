/**
 * DEPRECATED S522 — Content moved inline to promote/[saleId].tsx
 *
 * Share & Promote Modal
 *
 * Feature #131: Share & Promote Templates (Option B — Expand)
 * Provides organizers with multiple pre-templated formats for promoting their sales.
 * S520: Overhauled — fixed time bug, reordered tabs, added Spotlight Item tab,
 * added items prop, removed garbage time display.
 *
 * TODO: Pending Patrick confirmation before removal.
 */

import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { useToast } from './ToastContext';

interface Sale {
  id: string;
  title: string;
  description?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  startDate: string;
  endDate: string;
  tags?: string[];
  saleType?: string;
}

interface SpotlightTemplate {
  text: string;
  hashtags: string[];
  charCount: number;
  overLimit: boolean;
  platformLimit: number;
  photoUrl: string | null;
}

interface SharePromoteModalProps {
  sale: Sale;
  itemCount?: number;
  items?: Array<{ id: string; title: string; price: number | null }>;
  isOpen: boolean;
  onClose: () => void;
}

type TemplateType =
  | 'social'
  | 'nextdoor'
  | 'neighborhood'
  | 'threads'
  | 'email'
  | 'flyer'
  | 'pinterest'
  | 'tiktok'
  | 'spotlight';

interface TemplateContent {
  title: string;
  content: string;
  icon: string;
  description: string;
}

const getSaleTypeLabel = (saleType?: string): string => {
  if (!saleType) return 'estate sale';
  const labels: Record<string, string> = {
    ESTATE: 'estate sale',
    YARD: 'yard sale',
    AUCTION: 'auction',
    FLEA_MARKET: 'flea market',
    CONSIGNMENT: 'consignment sale',
    CHARITY: 'charity sale',
    BUSINESS_CORPORATE: 'corporate sale',
  };
  return labels[saleType] || 'sale';
};

const getHashtagsForSaleType = (saleType?: string): string => {
  const hashtagMap: Record<string, string> = {
    ESTATE: '#estatesale #garagesale #findasale',
    YARD: '#yardsale #garagesale #findasale',
    AUCTION: '#auction #estatesale #findasale',
    FLEA_MARKET: '#fleamarket #yardsale #findasale',
    CONSIGNMENT: '#consignment #thrifting #findasale',
    CHARITY: '#charity #yardsale #findasale',
    BUSINESS_CORPORATE: '#corporate #businesssale #findasale',
  };
  return hashtagMap[saleType ?? ''] || '#garagesale #yardsale #estatesale #findasale';
};

const SharePromoteModal: React.FC<SharePromoteModalProps> = ({
  sale,
  itemCount = 0,
  items = [],
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TemplateType>('social');
  const [copiedTab, setCopiedTab] = useState<TemplateType | null>(null);

  // Spotlight tab state
  const [spotlightItemId, setSpotlightItemId] = useState<string>('');
  const [spotlightTone, setSpotlightTone] = useState<'casual' | 'professional' | 'friendly'>('casual');
  const [spotlightPlatform, setSpotlightPlatform] = useState<'instagram' | 'facebook'>('instagram');
  const [spotlightTemplate, setSpotlightTemplate] = useState<SpotlightTemplate | null>(null);
  const [loadingSpotlight, setLoadingSpotlight] = useState(false);

  // Auto-select first item for spotlight
  useEffect(() => {
    if (items.length > 0 && !spotlightItemId) {
      setSpotlightItemId(items[0].id);
    }
  }, [items, spotlightItemId]);

  // Fetch spotlight template when item/tone/platform changes
  useEffect(() => {
    if (!spotlightItemId || activeTab !== 'spotlight') return;
    const fetchTemplate = async () => {
      try {
        setLoadingSpotlight(true);
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const res = await fetch(
          `${apiBase}/social/${spotlightItemId}/template?tone=${spotlightTone}&platform=${spotlightPlatform}`,
          { headers: { Authorization: `Bearer ${token || ''}` } }
        );
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json() as SpotlightTemplate;
        setSpotlightTemplate(data);
      } catch {
        setSpotlightTemplate(null);
      } finally {
        setLoadingSpotlight(false);
      }
    };
    fetchTemplate();
  }, [spotlightItemId, spotlightTone, spotlightPlatform, activeTab]);

  if (!isOpen) return null;

  const saleTypeLabel = getSaleTypeLabel(sale.saleType);

  // Format dates — no time display (Sale schema has no startTime/endTime fields)
  const startDate = format(parseISO(sale.startDate), 'MMM d');
  const endDate = format(parseISO(sale.endDate), 'MMM d, yyyy');
  const fullStartDate = format(parseISO(sale.startDate), 'EEEE, MMM d, yyyy');
  const fullEndDate = format(parseISO(sale.endDate), 'EEEE, MMM d, yyyy');
  const address = `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`;

  const templates: Record<Exclude<TemplateType, 'spotlight'>, TemplateContent> = {
    social: {
      title: 'Social Post',
      icon: '📱',
      description: 'Facebook/Instagram caption with sale details',
      content: `🏷️ ${sale.title}

Find amazing deals on quality items! ${itemCount ? `We have ${itemCount}+ items` : 'Great selection of items available'}.

📍 ${address}
📅 ${startDate} - ${endDate}

${sale.tags && sale.tags.length > 0 ? `#${sale.tags.join(' #')} ` : ''}#LocalSales ${getHashtagsForSaleType(sale.saleType)} #Bargains #ShoppingLocal

Don't miss out! Visit us today.`,
    },
    nextdoor: {
      title: 'Nextdoor',
      icon: '🏡',
      description: 'Neighbor-to-neighbor tone with local focus',
      content: `Neighbors — ${sale.title} this ${startDate} - ${endDate} at ${address}

${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} open to the public. Items include furniture, household goods, collectibles, and more. Early arrival recommended.

Full item list at finda.sale — search "${sale.city}"

Hope to see some familiar faces!`,
    },
    neighborhood: {
      title: 'Neighborhood Post',
      icon: '🏘️',
      description: 'Conversational local group style',
      content: `Hey neighbors! 👋

Just wanted to give you a heads up about a sale happening in our area that you might be interested in:

**${sale.title}**

It's running from ${fullStartDate} through ${fullEndDate}.

📍 Location: ${address}

They've got ${itemCount ? `${itemCount}+ items` : 'a lot of items'} available, so if you're into ${saleTypeLabel}s or looking for good deals, it's definitely worth checking out!

${sale.tags && sale.tags.length > 0 ? `They specialize in ${sale.tags.join(', ')}.\n\n` : ''}I'm planning to stop by and thought I'd share in case anyone else wants to go. Let me know if you end up going!

See you there! 🛍️`,
    },
    threads: {
      title: 'Threads',
      icon: '💬',
      description: 'Conversational style, minimal hashtags',
      content: `Running a ${saleTypeLabel} this weekend in ${sale.city} — ${sale.title}

Lots of ${sale.title} items: furniture, vintage pieces, collectibles, and more. Everything must go.

📍 ${address} · ${startDate} - ${endDate}
Browse the inventory at finda.sale`,
    },
    email: {
      title: 'Email Invite',
      icon: '📧',
      description: 'Subject line + body for email campaigns',
      content: `SUBJECT: You're invited to ${sale.title} — Limited time sale!

---

Hello Friend,

I'm excited to invite you to our upcoming sale:

${sale.title}

When:
${fullStartDate} through ${fullEndDate}
[Your Hours]

Where:
${address}

What to expect:
${itemCount ? `Over ${itemCount} quality items` : 'A wide selection of quality items'} at unbeatable prices. Whether you're looking for treasures or everyday finds, we have something for everyone!

${sale.description ? `About this sale: ${sale.description}\n\n` : ''}Why shop with us?
• Quality merchandise
• Competitive pricing
• First-come, first-served items
• Friendly staff

We look forward to seeing you there!

Best regards,
[Your Name]`,
    },
    flyer: {
      title: 'Flyer Copy',
      icon: '📄',
      description: 'Headline + bullet points + CTA for print/digital',
      content: `✨ ${sale.title.toUpperCase()} ✨

DATE: ${fullStartDate} – ${fullEndDate}
TIME: [Your Hours]
LOCATION: ${address}

HIGHLIGHTS:
• ${itemCount ? `${itemCount}+ quality items` : 'Wide selection of items'}
• Quality merchandise
• Unbeatable prices
• First come, first served
${sale.description ? `• ${sale.description.substring(0, 60)}...` : ''}

👉 DON'T MISS THIS OPPORTUNITY!

DIRECTIONS: ${sale.city}, ${sale.state}
Questions? [Your Phone] | [Your Email]`,
    },
    pinterest: {
      title: 'Pinterest',
      icon: '📌',
      description: 'Keyword-rich discovery-oriented description',
      content: `${sale.title} — ${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} in ${sale.city}

Discover unique vintage furniture, antiques, collectibles, and one-of-a-kind finds at this ${sale.city} ${saleTypeLabel}. Browse curated items from ${startDate} - ${endDate}. Shop in person or browse the full inventory online at FindA.Sale.

📍 ${address}
🗓️ ${startDate} - ${endDate}

${getHashtagsForSaleType(sale.saleType)}

Find more ${saleTypeLabel}s near you → finda.sale`,
    },
    tiktok: {
      title: 'TikTok',
      icon: '🎬',
      description: 'Short, punchy caption with trending hashtags',
      content: `${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} haul alert 🏷️ ${sale.title} in ${sale.city} — furniture, collectibles, vintage finds and more

📍 ${address}
🗓️ ${startDate} - ${endDate}
🔗 Link in bio → finda.sale

${getHashtagsForSaleType(sale.saleType)} #thrifting #vintagefinds #${sale.city.toLowerCase().replace(/\s/g, '')}thrift #secondhand #thrifthaul`,
    },
  };

  const TAB_ORDER: TemplateType[] = [
    'social',
    'nextdoor',
    'neighborhood',
    'threads',
    'email',
    'flyer',
    'pinterest',
    'tiktok',
    'spotlight',
  ];

  const TAB_META: Record<TemplateType, { icon: string; title: string }> = {
    social: { icon: '📱', title: 'Social Post' },
    nextdoor: { icon: '🏡', title: 'Nextdoor' },
    neighborhood: { icon: '🏘️', title: 'Neighborhood' },
    threads: { icon: '💬', title: 'Threads' },
    email: { icon: '📧', title: 'Email Invite' },
    flyer: { icon: '📄', title: 'Flyer Copy' },
    pinterest: { icon: '📌', title: 'Pinterest' },
    tiktok: { icon: '🎬', title: 'TikTok' },
    spotlight: { icon: '🔦', title: 'Spotlight Item' },
  };

  const saleUrl = typeof window !== 'undefined' ? `${window.location.origin}/sales/${sale.id}` : '';

  const handleCopy = async () => {
    let textToCopy = '';
    if (activeTab === 'spotlight') {
      if (!spotlightTemplate) return;
      textToCopy = `${spotlightTemplate.text}\n\n${spotlightTemplate.hashtags.join(' ')}`;
    } else {
      textToCopy = templates[activeTab].content;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedTab(activeTab);
      showToast('Copied to clipboard!', 'success');
      setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Copied to clipboard!', 'success');
      setCopiedTab(activeTab);
      setTimeout(() => setCopiedTab(null), 2000);
    }
  };

  const handleSocialShare = () => {
    if (activeTab === 'social') {
      const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(saleUrl)}`;
      window.open(facebookUrl, 'facebook-share', 'width=600,height=400');
    } else if (activeTab === 'threads') {
      const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(templates.threads.content)}`;
      window.open(threadsUrl, 'threads-share', 'width=600,height=400');
    } else if (activeTab === 'nextdoor') {
      handleCopy();
      showToast('Copied! Opening Nextdoor — paste your post there.', 'info');
      setTimeout(() => { window.open('https://nextdoor.com/news_feed/', 'nextdoor-open'); }, 500);
    } else if (activeTab === 'pinterest') {
      const pinterestUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(saleUrl)}&description=${encodeURIComponent(templates.pinterest.content.substring(0, 100))}`;
      window.open(pinterestUrl, 'pinterest-share', 'width=600,height=400');
    } else if (activeTab === 'tiktok') {
      handleCopy();
      showToast('Copied! Open TikTok and paste in your video caption.', 'info');
      setTimeout(() => { window.open('https://www.tiktok.com/', 'tiktok-open'); }, 500);
    } else {
      handleCopy();
    }
  };

  const showShareButton = ['social', 'threads', 'nextdoor', 'pinterest', 'tiktok'].includes(activeTab);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Share & Promote</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-amber-800 rounded p-1 transition"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sale Info Preview */}
        <div className="px-6 py-3 bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
          <p className="font-semibold text-warm-900 dark:text-warm-100">{sale.title}</p>
          <p className="text-sm text-warm-700 dark:text-warm-300">
            {startDate} - {endDate} • {address}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-800">
          {TAB_ORDER.map((type) => (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex-shrink-0 px-4 py-3 font-medium text-sm transition whitespace-nowrap ${
                activeTab === type
                  ? 'border-b-2 border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-gray-900'
                  : 'text-warm-700 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-200'
              }`}
            >
              <span className="mr-1">{TAB_META[type].icon}</span>
              {TAB_META[type].title}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex flex-col h-[calc(90vh-200px)] overflow-hidden">
          {/* Description */}
          <div className="px-6 py-2 bg-amber-50 dark:bg-gray-750 border-b border-warm-100 dark:border-gray-700">
            <p className="text-sm text-warm-700 dark:text-warm-400">
              {activeTab === 'spotlight'
                ? 'Create a social post for a specific item — great for showcasing your best pieces'
                : templates[activeTab].description}
            </p>
          </div>

          {/* Template Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'spotlight' ? (
              <div className="space-y-4">
                {/* Item selector */}
                <div>
                  <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                    Select Item
                  </label>
                  <select
                    value={spotlightItemId}
                    onChange={(e) => setSpotlightItemId(e.target.value)}
                    className="w-full border border-warm-200 dark:border-gray-700 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
                  >
                    <option value="">Choose an item...</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}{item.price ? ` — $${item.price}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {spotlightItemId && (
                  <>
                    {/* Tone */}
                    <div>
                      <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">Tone</label>
                      <div className="flex gap-2">
                        {(['casual', 'professional', 'friendly'] as const).map((tone) => (
                          <button
                            key={tone}
                            onClick={() => setSpotlightTone(tone)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                              spotlightTone === tone
                                ? 'bg-amber-600 text-white'
                                : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200'
                            }`}
                          >
                            {tone.charAt(0).toUpperCase() + tone.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Platform */}
                    <div>
                      <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">Platform</label>
                      <div className="flex gap-2">
                        {(['instagram', 'facebook'] as const).map((platform) => (
                          <button
                            key={platform}
                            onClick={() => setSpotlightPlatform(platform)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                              spotlightPlatform === platform
                                ? 'bg-amber-600 text-white'
                                : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200'
                            }`}
                          >
                            {platform.charAt(0).toUpperCase() + platform.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Generated content */}
                    {loadingSpotlight ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-20 bg-warm-100 dark:bg-gray-700 rounded-lg" />
                        <div className="h-8 bg-warm-100 dark:bg-gray-700 rounded-lg" />
                      </div>
                    ) : spotlightTemplate ? (
                      <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-4 space-y-3">
                        {spotlightTemplate.photoUrl && (
                          <img
                            src={spotlightTemplate.photoUrl}
                            alt="Item preview"
                            className="w-full max-w-xs rounded-lg object-cover max-h-40"
                          />
                        )}
                        <div>
                          <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-1">Post Text</p>
                          <p className="text-warm-900 dark:text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">
                            {spotlightTemplate.text}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-1">Hashtags</p>
                          <p className="text-warm-700 dark:text-warm-300 text-sm">
                            {spotlightTemplate.hashtags.join(' ')}
                          </p>
                        </div>
                        <p className={`text-xs ${spotlightTemplate.overLimit ? 'text-red-600' : 'text-warm-500'}`}>
                          {spotlightTemplate.charCount} / {spotlightTemplate.platformLimit} characters
                          {spotlightTemplate.overLimit && ' — over limit'}
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-warm-900 dark:text-warm-100">
                {templates[activeTab].content}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-warm-50 dark:bg-gray-700 border-t border-warm-200 dark:border-gray-600 flex gap-3">
            {showShareButton && activeTab !== 'spotlight' ? (
              <>
                <button
                  onClick={handleSocialShare}
                  className="flex-1 py-2 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition"
                >
                  {activeTab === 'nextdoor' || activeTab === 'tiktok' ? 'Copy & Open' : 'Share Now'}
                </button>
                <button
                  onClick={handleCopy}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    copiedTab === activeTab ? 'bg-green-600 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {copiedTab === activeTab ? '✓ Copied!' : 'Copy Text'}
                </button>
              </>
            ) : (
              <button
                onClick={handleCopy}
                disabled={activeTab === 'spotlight' && !spotlightTemplate}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  copiedTab === activeTab
                    ? 'bg-green-600 text-white'
                    : activeTab === 'spotlight' && !spotlightTemplate
                    ? 'bg-warm-300 text-warm-500 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {copiedTab === activeTab ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
            )}
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-lg font-medium bg-warm-200 dark:bg-gray-600 text-warm-900 dark:text-warm-100 hover:bg-warm-300 dark:hover:bg-gray-500 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharePromoteModal;
