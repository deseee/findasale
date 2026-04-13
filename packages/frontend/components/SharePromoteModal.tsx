/**
 * Share & Promote Modal
 *
 * Feature #131: Share & Promote Templates (Option B — Expand)
 * Provides organizers with multiple pre-templated formats for promoting their sales:
 * - Social post (Facebook/Instagram)
 * - Flyer copy (headline + bullet points)
 * - Email invite (subject + body)
 * - Neighborhood post (conversational NextDoor style)
 */

import React, { useState } from 'react';
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
  saleType?: string; // e.g., 'ESTATE', 'YARD', 'AUCTION', 'FLEA_MARKET', etc.
}

interface SharePromoteModalProps {
  sale: Sale;
  itemCount?: number;
  isOpen: boolean;
  onClose: () => void;
}

type TemplateType = 'social' | 'flyer' | 'email' | 'neighborhood' | 'tiktok' | 'pinterest' | 'threads' | 'nextdoor';

interface TemplateContent {
  title: string;
  content: string;
  icon: string;
  description: string;
}

// Helper: convert saleType enum to human-readable label
const getSaleTypeLabel = (saleType?: string): string => {
  if (!saleType) return 'estate sale';

  const labels: Record<string, string> = {
    'ESTATE': 'estate sale',
    'YARD': 'yard sale',
    'AUCTION': 'auction',
    'FLEA_MARKET': 'flea market',
    'CONSIGNMENT': 'consignment sale',
    'CHARITY': 'charity sale',
    'BUSINESS_CORPORATE': 'corporate sale',
  };

  return labels[saleType] || 'sale';
};

const SharePromoteModal: React.FC<SharePromoteModalProps> = ({
  sale,
  itemCount = 0,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TemplateType>('social');
  const [copiedTab, setCopiedTab] = useState<TemplateType | null>(null);

  if (!isOpen) return null;

  const saleTypeLabel = getSaleTypeLabel(sale.saleType);

  // Format dates for display
  const startDate = format(parseISO(sale.startDate), 'MMM d');
  const endDate = format(parseISO(sale.endDate), 'MMM d, yyyy');
  const fullStartDate = format(parseISO(sale.startDate), 'EEEE, MMM d, yyyy');
  const fullEndDate = format(parseISO(sale.endDate), 'EEEE, MMM d, yyyy');
  const time = format(parseISO(sale.startDate), 'h:mm a');
  const address = `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`;

  // Generate template content
  const templates: Record<TemplateType, TemplateContent> = {
    social: {
      title: 'Social Post',
      icon: '📱',
      description: 'Facebook/Instagram caption with sale details',
      content: `🏷️ ${sale.title}

Find amazing deals on quality items! ${itemCount ? `We have ${itemCount}+ items` : 'Great selection of items available'}.

📍 ${address}
📅 ${startDate} - ${endDate}
🕐 ${time}

${sale.tags && sale.tags.length > 0 ? `#${sale.tags.join(' #')} ` : ''}#LocalSales #EstateSale #Bargains #ShoppingLocal

Don't miss out! Visit us today.`,
    },
    flyer: {
      title: 'Flyer Copy',
      icon: '📄',
      description: 'Headline + bullet points + CTA for print/digital',
      content: `✨ ${sale.title.toUpperCase()} ✨

DATE: ${fullStartDate} – ${fullEndDate}
TIME: Starting at ${time}
LOCATION: ${address}

HIGHLIGHTS:
• ${itemCount ? `${itemCount}+ quality items` : 'Wide selection of items'}
• Estate quality merchandise
• Unbeatable prices
• First come, first served
${sale.description ? `• ${sale.description.substring(0, 60)}...` : ''}

👉 DON'T MISS THIS OPPORTUNITY!

DIRECTIONS: ${sale.city}, ${sale.state}
Questions? [Your Phone] | [Your Email]`,
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
Starting at ${time}

Where:
${address}

What to expect:
${itemCount ? `Over ${itemCount} quality items` : 'A wide selection of quality items'} at unbeatable prices. Whether you're looking for treasures or everyday finds, we have something for everyone!

${sale.description ? `About this sale: ${sale.description}

` : ''}Why shop with us?
• Quality merchandise
• Competitive pricing
• First-come, first-served items
• Friendly staff

We look forward to seeing you there!

Best regards,
[Your Name]`,
    },
    neighborhood: {
      title: 'Neighborhood Post',
      icon: '🏘️',
      description: 'Conversational NextDoor/local group style',
      content: `Hey neighbors! 👋

Just wanted to give you a heads up about a sale happening in our area that you might be interested in:

**${sale.title}**

It's running from ${fullStartDate} through ${fullEndDate}, starting at ${time}.

📍 Location: ${address}

They've got ${itemCount ? `${itemCount}+ items` : 'a lot of items'} available, so if you're into estate sales or looking for good deals, it's definitely worth checking out!

${sale.tags && sale.tags.length > 0 ? `They specialize in ${sale.tags.join(', ')}.

` : ''}I'm planning to stop by and thought I'd share in case anyone else wants to go. Let me know if you end up going!

See you there! 🛍️`,
    },
    tiktok: {
      title: 'TikTok',
      icon: '🎬',
      description: 'Short, punchy caption with trending hashtags',
      content: `${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} haul alert 🏷️ ${sale.title} in ${sale.city} — furniture, collectibles, vintage finds and more

📍 ${address}
🗓️ ${startDate} - ${endDate}
🔗 Link in bio → finda.sale

#${saleTypeLabel.replace(/\s+/g, '')} #thrifting #vintagefinds #${sale.city}thrift #secondhand #estatefinds #thrifthaul`,
    },
    pinterest: {
      title: 'Pinterest',
      icon: '📌',
      description: 'Keyword-rich discovery-oriented description',
      content: `${sale.title} — ${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} in ${sale.city}

Discover unique vintage furniture, antiques, collectibles, and one-of-a-kind finds at this ${sale.city} ${saleTypeLabel}. Browse curated items from ${startDate} - ${endDate}. Shop in person or browse the full inventory online at FindA.Sale.

📍 ${address}
🗓️ ${startDate} - ${endDate}

Find more ${saleTypeLabel}s near you → finda.sale`,
    },
    threads: {
      title: 'Threads',
      icon: '💬',
      description: 'Conversational style, minimal hashtags',
      content: `Running an estate sale this weekend in ${sale.city} — ${sale.title}

Lots of ${sale.title} items: furniture, vintage pieces, collectibles, and more. Everything must go.

📍 ${address} · ${startDate} - ${endDate}
Browse the inventory at finda.sale`,
    },
    nextdoor: {
      title: 'Nextdoor',
      icon: '🏡',
      description: 'Neighbor-to-neighbor tone with local focus',
      content: `Neighbors — ${sale.title} this ${startDate} - ${endDate} at ${address}

Estate sale open to the public. Items include furniture, household goods, collectibles, and more. Early arrival recommended.

Full item list at finda.sale — search "${sale.city}"

Hope to see some familiar faces!`,
    },
  };

  const currentTemplate = templates[activeTab];

  // Build shareable URL for social platforms
  const saleUrl = typeof window !== 'undefined' ? `${window.location.origin}/sales/${sale.id}` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentTemplate.content);
      setCopiedTab(activeTab);
      showToast('Copied to clipboard!', 'success');
      setTimeout(() => setCopiedTab(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = currentTemplate.content;
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
      // Facebook Share
      const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(saleUrl)}`;
      window.open(facebookUrl, 'facebook-share', 'width=600,height=400');
    } else if (activeTab === 'threads') {
      // Threads Share
      const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(currentTemplate.content)}`;
      window.open(threadsUrl, 'threads-share', 'width=600,height=400');
    } else if (activeTab === 'nextdoor') {
      // Nextdoor: Copy + Open
      handleCopy();
      showToast('Copied! Opening Nextdoor in a new tab. Paste your link there.', 'info');
      setTimeout(() => {
        window.open('https://nextdoor.com/news_feed/', 'nextdoor-open');
      }, 500);
    } else if (activeTab === 'pinterest') {
      // Pinterest Share
      const pinterestUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(saleUrl)}&description=${encodeURIComponent(currentTemplate.content.substring(0, 100))}`;
      window.open(pinterestUrl, 'pinterest-share', 'width=600,height=400');
    } else if (activeTab === 'tiktok') {
      // TikTok: Copy + Open (TikTok doesn't have web share API)
      handleCopy();
      showToast('Copied! TikTok link copied. Open TikTok and paste in your video caption.', 'info');
      setTimeout(() => {
        window.open('https://www.tiktok.com/', 'tiktok-open');
      }, 500);
    } else {
      // For other tabs (email, flyer, neighborhood), just copy
      handleCopy();
    }
  };

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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
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
          {(Object.keys(templates) as TemplateType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex-shrink-0 px-4 py-3 font-medium text-sm transition whitespace-nowrap ${
                activeTab === type
                  ? 'border-b-2 border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-gray-900'
                  : 'text-warm-700 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-200'
              }`}
            >
              <span className="mr-2">{templates[type].icon}</span>
              {templates[type].title}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex flex-col h-[calc(90vh-200px)] overflow-hidden">
          {/* Description */}
          <div className="px-6 py-2 bg-amber-50 dark:bg-gray-750">
            <p className="text-sm text-warm-700 dark:text-warm-400">
              {currentTemplate.description}
            </p>
          </div>

          {/* Template Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-warm-900 dark:text-warm-100">
              {currentTemplate.content}
            </div>
          </div>

          {/* Footer with Copy/Share Buttons */}
          <div className="px-6 py-4 bg-warm-50 dark:bg-gray-700 border-t border-warm-200 dark:border-gray-600 flex gap-3">
            {['social', 'threads', 'nextdoor', 'pinterest', 'tiktok'].includes(activeTab) ? (
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
                    copiedTab === activeTab
                      ? 'bg-green-600 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {copiedTab === activeTab ? '✓ Copied!' : 'Copy Text'}
                </button>
              </>
            ) : (
              <button
                onClick={handleCopy}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  copiedTab === activeTab
                    ? 'bg-green-600 text-white'
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
