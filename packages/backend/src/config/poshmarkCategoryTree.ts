/**
 * poshmarkCategoryTree.ts -- Poshmark's category taxonomy (poshmark.com, US) as compact data, plus small lookup
 * helpers (S-EXT-POSHMARK-CATEGORY-MAP, 2026-10-05). Dependency-free on purpose: no imports, no env, no I/O, safe
 * to import from any BACKEND file (never from the frontend or @findasale/shared).
 *
 * SOURCE: public pages only, read in a normal browser tab on 2026-10-05, nothing signed in, nothing submitted,
 * no private API. Each public category page (https://poshmark.com/category/<Dept>-<Category>) embeds the full
 * catalog facet list in its own server-rendered page state (window.__INITIAL_STATE__ ... facets.catalog): the
 * department's categories, and for the page's own category its sub-categories ("category_feature"). The header
 * mega-menu (common.experiences.navData) was used only to cross-check, never as a source: it is trimmed (e.g. it
 * omits 4 of the 16 Men > Accessories sub-categories). 50 page loads in total, no 403, no bot challenge.
 *
 * SHAPE: one line per node, "id|parentId|title"; parents listed before children; parentId 0 = a department.
 * The id is Poshmark's own public URL slug for the node (title with spaces turned into underscores, joined to
 * its parent slug with "-", e.g. Men-Accessories-Belts). Poshmark also has opaque 24-hex ids per node; they are
 * not needed here because the extension picks every level by its exact visible title, so they were not kept.
 * Depth is Department > Category > Sub-category (the real sell-form picker has the same 3 levels).
 *
 * COMPLETENESS (be honest about it, the tests pin the counts):
 *  - 6 departments: Women, Men, Kids, Home, Pets, Electronics (the sell-form picker lists exactly these, plus an
 *    "All Categories" reset row). There is NO sports, musical-instrument, collectibles, books, coins or stamps
 *    department: those item types have no true home on Poshmark.
 *  - Category level: complete for all 6 departments as listed by the public facets. NOT listed there, but present
 *    in the live sell-form picker according to earlier live walks recorded in extension/fas-poshmark.js: an "Other"
 *    row at department and category level (e.g. Men > Other, Home > Other). "Other" is deliberately NOT in this
 *    tree: the resolver never targets it (a deliberate blank beats a catch-all). Women/Men "Global & Traditional
 *    Wear" (Kimonos, Sarees, Kilts ...) was not harvested: no FindA.Sale mapping targets it.
 *  - Sub-category level VERIFIED (read from the category's own page): all 13 Home categories; Electronics
 *    Cameras, Computers, Cell Phones, Car Audio, Wearables, Tablets, Video Games, Media, Networking, Headphones,
 *    Portable Audio; Women Accessories, Bags, Jackets & Coats, Jewelry, Pants & Jumpsuits, Shoes, Sweaters, Tops;
 *    Men Accessories, Bags, Jackets & Coats, Pants, Shirts, Shoes, Sweaters; Kids Accessories, Bottoms, Shirts &
 *    Tops, Toys; Pets Fish. Kids Matching Sets was loaded and has NO sub-categories (it is a real leaf).
 *  - Sub-category level UNVERIFIED (never loaded, listed in POSHMARK_UNVERIFIED_BRANCHES): Women Dresses,
 *    Intimates & Sleepwear, Jeans, Makeup, Shorts, Skirts, Swim, Skincare, Hair, Bath & Body; Men Jeans, Shorts,
 *    Suits & Blazers, Swim, Underwear & Socks, Grooming; Kids Dresses, Jackets & Coats, One Pieces, Pajamas,
 *    Shoes, Swim, Costumes, Bath Skin & Hair; Electronics VR AR & Accessories; Pets Dog, Cat, Bird, Reptile,
 *    Small Pets. They appear below as bare categories, which are NOT valid mapping targets (isPoshmarkSelectable
 *    is false for them) because the real picker shows children under them that this tree does not know.
 * Poshmark can change this tree at any time; refresh this file (and re-run the tests) when it does.
 */

export interface PoshmarkNode {
  id: string;
  parentId: string;
  title: string;
  /** 1 for a department. */
  depth: number;
  childIds: string[];
}

export const POSHMARK_CATALOG_RAW = `
Women|0|Women
Women-Accessories|Women|Accessories
Women-Accessories-Belts|Women-Accessories|Belts
Women-Accessories-Face_Masks|Women-Accessories|Face Masks
Women-Accessories-Glasses|Women-Accessories|Glasses
Women-Accessories-Gloves_&_Mittens|Women-Accessories|Gloves & Mittens
Women-Accessories-Hair_Accessories|Women-Accessories|Hair Accessories
Women-Accessories-Hats|Women-Accessories|Hats
Women-Accessories-Hosiery_&_Socks|Women-Accessories|Hosiery & Socks
Women-Accessories-Key_&_Card_Holders|Women-Accessories|Key & Card Holders
Women-Accessories-Laptop_Cases|Women-Accessories|Laptop Cases
Women-Accessories-Phone_Cases|Women-Accessories|Phone Cases
Women-Accessories-Scarves_&_Wraps|Women-Accessories|Scarves & Wraps
Women-Accessories-Sunglasses|Women-Accessories|Sunglasses
Women-Accessories-Tablet_Cases|Women-Accessories|Tablet Cases
Women-Accessories-Umbrellas|Women-Accessories|Umbrellas
Women-Accessories-Watches|Women-Accessories|Watches
Women-Bags|Women|Bags
Women-Bags-Baby_Bags|Women-Bags|Baby Bags
Women-Bags-Backpacks|Women-Bags|Backpacks
Women-Bags-Clutches_&_Wristlets|Women-Bags|Clutches & Wristlets
Women-Bags-Cosmetic_Bags_&_Cases|Women-Bags|Cosmetic Bags & Cases
Women-Bags-Crossbody_Bags|Women-Bags|Crossbody Bags
Women-Bags-Hobos|Women-Bags|Hobos
Women-Bags-Laptop_Bags|Women-Bags|Laptop Bags
Women-Bags-Mini_Bags|Women-Bags|Mini Bags
Women-Bags-Satchels|Women-Bags|Satchels
Women-Bags-Shoulder_Bags|Women-Bags|Shoulder Bags
Women-Bags-Totes|Women-Bags|Totes
Women-Bags-Travel_Bags|Women-Bags|Travel Bags
Women-Bags-Wallets|Women-Bags|Wallets
Women-Dresses|Women|Dresses
Women-Intimates_&_Sleepwear|Women|Intimates & Sleepwear
Women-Jackets_&_Coats|Women|Jackets & Coats
Women-Jackets_&_Coats-Blazers_&_Suit_Jackets|Women-Jackets_&_Coats|Blazers & Suit Jackets
Women-Jackets_&_Coats-Bomber_Jackets|Women-Jackets_&_Coats|Bomber Jackets
Women-Jackets_&_Coats-Capes|Women-Jackets_&_Coats|Capes
Women-Jackets_&_Coats-Jean_Jackets|Women-Jackets_&_Coats|Jean Jackets
Women-Jackets_&_Coats-Leather_Jackets|Women-Jackets_&_Coats|Leather Jackets
Women-Jackets_&_Coats-Pea_Coats|Women-Jackets_&_Coats|Pea Coats
Women-Jackets_&_Coats-Puffers|Women-Jackets_&_Coats|Puffers
Women-Jackets_&_Coats-Ski_&_Snow_Jackets|Women-Jackets_&_Coats|Ski & Snow Jackets
Women-Jackets_&_Coats-Teddy_Jackets|Women-Jackets_&_Coats|Teddy Jackets
Women-Jackets_&_Coats-Trench_Coats|Women-Jackets_&_Coats|Trench Coats
Women-Jackets_&_Coats-Utility_Jackets|Women-Jackets_&_Coats|Utility Jackets
Women-Jackets_&_Coats-Varsity_Jackets|Women-Jackets_&_Coats|Varsity Jackets
Women-Jackets_&_Coats-Vests|Women-Jackets_&_Coats|Vests
Women-Jeans|Women|Jeans
Women-Jewelry|Women|Jewelry
Women-Jewelry-Bracelets|Women-Jewelry|Bracelets
Women-Jewelry-Brooches|Women-Jewelry|Brooches
Women-Jewelry-Earrings|Women-Jewelry|Earrings
Women-Jewelry-Necklaces|Women-Jewelry|Necklaces
Women-Jewelry-Rings|Women-Jewelry|Rings
Women-Makeup|Women|Makeup
Women-Pants_&_Jumpsuits|Women|Pants & Jumpsuits
Women-Pants_&_Jumpsuits-Ankle_&_Cropped|Women-Pants_&_Jumpsuits|Ankle & Cropped
Women-Pants_&_Jumpsuits-Boot_Cut_&_Flare|Women-Pants_&_Jumpsuits|Boot Cut & Flare
Women-Pants_&_Jumpsuits-Capris|Women-Pants_&_Jumpsuits|Capris
Women-Pants_&_Jumpsuits-Jumpsuits_&_Rompers|Women-Pants_&_Jumpsuits|Jumpsuits & Rompers
Women-Pants_&_Jumpsuits-Leggings|Women-Pants_&_Jumpsuits|Leggings
Women-Pants_&_Jumpsuits-Pantsuits|Women-Pants_&_Jumpsuits|Pantsuits
Women-Pants_&_Jumpsuits-Skinny|Women-Pants_&_Jumpsuits|Skinny
Women-Pants_&_Jumpsuits-Straight_Leg|Women-Pants_&_Jumpsuits|Straight Leg
Women-Pants_&_Jumpsuits-Track_Pants_&_Joggers|Women-Pants_&_Jumpsuits|Track Pants & Joggers
Women-Pants_&_Jumpsuits-Trousers|Women-Pants_&_Jumpsuits|Trousers
Women-Pants_&_Jumpsuits-Wide_Leg|Women-Pants_&_Jumpsuits|Wide Leg
Women-Shoes|Women|Shoes
Women-Shoes-Ankle_Boots_&_Booties|Women-Shoes|Ankle Boots & Booties
Women-Shoes-Athletic_Shoes|Women-Shoes|Athletic Shoes
Women-Shoes-Combat_&_Moto_Boots|Women-Shoes|Combat & Moto Boots
Women-Shoes-Espadrilles|Women-Shoes|Espadrilles
Women-Shoes-Flats_&_Loafers|Women-Shoes|Flats & Loafers
Women-Shoes-Heeled_Boots|Women-Shoes|Heeled Boots
Women-Shoes-Heels|Women-Shoes|Heels
Women-Shoes-Lace_Up_Boots|Women-Shoes|Lace Up Boots
Women-Shoes-Moccasins|Women-Shoes|Moccasins
Women-Shoes-Mules_&_Clogs|Women-Shoes|Mules & Clogs
Women-Shoes-Over_the_Knee_Boots|Women-Shoes|Over the Knee Boots
Women-Shoes-Platforms|Women-Shoes|Platforms
Women-Shoes-Sandals|Women-Shoes|Sandals
Women-Shoes-Slippers|Women-Shoes|Slippers
Women-Shoes-Sneakers|Women-Shoes|Sneakers
Women-Shoes-Wedges|Women-Shoes|Wedges
Women-Shoes-Winter_&_Rain_Boots|Women-Shoes|Winter & Rain Boots
Women-Shorts|Women|Shorts
Women-Skirts|Women|Skirts
Women-Sweaters|Women|Sweaters
Women-Sweaters-Cardigans|Women-Sweaters|Cardigans
Women-Sweaters-Cowl_&_Turtlenecks|Women-Sweaters|Cowl & Turtlenecks
Women-Sweaters-Crew_&_Scoop_Necks|Women-Sweaters|Crew & Scoop Necks
Women-Sweaters-Off-the-Shoulder_Sweaters|Women-Sweaters|Off-the-Shoulder Sweaters
Women-Sweaters-Shrugs_&_Ponchos|Women-Sweaters|Shrugs & Ponchos
Women-Sweaters-V-Necks|Women-Sweaters|V-Necks
Women-Swim|Women|Swim
Women-Tops|Women|Tops
Women-Tops-Blouses|Women-Tops|Blouses
Women-Tops-Bodysuits|Women-Tops|Bodysuits
Women-Tops-Button_Down_Shirts|Women-Tops|Button Down Shirts
Women-Tops-Camisoles|Women-Tops|Camisoles
Women-Tops-Crop_Tops|Women-Tops|Crop Tops
Women-Tops-Jerseys|Women-Tops|Jerseys
Women-Tops-Muscle_Tees|Women-Tops|Muscle Tees
Women-Tops-Sweatshirts_&_Hoodies|Women-Tops|Sweatshirts & Hoodies
Women-Tops-Tank_Tops|Women-Tops|Tank Tops
Women-Tops-Tees_-_Long_Sleeve|Women-Tops|Tees - Long Sleeve
Women-Tops-Tees_-_Short_Sleeve|Women-Tops|Tees - Short Sleeve
Women-Tops-Tunics|Women-Tops|Tunics
Women-Skincare|Women|Skincare
Women-Hair|Women|Hair
Women-Bath_&_Body|Women|Bath & Body
Men|0|Men
Men-Accessories|Men|Accessories
Men-Accessories-Belts|Men-Accessories|Belts
Men-Accessories-Cuff_Links|Men-Accessories|Cuff Links
Men-Accessories-Face_Masks|Men-Accessories|Face Masks
Men-Accessories-Glasses|Men-Accessories|Glasses
Men-Accessories-Gloves|Men-Accessories|Gloves
Men-Accessories-Hats|Men-Accessories|Hats
Men-Accessories-Jewelry|Men-Accessories|Jewelry
Men-Accessories-Key_&_Card_Holders|Men-Accessories|Key & Card Holders
Men-Accessories-Money_Clips|Men-Accessories|Money Clips
Men-Accessories-Phone_Cases|Men-Accessories|Phone Cases
Men-Accessories-Pocket_Squares|Men-Accessories|Pocket Squares
Men-Accessories-Scarves|Men-Accessories|Scarves
Men-Accessories-Sunglasses|Men-Accessories|Sunglasses
Men-Accessories-Suspenders|Men-Accessories|Suspenders
Men-Accessories-Ties|Men-Accessories|Ties
Men-Accessories-Watches|Men-Accessories|Watches
Men-Bags|Men|Bags
Men-Bags-Backpacks|Men-Bags|Backpacks
Men-Bags-Belt_Bags|Men-Bags|Belt Bags
Men-Bags-Briefcases|Men-Bags|Briefcases
Men-Bags-Duffel_Bags|Men-Bags|Duffel Bags
Men-Bags-Laptop_Bags|Men-Bags|Laptop Bags
Men-Bags-Luggage_&_Travel_Bags|Men-Bags|Luggage & Travel Bags
Men-Bags-Messenger_Bags|Men-Bags|Messenger Bags
Men-Bags-Toiletry_Bags|Men-Bags|Toiletry Bags
Men-Bags-Wallets|Men-Bags|Wallets
Men-Jackets_&_Coats|Men|Jackets & Coats
Men-Jackets_&_Coats-Bomber_&_Varsity|Men-Jackets_&_Coats|Bomber & Varsity
Men-Jackets_&_Coats-Lightweight_&_Shirt_Jackets|Men-Jackets_&_Coats|Lightweight & Shirt Jackets
Men-Jackets_&_Coats-Military_&_Field|Men-Jackets_&_Coats|Military & Field
Men-Jackets_&_Coats-Pea_Coats|Men-Jackets_&_Coats|Pea Coats
Men-Jackets_&_Coats-Performance_Jackets|Men-Jackets_&_Coats|Performance Jackets
Men-Jackets_&_Coats-Puffers|Men-Jackets_&_Coats|Puffers
Men-Jackets_&_Coats-Raincoats|Men-Jackets_&_Coats|Raincoats
Men-Jackets_&_Coats-Ski_&_Snowboard|Men-Jackets_&_Coats|Ski & Snowboard
Men-Jackets_&_Coats-Trench_Coats|Men-Jackets_&_Coats|Trench Coats
Men-Jackets_&_Coats-Vests|Men-Jackets_&_Coats|Vests
Men-Jackets_&_Coats-Windbreakers|Men-Jackets_&_Coats|Windbreakers
Men-Jeans|Men|Jeans
Men-Pants|Men|Pants
Men-Pants-Cargo|Men-Pants|Cargo
Men-Pants-Chinos_&_Khakis|Men-Pants|Chinos & Khakis
Men-Pants-Corduroy|Men-Pants|Corduroy
Men-Pants-Dress|Men-Pants|Dress
Men-Pants-Sweatpants_&_Joggers|Men-Pants|Sweatpants & Joggers
Men-Shirts|Men|Shirts
Men-Shirts-Casual_Button_Down_Shirts|Men-Shirts|Casual Button Down Shirts
Men-Shirts-Dress_Shirts|Men-Shirts|Dress Shirts
Men-Shirts-Jerseys|Men-Shirts|Jerseys
Men-Shirts-Polos|Men-Shirts|Polos
Men-Shirts-Sweatshirts_&_Hoodies|Men-Shirts|Sweatshirts & Hoodies
Men-Shirts-Tank_Tops|Men-Shirts|Tank Tops
Men-Shirts-Tees_-_Long_Sleeve|Men-Shirts|Tees - Long Sleeve
Men-Shirts-Tees_-_Short_Sleeve|Men-Shirts|Tees - Short Sleeve
Men-Shoes|Men|Shoes
Men-Shoes-Athletic_Shoes|Men-Shoes|Athletic Shoes
Men-Shoes-Boat_Shoes|Men-Shoes|Boat Shoes
Men-Shoes-Boots|Men-Shoes|Boots
Men-Shoes-Chukka_Boots|Men-Shoes|Chukka Boots
Men-Shoes-Cowboy_&_Western_Boots|Men-Shoes|Cowboy & Western Boots
Men-Shoes-Loafers_&_Slip-Ons|Men-Shoes|Loafers & Slip-Ons
Men-Shoes-Oxfords_&_Derbys|Men-Shoes|Oxfords & Derbys
Men-Shoes-Rain_&_Snow_Boots|Men-Shoes|Rain & Snow Boots
Men-Shoes-Sandals_&_Flip-Flops|Men-Shoes|Sandals & Flip-Flops
Men-Shoes-Sneakers|Men-Shoes|Sneakers
Men-Shorts|Men|Shorts
Men-Suits_&_Blazers|Men|Suits & Blazers
Men-Sweaters|Men|Sweaters
Men-Sweaters-Cardigan|Men-Sweaters|Cardigan
Men-Sweaters-Crewneck|Men-Sweaters|Crewneck
Men-Sweaters-Turtleneck|Men-Sweaters|Turtleneck
Men-Sweaters-V-Neck|Men-Sweaters|V-Neck
Men-Sweaters-Zip_Up|Men-Sweaters|Zip Up
Men-Swim|Men|Swim
Men-Underwear_&_Socks|Men|Underwear & Socks
Men-Grooming|Men|Grooming
Kids|0|Kids
Kids-Accessories|Kids|Accessories
Kids-Accessories-Bags|Kids-Accessories|Bags
Kids-Accessories-Belts|Kids-Accessories|Belts
Kids-Accessories-Bibs|Kids-Accessories|Bibs
Kids-Accessories-Diaper_Covers|Kids-Accessories|Diaper Covers
Kids-Accessories-Face_Masks|Kids-Accessories|Face Masks
Kids-Accessories-Hair_Accessories|Kids-Accessories|Hair Accessories
Kids-Accessories-Hats|Kids-Accessories|Hats
Kids-Accessories-Jewelry|Kids-Accessories|Jewelry
Kids-Accessories-Mittens|Kids-Accessories|Mittens
Kids-Accessories-Socks_&_Tights|Kids-Accessories|Socks & Tights
Kids-Accessories-Sunglasses|Kids-Accessories|Sunglasses
Kids-Accessories-Suspenders|Kids-Accessories|Suspenders
Kids-Accessories-Ties|Kids-Accessories|Ties
Kids-Accessories-Underwear|Kids-Accessories|Underwear
Kids-Accessories-Watches|Kids-Accessories|Watches
Kids-Bottoms|Kids|Bottoms
Kids-Bottoms-Casual|Kids-Bottoms|Casual
Kids-Bottoms-Formal|Kids-Bottoms|Formal
Kids-Bottoms-Jeans|Kids-Bottoms|Jeans
Kids-Bottoms-Jumpsuits_&_Rompers|Kids-Bottoms|Jumpsuits & Rompers
Kids-Bottoms-Leggings|Kids-Bottoms|Leggings
Kids-Bottoms-Overalls|Kids-Bottoms|Overalls
Kids-Bottoms-Shorts|Kids-Bottoms|Shorts
Kids-Bottoms-Skirts|Kids-Bottoms|Skirts
Kids-Bottoms-Skorts|Kids-Bottoms|Skorts
Kids-Bottoms-Sweatpants_&_Joggers|Kids-Bottoms|Sweatpants & Joggers
Kids-Dresses|Kids|Dresses
Kids-Jackets_&_Coats|Kids|Jackets & Coats
Kids-Matching_Sets|Kids|Matching Sets
Kids-One_Pieces|Kids|One Pieces
Kids-Pajamas|Kids|Pajamas
Kids-Shirts_&_Tops|Kids|Shirts & Tops
Kids-Shirts_&_Tops-Blouses|Kids-Shirts_&_Tops|Blouses
Kids-Shirts_&_Tops-Button_Down_Shirts|Kids-Shirts_&_Tops|Button Down Shirts
Kids-Shirts_&_Tops-Camisoles|Kids-Shirts_&_Tops|Camisoles
Kids-Shirts_&_Tops-Jerseys|Kids-Shirts_&_Tops|Jerseys
Kids-Shirts_&_Tops-Polos|Kids-Shirts_&_Tops|Polos
Kids-Shirts_&_Tops-Sweaters|Kids-Shirts_&_Tops|Sweaters
Kids-Shirts_&_Tops-Sweatshirts_&_Hoodies|Kids-Shirts_&_Tops|Sweatshirts & Hoodies
Kids-Shirts_&_Tops-Tank_Tops|Kids-Shirts_&_Tops|Tank Tops
Kids-Shirts_&_Tops-Tees_-_Long_Sleeve|Kids-Shirts_&_Tops|Tees - Long Sleeve
Kids-Shirts_&_Tops-Tees_-_Short_Sleeve|Kids-Shirts_&_Tops|Tees - Short Sleeve
Kids-Shoes|Kids|Shoes
Kids-Swim|Kids|Swim
Kids-Costumes|Kids|Costumes
Kids-Bath,_Skin_&_Hair|Kids|Bath, Skin & Hair
Kids-Toys|Kids|Toys
Kids-Toys-Action_Figures_&_Playsets|Kids-Toys|Action Figures & Playsets
Kids-Toys-Building_Sets_&_Blocks|Kids-Toys|Building Sets & Blocks
Kids-Toys-Cars_&_Vehicles|Kids-Toys|Cars & Vehicles
Kids-Toys-Dolls_&_Accessories|Kids-Toys|Dolls & Accessories
Kids-Toys-Learning_Toys|Kids-Toys|Learning Toys
Kids-Toys-Puzzles_&_Games|Kids-Toys|Puzzles & Games
Kids-Toys-Stuffed_Animals|Kids-Toys|Stuffed Animals
Kids-Toys-Trading_Cards|Kids-Toys|Trading Cards
Home|0|Home
Home-Accents|Home|Accents
Home-Accents-Accent_Pillows|Home-Accents|Accent Pillows
Home-Accents-Baskets_&_Bins|Home-Accents|Baskets & Bins
Home-Accents-Candles_&_Holders|Home-Accents|Candles & Holders
Home-Accents-Coffee_Table_Books|Home-Accents|Coffee Table Books
Home-Accents-Curtains_&_Drapes|Home-Accents|Curtains & Drapes
Home-Accents-Decor|Home-Accents|Decor
Home-Accents-Door_Mats|Home-Accents|Door Mats
Home-Accents-Faux_Florals|Home-Accents|Faux Florals
Home-Accents-Furniture_Covers|Home-Accents|Furniture Covers
Home-Accents-Lanterns|Home-Accents|Lanterns
Home-Accents-Picture_Frames|Home-Accents|Picture Frames
Home-Accents-Vases|Home-Accents|Vases
Home-Art|Home|Art
Home-Art-Ceramics|Home-Art|Ceramics
Home-Art-Drawing_&_Illustrations|Home-Art|Drawing & Illustrations
Home-Art-Fiber_Arts|Home-Art|Fiber Arts
Home-Art-Glass_Art|Home-Art|Glass Art
Home-Art-Mixed_Media|Home-Art|Mixed Media
Home-Art-Painting|Home-Art|Painting
Home-Art-Photography|Home-Art|Photography
Home-Art-Posters|Home-Art|Posters
Home-Art-Prints|Home-Art|Prints
Home-Art-Sculpture|Home-Art|Sculpture
Home-Bath|Home|Bath
Home-Bath-Bath_Accessories|Home-Bath|Bath Accessories
Home-Bath-Bath_Storage|Home-Bath|Bath Storage
Home-Bath-Bath_Towels|Home-Bath|Bath Towels
Home-Bath-Beach_Towels|Home-Bath|Beach Towels
Home-Bath-Hand_Towels|Home-Bath|Hand Towels
Home-Bath-Mats|Home-Bath|Mats
Home-Bath-Shower_Curtains|Home-Bath|Shower Curtains
Home-Bath-Vanity_Mirrors|Home-Bath|Vanity Mirrors
Home-Bath-Vanity_Trays|Home-Bath|Vanity Trays
Home-Bath-Wash_Cloths|Home-Bath|Wash Cloths
Home-Bedding|Home|Bedding
Home-Bedding-Blankets_&_Throws|Home-Bedding|Blankets & Throws
Home-Bedding-Comforters|Home-Bedding|Comforters
Home-Bedding-Duvet_Covers|Home-Bedding|Duvet Covers
Home-Bedding-Mattress_Covers|Home-Bedding|Mattress Covers
Home-Bedding-Pillows|Home-Bedding|Pillows
Home-Bedding-Quilts|Home-Bedding|Quilts
Home-Bedding-Sheets|Home-Bedding|Sheets
Home-Design|Home|Design
Home-Design-Birthday_Cards|Home-Design|Birthday Cards
Home-Design-Business_Cards|Home-Design|Business Cards
Home-Design-Planners|Home-Design|Planners
Home-Design-Stamps|Home-Design|Stamps
Home-Design-Stickers|Home-Design|Stickers
Home-Design-Thank_You_Cards|Home-Design|Thank You Cards
Home-Dining|Home|Dining
Home-Dining-Bar_Accessories|Home-Dining|Bar Accessories
Home-Dining-Dinnerware|Home-Dining|Dinnerware
Home-Dining-Drinkware|Home-Dining|Drinkware
Home-Dining-Flatware|Home-Dining|Flatware
Home-Dining-Mugs|Home-Dining|Mugs
Home-Dining-Serveware|Home-Dining|Serveware
Home-Dining-Serving_Utensils|Home-Dining|Serving Utensils
Home-Dining-Table_Linens|Home-Dining|Table Linens
Home-Dining-Water_Bottles_&_Thermoses|Home-Dining|Water Bottles & Thermoses
Home-Games|Home|Games
Home-Games-Board_Games|Home-Games|Board Games
Home-Games-Card_Games|Home-Games|Card Games
Home-Games-Outdoor_Games|Home-Games|Outdoor Games
Home-Games-Puzzles|Home-Games|Puzzles
Home-Holiday|Home|Holiday
Home-Holiday-Garland|Home-Holiday|Garland
Home-Holiday-Holiday_Blankets_&_Throws|Home-Holiday|Holiday Blankets & Throws
Home-Holiday-Holiday_Decor|Home-Holiday|Holiday Decor
Home-Holiday-Holiday_Pillows|Home-Holiday|Holiday Pillows
Home-Holiday-Ornaments|Home-Holiday|Ornaments
Home-Holiday-String_Lights|Home-Holiday|String Lights
Home-Holiday-Wreaths|Home-Holiday|Wreaths
Home-Kitchen|Home|Kitchen
Home-Kitchen-BBQ_&_Grilling_Tools|Home-Kitchen|BBQ & Grilling Tools
Home-Kitchen-Bakeware|Home-Kitchen|Bakeware
Home-Kitchen-Coffee_&_Tea_Accessories|Home-Kitchen|Coffee & Tea Accessories
Home-Kitchen-Cookbooks|Home-Kitchen|Cookbooks
Home-Kitchen-Cooking_Utensils|Home-Kitchen|Cooking Utensils
Home-Kitchen-Cookware|Home-Kitchen|Cookware
Home-Kitchen-Food_Storage|Home-Kitchen|Food Storage
Home-Kitchen-Kitchen_Linens|Home-Kitchen|Kitchen Linens
Home-Kitchen-Kitchen_Tools|Home-Kitchen|Kitchen Tools
Home-Kitchen-Knives_&_Cutlery|Home-Kitchen|Knives & Cutlery
Home-Office|Home|Office
Home-Office-Arts_&_Crafts|Home-Office|Arts & Crafts
Home-Office-Binders_&_Folders|Home-Office|Binders & Folders
Home-Office-Calendars|Home-Office|Calendars
Home-Office-Labels_&_Label_Makers|Home-Office|Labels & Label Makers
Home-Office-Notebooks_&_Journals|Home-Office|Notebooks & Journals
Home-Office-Pencil_Cases|Home-Office|Pencil Cases
Home-Office-Planners|Home-Office|Planners
Home-Office-Shipping_Supplies|Home-Office|Shipping Supplies
Home-Office-Stationery|Home-Office|Stationery
Home-Party_Supplies|Home|Party Supplies
Home-Party_Supplies-Cake_Candles|Home-Party_Supplies|Cake Candles
Home-Party_Supplies-Cake_Toppers|Home-Party_Supplies|Cake Toppers
Home-Party_Supplies-Cards_&_Invitations|Home-Party_Supplies|Cards & Invitations
Home-Party_Supplies-Decorations|Home-Party_Supplies|Decorations
Home-Party_Supplies-Disposable_Tableware|Home-Party_Supplies|Disposable Tableware
Home-Party_Supplies-Favors|Home-Party_Supplies|Favors
Home-Party_Supplies-Gift_Wrap|Home-Party_Supplies|Gift Wrap
Home-Party_Supplies-Hats|Home-Party_Supplies|Hats
Home-Party_Supplies-Party_Lights|Home-Party_Supplies|Party Lights
Home-Storage_&_Organization|Home|Storage & Organization
Home-Storage_&_Organization-Closet_Accessories|Home-Storage_&_Organization|Closet Accessories
Home-Storage_&_Organization-Drawer_Liners|Home-Storage_&_Organization|Drawer Liners
Home-Storage_&_Organization-Garment_Bags|Home-Storage_&_Organization|Garment Bags
Home-Storage_&_Organization-Jewelry_Organizers|Home-Storage_&_Organization|Jewelry Organizers
Home-Storage_&_Organization-Makeup_Organizers|Home-Storage_&_Organization|Makeup Organizers
Home-Storage_&_Organization-Storage|Home-Storage_&_Organization|Storage
Home-Wall_Decor|Home|Wall Decor
Home-Wall_Decor-Art_&_Decals|Home-Wall_Decor|Art & Decals
Home-Wall_Decor-Clocks|Home-Wall_Decor|Clocks
Home-Wall_Decor-Display_Shelves|Home-Wall_Decor|Display Shelves
Home-Wall_Decor-Hooks|Home-Wall_Decor|Hooks
Home-Wall_Decor-Mirrors|Home-Wall_Decor|Mirrors
Home-Wall_Decor-Tapestries|Home-Wall_Decor|Tapestries
Home-Wall_Decor-Wallpaper|Home-Wall_Decor|Wallpaper
Pets|0|Pets
Pets-Dog|Pets|Dog
Pets-Cat|Pets|Cat
Pets-Bird|Pets|Bird
Pets-Fish|Pets|Fish
Pets-Fish-Aquarium_Kits|Pets-Fish|Aquarium Kits
Pets-Fish-Cleaning_&_Maintenance|Pets-Fish|Cleaning & Maintenance
Pets-Fish-Decor_&_Accessories|Pets-Fish|Decor & Accessories
Pets-Reptile|Pets|Reptile
Pets-Small_Pets|Pets|Small Pets
Electronics|0|Electronics
Electronics-Cameras,_Photo_&_Video|Electronics|Cameras, Photo & Video
Electronics-Cameras,_Photo_&_Video-Digital_Cameras|Electronics-Cameras,_Photo_&_Video|Digital Cameras
Electronics-Cameras,_Photo_&_Video-Bags_&_Cases|Electronics-Cameras,_Photo_&_Video|Bags & Cases
Electronics-Cameras,_Photo_&_Video-Binoculars_&_Scopes|Electronics-Cameras,_Photo_&_Video|Binoculars & Scopes
Electronics-Cameras,_Photo_&_Video-Film_Photography|Electronics-Cameras,_Photo_&_Video|Film Photography
Electronics-Cameras,_Photo_&_Video-Flashes|Electronics-Cameras,_Photo_&_Video|Flashes
Electronics-Cameras,_Photo_&_Video-Lenses|Electronics-Cameras,_Photo_&_Video|Lenses
Electronics-Cameras,_Photo_&_Video-Memory_Cards|Electronics-Cameras,_Photo_&_Video|Memory Cards
Electronics-Cameras,_Photo_&_Video-Simulated_Cameras|Electronics-Cameras,_Photo_&_Video|Simulated Cameras
Electronics-Cameras,_Photo_&_Video-Tripods_&_Monopods|Electronics-Cameras,_Photo_&_Video|Tripods & Monopods
Electronics-Cameras,_Photo_&_Video-Underwater_Photography|Electronics-Cameras,_Photo_&_Video|Underwater Photography
Electronics-Cameras,_Photo_&_Video-Video|Electronics-Cameras,_Photo_&_Video|Video
Electronics-Cameras,_Photo_&_Video-Camera_Straps|Electronics-Cameras,_Photo_&_Video|Camera Straps
Electronics-Computers,_Laptops_&_Parts|Electronics|Computers, Laptops & Parts
Electronics-Computers,_Laptops_&_Parts-Laptops|Electronics-Computers,_Laptops_&_Parts|Laptops
Electronics-Computers,_Laptops_&_Parts-Cables_&_Interconnects|Electronics-Computers,_Laptops_&_Parts|Cables & Interconnects
Electronics-Computers,_Laptops_&_Parts-Camera_Privacy_Covers|Electronics-Computers,_Laptops_&_Parts|Camera Privacy Covers
Electronics-Computers,_Laptops_&_Parts-Computer_Cable_Adapters|Electronics-Computers,_Laptops_&_Parts|Computer Cable Adapters
Electronics-Computers,_Laptops_&_Parts-Computer_Headsets|Electronics-Computers,_Laptops_&_Parts|Computer Headsets
Electronics-Computers,_Laptops_&_Parts-Computer_Microphones|Electronics-Computers,_Laptops_&_Parts|Computer Microphones
Electronics-Computers,_Laptops_&_Parts-External_Components|Electronics-Computers,_Laptops_&_Parts|External Components
Electronics-Computers,_Laptops_&_Parts-Graphics_Cards|Electronics-Computers,_Laptops_&_Parts|Graphics Cards
Electronics-Computers,_Laptops_&_Parts-Internal_Components|Electronics-Computers,_Laptops_&_Parts|Internal Components
Electronics-Computers,_Laptops_&_Parts-Keyboards|Electronics-Computers,_Laptops_&_Parts|Keyboards
Electronics-Computers,_Laptops_&_Parts-Memory_Card_Readers|Electronics-Computers,_Laptops_&_Parts|Memory Card Readers
Electronics-Computers,_Laptops_&_Parts-Mice|Electronics-Computers,_Laptops_&_Parts|Mice
Electronics-Computers,_Laptops_&_Parts-Mounts_&_Stands|Electronics-Computers,_Laptops_&_Parts|Mounts & Stands
Electronics-Computers,_Laptops_&_Parts-Surge_Protectors|Electronics-Computers,_Laptops_&_Parts|Surge Protectors
Electronics-Computers,_Laptops_&_Parts-Single_Board_Computers|Electronics-Computers,_Laptops_&_Parts|Single Board Computers
Electronics-Computers,_Laptops_&_Parts-USB_Hubs|Electronics-Computers,_Laptops_&_Parts|USB Hubs
Electronics-Computers,_Laptops_&_Parts-Webcams|Electronics-Computers,_Laptops_&_Parts|Webcams
Electronics-Cell_Phones_&_Accessories|Electronics|Cell Phones & Accessories
Electronics-Cell_Phones_&_Accessories-Cell_Phones|Electronics-Cell_Phones_&_Accessories|Cell Phones
Electronics-Cell_Phones_&_Accessories-Holsters_&_Clips|Electronics-Cell_Phones_&_Accessories|Holsters & Clips
Electronics-Cell_Phones_&_Accessories-Headsets|Electronics-Cell_Phones_&_Accessories|Headsets
Electronics-Cell_Phones_&_Accessories-Screen_Protectors|Electronics-Cell_Phones_&_Accessories|Screen Protectors
Electronics-Cell_Phones_&_Accessories-Cases|Electronics-Cell_Phones_&_Accessories|Cases
Electronics-Cell_Phones_&_Accessories-Covers|Electronics-Cell_Phones_&_Accessories|Covers
Electronics-Cell_Phones_&_Accessories-Skins_&_Bumpers|Electronics-Cell_Phones_&_Accessories|Skins & Bumpers
Electronics-Cell_Phones_&_Accessories-Chargers|Electronics-Cell_Phones_&_Accessories|Chargers
Electronics-Cell_Phones_&_Accessories-Adapters|Electronics-Cell_Phones_&_Accessories|Adapters
Electronics-Cell_Phones_&_Accessories-Cables|Electronics-Cell_Phones_&_Accessories|Cables
Electronics-Car_Audio,_Video_&_GPS|Electronics|Car Audio, Video & GPS
Electronics-Car_Audio,_Video_&_GPS-GPS_&_Navigation|Electronics-Car_Audio,_Video_&_GPS|GPS & Navigation
Electronics-Car_Audio,_Video_&_GPS-Amplifiers|Electronics-Car_Audio,_Video_&_GPS|Amplifiers
Electronics-Car_Audio,_Video_&_GPS-Car_Stereo_Receivers|Electronics-Car_Audio,_Video_&_GPS|Car Stereo Receivers
Electronics-Car_Audio,_Video_&_GPS-Changers|Electronics-Car_Audio,_Video_&_GPS|Changers
Electronics-Car_Audio,_Video_&_GPS-Digital_Media_Receivers|Electronics-Car_Audio,_Video_&_GPS|Digital Media Receivers
Electronics-Car_Audio,_Video_&_GPS-Equalizers|Electronics-Car_Audio,_Video_&_GPS|Equalizers
Electronics-Car_Audio,_Video_&_GPS-Satellite_Radio|Electronics-Car_Audio,_Video_&_GPS|Satellite Radio
Electronics-Car_Audio,_Video_&_GPS-Car_Headphones|Electronics-Car_Audio,_Video_&_GPS|Car Headphones
Electronics-Car_Audio,_Video_&_GPS-In-Mirror_Video|Electronics-Car_Audio,_Video_&_GPS|In-Mirror Video
Electronics-Car_Audio,_Video_&_GPS-In-Visor_Video|Electronics-Car_Audio,_Video_&_GPS|In-Visor Video
Electronics-Car_Audio,_Video_&_GPS-On-Dash_Cameras|Electronics-Car_Audio,_Video_&_GPS|On-Dash Cameras
Electronics-Car_Audio,_Video_&_GPS-Overhead_Video|Electronics-Car_Audio,_Video_&_GPS|Overhead Video
Electronics-Car_Audio,_Video_&_GPS-Surround_Processors|Electronics-Car_Audio,_Video_&_GPS|Surround Processors
Electronics-Car_Audio,_Video_&_GPS-TV_Tuners|Electronics-Car_Audio,_Video_&_GPS|TV Tuners
Electronics-Car_Audio,_Video_&_GPS-Vehicle_Backup_Cameras|Electronics-Car_Audio,_Video_&_GPS|Vehicle Backup Cameras
Electronics-Wearables|Electronics|Wearables
Electronics-Wearables-Smartwatches|Electronics-Wearables|Smartwatches
Electronics-Wearables-Body_Mounted_Cameras|Electronics-Wearables|Body Mounted Cameras
Electronics-Wearables-Clips,_Arm_&_Wristbands|Electronics-Wearables|Clips, Arm & Wristbands
Electronics-Wearables-Glasses|Electronics-Wearables|Glasses
Electronics-Wearables-Rings|Electronics-Wearables|Rings
Electronics-Wearables-Smartwatch_Cases|Electronics-Wearables|Smartwatch Cases
Electronics-Wearables-Wearables_Chargers|Electronics-Wearables|Wearables Chargers
Electronics-Tablets_&_Accessories|Electronics|Tablets & Accessories
Electronics-Tablets_&_Accessories-Tablets|Electronics-Tablets_&_Accessories|Tablets
Electronics-Tablets_&_Accessories-eBook_Readers|Electronics-Tablets_&_Accessories|eBook Readers
Electronics-Tablets_&_Accessories-Cases|Electronics-Tablets_&_Accessories|Cases
Electronics-Tablets_&_Accessories-Chargers|Electronics-Tablets_&_Accessories|Chargers
Electronics-Tablets_&_Accessories-Covers|Electronics-Tablets_&_Accessories|Covers
Electronics-Tablets_&_Accessories-Power_Adapters|Electronics-Tablets_&_Accessories|Power Adapters
Electronics-Tablets_&_Accessories-Power_Cables|Electronics-Tablets_&_Accessories|Power Cables
Electronics-Tablets_&_Accessories-Reading_Lights|Electronics-Tablets_&_Accessories|Reading Lights
Electronics-Tablets_&_Accessories-Screen_Protectors|Electronics-Tablets_&_Accessories|Screen Protectors
Electronics-Tablets_&_Accessories-Skins|Electronics-Tablets_&_Accessories|Skins
Electronics-Tablets_&_Accessories-Sleeves|Electronics-Tablets_&_Accessories|Sleeves
Electronics-Tablets_&_Accessories-Stands|Electronics-Tablets_&_Accessories|Stands
Electronics-Tablets_&_Accessories-Tablet_Keyboards|Electronics-Tablets_&_Accessories|Tablet Keyboards
Electronics-Video_Games_&_Consoles|Electronics|Video Games & Consoles
Electronics-Video_Games_&_Consoles-Consoles|Electronics-Video_Games_&_Consoles|Consoles
Electronics-Video_Games_&_Consoles-Handheld_Consoles|Electronics-Video_Games_&_Consoles|Handheld Consoles
Electronics-Video_Games_&_Consoles-Batteries_&_Chargers|Electronics-Video_Games_&_Consoles|Batteries & Chargers
Electronics-Video_Games_&_Consoles-Cables|Electronics-Video_Games_&_Consoles|Cables
Electronics-Video_Games_&_Consoles-Controllers|Electronics-Video_Games_&_Consoles|Controllers
Electronics-Video_Games_&_Consoles-Headsets|Electronics-Video_Games_&_Consoles|Headsets
Electronics-Video_Games_&_Consoles-Gaming_Guides|Electronics-Video_Games_&_Consoles|Gaming Guides
Electronics-Video_Games_&_Consoles-Keyboards|Electronics-Video_Games_&_Consoles|Keyboards
Electronics-Video_Games_&_Consoles-Digital_Games|Electronics-Video_Games_&_Consoles|Digital Games
Electronics-Video_Games_&_Consoles-PC_Games|Electronics-Video_Games_&_Consoles|PC Games
Electronics-Video_Games_&_Consoles-Video_Games|Electronics-Video_Games_&_Consoles|Video Games
Electronics-VR,_AR_&_Accessories|Electronics|VR, AR & Accessories
Electronics-Media|Electronics|Media
Electronics-Media-Blank_Media|Electronics-Media|Blank Media
Electronics-Media-CDs|Electronics-Media|CDs
Electronics-Media-DVDs_&_Blu-ray_Discs|Electronics-Media|DVDs & Blu-ray Discs
Electronics-Media-Media_Streamers|Electronics-Media|Media Streamers
Electronics-Media-Media_Cases_&_Organization|Electronics-Media|Media Cases & Organization
Electronics-Media-Vinyl_Records|Electronics-Media|Vinyl Records
Electronics-Networking|Electronics|Networking
Electronics-Networking-Boosters_&_Antennas|Electronics-Networking|Boosters & Antennas
Electronics-Networking-Mobile_Broadband_Devices|Electronics-Networking|Mobile Broadband Devices
Electronics-Networking-Modems|Electronics-Networking|Modems
Electronics-Networking-Modem-Router_Combos|Electronics-Networking|Modem-Router Combos
Electronics-Networking-Powerline_Networking|Electronics-Networking|Powerline Networking
Electronics-Networking-USB_Bluetooth_Adapters|Electronics-Networking|USB Bluetooth Adapters
Electronics-Networking-USB_Wi-Fi_Adapters|Electronics-Networking|USB Wi-Fi Adapters
Electronics-Networking-VoIP_Home_Phones|Electronics-Networking|VoIP Home Phones
Electronics-Networking-VoIP_Phone_Adapters|Electronics-Networking|VoIP Phone Adapters
Electronics-Networking-Wired_Routers|Electronics-Networking|Wired Routers
Electronics-Networking-Wireless_Access_Points|Electronics-Networking|Wireless Access Points
Electronics-Networking-Wireless_Routers|Electronics-Networking|Wireless Routers
Electronics-Headphones|Electronics|Headphones
Electronics-Headphones-Earbud_Headphones|Electronics-Headphones|Earbud Headphones
Electronics-Headphones-On-Ear_Headphones|Electronics-Headphones|On-Ear Headphones
Electronics-Headphones-Over-Ear_Headphones|Electronics-Headphones|Over-Ear Headphones
Electronics-Portable_Audio_&_Video|Electronics|Portable Audio & Video
Electronics-Portable_Audio_&_Video-Boomboxes|Electronics-Portable_Audio_&_Video|Boomboxes
Electronics-Portable_Audio_&_Video-CB_&_Two-Way_Radios|Electronics-Portable_Audio_&_Video|CB & Two-Way Radios
Electronics-Portable_Audio_&_Video-Cassette_Players|Electronics-Portable_Audio_&_Video|Cassette Players
Electronics-Portable_Audio_&_Video-Digital_Voice_Recorders|Electronics-Portable_Audio_&_Video|Digital Voice Recorders
Electronics-Portable_Audio_&_Video-MP3_&_MP4_Players|Electronics-Portable_Audio_&_Video|MP3 & MP4 Players
Electronics-Portable_Audio_&_Video-Microcassette_Recorders|Electronics-Portable_Audio_&_Video|Microcassette Recorders
Electronics-Portable_Audio_&_Video-Minidisc_Players|Electronics-Portable_Audio_&_Video|Minidisc Players
Electronics-Portable_Audio_&_Video-Portable_&_Handheld_TVs|Electronics-Portable_Audio_&_Video|Portable & Handheld TVs
Electronics-Portable_Audio_&_Video-Portable_CD_Players|Electronics-Portable_Audio_&_Video|Portable CD Players
Electronics-Portable_Audio_&_Video-Portable_DVD_Players|Electronics-Portable_Audio_&_Video|Portable DVD Players
Electronics-Portable_Audio_&_Video-Portable_Speakers|Electronics-Portable_Audio_&_Video|Portable Speakers
Electronics-Portable_Audio_&_Video-Radios|Electronics-Portable_Audio_&_Video|Radios
`;

/** Categories whose sub-categories were never read (see header): NOT valid mapping targets. */
export const POSHMARK_UNVERIFIED_BRANCHES: ReadonlySet<string> = new Set<string>([
  'Women-Dresses',
  'Women-Intimates_&_Sleepwear',
  'Women-Jeans',
  'Women-Makeup',
  'Women-Shorts',
  'Women-Skirts',
  'Women-Swim',
  'Women-Skincare',
  'Women-Hair',
  'Women-Bath_&_Body',
  'Men-Jeans',
  'Men-Shorts',
  'Men-Suits_&_Blazers',
  'Men-Swim',
  'Men-Underwear_&_Socks',
  'Men-Grooming',
  'Kids-Dresses',
  'Kids-Jackets_&_Coats',
  'Kids-One_Pieces',
  'Kids-Pajamas',
  'Kids-Shoes',
  'Kids-Swim',
  'Kids-Costumes',
  'Kids-Bath,_Skin_&_Hair',
  'Pets-Dog',
  'Pets-Cat',
  'Pets-Bird',
  'Pets-Reptile',
  'Pets-Small_Pets',
  'Electronics-VR,_AR_&_Accessories'
]);

/** Categories verified to have no sub-categories at all (a real leaf at depth 2). */
export const POSHMARK_VERIFIED_CHILDLESS: ReadonlySet<string> = new Set<string>([
  'Kids-Matching_Sets'
]);

function buildPoshmarkNodes(): Map<string, PoshmarkNode> {
  const nodes = new Map<string, PoshmarkNode>();
  for (const raw of POSHMARK_CATALOG_RAW.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const first = line.indexOf('|');
    const second = line.indexOf('|', first + 1);
    const id = line.slice(0, first);
    const parentId = line.slice(first + 1, second);
    const title = line.slice(second + 1);
    const parent = parentId === '0' ? undefined : nodes.get(parentId);
    nodes.set(id, { id, parentId, title, depth: parent ? parent.depth + 1 : 1, childIds: [] });
    if (parent) parent.childIds.push(id);
  }
  return nodes;
}

export const POSHMARK_NODES: ReadonlyMap<string, PoshmarkNode> = buildPoshmarkNodes();

export function getPoshmarkNode(id: string): PoshmarkNode | undefined {
  return POSHMARK_NODES.get(id);
}

/** A node with no children in this tree (includes the unverified bare categories: see isPoshmarkSelectable). */
export function isPoshmarkLeaf(id: string): boolean {
  const n = POSHMARK_NODES.get(id);
  return !!n && n.childIds.length === 0;
}

/** True when the id is a real, fully known end of the picker: a leaf that is not an unverified branch. */
export function isPoshmarkSelectable(id: string): boolean {
  return isPoshmarkLeaf(id) && !POSHMARK_UNVERIFIED_BRANCHES.has(id);
}

/** Root-to-node chain of nodes ([] for an unknown id). */
export function poshmarkPathNodes(id: string): PoshmarkNode[] {
  const out: PoshmarkNode[] = [];
  let cur = POSHMARK_NODES.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId === '0' ? undefined : POSHMARK_NODES.get(cur.parentId);
  }
  return out;
}

/** Titles from the department down to the node, e.g. ["Men", "Accessories", "Belts"]. */
export function poshmarkPathTitles(id: string): string[] {
  return poshmarkPathNodes(id).map((n) => n.title);
}

/** "Men > Accessories > Belts" ('' for an unknown id). */
export function poshmarkPathText(id: string): string {
  return poshmarkPathTitles(id).join(' > ');
}

/** Id of the department an id lives under ('' for an unknown id). */
export function poshmarkDepartmentId(id: string): string {
  const chain = poshmarkPathNodes(id);
  return chain.length ? chain[0].id : '';
}

/** Every selectable leaf id at or below a node. */
export function poshmarkAllSelectableIds(): string[] {
  const out: string[] = [];
  POSHMARK_NODES.forEach((n) => { if (isPoshmarkSelectable(n.id)) out.push(n.id); });
  return out;
}

export const POSHMARK_DEPARTMENT_IDS = {
  WOMEN: 'Women',
  MEN: 'Men',
  KIDS: 'Kids',
  HOME: 'Home',
  PETS: 'Pets',
  ELECTRONICS: 'Electronics',
} as const;
