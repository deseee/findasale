/**
 * Publishing Page (Review & Publish)
 *
 * Phase 4: Publishing page for Rapidfire items
 * - Fetch items with draftStatus IN ['DRAFT', 'PENDING_REVIEW']
 * - AI confidence color tinting (green/amber/red borders)
 * - Per-item expanded editor (brightness, contrast, aspect ratio, background removal, metadata)
 * - Batch toolbar (select, bulk price, bulk category, bulk BG removal)
 * - Buyer preview mode (light-mode grid)
 * - Publish all button
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../../components/Skeleton';
import NearMissNudge from '../../../../components/NearMissNudge'; // Feature 61

type AspectRatio = '4:3' | '1:1' | '16:9';

interface ItemEditState {
  title: string;
  price: number;
  category: string;
  aspectRatio: AspectRatio;
  brightness: number;
  contrast: number;
  backgroundRemoved: boolean;
  autoEnhanced: boolean;
}

interface Item {
  id: string;
  title: string;
  price: number | null;
  category: string | null;
  photoUrls: string[];
  aiConfidence: number | null;
  backgroundRemoved: boolean;
  autoEnhanced: boolean;
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
}

const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Electronics',
  'Kitchenware',
  'Tools',
  'Books',
  'Collectibles',
  'Other',
];

function buildCloudinaryUrl(
  url: string,
  opts: {
    aspectRatio?: AspectRatio;
    backgroundRemoved?: boolean;
    brightness?: number;
    contrast?: number;
  }
): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  const transforms: string[] = [];

  if (opts.aspectRatio) {
    const ar = opts.aspectRatio.replace(':', '_');
    transforms.push(`ar_${ar},c_fill`);
  }

  if (opts.backgroundRemoved) {
    transforms.push('b_remove');
  }

  if (opts.brightness !== undefined && opts.brightness !== 50) {
    const val = Math.round((opts.brightness - 50) * 1.5);
    transforms.push(`e_brightness:${val}`);
  }

  if (opts.contrast !== undefined && opts.contrast !== 50) {
    const val = Math.round((opts.contrast - 50) * 1.5);
    transforms.push(`e_contrast:${val}`);
  }

  if (transforms.length === 0) return url;
  return url.replace('/upload/', `/upload/${transforms.join(',')}/`);
}

function confidenceBorderClass(score: number | null | undefined): string {
  if (score == null) return 'border-l-4 border-warm-200';
  if (score >= 0.8) return 'border-l-4 border-green-500';
  if (score >= 0.55) return 'border-l-4 border-amber-400';
  return 'border-l-4 border-red-500';
}

function confidenceLabel(score: number | null | undefined): { text: string; color: string } {
  if (score == null) return { text: 'Manual', color: 'text-warm-500' };
  if (score >= 0.8) return { text: 'Good', color: 'text-green-600' };
  if (score >= 0.55) return { text: 'Review', color: 'text-amber-600' };
  return { text: 'Low', color: 'text-red-600' };
}
