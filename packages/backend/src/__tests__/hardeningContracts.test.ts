/**
 * Source-level contracts for wiring that is too heavy to execute in isolation (index.ts boots the whole
 * server; batchAnalyzeController is a 650 line pipeline). Each assertion pins one hardening decision so a
 * later edit cannot silently drop it. NOT EXECUTED when written.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('index.ts body-parser ordering', () => {
  it('registers the MailerLite snooze webhook raw parser before express.json', () => {
    const src = read('index.ts');
    const rawIdx = src.indexOf("app.use('/api/snooze/webhook', express.raw({ type: 'application/json' }));");
    const jsonIdx = src.indexOf("app.use(express.json({ limit: '1mb' }));");
    expect(rawIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeLessThan(jsonIdx);
  });
});

describe('batch-analyze metering', () => {
  it('counts one tag per analyzed photo after a successful analysis', () => {
    const src = read('controllers/batchAnalyzeController.ts');
    expect(src).toContain("import { getAiGate, AiGateContext } from '../middleware/aiUploadGate'");
    // The gate reserved units up front (atomic); the controller keeps one tag per analyzed photo and refunds the rest.
    expect(src).toContain('spentTags += clusterImages.length;');
    expect(src).toContain('await gate.settle(spentTags);');
    expect(src).not.toContain('recordAiUsage(');
  });

  it('fails closed without a gate and maps items by cluster index through a Map', () => {
    const src = read('controllers/batchAnalyzeController.ts');
    expect(src).toContain('itemIdByClusterIdx');
    expect(src).toContain('new Map<number, string>()');
    expect(src).toContain('export function detectImageMime');
  });

  it('the route pre-checks quota with one unit per submitted image', () => {
    const src = read('routes/upload.ts');
    expect(src).toContain("organizerAiGate({ requireSaleId: true, units: (req: Request) => (Array.isArray(req.body?.imageUrls) ? req.body.imageUrls.length : 1) })");
  });
});
