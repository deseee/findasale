/**
 * Auto-generated city tips for long-tail cities
 * Used as fallback when no human-authored tip exists
 */

export interface CityTipsInput {
  cityName: string;
  state: string;
  population: number;
  topCategories: string[];
  regionType: 'northern' | 'southern' | 'midwest' | 'western';
}

const SEASONAL_PATTERNS: Record<string, Record<string, string>> = {
  northern: {
    peakMonth: 'March–May',
    seasonalInsight:
      'Spring is peak season in northern regions as winter homes clear inventory. Expect 3–5 sales per week March–May.',
  },
  southern: {
    peakMonth: 'October–November',
    seasonalInsight:
      'Southern estate sales peak in fall when summer heat subsides. Winter brings slower activity due to holiday travel.',
  },
  midwest: {
    peakMonth: 'April–June',
    seasonalInsight:
      'Midwest estate sales peak in late spring when post-winter downsizing occurs. Summer sees steady activity; winter slows considerably.',
  },
  western: {
    peakMonth: 'March–September',
    seasonalInsight:
      'Western cities show longer seasons due to milder winters. Peak activity March–September; demand drops Oct–Feb.',
  },
};

const REGIONAL_TIPS: Record<string, Record<string, string>> = {
  northern: {
    tip: 'Northern estate sales often feature quality furniture and vintage goods from settled families. Look for Arts & Crafts and mid-century modern pieces.',
  },
  southern: {
    tip: 'Southern estates frequently contain antique furniture, Civil War memorabilia, and vintage collectibles. Estate sale season aligns with spring cleaning.',
  },
  midwest: {
    tip: 'Midwest communities produce steady, quality estate sales with strong furniture markets. Dairy farming heritage means functional, durable items.',
  },
  western: {
    tip: 'Western cities attract newer residents with frequent relocations and estate sales. Tech-industry spillover means modern furniture and electronics.',
  },
};

export function generateCityTip(input: CityTipsInput): string {
  const { cityName, state, population, topCategories, regionType } = input;
  const seasonal = SEASONAL_PATTERNS[regionType];
  const regional = REGIONAL_TIPS[regionType];

  const formattedPop = population.toLocaleString();
  const categories = topCategories.slice(0, 3).join(', ');

  return `# Estate Hunting in ${cityName}, ${state}

${cityName} is home to ${formattedPop} residents and a growing estate sale community. Top categories here: ${categories}.

## Best Times to Hunt

Estate sales in ${cityName} typically peak in ${seasonal.peakMonth}, when seasonal downsizing is in full swing. ${seasonal.seasonalInsight}

## Insider Tip

${regional.tip} Check back frequently for upcoming sales—new listings typically appear 1–2 weeks before events.

## How to Hunt Smartly

1. **Join the platform** — save your favorite sales and get alerts for new ones in ${cityName}
2. **Follow organizers** — get notified the moment they list a new sale
3. **Plan your route** — use GPS and sale timestamps to maximize your visit
4. **Check condition carefully** — remote viewings are great for planning, but always inspect in person before purchasing

Happy hunting!`;
}
