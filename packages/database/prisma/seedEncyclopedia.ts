import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Parse frontmatter and content from markdown
interface ParsedEntry {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  isFeatured: boolean;
  content: string;
}

interface PriceBenchmarkRow {
  entrySlug: string;
  condition: string;
  region: string;
  priceRangeLow: number;
  priceRangeHigh: number;
  dataSource: string;
  notes: string;
}

// Simple frontmatter parser (no external dependencies)
function parseFrontmatter(markdown: string): ParsedEntry | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const [, frontmatterStr, content] = match;

  // Parse YAML frontmatter manually
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterStr.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays [item1, item2, ...]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1);
      frontmatter[key] = arrayContent.split(',').map(item => item.trim());
    } else if (value === 'true') {
      frontmatter[key] = true;
    } else if (value === 'false') {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = value;
    }
  }

  return {
    slug: (frontmatter.slug as string) || '',
    title: (frontmatter.title as string) || '',
    category: (frontmatter.category as string) || '',
    tags: (frontmatter.tags as string[]) || [],
    isFeatured: (frontmatter.isFeatured as boolean) || false,
    content: content.trim(),
  };
}

// Extract individual entries from markdown file
function extractEntries(markdown: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  // Split by Entry N: pattern
  const entryBlocks = markdown.split(/^## Entry \d+: /m).slice(1);

  for (const block of entryBlocks) {
    // Each entry starts with its title, then has a code block with frontmatter
    const codeBlockRegex = /^([^\n]*)\n```\n([\s\S]*?)\n```/;
    const codeMatch = block.match(codeBlockRegex);

    if (codeMatch) {
      const fullMarkdown = codeMatch[2];
      const parsed = parseFrontmatter(fullMarkdown);
      if (parsed && parsed.slug) {
        entries.push(parsed);
      }
    }
  }

  return entries;
}

async function seedEncyclopedia() {
  try {
    // Look up an existing admin user to use as the entry author (FK constraint requires a real user ID)
    const adminUser = await prisma.user.findFirst({
      where: { roles: { has: 'ADMIN' } },
      select: { id: true },
    });
    const SYSTEM_USER_ID = adminUser?.id;
    if (!SYSTEM_USER_ID) {
      throw new Error('No admin user found in database. Run main seed first: npm run seed');
    }

    // Read and parse encyclopedia entries
    const entriesFile = path.join(__dirname, '../../..', 'claude_docs/feature-notes/encyclopedia-seed-entries.md');
    const entriesMarkdown = fs.readFileSync(entriesFile, 'utf-8');
    const parsedEntries = extractEntries(entriesMarkdown);

    console.log(`Parsed ${parsedEntries.length} encyclopedia entries`);

    // Read price benchmarks
    const benchmarksFile = path.join(__dirname, '../../..', 'claude_docs/feature-notes/pricebenchmark-seed.json');
    const benchmarksJson = fs.readFileSync(benchmarksFile, 'utf-8');
    const benchmarks: PriceBenchmarkRow[] = JSON.parse(benchmarksJson);

    console.log(`Loaded ${benchmarks.length} price benchmark rows`);

    // Map benchmarks by slug for fast lookup
    const benchmarksBySlug = new Map<string, PriceBenchmarkRow[]>();
    for (const benchmark of benchmarks) {
      if (!benchmarksBySlug.has(benchmark.entrySlug)) {
        benchmarksBySlug.set(benchmark.entrySlug, []);
      }
      benchmarksBySlug.get(benchmark.entrySlug)!.push(benchmark);
    }

    // Top 5 entry slugs to feature
    const featuredSlugs = new Set([
      'pyrex-primary-colors-mixing-bowls',
      'fire-king-dinnerware-patterns-identification',
      'lane-cedar-chests-dating-and-value',
      'noritake-dinnerware-sets-collectors-guide',
      'fiestaware-dinnerware-complete-sets',
    ]);

    // Insert entries and benchmarks in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let entriesInserted = 0;
      let entriesSkipped = 0;
      let benchmarksInserted = 0;
      let benchmarksSkipped = 0;

      for (const entry of parsedEntries) {
        const isFeatured = featuredSlugs.has(entry.slug);

        try {
          const upsertedEntry = await tx.encyclopediaEntry.upsert({
            where: { slug: entry.slug },
            update: {
              title: entry.title,
              category: entry.category,
              tags: entry.tags,
              isFeatured,
              status: 'PUBLISHED',
              content: entry.content,
            },
            create: {
              slug: entry.slug,
              title: entry.title,
              category: entry.category,
              tags: entry.tags,
              isFeatured,
              status: 'PUBLISHED',
              content: entry.content,
              authorId: SYSTEM_USER_ID,
            },
          });

          entriesInserted++;

          // Insert associated price benchmarks
          const entryBenchmarks = benchmarksBySlug.get(entry.slug) || [];
          for (const benchmark of entryBenchmarks) {
            try {
              // Check if benchmark exists (no unique constraint defined yet)
              const existing = await tx.priceBenchmark.findFirst({
                where: {
                  entryId: upsertedEntry.id,
                  condition: benchmark.condition,
                  region: benchmark.region,
                },
              });

              if (existing) {
                // Update if exists
                await tx.priceBenchmark.update({
                  where: { id: existing.id },
                  data: {
                    priceRangeLow: benchmark.priceRangeLow,
                    priceRangeHigh: benchmark.priceRangeHigh,
                    dataSource: benchmark.dataSource,
                  },
                });
                benchmarksSkipped++;
              } else {
                // Create if doesn't exist
                await tx.priceBenchmark.create({
                  data: {
                    entryId: upsertedEntry.id,
                    condition: benchmark.condition,
                    region: benchmark.region,
                    priceRangeLow: benchmark.priceRangeLow,
                    priceRangeHigh: benchmark.priceRangeHigh,
                    dataSource: benchmark.dataSource,
                  },
                });
                benchmarksInserted++;
              }
            } catch (error) {
              console.error(`Failed to process benchmark for ${entry.slug}/${benchmark.condition}/${benchmark.region}:`, error);
              benchmarksSkipped++;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Unique constraint')) {
            entriesSkipped++;
          } else {
            throw error;
          }
        }
      }

      return { entriesInserted, entriesSkipped, benchmarksInserted, benchmarksSkipped };
    });

    console.log(`\n✅ Seed complete!`);
    console.log(`   Entries: inserted ${result.entriesInserted}, skipped ${result.entriesSkipped} (duplicates)`);
    console.log(`   Benchmarks: inserted ${result.benchmarksInserted}, skipped ${result.benchmarksSkipped} (duplicates)`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedEncyclopedia();
