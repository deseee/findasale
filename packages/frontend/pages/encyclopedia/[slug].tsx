/**
 * Encyclopedia Entry Detail Page
 *
 * Feature #52: Display single encyclopedia entry with full content
 * Supports markdown rendering and related entries navigation
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEncyclopediaEntry } from '../../hooks/useEncyclopedia';
import EncyclopediaCard from '../../components/EncyclopediaCard';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { ThumbsUp, ThumbsDown, Share2, ArrowLeft, Calendar } from 'lucide-react';

/**
 * Simple markdown renderer for encyclopedia content
 * Supports: headings, paragraphs, bold, italic, lists, links, code blocks
 */
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  // Parse markdown to HTML-like JSX
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-xl font-bold text-gray-900 dark:text-white mt-4 mb-2">
          {line.replace(/^### /, '')}
        </h3>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-3">
          {line.replace(/^## /, '')}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-3xl font-bold text-gray-900 dark:text-white mt-8 mb-4">
          {line.replace(/^# /, '')}
        </h1>
      );
    }
    // Lists
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      const listItems = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        listItems.push(
          <li key={`li-${i}`} className="mb-1">
            {lines[i].replace(/^[-*]\s/, '')}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside text-gray-700 dark:text-gray-300 mb-4 space-y-2">
          {listItems}
        </ul>
      );
      i--;
    }
    // Paragraphs and text
    else if (line.trim()) {
      // Simple inline markdown: **bold**, *italic*, [link](url)
      const parseInline = (text: string) => {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;

        // Match **bold**, *italic*, [link](url)
        const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
          if (lastIndex < match.index) {
            parts.push(text.substring(lastIndex, match.index));
          }

          if (match[1]) {
            // Bold
            parts.push(
              <strong key={`bold-${match.index}`} className="font-bold">
                {match[1]}
              </strong>
            );
          } else if (match[2]) {
            // Italic
            parts.push(
              <em key={`italic-${match.index}`} className="italic">
                {match[2]}
              </em>
            );
          } else if (match[3] && match[4]) {
            // Link
            parts.push(
              <a
                key={`link-${match.index}`}
                href={match[4]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sage-green hover:text-sage-green/80 underline"
              >
                {match[3]}
              </a>
            );
          }

          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          parts.push(text.substring(lastIndex));
        }

        return parts.length > 0 ? parts : text;
      };

      elements.push(
        <p key={`p-${i}`} className="text-gray-700 dark:text-gray-300 mb-4">
          {parseInline(line)}
        </p>
      );
    }

    i++;
  }

  return <div className="max-w-none">{elements}</div>;
};

const EncyclopediaEntryPage = () => {
  const router = useRouter();
  const { slug } = router.query;
  const [userVote, setUserVote] = useState<'helpful' | 'unhelpful' | null>(null);
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  const { data, isLoading, error } = useEncyclopediaEntry(slug as string);
  const entry = data?.entry;

  const handleVote = (helpful: boolean) => {
    setUserVote(helpful ? 'helpful' : 'unhelpful');
    // TODO: Make API call to record vote when endpoint is available
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      await navigator.share({
        title: entry?.title,
        text: entry?.subtitle || entry?.title,
        url,
      });
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url);
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Encyclopedia | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-900">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <Skeleton className="h-12 w-32 mb-4" />
            <Skeleton className="h-8 w-2/3 mb-8" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </>
    );
  }

  if (error || !entry) {
    return (
      <>
        <Head>
          <title>Encyclopedia | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-900 py-12">
          <EmptyState
            heading="Article Not Found"
            subtext="The encyclopedia article you're looking for doesn't exist or has been removed."
            cta={{
              label: 'Back to Encyclopedia',
              href: '/encyclopedia',
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{entry.title} | Estate Sale Encyclopedia</title>
        <meta name="description" content={entry.subtitle || entry.title} />
        <meta property="og:title" content={entry.title} />
        <meta property="og:description" content={entry.subtitle || entry.title} />
        <meta property="og:type" content="article" />
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-900">
        {/* Breadcrumb & Back Link */}
        <div className="border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <Link
              href="/encyclopedia"
              className="flex items-center gap-2 text-sage-green hover:text-sage-green/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Encyclopedia
            </Link>
          </div>
        </div>

        {/* Header Section */}
        <div className="bg-gradient-to-br from-sage-green/5 to-transparent dark:from-sage-green/10 dark:to-transparent py-12 px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-4xl mx-auto">
            <div className="mb-4">
              <span
                className={`inline-block text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full
                ${
                  entry.category === 'Art Deco'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : entry.category === 'MCM'
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                      : entry.category === 'Tools'
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        : 'bg-sage-green/20 dark:bg-sage-green/30 text-sage-green dark:text-sage-green'
                }`}
              >
                {entry.category}
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3">
              {entry.title}
            </h1>

            {entry.subtitle && (
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">{entry.subtitle}</p>
            )}

            {/* Meta Information */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
              {entry.authorName && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-sage-green/20 dark:bg-sage-green/30" />
                  <span>By {entry.authorName}</span>
                </div>
              )}
              {entry.createdAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Article Content */}
          <div className="lg:col-span-2">
            <div className="mb-12">
              <MarkdownContent content={entry.content} />
            </div>

            {/* Tags */}
            {entry.tags && entry.tags.length > 0 && (
              <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag, i) => (
                    <Link
                      key={i}
                      href={`/encyclopedia?search=${encodeURIComponent(tag)}`}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-sage-green/20 dark:hover:bg-sage-green/30 transition-colors"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Engagement Section */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-8">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Was this helpful?</h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleVote(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    userVote === 'helpful'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                  }`}
                >
                  <ThumbsUp className="w-5 h-5" />
                  <span>Yes ({entry.helpfulCount || 0})</span>
                </button>

                <button
                  onClick={() => handleVote(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    userVote === 'unhelpful'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  }`}
                >
                  <ThumbsDown className="w-5 h-5" />
                  <span>No ({entry.unhelpfulCount || 0})</span>
                </button>

                <button
                  onClick={handleShare}
                  className="ml-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                  <span>Share</span>
                </button>
              </div>

              {showCopiedMessage && (
                <p className="mt-4 text-sm text-green-600 dark:text-green-400">
                  Link copied to clipboard!
                </p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Related Entries */}
            {entry.relatedEntries && entry.relatedEntries.length > 0 && (
              <div className="sticky top-20">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                  Related Articles
                </h3>
                <div className="space-y-3">
                  {entry.relatedEntries.map((related) => (
                    <EncyclopediaCard key={related.id} entry={related} compact />
                  ))}
                </div>

                <Link
                  href={`/encyclopedia?category=${entry.category}`}
                  className="mt-6 block text-center px-4 py-2 text-sage-green font-medium hover:text-sage-green/80 transition-colors"
                >
                  More in {entry.category} →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-sage-green/10 dark:bg-sage-green/20 border-t border-gray-200 dark:border-gray-800 py-8 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Help us improve this article with your feedback or contribute a new article.
            </p>
            <Link
              href="/encyclopedia"
              className="inline-block px-6 py-2 text-sage-green font-medium hover:text-sage-green/80 transition-colors"
            >
              View All Articles
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default EncyclopediaEntryPage;
