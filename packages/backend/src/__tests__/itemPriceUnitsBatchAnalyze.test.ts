/**
 * Item.price units in batch analyze. Item.price is dollars (schema.prisma: `price Float?`; itemController stores
 * parseFloat(price) as typed; processRapidDraft writes the AI dollar price; cloudAIService converts the pricing
 * orchestrator's cents with / 100 before it reaches suggestedPrice). batchAnalyzeController used to write
 * suggestedPrice * 100 into Item.price (a $12.99 suggestion stored as $1,299) and to report a stored price / 100 from
 * the organizer-intent gate. The weekly picks email divided Item.price by 100 as well ($25 shown as $0.25).
 *
 * The controller is too heavy to drive end to end (see batchAnalyzeCardAware.test.ts), so its two price lines are
 * asserted on source; the weekly email is rendered for real.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: jest.fn() } } }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) } }));

import { buildEmailHtml } from '../services/weeklyEmailService';

const controllerSrc = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'batchAnalyzeController.ts'), 'utf8');
const code = controllerSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('batchAnalyzeController writes Item.price in dollars', () => {
  it('never multiplies suggestedPrice by 100', () => {
    expect(code).not.toMatch(/suggestedPrice\s*\*\s*100/);
  });

  it('writes the dollar suggestion straight into Item.price', () => {
    expect(code).toContain('price: summary.suggestedPrice ? summary.suggestedPrice : undefined,');
  });

  it('the organizer-intent gate reports the stored dollar price without dividing by 100', () => {
    expect(code).not.toMatch(/gateItem\.price\s*\/\s*100/);
    expect(code).toContain('suggestedPrice: gateItem.price ? gateItem.price : undefined,');
  });
});

describe('weekly picks email shows Item.price as dollars', () => {
  const pick = (id: string, price: number | undefined) => ({
    id, title: `Item ${id}`, price, saleName: 'Sale', saleStartDate: new Date(Date.now() + 3 * 86400000), saleCity: 'Paw Paw', saleId: 's1',
  });

  it('renders $25.00 for a $25 item and the range in dollars', () => {
    const html = buildEmailHtml('Pat', [pick('a', 25), pick('b', 40), pick('c', undefined)], 'tok');
    expect(html).toContain('$25.00');
    expect(html).toContain('$40.00');
    expect(html).toContain('Prices from $25 to $40.');
    expect(html).not.toContain('$0.25');
  });
});
