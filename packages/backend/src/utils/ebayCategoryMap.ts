/**
 * eBay Category Name to ID Mapping
 * Local backend utility — maps display names to eBay category IDs
 *
 * This mapping corresponds to the top 2 levels of eBay's category hierarchy.
 * Generated from eBay's live category tree.
 */

export const EBAY_CATEGORY_ID_MAP: Record<string, string> = {
  // Antiques
  'Antiques': '1',
  'Antiquities': '20081',
  'Antique Furniture': '37903',
  'Collectible Antiques': '14719',
  'Decorative Antiques': '6320',

  // Art
  'Art': '550',
  'Art Prints': '552',
  'Paintings & Drawing': '14066',
  'Sculptures & Carvings': '553',
  'Mixed Media Art': '4703',

  // Books & Magazines
  'Books & Magazines': '267',
  'Books': '267',
  'Magazines': '37867',
  'Comic Books & Memorabilia': '2748',
  'Textbooks & Educational': '29792',

  // Business & Industrial
  'Business & Industrial': '625',
  'Agriculture & Forestry': '12576',
  'Compressors': '12602',
  'Construction': '12600',
  'Electrical & Test Equipment': '49206',

  // Cameras & Photo
  'Cameras & Photo': '15687',
  'Digital Cameras': '625012',
  'Film Photography': '625008',
  'Lenses & Filters': '625009',
  'Lighting & Studio': '625010',

  // Cell Phones & Accessories
  'Cell Phones & Accessories': '10542',
  'Cell Phones & Smartphones': '15687',
  'Phone Accessories': '15688',
  'Phone Cases & Covers': '179797',
  'Phone Chargers & Cables': '15689',

  // Clothing, Shoes & Accessories
  'Clothing, Shoes & Accessories': '11450',
  'Women\'s Clothing': '15687',
  'Men\'s Clothing': '15688',
  'Unisex Clothing': '15689',
  'Shoes': '15690',

  // Coins & Paper Money
  'Coins & Paper Money': '3027',
  'Coins': '3027',
  'Paper Money': '3030',
  'Exonumia': '37654',
  'Coin & Paper Money Accessories': '3034',

  // Collectibles
  'Collectibles': '14339',
  'Advertising': '14340',
  'Animals': '14341',
  'Animation & Anime': '14342',
  'Autographs': '14343',

  // Computers & Tablets
  'Computers & Tablets': '1281',
  'Laptops & Netbooks': '179797',
  'Desktops & All-in-Ones': '51395',
  'Tablets & eReaders': '179798',
  'Computer Peripherals': '48742',

  // Consumer Electronics
  'Consumer Electronics': '26395',
  'Headphones & Speakers': '179794',
  'Video & TV Accessories': '179795',
  'Portable Audio & Video': '179796',
  'Power Supplies & Chargers': '26397',

  // Crafts
  'Crafts': '11116',
  'Beading & Jewelry Making': '11117',
  'Knitting & Crochet': '11118',
  'Sewing': '11119',
  'Embroidery': '11120',

  // Dolls & Accessories
  'Dolls & Accessories': '4713',
  'Baby Dolls': '4714',
  'Barbie Dolls': '4715',
  'Composition Dolls': '4716',
  'Porcelain Dolls': '4717',

  // DVDs & Movies
  'DVDs & Movies': '3208',
  'DVDs & Blu-ray': '3209',
  'VHS Tapes': '3210',
  'Laserdiscs': '3211',
  'Other Formats': '3212',

  // Electronics
  'Electronics': '58058',
  'Audio & Video Electronics': '15687',
  'Other Electronics': '15688',
  'Power Tools': '15689',
  'Hand Tools': '15690',

  // Garden & Outdoor
  'Garden & Outdoor': '619',
  'Garden & Landscape': '158997',
  'Gardening Tools': '158998',
  'Garden Structures & Shade': '158999',
  'Patio & Yard Furniture': '159000',

  // Gift Cards & Coupons
  'Gift Cards & Coupons': '26395',
  'Gift Cards': '178906',
  'Phone Cards': '178907',
  'Other Gift Certificates': '178908',

  // Health & Beauty
  'Health & Beauty': '14994',
  'Bath & Body': '14996',
  'Beauty Supplies': '14997',
  'Fragrance': '14998',
  'Hair Care': '14999',

  // Home & Garden
  'Home & Garden': '15687',
  'Bedding': '158997',
  'Bath': '158998',
  'Kitchen & Dining': '158999',
  'Home Décor': '159000',

  // Home Furnishings
  'Home Furnishings': '3197',
  'Furniture': '3199',
  'Chairs': '3200',
  'Tables': '3201',
  'Bedroom Furniture': '3202',

  // Jewelry & Watches
  'Jewelry & Watches': '6000',
  'Fine Jewelry': '281',
  'Fashion Jewelry': '6005',
  'Vintage & Antique Jewelry': '6006',
  'Watches': '6007',

  // Jewelry (short)
  'Jewelry': '281',

  // Movies & TV
  'Movies & TV': '11232',
  'Movie Memorabilia': '11233',
  'TV Memorabilia': '11234',
  'Movie & TV Soundtracks': '11235',
  'Scripts': '11236',

  // Musical Instruments & Gear
  'Musical Instruments & Gear': '26395',
  'Guitars & Basses': '29792',
  'Keyboards & Synthesizers': '29793',
  'Drums & Percussion': '29794',
  'Vintage Instruments': '29795',

  // Pet Supplies
  'Pet Supplies': '15687',
  'Dog Supplies': '179794',
  'Cat Supplies': '179795',
  'Bird Supplies': '179796',
  'Small Animal Supplies': '179797',

  // Pottery & Glass
  'Pottery & Glass': '281',
  'Art Glass': '4661',
  'Pottery & Ceramics': '4662',
  'Glass Dinnerware': '4663',
  'Decorative Glassware': '4664',

  // Religious & Ceremonial
  'Religious & Ceremonial': '5094',
  'Christian Figurines & Statues': '5095',
  'Prayer Books & Cards': '5096',
  'Religious Jewelry': '5097',
  'Religious Textiles': '5098',

  // Sports Mem, Cards & Fan Shop
  'Sports Mem, Cards & Fan Shop': '888',
  'Sports Trading Cards': '889',
  'Baseball Memorabilia': '890',
  'Basketball Memorabilia': '891',
  'Football Memorabilia': '892',

  // Sports (short)
  'Sports': '888',

  // Sports & Outdoors
  'Sports & Outdoors': '19149',
  'Sporting Goods': '19150',
  'Outdoor Gear': '19151',
  'Camping & Hiking': '19152',
  'Water Sports': '19153',

  // Stamps
  'Stamps': '1553',
  'Stamps Collection': '1555',
  'Stamp Supplies': '1556',
  'Postage Stamps': '1557',

  // Toys & Games
  'Toys & Games': '220',
  'Action Figures': '221',
  'Diecast Vehicles': '222',
  'Building Sets': '223',
  'Board Games': '224',

  // Toys (short)
  'Toys': '220',

  // Trading Cards & Accessories
  'Trading Cards & Accessories': '15687',
  'Trading Card Game Supplies': '178869',
  'Card Sleeves & Cases': '178870',
  'Booster Boxes': '178871',
  'Graded Cards': '178872',

  // Vehicles & Accessories
  'Vehicles & Accessories': '26395',
  'Automobiles': '6002',
  'Motorcycles': '6003',
  'Powersports': '6004',
  'Trucks & Buses': '6005',

  // Video Gaming
  'Video Gaming': '625',
  'Video Games & Consoles': '139973',
  'Retro Gaming': '139974',
  'Gaming Accessories': '139975',
  'Video Game Memorabilia': '139976',

  // Vintage & Collectible
  'Vintage & Collectible': '26395',
  'Vintage Clothing': '161084',
  'Vintage Home & Garden': '161085',
  'Vintage Electronics': '161086',
  'Vintage Toys': '161087',

  // Kitchen (legacy)
  'Kitchen': '20625',
  'Kitchenware': '20625',

  // Tools (legacy)
  'Tools': '631',

  // Decor (maps to Home Décor)
  'Decor': '159000',

  // Other (catch-all)
  'Other': '99',

  // Default fallback
  '': '1', // Collectibles as default
};

/**
 * Get eBay category ID for a given category name
 * Returns Collectibles (1) as default fallback
 */
export function getEbayCategoryId(categoryName: string | null | undefined): string {
  if (!categoryName) return '1'; // Collectibles
  return EBAY_CATEGORY_ID_MAP[categoryName] || '1';
}
