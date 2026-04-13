/**
 * Feature #71: Organizer Reputation Score
 *
 * Simplified reputation DTO for organizer trust display
 * Score: 0–5 stars (float, rounded to nearest 0.5)
 * isNew: true if organizer has < 3 published sales
 */

export interface OrganizerReputationDTO {
  score: number;           // 0–5 stars
  isNew: boolean;          // true if saleCount < 3
  responseTimeAvg: number; // average hours (stub)
  saleCount: number;       // total published sales
  photoQualityAvg: number; // 0–1 scale, converted to 0–5 in display
  shopperRating?: number;  // stub for future
  disputeRate?: number;    // stub for future
  lastCalculated?: string; // ISO date
}

export type ReputationScore = OrganizerReputationDTO;
