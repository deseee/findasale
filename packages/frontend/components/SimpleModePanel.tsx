/**
 * SimpleModePanel
 *
 * A clean, 5-button surface for organizers in Simple Mode.
 * Designed to reduce cognitive load for new or low-volume organizers.
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface SimpleModeButtonProps {
  icon: React.ReactNode;
  label: string;
  subtext: string;
  href?: string;
  onClick?: () => void;
}

const SimpleModeButton: React.FC<SimpleModeButtonProps> = ({ icon, label, subtext, href, onClick }) => {
  const content = (
    <div className="flex flex-col items-center justify-center text-center p-6 h-full">
      <div className="text-5xl mb-4 text-sage-600 dark:text-sage-400">{icon}</div>
      <h3 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-2">{label}</h3>
      <p className="text-sm text-warm-600 dark:text-gray-400">{subtext}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href}>
        <div className="bg-white dark:bg-gray-800 border-2 border-sage-200 dark:border-sage-800 rounded-lg hover:border-sage-400 dark:hover:border-sage-600 hover:shadow-lg transition-all cursor-pointer min-h-64">
          {content}
        </div>
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full bg-white dark:bg-gray-800 border-2 border-sage-200 dark:border-sage-800 rounded-lg hover:border-sage-400 dark:hover:border-sage-600 hover:shadow-lg transition-all min-h-64"
    >
      {content}
    </button>
  );
};

interface SimpleModeViewProps {
  onExitSimpleMode: () => void;
}

const SimpleModePanel: React.FC<SimpleModeViewProps> = ({ onExitSimpleMode }) => {
  const router = useRouter();

  // SVG Icons (inline, no lucide dependency)
  const icons = {
    plus: (
      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    package: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
    ),
    list: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <line x1="9" y1="6" x2="20" y2="6"></line>
        <line x1="9" y1="12" x2="20" y2="12"></line>
        <line x1="9" y1="18" x2="20" y2="18"></line>
        <line x1="5" y1="6" x2="5" y2="6.01"></line>
        <line x1="5" y1="12" x2="5" y2="12.01"></line>
        <line x1="5" y1="18" x2="5" y2="18.01"></line>
      </svg>
    ),
    share: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <circle cx="18" cy="5" r="3"></circle>
        <circle cx="6" cy="12" r="3"></circle>
        <circle cx="18" cy="19" r="3"></circle>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
      </svg>
    ),
    help: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 16v-4"></path>
        <path d="M12 8h.01"></path>
      </svg>
    ),
  };

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-100 mb-2">Welcome to Simple Mode</h1>
          <p className="text-lg text-warm-600 dark:text-gray-400">Everything you need to get started—in five easy steps</p>
        </div>

        {/* 5-Button Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          <SimpleModeButton
            icon={icons.plus}
            label="Create a Sale"
            subtext="Start a new estate or garage sale"
            href="/organizer/create-sale"
          />
          <SimpleModeButton
            icon={icons.package}
            label="Add Items"
            subtext="Photo scan or manual entry"
            onClick={() => router.push('/organizer/dashboard')}
          />
          <SimpleModeButton
            icon={icons.list}
            label="My Sales"
            subtext="View and manage your sales"
            href="/organizer/dashboard"
          />
          <SimpleModeButton
            icon={icons.share}
            label="Share a Sale"
            subtext="Get your sale link and QR code"
            onClick={() => router.push('/organizer/dashboard')}
          />
          <SimpleModeButton
            icon={icons.help}
            label="Help & Guide"
            subtext="Tips, walkthrough, and support"
            href="/guide"
          />
        </div>

        {/* Footer */}
        <div className="text-center border-t border-warm-200 dark:border-gray-700 pt-8">
          <button
            onClick={onExitSimpleMode}
            className="text-amber-600 dark:text-amber-400 hover:underline text-sm font-medium"
          >
            ← Switch to full view
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleModePanel;
