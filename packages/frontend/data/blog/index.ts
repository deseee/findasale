export interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  publishDate: string;
  updatedDate?: string;
  category: 'tips' | 'guides' | 'news' | 'how-to';
  excerpt: string;
  readingTimeMinutes: number;
  body: string;
}

import { postA } from './posts/estate-sale-software-built-for-buyers-not-organizers';
import { postB } from './posts/hidden-cost-estate-sale-patchwork-workflow';
import { postC } from './posts/estate-sale-photos-value-cataloging-tips';
import { postD } from './posts/ai-estate-sale-cataloging-what-actually-matters';
import { postE } from './posts/estate-sale-organizer-revenue-digital-tools-data';
import { postF } from './posts/estate-sale-listing-page-convert-ad-traffic';
import { postG } from './posts/estate-sale-buyer-discovery-vs-organizer-tools';
import { postH } from './posts/free-estate-sale-cataloging-software-estimint-alternative';
import { postI } from './posts/digital-buyers-expect-more-than-a-listing';
import { postJ } from './posts/when-buyers-browse-free-what-makes-managed-sale-worth-it';
import { postK } from './posts/state-of-secondary-sales-in-america-2026';
import { postL } from './posts/when-estate-sales-and-yard-sales-actually-happen';
import { postM } from './posts/estate-sale-company-density-us-cities';

export const posts: BlogPost[] = [postA, postB, postC, postD, postE, postF, postG, postH, postI, postJ, postK, postL, postM];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
