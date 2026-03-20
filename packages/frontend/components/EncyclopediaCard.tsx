import React from 'react';
import Link from 'next/link';
import { EncyclopediaEntry } from '../hooks/useEncyclopedia';
import { ArrowRight, Bookmark } from 'lucide-react';

interface EncyclopediaCardProps {
  entry: EncyclopediaEntry;
  compact?: boolean; // Compact version for list view
}

/**
 * EncyclopediaCard — Reusable card for displaying encyclopedia entry preview
 * Feature #52: Shows title, category, excerpt, and navigation
 */
const EncyclopediaCard: React.FC<EncyclopediaCardProps> = ({ entry, compact = false }) => {
  // Extract plain text excerpt from markdown
  const getExcerpt = (markdown: string | null | undefined, maxLength: number = 150) => {
    if (!markdown) return '';
    // Remove markdown syntax
    const text = markdown
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Replace links with text
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '') // Remove italic markers
      .replace(/`/g, ''); // Remove code markers

    return text.substring(0, maxLength).trim() + (text.length > maxLength ? '...' : '');
  };

  const getCategoryColor = (category: string) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      'Art Deco': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
      'MCM': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
      'Americana': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
      'Victorian': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
      'Tools': { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
      'Toys': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
      'Furniture': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
      'Collectibles': { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
    };
    return colorMap[category] || { bg: 'bg-sage-green/10 dark:bg-sage-green/20', text: 'text-sage-green dark:text-sage-green' };
  };

  const categoryStyle = getCategoryColor(entry.category);

  if (compact) {
    return (
      <Link href={`/encyclopedia/${entry.slug}`}>
        <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-sage-green/30 dark:hover:border-sage-green/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${categoryStyle.bg} ${categoryStyle.text}`}>
                  {entry.category}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white hover:text-sage-green dark:hover:text-sage-green transition-colors">
                {entry.title}
              </h3>
              {entry.subtitle && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {entry.subtitle}
                </p>
              )}
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600 flex-shrink-0 mt-1" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/encyclopedia/${entry.slug}`}>
      <div className="h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg dark:hover:shadow-lg/20 transition-all cursor-pointer hover:border-sage-green/50 dark:hover:border-sage-green/50">
        {/* Header with category */}
        <div className={`p-4 ${categoryStyle.bg}`}>
          <span className={`inline-block text-xs font-bold uppercase tracking-wide ${categoryStyle.text}`}>
            {entry.category}
          </span>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 hover:text-sage-green dark:hover:text-sage-green transition-colors">
            {entry.title}
          </h3>

          {entry.subtitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {entry.subtitle}
            </p>
          )}

          <p className="text-gray-700 dark:text-gray-300 text-sm mb-4 line-clamp-3">
            {getExcerpt(entry.content)}
          </p>

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {entry.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
                >
                  #{tag}
                </span>
              ))}
              {entry.tags.length > 3 && (
                <span className="text-xs px-2 py-1 text-gray-600 dark:text-gray-400">
                  +{entry.tags.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Footer with engagement metrics and CTA */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {entry.helpfulCount ?? 0} found helpful
            </div>
            <div className="flex items-center gap-2 text-sage-green hover:text-sage-green/80 transition-colors">
              <span className="text-sm font-medium">Read more</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default EncyclopediaCard;
