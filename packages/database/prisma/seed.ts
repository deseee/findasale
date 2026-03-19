import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Seed configuration — override via environment variables to seed any region
const SEED_CONFIG = {
  city: process.env.SEED_CITY || 'Riverside',
  state: process.env.SEED_STATE || 'IL',
  stateAbbrev: process.env.SEED_STATE_ABBREV || 'MI',
  centerLat: parseFloat(process.env.SEED_CENTER_LAT || '42.96'),
  centerLng: parseFloat(process.env.SEED_CENTER_LNG || '-85.66'),
  zips: (process.env.SEED_ZIPS || '49503,49504,49505,49506,49507,49508,49509,49512,49525,49534').split(','),
};

// Realistic data arrays
const firstNames = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Karen', 'Leo', 'Maya', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rachel', 'Sam', 'Tina',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zoe', 'Aaron', 'Bella', 'Chris', 'Diana',
  'Ethan', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia', 'Kevin', 'Lisa', 'Marcus', 'Nina',
  'Oscar', 'Patricia', 'Quincy', 'Rebecca', 'Steven', 'Tabitha', 'Ulysses', 'Violet', 'Walter', 'Xena',
  'Yusuf', 'Zara', 'Adrian', 'Amelia', 'Austin', 'Ava', 'Benjamin', 'Bianca', 'Bradley', 'Brooke',
  'Caleb', 'Chloe', 'Daniel', 'Danielle', 'Derek', 'Destiny', 'Drew', 'Destiny', 'Evan', 'Eva',
  'Felix', 'Felicity', 'Garrett', 'Gabriella', 'Gregory', 'Giselle', 'Hayden', 'Helena', 'Ivan', 'Iris',
  'Jordan', 'Jasmine', 'Keith', 'Kayla', 'Lance', 'Lena', 'Miles', 'Mia', 'Neil', 'Natalie',
];

const lastNames = [
  'Johnson', 'Smith', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor',
  'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Garcia', 'Rodriguez', 'Lee', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Allen', 'King', 'Wright', 'Scott', 'Green',
  'Baker', 'Adams', 'Nelson', 'Carter', 'Roberts', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards',
  'Collins', 'Reeves', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Morgan', 'Peterson', 'Cooper', 'Reed',
  'Bell', 'Gomez', 'Murray', 'Freeman', 'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter',
];

const businessNames = [
  'Lakeshore Estate Sales', 'Riverside Liquidators', 'Local Estate Auctions',
  'Heritage Estate Services', 'Lakewood Estate Clearance', 'Priority Estate Sales',
  'Premier Liquidation Solutions', 'Treasure Find Estate Sales', 'Valley Estate Auctions',
  'Downtown Downsizing', 'Eastside Estate Specialists', 'West side Collectibles',
];

const streetNames = [
  'Wealthy St', 'Lake Dr', 'Division Ave', 'Cherry St', 'Fulton St',
  'Ionia Ave', 'Pearl St', 'Cass Ave', 'Sheldon Ave', 'Jefferson Ave',
  'Leonard St', 'College Ave', 'Lyon St', 'Madison Ave', 'Monroe Ave',
];

const itemTitles = [
  '1940s Mahogany Dresser', 'Singer Sewing Machine', 'Cast Iron Skillet Set',
  'Vintage Record Player', 'Leather Wingback Chair', 'Crystal Vase Collection',
  'Oak Dining Table', 'Antique Pocket Watch', 'Mid-Century Sofa', 'Persian Rug',
  'Vintage Typewriter', 'Brass Floor Lamp', 'Wooden Bookshelf', 'Gilt Mirror',
  'Porcelain Dinnerware Set', 'Leather Briefcase', 'Tiffany Glass Lamp', 'Clock Radio',
  'Decorative Plates', 'Tennis Rackets', 'Vintage Camera', 'Glass Pitcher Set',
  'Copper Cookware', 'Handmade Quilts', 'Wooden Jewelry Box', 'Decorative Plates',
  'Oil Painting', 'Antique Desk', 'Chaise Lounge', 'Bookcase Unit', 'Floor Lamp',
  'Side Table', 'Ottoman', 'Wall Sconce', 'Decorative Mirror', 'Throw Pillows',
  'Area Rug', 'Table Runner', 'Curtains', 'Wall Art', 'Picture Frames',
  'Vase Set', 'Candle Holders', 'Figurines', 'Music Box', 'Jewelry Box',
  'Wooden Trunk', 'Coat Rack', 'Umbrella Stand', 'Plant Stand', 'Console Table',
];

const saleDescriptions = [
  'Complete household estate sale including furniture, electronics, and collectibles.',
  'Multi-family estate sale featuring antique furniture, vintage collectibles, and household items.',
  'Large estate with quality furniture, artwork, and home décor.',
  'Collectors estate sale featuring vintage items and antiques.',
  'Downsizing estate sale with quality household furnishings.',
  'Complete home contents sale including all furniture and décor.',
  'Estate liquidation featuring furniture, art, and collectibles.',
  'Multi-room estate sale with furniture and household items.',
];

const saleStreets = [
  'Wealthy St', 'Lake Dr', 'Division Ave', 'Cherry St', 'Fulton St',
];

const categories = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing',
];

const conditions = ['mint', 'excellent', 'good', 'fair', 'poor'];

const salePhotoUrls = [
  'https://fastly.picsum.photos/id/637/800/600.jpg?hmac=kncdkpbYYQHSXAC06PzTzVvGtm1ebZ_Qe72HkxhRvDk',
  'https://fastly.picsum.photos/id/613/800/600.jpg?hmac=-0i5Kl_9JQpW3utGuxVgA3zksoEPIAfrI2XjM1kKv2Y',
  'https://fastly.picsum.photos/id/515/800/600.jpg?hmac=u7HfJd5Ryyt_u5PUGvY_c3P4UdkjRZV0XhyZuL2Ny78',
  'https://fastly.picsum.photos/id/249/800/600.jpg?hmac=-KQaSdrUVO8GfiMHph5eE-Nwl_DUaXuvZ8O7m0WRhas',
  'https://fastly.picsum.photos/id/698/800/600.jpg?hmac=IxKdF5SjJdQg56BS_Ejc5JzVLDEe28o6cBbj6jA05Ec',
  'https://fastly.picsum.photos/id/925/800/600.jpg?hmac=C2FP6ms8hbBOX58pQCijWEP02dyO6wdn8GQ0Vb2vdQ4',
  'https://fastly.picsum.photos/id/779/800/600.jpg?hmac=AqQVSvC4EDrWxi8BnTBaxQ12KUncMaGmXsLuoFYZeT0',
  'https://fastly.picsum.photos/id/698/800/600.jpg?hmac=IxKdF5SjJdQg56BS_Ejc5JzVLDEe28o6cBbj6jA05Ec',
  'https://fastly.picsum.photos/id/465/800/600.jpg?hmac=TpadF5Inc-PTxMXMjB4q5pDPYlahe6CYRDeLbaOjRZk',
  'https://fastly.picsum.photos/id/492/800/600.jpg?hmac=aolz_CKCnAf54UuNY7lvPbI6wMzb2t81dvRkt2WJdJE',
  'https://fastly.picsum.photos/id/726/800/600.jpg?hmac=qFPjkmgGGo3bmW20SoJH_QycsmYAJOsKoElFAEamh7g',
  'https://fastly.picsum.photos/id/719/800/600.jpg?hmac=lxszKi_UN449cJaeWVhr81sYLeXlA9V5ZDLElVdnLY4',
  'https://fastly.picsum.photos/id/314/800/600.jpg?hmac=OjmCu3etW85aNJD0JaXWdV4XtFax1pY7mNMJbXxYFWY',
  'https://fastly.picsum.photos/id/663/800/600.jpg?hmac=6KwrDDW7MZ2vTZ-L_3z6b2x_4p_adCqeFB6cIMlYyhc',
  'https://fastly.picsum.photos/id/788/800/600.jpg?hmac=tgypEsAsBdraA8ehcLjJ88OAYUZHEFrfkPMokkETd0M',
  'https://fastly.picsum.photos/id/383/800/600.jpg?hmac=nC5kYs09icYCDzp6GiMOTczS-now4ZKQ6tiiCBmcIzo',
  'https://fastly.picsum.photos/id/272/800/600.jpg?hmac=Si-HAYLaQ3WaGRUeA3_AGOt2Wco07TDtbbLH97g7lZ4',
  'https://fastly.picsum.photos/id/769/800/600.jpg?hmac=WKPwJzilN_3XU-sLienIORtJxdLRvtRIMhApT28bt8E',
  'https://fastly.picsum.photos/id/497/800/600.jpg?hmac=MCuRVBkGn7uxJBlW04P9NPb-uEUUkUdaDMk9XXYRQsc',
  'https://fastly.picsum.photos/id/1011/800/600.jpg?hmac=IdMb_PQfwnMjO6rbG9t4_Y3Mi_9dFpclHfNz4TmXU_0',
];

const itemPhotoPool = [
  'https://fastly.picsum.photos/id/1037/600/400.jpg?hmac=E7oV9MlYzBUFFygTj04kbdysY_Yu8n2jqR9o-hXekyU',
  'https://fastly.picsum.photos/id/841/600/400.jpg?hmac=iAmjBV3nnPkSjUIMk9sjc2vH4Cm9HNe-BeQ0fu78NcY',
  'https://fastly.picsum.photos/id/820/600/400.jpg?hmac=FKqdyLSrMLcr2y-nT5m6eVtPj_qC6dcbSn49numf-6s',
  'https://fastly.picsum.photos/id/949/600/400.jpg?hmac=8R-1KEvShmnk-yZ7_Sv9o3R47y8r_GAyCqYMJi8shzU',
  'https://fastly.picsum.photos/id/180/600/400.jpg?hmac=GWOD1KQ7oaGkR7Zpj4QJDXLC2XkaKZjoKZ3i824mdUE',
  'https://fastly.picsum.photos/id/164/600/400.jpg?hmac=AeaV1BoMa0SBprKJm71cmlXO7mUuDsQU5t-n-xUZlus',
  'https://fastly.picsum.photos/id/568/600/400.jpg?hmac=AC6_PWP-eHtGmBwHnwlj8RTFzHuCK3EWYYFcVAuSxwk',
  'https://fastly.picsum.photos/id/132/600/400.jpg?hmac=gJk_qWSbbgRfkHDwuIj28xSW_dVYSSzzSWL89GbOHRI',
  'https://fastly.picsum.photos/id/563/600/400.jpg?hmac=-_o6NDMsUHWq07Ml1TszDSpxv22vrBh8fvcxakx4Pkc',
  'https://fastly.picsum.photos/id/128/600/400.jpg?hmac=8llVvQyDbjLA-0Fltxos8HsMmiynleSoS_LveaHajmY',
];

const reviewComments = [
  'Great selection of mid-century pieces!',
  'Prices were fair and reasonable.',
  'Excellent condition on most items.',
  'Well organized and easy to navigate.',
  'Found some amazing vintage treasures!',
  'Professional and friendly staff.',
  'Would come again!',
  'Great variety of items.',
  'Highly recommend this estate sale.',
  'Very satisfied with my purchases.',
  'Nice quality items at good prices.',
  'Friendly and helpful organizers.',
  'Well priced antiques and collectibles.',
  'Great finds!',
  'Neat items and fair pricing.',
];

async function main() {
  console.log('🌱 Starting database seed...');
  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash('password123', saltRounds);

  // Clear existing data in correct dependency order
  console.log('🗑️  Clearing existing data...');
  await prisma.$transaction([
    prisma.bid.deleteMany(),
    prisma.lineEntry.deleteMany(),
    prisma.affiliateLink.deleteMany(),
    prisma.review.deleteMany(),
    prisma.saleSubscriber.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.item.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.organizer.deleteMany(),
    prisma.user.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.feeStructure.deleteMany(),
  ]);

  // Create badges (5 total)
  console.log('⭐ Creating badges...');
  const badgesData = [
    {
      name: 'First Purchase',
      description: 'Made your first purchase',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'purchases_made', count: 1 }),
    },
    {
      name: 'Regular Shopper',
      description: 'Made 5 purchases',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'purchases_made', count: 5 }),
    },
    {
      name: 'Dedicated Collector',
      description: 'Made 20 purchases',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'purchases_made', count: 20 }),
    },
    {
      name: 'Social Butterfly',
      description: 'Referred 3 friends',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'referrals_made', count: 3 }),
    },
    {
      name: 'Community Champion',
      description: 'Earned 1000 points',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'points_earned', count: 1000 }),
    },
  ];

  const badges = await prisma.badge.createMany({ data: badgesData });
  console.log(`✅ Created ${badges.count} badges`);

  // Create encyclopedia entries (15 total)
  console.log('📚 Creating encyclopedia entries...');
  const encyclopediaData = [
    {
      slug: 'depression-glass-101',
      title: 'Depression Glass 101: A Collector\'s Guide',
      subtitle: 'Identify, value, and collect authentic depression glass',
      content: `# Depression Glass: Understanding This Affordable Collectible

Depression glass is colorful glassware produced during the Great Depression era (1930-1939). Originally distributed as premiums with other products or sold inexpensively at dime stores, these pieces have become highly collectible today.

## Identifying Depression Glass

**Key characteristics:**
- Produced in bright, vibrant colors: amber, pink, green, blue, and clear
- Often features geometric patterns or floral designs
- Feels lighter and slightly thinner than modern glassware
- May have slight imperfections or bubbles (a sign of age)

## Common Colors and Rarity
- **Amber & Clear**: Most common, least valuable
- **Pink**: Mid-range value, very popular with collectors
- **Green**: Similar pricing to pink
- **Blue**: Generally higher value than green or pink
- **Rare colors** (red, black, or specialized hues): Significantly more expensive

## Valuation Tips
1. Check condition—chips and cracks reduce value dramatically
2. Research specific patterns—some command premium prices
3. Look for rare colors within a pattern
4. Complete sets are worth more than individual pieces
5. Original production date marks add authenticity

## Starting Your Collection
Begin with pieces you love rather than pure investment value. Join collecting clubs or online communities to learn pattern names and market trends. Estate sales are excellent hunting grounds for depression glass at reasonable prices.`,
      category: 'Collectibles',
      tags: ['glass', 'depression-era', 'collectibles', 'vintage', 'tableware'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: true,
    },
    {
      slug: 'mid-century-modern-furniture-guide',
      title: 'Mid-Century Modern Furniture: Spotting Quality Pieces',
      subtitle: 'Identify authentic MCM furniture and understand what makes it valuable',
      content: `# Mid-Century Modern Furniture Guide

Mid-Century Modern (MCM) furniture, produced roughly between 1945 and 1970, remains one of the most sought-after design styles in estate sales today. Clean lines, functionality, and timeless appeal make these pieces both beautiful and practical.

## Hallmarks of MCM Design
- Minimalist, functional approach to form
- Use of natural wood (teak, walnut, rosewood)
- Metal legs, often tapered or splayed
- Upholstered seats in period-appropriate fabrics
- Geometric shapes and organic curves

## Authenticating MCM Pieces
**Check for maker marks:**
- Brand labels or stamps inside drawers
- Manufacturer's nameplates on legs or undersides
- Joinery methods typical of the era

**Evaluate wood quality:**
- Authentic MCM uses solid wood, not veneer on particleboard
- Teak and walnut are more valuable than oak or pine
- Look for natural grain patterns

## High-Value MCM Designers
- Herman Miller
- Eames
- Knoll
- Wegner
- Noguchi
- Stickley

These command premium prices; lesser-known quality makers offer better value for collectors.

## Shopping Tips
Assess structural integrity first—damaged joints reduce value significantly. Upholstery can be replaced affordably, so don't reject a great frame needing new fabric. Check for water damage or woodworm, which are costlier to address.`,
      category: 'MCM',
      tags: ['furniture', 'mid-century-modern', 'design', 'collectible', 'iconic'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: true,
    },
    {
      slug: 'victorian-antiques-period-guide',
      title: 'Victorian Era Antiques: Styles and Characteristics',
      subtitle: 'Navigate the ornate world of Victorian-era collectibles',
      content: `# Victorian Era Antiques: A Comprehensive Overview

The Victorian era (1837-1901) produced some of the most ornate and recognizable antiques you'll find at estate sales. Understanding the substyles and characteristics helps identify authentic pieces and evaluate value.

## Victorian Substyles

**Early Victorian (1837-1860):** Heavy furniture with ornate carving, cabriole legs, floral motifs

**Mid Victorian (1860-1880):** Peak of eclecticism; combining multiple historical styles in one piece

**Late Victorian (1880-1901):** Art Nouveau influence, less ornate, more streamlined

## Materials and Construction
- Mahogany, rosewood, and walnut were preferred hardwoods
- Extensive hand carving and inlay work
- Casters on furniture legs for mobility
- Upholstery in damask, velvet, or horsehair fabric

## Commonly Available Victorian Pieces
- Settees and parlor chairs
- Bedroom suites (bed, dresser, wardrobe)
- Dining tables and sideboards
- Whatnots and étagères for display
- Oil lamps and lighting fixtures

## Valuation Factors
**Premium factors:**
- Hand-carved details by known makers
- Exotic wood veneers
- Original hardware and finish
- Matching sets

**Condition concerns:**
- Woodworm or dry rot significantly reduces value
- Missing casters or hardware can be replaced
- Upholstery wear is cosmetic but affects pricing

## Spotting Quality
Run your hand over carved surfaces—crisp details indicate hand carving over machine reproduction. Examine joinery from underneath; dovetail joints are stronger and more valuable than simple butt joints.`,
      category: 'Victorian',
      tags: ['antiques', 'victorian', 'furniture', 'era', 'collectible'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'vintage-clothing-identification',
      title: 'Identifying Vintage Clothing: Era, Designer, and Value',
      subtitle: 'Learn to date and value vintage fashion from estate sales',
      content: `# Vintage Clothing: A Buyer\'s and Seller\'s Guide

Vintage clothing refers to garments at least 20 years old, with the most desirable pieces being 30-50 years old or from notable designers. Estate sales are goldmines for discovering quality vintage fashion at reasonable prices.

## Dating Vintage Clothing

**Label clues:**
- Union labels appear starting in the 1920s
- Country-of-origin labels mandatory from 1939 onward
- Care labels (wash symbols) didn't appear until 1971

**Construction details:**
- Pre-1950s often uses metal zippers; earlier garments have snaps or buttons
- Hand-stitching predates 1930s factory production
- Seam finishes and hem widths changed throughout decades

## Identifying Eras

**1920s-1930s:** Drop waistlines, cloche silhouettes, art deco prints

**1940s:** Broad shoulders, war-time rationing effects (minimal trim, repurposed fabrics)

**1950s:** Full skirts, fitted bodices, bold prints and pastels

**1960s-1970s:** Mini skirts, mod prints, polyester

## Designer Labels Worth Extra
- Chanel, Dior, Givenchy (always premium)
- Norman Norell, Hattie Carnegie (American designers, valuable)
- Mainbocher, Valentino (high-end vintage pricing)
- Department store high-end brands (Saks Fifth Avenue, Bergdorf Goodman)

## Condition Assessment
- Stains, tears, and odors significantly reduce value
- Size changes are common but affect wearability
- Dry cleaning can refresh vintage without damaging
- Alterations reduce designer piece value

## Shopping Strategy
Focus on well-constructed basics (skirts, blouses, jackets) from desirable eras and known makers. Quality leather, silk, and wool hold value better than synthetics.`,
      category: 'Furniture',
      tags: ['clothing', 'vintage', 'fashion', 'era', 'collectible'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'art-deco-design-101',
      title: 'Art Deco Design: Recognizing Style and Authenticity',
      subtitle: 'Master the glamorous geometric aesthetic of the Art Deco movement',
      content: `# Art Deco: A Design Movement for the Modern Collector

Art Deco, flourishing from the 1920s through the 1940s, embraced geometric forms, bright colors, and luxury materials. Understanding its characteristics helps you identify authentic pieces and spot valuable reproductions.

## Art Deco Fundamentals

**Core aesthetic:**
- Bold geometric patterns (triangles, sunbursts, zigzags)
- Streamlined, symmetrical forms
- Vibrant color combinations
- Luxurious materials (chrome, glass, exotic woods)

**Key periods:**
- **1920s:** Art Deco emerges in Paris; Exposition Internationale des Arts Modernes
- **1930s:** Peaks in popularity; becomes mainstream in America
- **1940s:** Transitions into Streamline Moderne as war influences design

## Materials and Techniques

**Valued materials:**
- Chrome and aluminum for furniture frames
- Lacquered wood surfaces (Chinese-inspired finishes)
- Bakelite and early plastics
- Glass—etched, mirrored, or patterned
- Exotic veneers (macassar ebony, rosewood)

**Construction signs of authenticity:**
- Hand-etched glass details
- Inlay work in contrasting woods
- Precise mitering and joinery
- Original hardware with period finishes

## Common Art Deco Items
- Furniture suites with symmetrical designs
- Lighting (table lamps, wall sconces)
- Decorative accessories (figurines, bookends, mirrors)
- Jewelry and accessories
- Architectural elements (doors, hardware, tiles)

## Valuation Considerations
Signed pieces or those attributed to known designers command premiums. Bakelite items, especially in rare colors, are highly collectible. Complete sets are worth more than individual pieces.

## Spotting Reproductions
Modern reproductions use different materials (plastic instead of Bakelite, veneers instead of solid wood) and have machine-perfect edges. Original Art Deco shows slight imperfections from hand finishing.`,
      category: 'Art Deco',
      tags: ['design', 'art-deco', 'modernism', 'furniture', 'decorative'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: true,
    },
    {
      slug: 'vintage-tools-identification',
      title: 'Vintage Tool Identification: Collecting Quality Hand Tools',
      subtitle: 'Learn to identify valuable vintage tools and why quality matters',
      content: `# Vintage Tools: A Collector\'s and Craftsperson\'s Guide

Vintage hand tools are experiencing renewed interest from both collectors and craftspeople who value their durability and superior materials. Estate sales frequently yield quality tools at reasonable prices.

## Why Vintage Tools Matter

**Superior construction:**
- Cast iron and forged steel last generations
- Simpler mechanisms are easier to maintain
- Hand-finished surfaces show superior attention to detail

**Value proposition:**
- Often cost less than modern equivalents
- Perform as well or better than new tools
- Environmental benefits of reuse
- Aesthetic appeal for workshop display

## Identifying Quality Vintage Tools

**Brand recognition:**
- Starrett: Precision measuring instruments (always valuable)
- Stanley: Planes, levels, and hand tools (pre-1970 models)
- Craftsman: USA-made variants (marked "USA" not "Taiwan")
- Walton & Mayer: Specialized joinery tools
- Disston: Hand saws with blade-etching details

**Construction markers:**
- Cast iron bodies vs. stamped steel (cast is stronger)
- Wooden handles indicate older, hand-tool production
- Hand-forged edges show slight irregularities
- Patent dates on tools help with dating

## Common Valuable Finds
- Machinist toolboxes with original tools
- Plane types (jack, jointer, smoothing)
- Vintage chisels with maker marks
- Complete tool sets in original cases
- Specialized tools for trades (woodworking, masonry)

## Restoration and Care
Clean gently with appropriate methods—overrestoration reduces value. Light rust can be addressed with oil and elbow grease. Original patina is valued by collectors over "like new" finishes.

## Shopping Tips
Quality matters more than quantity; one excellent Starrett tool outweighs ten generic hammers. Learn maker marks and manufacturing periods to spot quality. Tools in original cases command premiums.`,
      category: 'Tools',
      tags: ['tools', 'vintage', 'hardware', 'collectible', 'craftsmanship'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'pottery-and-porcelain-guide',
      title: 'Pottery and Porcelain: Understanding Ceramics and Value',
      subtitle: 'Learn to identify and value ceramic pieces from your estate sales',
      content: `# Pottery and Porcelain: A Comprehensive Collector\'s Guide

Ceramics—encompassing pottery, stoneware, and porcelain—are among the most common finds at estate sales. Understanding the differences and identifying valuable pieces transforms ordinary dinnerware into meaningful collectibles.

## Pottery vs. Porcelain vs. Stoneware

**Pottery:** Porous earthenware, opaque, chips easily. Generally lower value unless handmade or artistic.

**Stoneware:** Denser than pottery, often glazed. More durable, moderate collectibility.

**Porcelain:** Non-porous, translucent when held to light, resonant ring when gently struck. Higher value due to manufacturing difficulty and durability.

## Identifying Valuable Ceramics

**Maker marks and signatures:**
- Underglaze marks (printed or stamped) indicate factory production dates
- Hand-painted signatures from renowned artists
- Registry marks help date English ceramics (Registration Diamond pattern)

**Quality indicators:**
- Even glaze application
- Crisp painting or decoration details
- Symmetrical shaping and proportions
- Proper weight (feels dense and solid)

## Valuable Manufacturers and Artists

**English manufacturers:**
- Royal Doulton: Character jugs and figurines (premium)
- Wedgwood: Classical designs, jasperware
- Spode: Fine china and dinnerware

**American makers:**
- Rookwood Pottery: Art pottery (Arts & Crafts movement)
- Roseville and Weller: Colorful art pottery
- Fiesta Ware: Art Deco-influenced dinnerware

**European producers:**
- Limoges: French porcelain (often used for dinnerware services)
- Meissen: German porcelain, identifiable by crossed swords mark
- Royal Copenhagen: Scandinavian porcelain figurines

## Valuation Factors
Complete dinnerware sets command premiums over individual pieces. Rare colors or patterns significantly increase value. Hand-painted pieces are worth more than transfer-printed designs. Artistic studio pottery often exceeds commercial production in collectibility.

## Condition Matters
Chips, cracks, and repairs substantially reduce value. Crazing (fine surface cracks in glaze) is common but acceptable in older pieces. Restored pieces are worth 30-50% of pristine condition equivalents.`,
      category: 'Collectibles',
      tags: ['pottery', 'porcelain', 'ceramic', 'dinnerware', 'collectible'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'americana-collectibles-guide',
      title: 'Americana Collectibles: Folk Art, Textiles, and Memorabilia',
      subtitle: 'Discover and value authentic Americana pieces from estate sales',
      content: `# Americana Collectibles: Celebrating American Folk Heritage

Americana encompasses the decorative arts, folk crafts, and cultural artifacts reflecting American life and values. These collectibles range from quilts and folk art to trade signs and memorabilia, making them among the most emotionally resonant finds at estate sales.

## Categories of Americana

**Textiles:**
- Quilts (pieced, appliquéd, or whole-cloth)
- Samplers and needlework
- Coverlets and blankets
- Hooked or braided rugs

**Folk art:**
- Carved wooden decoys and weathervanes
- Painted or stenciled furniture
- Fraktur (decorated documents)
- Whirligigs and mechanical toys

**Memorabilia:**
- Political buttons and campaign items
- Trade cards and advertising ephemera
- Early printed materials
- Patriotic items and flag textiles

**Functional crafts:**
- Handmade baskets
- Woven textiles
- Pottery with folk decoration
- Metalware (tinware, wrought iron)

## Valuation Drivers

**Authenticity:** Handmade, period-appropriate pieces command premiums

**Provenance:** Family histories and documented origins increase value

**Condition:** Use-wear appropriate to age is acceptable; major damage reduces value

**Rarity:** Uncommon designs, maker-signed items, or limited production

## Spotting Quality Americana

**Construction clues:**
- Hand-stitching in textiles (irregular stitch length is authentic)
- Mortise-and-tenon joinery in wooden pieces
- Period-appropriate materials and dyes
- Evidence of actual use (patina, wear patterns)

**Documentation matters:**
- Maker's marks or signatures
- Dye type in textiles (natural vs. synthetic)
- Nail types in furniture (wrought vs. wire)

## Common Estate Sale Finds

Quilts (often undervalued), hand-painted furniture, carved wooden items, decorated tinware, and stoneware crocks represent excellent value opportunities. Learn regional variations—New England folk art differs from Appalachian or Native American traditions.`,
      category: 'Americana',
      tags: ['americana', 'folk-art', 'textiles', 'quilts', 'memorabilia'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: true,
    },
    {
      slug: 'vinyl-records-grading-guide',
      title: 'Vinyl Records: Grading, Condition, and Collector Value',
      subtitle: 'Master vinyl record valuation and condition assessment',
      content: `# Vinyl Records: A Collector\'s Guide to Grading and Value

Vinyl records have seen resurgent interest from collectors, audiophiles, and music enthusiasts. Understanding condition grading and market factors helps you identify valuable records at estate sales.

## The Goldmine Standard Grading System

**Mint (M):** Unplayed condition, original shrink wrap, perfect surfaces

**Near Mint (NM):** Virtually unplayed, minimal surface marks, near-perfect sound

**Very Good Plus (VG+):** Minor wear visible in light; plays with minimal surface noise

**Very Good (VG):** Obvious wear, audible surface noise, but playable; grades consistently across multiple plays

**Good Plus (G+):** Heavy wear, significant surface noise, still playable

**Good (G):** Very heavy wear, considerable surface noise, listenable

**Fair (F):** Warped, heavy damage, plays but with difficulty

**Poor (P):** Unplayable, heavily damaged

## Factors Affecting Value

**Rarity:** Limited pressings, first editions, regional releases command premiums

**Condition of cover:** Dust jackets/sleeves dramatically impact value; VG+ record with poor sleeve is worth less than mint record in excellent jacket

**Pressing variations:** Different label designs, catalog numbers indicate first pressings (often more valuable)

**Artist importance:** Collectible genres (jazz, soul, punk, prog rock) hold value better than others

## High-Value Records to Spot

- Original pressings of classic rock albums (Led Zeppelin, Pink Floyd)
- Jazz first pressings (Miles Davis, Coltrane)
- Soul and R&B original labels (Motown, Atlantic)
- Punk and New Wave original releases
- Deleted/out-of-print albums

## Storage and Care

Original jackets must be stored vertically (never stacked flat). Keep records away from heat and humidity. Play on quality turntables to prevent further damage. Original shrink wrap increases value significantly even if removed.

## Shopping Tips
Focus on condition—a VG+ record sounds dramatically better than Good grade equivalent. First pressings in any condition are more valuable than reissues. Learn which records have valuable variants (different label colors, barcode presence, etc.).`,
      category: 'Collectibles',
      tags: ['vinyl', 'records', 'music', 'collectible', 'audio'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'jewelry-appraisal-basics',
      title: 'Jewelry Appraisal Basics: Materials, Hallmarks, and Value',
      subtitle: 'Learn to evaluate jewelry and spot valuable pieces',
      content: `# Jewelry Appraisal Basics: A Shopper\'s Guide

Jewelry is frequently found at estate sales and can represent significant value if you understand materials, hallmarks, and market factors. This guide helps you make informed decisions.

## Precious Metals

**Gold:** Marked with purity (10K, 14K, 18K, 22K, 24K). Higher karat = higher purity and value. Color (yellow, white, rose) doesn't affect value but style preference affects collectibility.

**Silver:** Sterling (925/1000 pure) is standard for jewelry. Marked "925" or "STERLING." Silver plate has less value than solid silver.

**Platinum:** Rarest and most valuable precious metal. Marked "PT" or "PLAT." Much heavier than gold.

**Stainless steel & base metals:** Common in mass-produced costume jewelry; minimal precious metal value.

## Gemstones

**Precious stones (high value):**
- Diamonds: Value determined by 4 Cs (Carat, Cut, Clarity, Color)
- Ruby, sapphire, emerald: Valued by size, color intensity, clarity

**Semi-precious stones (moderate value):**
- Amethyst, topaz, garnet, opal
- Quality ranges widely
- Color and clarity affect value

**Imitation stones (low value):**
- Glass, plastic, cubic zirconia
- Inexpensive to replace
- No collector value

## Hallmarks and Maker Identification

**Location of marks:** Inside rings, bands, or backs of brooches

**Purity marks:** Country-specific (US uses karat numbers, Europe uses 3-digit decimals)

**Maker marks:** Look for designer initials or brand names

**Valuable makers:**
- Tiffany & Co., Cartier (always premium)
- Mikimoto (pearls)
- Signed costume jewelry from mid-century (Schiaparelli, Miriam Haskell)

## Condition Assessment

**Metal condition:**
- Wear and patina are acceptable in antique pieces
- Significant dents, cracks, or damage reduce value
- Repairs (soldering) are acceptable but documented

**Stone condition:**
- Chips, cracks, or significant scratches reduce value substantially
- Cloudiness in diamonds indicates lower clarity
- Missing stones reduce value more than chip damage

## Common Estate Sale Opportunities

Mid-century costume jewelry, estate gold pieces requiring refinishing, vintage watches (often highly valuable), and semi-precious stone collections represent good value potential. Don't overlook simple gold bands or plain settings—melt value alone may exceed asking price.

## When to Get Professional Appraisal

Pieces with gemstones over 1 carat warrant professional evaluation. Significant precious metal items should be appraised by certified gemologists. Designer pieces with provenance benefit from expert authentication.`,
      category: 'Collectibles',
      tags: ['jewelry', 'gems', 'precious-metals', 'antique', 'collectible'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'antique-books-first-editions',
      title: 'Antique Books and First Editions: Finding Value in Literature',
      subtitle: 'Learn to identify valuable books and first editions at estate sales',
      content: `# Antique Books and First Editions: A Collector\'s Handbook

Books represent some of the most accessible collectibles at estate sales, with values ranging from modest to substantial depending on age, condition, author, and edition. Understanding these factors helps identify hidden treasures.

## Book Values: What Drives Price?

**Rarity:** Limited print runs, regional publishers, or books that have become hard to find

**Author significance:** First books by now-famous authors; self-published works later gained fame

**Historical importance:** Significant first publications, controversial works, important scientific or literary works

**Condition:** Critical factor; pristine copies worth dramatically more than worn examples

**Edition specificity:** First editions in first issue (with original dust jacket) are premiums

## Identifying First Editions

**Check publication data:**
- "First Edition" explicitly stated on copyright page (easiest method)
- Absence of "Second Printing," "Revised Edition," etc. indicates first
- Publication date matches copyright date
- British vs. American firsts (sometimes priced differently)

**Dust jacket importance:**
- Original dust jacket can add 50-200% to value
- Must be unfaded, intact, and unclipped
- Flap copy and artwork affect collectibility
- Loss of dust jacket substantially reduces desirability

**Printing numbers:**
- Number line on copyright page—"1" appearing in line indicates first printing
- Modern publishers use "1 2 3 4 5" format; presence of "1" = first printing

## High-Value Authors and Genres

**Classic literature first editions:**
- F. Scott Fitzgerald, Ernest Hemingway, William Faulkner

**Mystery/crime:**
- Agatha Christie, Sherlock Holmes originals, Dashiell Hammett

**Science fiction:**
- Early H.G. Wells, Jules Verne, Isaac Asimov

**Children's literature:**
- Winnie the Pooh, Nancy Drew originals, Dr. Seuss first editions

**Local/regional authors:**
- Often undervalued; regional history interest can increase value

## Condition Factors

**Binding condition:** Spine strength critical; broken spines reduce value 30-50%

**Page condition:** Foxing (brown spots) acceptable in older books; water damage reduces value

**Markings:** Signatures, annotations, library stamps reduce collectible value (unless famous person signed)

**Smell:** Musty odor is cosmetic but affects desirability

## Pricing Resources
- Alibris, AbeBooks: Online marketplaces for rare books
- VIALIBRI: Price aggregator across multiple sellers
- Sold comparables: Similar titles in similar condition establish market value

## Estate Sale Strategy
Entire libraries often sell below market value. Learn key authors and genres. Early twentieth-century fiction frequently underpriced. Children's editions and local authors represent value opportunities if you research comparable sales.`,
      category: 'Toys',
      tags: ['books', 'first-editions', 'literature', 'collectible', 'antique'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'estate-sale-shopping-tips',
      title: 'Estate Sale Shopping 101: Strategy, Timing, and Best Practices',
      subtitle: 'Master the art of smart estate sale shopping',
      content: `# Estate Sale Shopping 101: The Complete Strategy Guide

Estate sales can be overwhelming and competitive. Whether you're a casual browser or serious collector, strategic planning maximizes your success and enjoyment.

## Before the Sale: Research and Preparation

**Scout the listing:**
- Review photos carefully—zoom in on details
- Note sale dates, hours, and preview availability
- Identify high-interest items worth arriving early for
- Check address and parking situation

**Make your wish list:**
- Prioritize items you'd regret missing
- Research fair market values for high-value items
- Set budget limits for each category
- Note target price ranges

**Arrive strategically:**
- Preview day is less crowded; note condition and exact location of items
- Opening day attracts dealers and serious collectors
- Later days often have price reductions
- Mid-day shopping balances crowd levels with selection

## During the Sale: Smart Bidding and Negotiation

**Inspection tips:**
- Examine items closely for damage (turn on electronics, test furniture joints)
- Ask questions about condition, history, or authenticity
- Request detailed information about provenance if significant

**Pricing strategy:**
- Markup markedly increases through the sale progression
- Higher-value items priced competitively; bulk items marked up
- Day-of or evening negotiations may succeed
- Multiple-item purchases often merit discounts

**Crowd navigation:**
- Peak times: First hours and early afternoon on opening day
- Avoid peak times if you prefer unhurried browsing
- Develop relationships with sale coordinators—helpful for information

## Spotting Sleepers and Value

**Knowledge is power:**
- Learn maker marks, hallmarks, designer signatures
- Understand condition factors specific to item type
- Research obscure but valuable categories (old tools, technical equipment)
- Develop specialty knowledge in areas of personal interest

**Common undervalued finds:**
- Vintage glassware (often priced under actual market value)
- Quality kitchenware and cookbooks
- Technical or specialized tools
- Books and ephemera (undervalued unless rare editions)
- Simple wooden furniture and smaller case pieces

**Don't overlook:**
- Boxes of mixed items (great value if you sort)
- Damaged items with appeal to restorers
- Items requiring cleaning or minor repair
- Incomplete sets (sometimes sellable as components)

## After the Purchase: Care and Documentation

**Condition preservation:**
- Transport carefully to avoid additional damage
- Clean appropriately based on material type
- Store in climate-controlled environments
- Document your finds through photography

**Building your collection:**
- Research provenance and maker information
- Connect with collector communities for learning
- Consider insurance for valuable pieces
- Enjoy the history and craftsmanship of your finds

## The Estate Sale Experience

Estate sales offer unique opportunities to connect with material culture and history. Approach with curiosity, realistic expectations, and respect for the families involved. The best finds aren't always the most expensive—sometimes the most rewarding treasures are those that bring personal joy or tell compelling stories.`,
      category: 'Furniture',
      tags: ['shopping', 'estate-sales', 'tips', 'strategy', 'collecting'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: true,
    },
    {
      slug: 'vintage-lighting-fixtures',
      title: 'Vintage Lighting Fixtures: From Tiffany to Atomic',
      subtitle: 'Identify and value vintage lamps, chandeliers, and lighting design',
      content: `# Vintage Lighting: A Luminous Collector\'s Guide

Lighting fixtures bridge functional necessity and artistic expression, making them premier collectibles. From Art Nouveau to Atomic Age, vintage lighting encompasses diverse styles and price points.

## Major Lighting Styles and Periods

**Tiffany and Arts & Crafts (1880-1920s):**
- Handcrafted glass shades with intricate patterns
- Bronze or brass bases, often with organic forms
- High collectibility and values ($500-5000+ for authentic pieces)

**Art Deco (1920s-1940s):**
- Geometric patterns, streamlined forms
- Chrome, glass, and Bakelite materials
- Moderate to high value depending on designer

**Mid-Century Modern (1945-1970):**
- Sculptural bases, innovative materials
- Designers like George Nelson, Arteluce, Artemide
- Rising in popularity and value

**Atomic/Space Age (1950s-1960s):**
- Whimsical forms, bright colors, futuristic designs
- Plastic, fiberglass, and metal construction
- Increasingly collectible; values climbing

## Authentication Tips

**Materials analysis:**
- Tiffany: Copper-foil glass (not modern solder joints); bronze patina
- Mid-Century: Teak or walnut wood, brushed aluminum, original wiring
- Period-appropriate electrical components: cloth wiring in older lamps

**Maker identification:**
- Tiffany Studios marks on shade and base
- Designer signatures in wood bases
- Company nameplates on modern vintage
- Patent dates help establish production period

**Construction quality:**
- Hand-soldered joints on glass shades (not perfect, slightly irregular)
- Custom metalwork vs. mass production
- Quality of finish and material consistency

## Common Fixtures at Estate Sales

Table lamps (most common), floor lamps (valuable if quality design), ceiling fixtures and chandeliers, wall sconces, and desk lamps. Hanging pendants are less common but highly desirable if original.

## Valuation Factors

Original shades dramatically increase value—replacements reduce desirability. Complete, undamaged fixtures command premiums. Signed pieces or those by known designers fetch higher prices. Functionality (working electrical systems) preferred but restoration acceptable.

## Care and Restoration

Have vintage electrical systems inspected by qualified electricians. Rewiring is appropriate and doesn't reduce value if done professionally. Clean fixtures appropriately by material (never use harsh chemicals on art glass). Documentation through photos aids in research and potential appraisal.`,
      category: 'MCM',
      tags: ['lighting', 'lamps', 'vintage', 'design', 'collectible'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
    {
      slug: 'oriental-rugs-guide',
      title: 'Oriental and Vintage Rugs: Identifying Quality and Authenticity',
      subtitle: 'Master rug identification, knotting techniques, and value assessment',
      content: `# Oriental and Vintage Rugs: A Comprehensive Collector\'s Guide

Rugs are among the most significant purchases at estate sales, with values ranging from modest to substantial. Understanding construction, origin, and condition dramatically impacts your collecting success.

## Rug Construction Basics

**Hand-knotted rugs:**
- Individual knots hand-tied to warp threads
- Labor-intensive; quality correlates with knot density (KPSI—knots per square inch)
- Higher knot density = finer detail, greater durability, higher value
- Can take months to years to complete

**Hand-woven rugs:**
- Weft threads passed through warp
- Less common at estate sales; generally lower value than knotted
- Still handmade; quality varies by region

**Machine-made rugs:**
- Mass production; no collector value beyond decorative
- Easy to identify: perfectly regular, identical patterns, chemical smell

## Regional Classifications

**Persian rugs:**
- Diverse regions: Tabriz, Isfahan, Kashan, Qum (high value)
- Fine knotting, classical designs, rich colors
- Values: $500-5000+ for quality examples

**Turkish rugs:**
- Geometric patterns, traditional designs
- Slightly coarser knot than Persian equivalents
- Moderate values: $300-2000

**Chinese rugs:**
- Distinct aesthetic, often floral or dragon motifs
- Growing collector interest; values increasing
- Quality varies widely by age and condition

**Caucasian and Central Asian:**
- Bold geometric patterns, vibrant colors
- Smaller size typical; values vary by condition
- Increasing in collector popularity

## Authenticity Verification

**Knot examination:**
- Look at back: Hand-knotted shows individual knots; machine-made is perfectly regular
- Count knots (if possible) to estimate fineness
- Check for asymmetrical knots (Persian) vs. symmetrical (Turkish)

**Dye analysis:**
- Natural dyes (pre-1850s primarily) fade naturally and unevenly
- Synthetic dyes (post-1870s) fade more uniformly
- Uneven fading pattern indicates age and authenticity

**Condition clues:**
- Wear patterns should be natural (high-traffic areas more worn)
- Fringe attachment: Hand-knotted shows individual knots; machine-made is sewn

## Size and Value

Traditional sizes (runner, scatter, room size) command better prices than unusual dimensions. Large rugs (9x12 and up) valuable if in good condition. Small accent rugs have limited market demand.

## Condition Assessment

**Minor acceptable wear:** Natural patina from use; light fading

**Condition issues:** Holes, tears, stains, odors, loose or missing fringe all reduce value

**Restoration impact:** Professional cleaning acceptable; reweaving or extensive repair reduces value 20-40%

## Shopping at Estate Sales

Rugs often sell below appraised value at estate sales. Research similar rugs on auction sites (Christies, Sothebys) for comparable pricing. Professional appraisal worthwhile for significant pieces. Storage condition matters—musty odor requires professional cleaning but isn't permanent damage.`,
      category: 'Furniture',
      tags: ['rugs', 'oriental', 'textile', 'collectible', 'design'],
      authorId: users[0].id,
      status: 'PUBLISHED',
      isFeatured: false,
    },
  ];

  for (const entry of encyclopediaData) {
    await prisma.encyclopediaEntry.create({ data: entry });
  }
  console.log(`✅ Created ${encyclopediaData.length} encyclopedia entries`);

  // B1: Seed FeeStructure with default 10% global rate
  console.log('💰 Seeding FeeStructure...');
  await prisma.feeStructure.upsert({
    where: { id: 1 },
    update: {},
    create: { listingType: '*', feeRate: 0.10 }
  });
  console.log('✅ FeeStructure seeded (10% global rate)');

  // Get badge IDs for later use
  const allBadges = await prisma.badge.findMany();
  const badgeMap = new Map(allBadges.map((b: any) => [b.name, b.id]));

  // Create 100 users (90 shoppers, 10 organizers)
  console.log('👥 Creating 100 users...');
  const users: any[] = [];
  const pointsOptions = [0, 50, 150, 320, 750, 1200];

  for (let i = 0; i < 100; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const email = `user${i + 1}@example.com`;
    const points = pointsOptions[Math.floor(Math.random() * pointsOptions.length)];
    const hasPhone = Math.random() > 0.4; // 60% have phone numbers

    const user = await prisma.user.create({
      data: {
        email,
        password: defaultPassword,
        name: `${firstName} ${lastName}`,
        role: i < 10 ? 'ORGANIZER' : 'USER',
        points,
        phone: hasPhone ? `616-555-${String(i).padStart(4, '0')}` : null,
        referralCode: `REF-${uuidv4().substring(0, 8).toUpperCase()}`,
      },
    });
    users.push(user);
  }
  console.log(`✅ Created ${users.length} users`);

  // Create 10 organizers (from first 10 users)
  console.log('🏢 Creating 10 organizers...');
  const organizers: any[] = [];
  for (let i = 0; i < 10; i++) {
    const businessName = businessNames[i % businessNames.length];
    const street = saleStreets[Math.floor(Math.random() * saleStreets.length)];
    const number = Math.floor(Math.random() * 5000) + 100;
    const address = `${number} ${street}`;
    const zip = SEED_CONFIG.zips[Math.floor(Math.random() * SEED_CONFIG.zips.length)];
    const organizer = await prisma.organizer.create({
      data: {
        userId: users[i].id,
        businessName: `${businessName} ${i + 1}`,
        phone: `616-555-${String(1000 + i).padStart(4, '0')}`,
        address: `${address}, ${SEED_CONFIG.city}, ${SEED_CONFIG.state} ${zip}`,
        stripeConnectId: null,
      },
    });
    organizers.push(organizer);
  }
  console.log(`✅ Created ${organizers.length} organizers`);

  // Create 25 sales
  console.log('📅 Creating 25 sales...');
  const sales: any[] = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const organizer = organizers[i % organizers.length];
    const street = saleStreets[Math.floor(Math.random() * saleStreets.length)];
    const number = Math.floor(Math.random() * 5000) + 100;
    const zip = SEED_CONFIG.zips[Math.floor(Math.random() * SEED_CONFIG.zips.length)];

    let startDate, endDate, status;
    if (i < 8) {
      const weeksAhead = Math.floor(Math.random() * 6) + 2;
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() + weeksAhead * 7);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      status = 'PUBLISHED';
    } else if (i < 16) {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 3));
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 4));
      status = 'PUBLISHED';
    } else if (i < 21) {
      const monthsAgo = Math.floor(Math.random() * 4) + 3;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() - monthsAgo);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 1);
      status = 'ENDED';
    } else {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30));
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      status = 'DRAFT';
    }

    const lat = SEED_CONFIG.centerLat + (Math.random() - 0.5) * 0.1;
    const lng = SEED_CONFIG.centerLng + (Math.random() - 0.5) * 0.1;

    const tags = [
      [categories[Math.floor(Math.random() * categories.length)]],
      categories.slice(0, 3).sort(() => Math.random() - 0.5),
    ][Math.floor(Math.random() * 2)];

    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `${
          ['Downtown Downsizing', 'Eastside Collector\'s', 'Lakefront Estate', 'Family Collection'][
            Math.floor(Math.random() * 4)
          ]
        } Estate Sale ${i + 1}`,
        description: saleDescriptions[Math.floor(Math.random() * saleDescriptions.length)],
        startDate,
        endDate,
        address: `${number} ${street}`,
        city: SEED_CONFIG.city,
        state: SEED_CONFIG.state,
        zip,
        lat,
        lng,
        status,
        photoUrls: [
          salePhotoUrls[i % salePhotoUrls.length],
        ],
        tags,
      },
    });
    sales.push(sale);
  }
  console.log(`✅ Created ${sales.length} sales`);

  // Create 300 items (~12 per sale)
  console.log('📦 Creating 300 items...');
  const items: any[] = [];
  let itemCount = 0;

  for (const sale of sales) {
    const itemsPerSale = Math.floor(Math.random() * 5) + 10;
    for (let j = 0; j < itemsPerSale; j++) {
      const title = itemTitles[Math.floor(Math.random() * itemTitles.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const price = Math.floor(Math.random() * 119800) / 100 + 2;
      const hasMultiplePhotos = Math.random() > 0.6;

      let status = 'AVAILABLE';
      if (Math.random() < 0.1) status = 'SOLD';
      else if (Math.random() < 0.05) status = 'RESERVED';

      const item = await prisma.item.create({
        data: {
          saleId: sale.id,
          title: `${title} #${j + 1}`,
          description: `Beautiful ${category} item in ${condition} condition. Authentic and well-maintained.`,
          price,
          category,
          condition,
          status,
          photoUrls: hasMultiplePhotos
            ? [
                itemPhotoPool[itemCount % itemPhotoPool.length],
                itemPhotoPool[(itemCount + 1) % itemPhotoPool.length],
              ]
            : [
                itemPhotoPool[itemCount % itemPhotoPool.length],
              ],
          embedding: [],
        },
      });
      items.push(item);
      itemCount++;
    }
  }
  console.log(`✅ Created ${items.length} items`);

  // Create 50 purchases (only on SOLD or RESERVED items)
  console.log('💳 Creating 50 purchases...');
  const soldAndReservedItems = items.filter((i) => i.status === 'SOLD' || i.status === 'RESERVED');
  const purchases: any[] = [];

  for (let i = 0; i < Math.min(50, soldAndReservedItems.length); i++) {
    const item = soldAndReservedItems[i];
    const buyerIndex = Math.floor(Math.random() * 90) + 10;
    const buyer = users[buyerIndex];
    const status = Math.random() > 0.2 ? 'PAID' : 'PENDING';

    const purchase = await prisma.purchase.create({
      data: {
        userId: buyer.id,
        itemId: item.id,
        saleId: item.saleId,
        amount: item.price!,
        platformFeeAmount: item.price! * 0.05,
        status,
        stripePaymentIntentId: status === 'PAID' ? `pi_test_${uuidv4().substring(0, 20)}` : null,
      },
    });
    purchases.push(purchase);
  }
  console.log(`✅ Created ${purchases.length} purchases`);

  // Summary
  console.log('\n✨ Seed data created successfully!');
  console.log('\n📋 Data Summary:');
  console.log(`  • Users: 100 (10 organizers, 90 shoppers)`);
  console.log(`  • Organizers: 10`);
  console.log(`  • Sales: 25`);
  console.log(`  • Items: ${items.length}`);
  console.log(`  • Purchases: ${purchases.length}`);
  console.log(`  • Badges: 5`);
  console.log(`  • Encyclopedia Entries: ${encyclopediaData.length}`);
  console.log(`  • Achievements: 8 (auto-synced via service)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
