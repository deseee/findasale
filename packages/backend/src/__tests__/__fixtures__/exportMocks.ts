/**
 * Shared Prisma stand-in for the export guard tests (ADR-136 Addendum C). Kept in a module so a jest.mock factory can
 * require it lazily (the factory runs when the controller first imports '../index', before any test-file constant exists).
 */
export const mockPrisma = {
  organizer: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
  item: { findMany: jest.fn() },
  itemBulkLot: { findMany: jest.fn() },
};
