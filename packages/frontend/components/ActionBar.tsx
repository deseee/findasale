import React, { useState } from 'react';
import Link from 'next/link';
import { QrCode } from 'lucide-react';

interface ActionBarProps {
  className?: string;
  onQrClick?: () => void;
}

const ACTION_ITEMS = [
  {
    id: 'browse',
    label: 'Browse Sales',
    icon: '🔍',
    href: '/sales',
  },
  {
    id: 'collections',
    label: 'Collections',
    icon: '💕',
    href: '/shopper/collections',
  },
  {
    id: 'history',
    label: 'Purchase History',
    icon: '📋',
    href: '/shopper/purchases',
  },
  {
    id: 'trails',
    label: 'Treasure Trails',
    icon: '🗺️',
    href: '/shopper/trails',
  },
  {
    id: 'qr',
    label: 'My QR',
    icon: null, // uses lucide icon
    action: 'qr',
  },
];

export const ActionBar: React.FC<ActionBarProps> = ({ className = '', onQrClick }) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const moreItems = [
    {
      label: 'My Finds Gallery',
      icon: '📸',
      href: '/shopper/history?view=gallery',
    },
    {
      label: 'Explorer Passport',
      icon: '🗺️',
      href: '/shopper/explorer-passport',
    },
    {
      label: 'Rank Benefits',
      icon: '⭐',
      href: '/shopper/ranks',
    },
  ];

  return (
    <div className={`bg-white border border-warm-200 dark:bg-gray-800 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition-shadow ${className}`}>
      <div className="grid grid-cols-5 gap-2">
        {/* Main action items */}
        {ACTION_ITEMS.map((item) => {
          if (item.action === 'qr') {
            return (
              <button
                key={item.id}
                onClick={onQrClick}
                className="flex flex-col items-center justify-center p-3 rounded-lg bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors"
              >
                <QrCode className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold text-warm-900 dark:text-warm-100 text-center">
                  {item.label}
                </span>
              </button>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href || '#'}
              className="flex flex-col items-center justify-center p-3 rounded-lg bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors"
            >
              <span className="text-xl mb-1">{item.icon}</span>
              <span className="text-xs font-semibold text-warm-900 dark:text-warm-100 text-center">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* More menu */}
        <div className="relative">
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className="flex flex-col items-center justify-center p-3 rounded-lg bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors w-full h-full"
          >
            <span className="text-xl mb-1">⋯</span>
            <span className="text-xs font-semibold text-warm-900 dark:text-warm-100">More</span>
          </button>

          {/* Dropdown menu */}
          {isMoreOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-warm-200 dark:border-gray-600 z-50">
              {moreItems.map((item, idx) => (
                <Link
                  key={idx}
                  href={item.href}
                  onClick={() => setIsMoreOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-warm-50 dark:hover:bg-gray-600 transition-colors first:rounded-t-lg last:rounded-b-lg border-b border-warm-100 dark:border-gray-600 last:border-b-0"
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm font-medium text-warm-900 dark:text-warm-100">
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionBar;
