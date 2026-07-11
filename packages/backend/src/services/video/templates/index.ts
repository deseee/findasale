/**
 * templates/index.ts — ADR-080 §9 template registry (data aggregation only).
 *
 * Re-exports the contract types and the five season Template definitions, plus a
 * lookup array/record the later `inferTemplate()` (§10) and slot-fill assembler
 * (§9.2) consume. No inference or render logic here — foundation stage only.
 */
export * from './types';

import { Template } from './types';
import seasonARoomStyling from './season-A-room-styling';
import seasonBResaleRoute from './season-B-resale-route';
import seasonCMapToMantel from './season-C-map-to-mantel';
import seasonD50RoomChallenge from './season-D-50-room-challenge';
import seasonESoldNearYou from './season-E-sold-near-you';

export {
  seasonARoomStyling,
  seasonBResaleRoute,
  seasonCMapToMantel,
  seasonD50RoomChallenge,
  seasonESoldNearYou,
};

/** All templates in season order. Source of truth for §10 format inference. */
export const ALL_TEMPLATES: Template[] = [
  seasonARoomStyling,
  seasonBResaleRoute,
  seasonCMapToMantel,
  seasonD50RoomChallenge,
  seasonESoldNearYou,
];

/** id -> Template lookup (e.g. FootageBatch.templateId resolution). */
export const TEMPLATES_BY_ID: Record<string, Template> = ALL_TEMPLATES.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<string, Template>,
);

export type TemplateId = (typeof ALL_TEMPLATES)[number]['id'];
