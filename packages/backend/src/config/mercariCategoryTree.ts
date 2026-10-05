/**
 * mercariCategoryTree.ts -- the PARTIAL Mercari US category taxonomy FindA.Sale actually needs, as compact data plus
 * small lookup helpers (S-EXT-MERCARI-CATEGORY-MAP, 2026-10-05). Dependency-free on purpose: no imports, no env,
 * no I/O, safe to import from any BACKEND file (never from the frontend or @findasale/shared).
 *
 * SOURCE: public Mercari pages https://www.mercari.com/us/category/<slug>-<id>/ (the __NEXT_DATA__ serverState,
 * "Categories:<id>.categoryLevels": each page lists the siblings at every ancestor level plus the page's own
 * children), read on 2026-10-05 in a normal browser session, logged out, public pages only, 2.5 s between loads, no
 * block / CAPTCHA / 403 was shown. Nothing here came from Mercari's private API. A handful of listing pages were also
 * read to see where real vinyl records are filed. The earlier partial harvest of 2026-10-04 (top level, Sports &
 * outdoors level 1, Baseball Equipment children) is merged in unchanged.
 *
 * SHAPE: one line per node, "id|parentId|title", parents listed before children, parentId 0 = a top-level family.
 * Mercari's real picker is 3 levels deep (family > group > leaf, e.g. Sports & outdoors > Baseball Equipment >
 * Baseball Gloves & Mitts).
 *
 * COMPLETENESS (this is a PARTIAL tree, the resolver treats everything not listed as unknown and returns null):
 *   - Top level: complete (17 families). Families 6 Beauty and 2882 Office were NOT expanded below the top level.
 *   - Level 1 (groups) is complete for the families in MERCARI_EXPANDED_TOP_IDS.
 *   - Level 2 (leaves) is complete ONLY for the groups in MERCARI_EXPANDED_GROUP_IDS. Every other group is a
 *     group whose leaves were not harvested: no target may point into it, and a test enforces that.
 *   - A level-2 node is TREATED as a leaf because every level-2 page loaded (MERCARI_CONFIRMED_LEAF_IDS, 6 of 6) showed
 *     no deeper level and the live picker shows 3-level paths. It is not individually confirmed for the others.
 *   - Duplicated titles exist (e.g. "Home decor" under Home and under Vintage & collectibles, "Other" many times):
 *     always address a category by id and by its full path text.
 * Mercari can change this tree at any time; refresh this file (and re-run the tests) when it does.
 */

export interface MercariNode {
  id: number;
  parentId: number;
  title: string;
  /** 1 for a top-level family, 2 for a group, 3 for a leaf. */
  depth: number;
  childIds: number[];
}

export const MERCARI_CATALOG_RAW = `
1|0|Women
11|1|Dresses
12|1|Tops & blouses
155|12|Blouse
156|12|Button down shirt
157|12|Halter
158|12|Knit top
159|12|Polo shirt
161|12|T-shirts
162|12|Tunic
163|12|Turtleneck
164|12|Wrap
165|12|Other
1955|12|Bodysuits
1956|12|Camisoles
1957|12|Tank Tops
13|1|Sweaters
14|1|Jeans
183|14|Boot cut
184|14|Boyfriend
186|14|Cargo
187|14|Flare
188|14|Leggings
189|14|Overalls
190|14|Relaxed
192|14|Straight leg
193|14|Wide leg
194|14|Other
1962|14|Capri Jeans
1963|14|Cropped Jeans
1964|14|Skinny Jeans
1965|14|Slim Jeans
15|1|Pants
16|1|Skirts
17|1|Coats & jackets
216|17|Cape
217|17|Fleece jacket
218|17|Jean jacket
219|17|Military
220|17|Motorcycle
221|17|Parka
222|17|Peacoat
223|17|Poncho
224|17|Puffer
225|17|Raincoat
226|17|Trench
227|17|Vest
228|17|Windbreaker
229|17|Wool
230|17|Other
18|1|Suits & blazers
19|1|Athletic apparel
236|19|Jackets
237|19|Jerseys
240|19|Shorts
243|19|Socks
244|19|Sports bras
246|19|Vests
247|19|Other
1968|19|Athletic Leggings
1969|19|Athletic Pants
1970|19|Athletic Tights
1971|19|Athletic Polos
1972|19|Athletic T-Shirts
1973|19|Athletic Tank Tops
1974|19|Athletic Dresses
1975|19|Athletic Skirts
1976|19|Athletic Skorts
1977|19|Snow Bibs
1978|19|Snow Pants
1979|19|Snowsuits
1980|19|Athletic Hoodies
1981|19|Athletic Sweat Pants
1982|19|Athletic Sweatshirts
1983|19|Athletic Sweatsuits
1984|19|Track Jackets
1985|19|Track Pants
1986|19|Tracksuits
20|1|Swimwear
21|1|Women's handbags
22|1|Women's accessories
23|1|Jewelry
24|1|Maternity
25|1|Shoes
26|1|Other
1561|1|Underwear
1936|1|Shorts
1947|1|Sleepwear & robes
3550|1|Kimono / Yukata
3551|1|School Uniform
2|0|Men
27|2|Tops
297|27|Button-front
298|27|Dress shirts
299|27|Hawaiian
300|27|Henley
302|27|Tank
303|27|T-shirts
304|27|Turtleneck
305|27|Other
2005|27|Polos
2006|27|Rugby Shirts
28|2|Sweats & hoodies
29|2|Sweaters
30|2|Jeans
320|30|Baggy, loose
321|30|Boot cut
322|30|Cargo
323|30|Carpenter
324|30|Classic, straight leg
325|30|Overalls
326|30|Relaxed
328|30|Other
2007|30|Skinny Jeans
2008|30|Slim Jeans
31|2|Pants
32|2|Shorts
33|2|Coats & jackets
347|33|Fleece jacket
348|33|Flight/bomber
349|33|Jean jacket
350|33|Military
351|33|Motorcycle
352|33|Parka
353|33|Peacoat
354|33|Poncho
355|33|Puffer
356|33|Rainwear
357|33|Trench
358|33|Varsity/baseball
359|33|Vest
360|33|Windbreaker
361|33|Wool
362|33|Other
34|2|Blazers & sport coats
35|2|Suits
36|2|Athletic apparel
376|36|Competitive swimwear
377|36|Jackets
378|36|Jerseys
379|36|Pants
381|36|Shorts
383|36|Socks
385|36|Vests
386|36|Other
2009|36|Athletic Polos
2010|36|Athletic Long Sleeve Shirts
2011|36|Athletic Short Sleeve Shirts
2012|36|Jerseys
2013|36|Athletic T-Shirts
2014|36|Athletic Tank Tops
2015|36|Snow Bibs
2016|36|Snow Pants
2017|36|Snowsuits
2018|36|Athletic Hoodies
2019|36|Athletic Sweat Pants
2020|36|Athletic Sweatshirts
2022|36|Track Pants
2023|36|Tracksuits
37|2|Swimwear
38|2|Men's accessories
39|2|Shoes
40|2|Other
2874|2|Jewelry
3532|2|Kimono / Yukata
3533|2|School Uniform
3|0|Kids
48|3|Bathing & skin care
49|3|Car seats & accessories
50|3|Diapering
51|3|Feeding
52|3|Gear
53|3|Health & baby care
54|3|Nursery
55|3|Potty training
56|3|Pregnancy & maternity
57|3|Safety
58|3|Strollers
59|3|Other
1870|3|Girls accessories
1871|3|Girls bottoms
1872|3|Girls coats & jackets
1873|3|Girls dresses
1874|3|Girls one-pieces
1875|3|Girls shoes
1876|3|Girls swimwear
1877|3|Girls tops & t-shirts
1878|3|Girls other
1879|3|Boys accessories
1880|3|Boys bottoms
1881|3|Boys coats & jackets
1882|3|Boys one-pieces
1883|3|Boys swimwear
1884|3|Boys shoes
1885|3|Boys tops & t-shirts
1886|3|Boys other
4|0|Home
60|4|Kids' home store
61|4|Kitchen & dining
589|61|Other
2069|61|Home Brewing Supplies
2070|61|Wine Making Supplies
2071|61|Cutlery Accessories
2073|61|Water Coolers
2074|61|Water Filters
62|4|Bedding
63|4|Bath
64|4|Furniture
613|64|Home bar furniture
614|64|Entertainment Centers & TV Stands
65|4|Home decor
622|65|Baskets
624|65|Clocks
625|65|Decorative pillows
626|65|Doormats
627|65|Doorstops
628|65|Draft stoppers
630|65|Home decor accents
631|65|Home fragrance
633|65|Mirrors
635|65|Slipcovers
636|65|Tapestries
637|65|Window treatments
638|65|Vases
639|65|Other
2090|65|Area Rugs
2091|65|Rug Pads
2092|65|Candle Holders
2093|65|Candle Warmers
2094|65|Fragrance Oils
2095|65|Home Candles
2096|65|Other Candle Accessories
2097|65|Wax Melts
2098|65|Fireplace Accessories
2099|65|Fireplaces
2100|65|Home Decor Lamps
2101|65|Home Decor Lighting
2102|65|Home Decor Lamp Accessories
2103|65|Photo Albums
2104|65|Picture Frames
2825|65|Aromatherapy Diffusers
66|4|Artwork
640|66|Drawings
642|66|Paintings
643|66|Photographs
645|66|Other
2105|66|Etchings
2106|66|Lithographs
2107|66|Woodcuts
2108|66|Art Prints
2109|66|Posters
67|4|Seasonal decor
646|67|Christmas
647|67|Easter
648|67|Halloween
649|67|Valentine
650|67|Patriotic
651|67|Thanksgiving
652|67|Birthday
653|67|St patrick's
654|67|Hanukkah
655|67|Day of the dead
656|67|New year's
657|67|Other
68|4|Home appliances
658|68|Air conditioners
659|68|Air purifiers
660|68|Dehumidifiers
661|68|Dishwashers
662|68|Garbage disposals
663|68|Fans
665|68|Garment steamers
666|68|Humidifiers
668|68|Kitchen appliances
669|68|Microwaves
670|68|Refrigerators
671|68|Space heaters
2110|68|Freezers
2111|68|Ice Makers
2112|68|Ironing Boards
2113|68|Irons
2114|68|Home Floor Care
2115|68|Vacuums
2116|68|Dryers
2117|68|Washer & Dryer Sets
2118|68|Washers
2119|68|Beverage Coolers
2120|68|Wine Coolers
69|4|Storage & organization
677|69|Bathroom storage & organization
678|69|Clothing & closet storage
679|69|Garage storage & organization
680|69|Holiday decor storage
682|69|Laundry storage & organization
684|69|Trash & recycling
685|69|Storage cabinets
686|69|Jewelry boxes & organizers
687|69|Other
2121|69|Storage Baskets
2122|69|Storage Bins
2123|69|Storage Drawers
2124|69|Storage Racks
2125|69|Storage Shelves
70|4|Cleaning supplies
71|4|Other
576|4|Kitchen Bakeware
577|4|Kitchen Coffee & Espresso Makers
578|4|Kitchen Cookware
579|4|Kitchen Dinnerware
580|4|Kitchen Serveware
582|4|Kitchen & Table Linens
584|4|Kitchen Utensils
585|4|Kitchen Small Appliances
586|4|Kitchen Storage
588|4|Kitchen Bar & Wine Accessories
611|4|Bedroom Furniture
612|4|Kitchen Furniture
615|4|Home Office Furniture
616|4|Living Room Furniture
617|4|Bathroom Furniture
618|4|Other Furniture
619|4|Furniture Hardware & Parts
1853|4|Party Supplies
2072|4|Kitchen Cutlery
2305|4|Kitchen Baking & Cake Accessories
2329|4|Kitchen Barware
2383|4|Kitchen Drinkware
2393|4|Kitchen Flatware
2413|4|Kitchen Gadgets & Tools
2488|4|Kitchen Tea & Accessories
5|0|Vintage & collectibles
95|5|Jewelry
96|5|Clothing
97|5|Home decor
903|97|Wall hanging
904|97|Vase
905|97|Linens
906|97|Lighting
907|97|Box
908|97|Candle holder
909|97|Planter
910|97|Bedding
911|97|Tray
912|97|Pillow
913|97|Frame
914|97|Basket
915|97|Other
3631|97|Designer Packaging & Dust Bags
99|5|Accessories
100|5|Housewares
101|5|Supplies
102|5|Antique
968|102|100 years or older
969|102|50 to 75 years
970|102|Paper ephemera
971|102|Collectibles
972|102|75 to 100 years
973|102|Home decor
974|102|Jewelry
975|102|Housewares
976|102|Supplies
977|102|Serving
978|102|Book
979|102|Accessories
980|102|Furniture
982|102|Bags and purses
983|102|Electronics
984|102|Other
103|5|Paper ephemera
985|103|Postcard
986|103|Advertisement
987|103|Map
988|103|Stamps
989|103|Game
990|103|Matchbox
991|103|Other
104|5|Serving
106|5|Bags and purses
108|5|Electronics
109|5|Furniture
111|5|Other
2603|5|Collectible Coins
2604|2603|Collectible Ancient Coins
2605|2603|Collectible Exonumia
2606|2603|Collectible US Coins
2607|2603|Collectible World Coins
2608|2603|Other Collectible Coins
2609|5|Collectible Paper Money
2610|2609|Collectible US Paper Money
2611|2609|Collectible World Paper Money
2612|2609|Other Collectible Paper Money
2613|5|Collectible Postage
6|0|Beauty
7|0|Electronics
80|7|Cameras & photography
759|80|Digital cameras
760|80|Camcorders
761|80|Camera & photo accessories
766|80|Lighting & studio
767|80|Film & Polaroid Cameras
768|80|Other
2134|80|Camera Filters
2135|80|Camera Lenses
2136|80|Photography Supports
2137|80|Photography Tripods
2138|80|Camera Flash Accessories
2139|80|Camera Flashes
2140|80|Binoculars
2141|80|Telescopes
2205|80|Sport Cameras
2206|80|Waterproof Cameras
2207|80|Camera Films
2208|80|Polaroid Films
81|7|Computers & Laptops
774|81|Networking & connectivity
777|81|Other
1595|81|Monitors & Screens
1596|81|Computer Accessories
2145|81|Laptops
2146|81|Netbooks
2147|81|Desktops Computers
2148|81|All-In-One Computers
2149|81|Printers
2150|81|Printing Supplies
2151|81|Scanners
2152|81|Computer Drives
2153|81|Computer Media
2154|81|Computer Storage
2268|81|All-In-One Printers
82|7|Cell phones & accessories
83|7|TV & Video
84|7|Video games & consoles
796|84|Games
797|84|Consoles
798|84|Accessories
800|84|Strategy guides
802|84|Replacement parts & tools
803|84|Other
1599|84|PC Gaming
3630|84|Game Cases & Manuals
85|7|Car audio, video & gps
805|85|GPS units & equipment
806|85|Car speakers & systems
807|85|Car subwoofers
808|85|Car video
809|85|Car security & convenience
810|85|Car A/V installation
813|85|Other
2166|85|Car Amplifiers
2167|85|Car CD Changers
2168|85|Car Equalizers
2169|85|Car Stereo Receivers
2170|85|GPS Accessories
2171|85|GPS Car Mounts
2246|85|Car Coaxial Speakers
2247|85|Car Component Speakers
2248|85|Car Mid-Range Speakers
2249|85|Car Tweeters
2250|85|Car Woofers
86|7|Media
814|86|Blu-ray
815|86|DVD
816|86|CD
817|86|VHS
818|86|Other
87|7|Other
775|7|Computer Components & Parts
801|7|Video Game Merchandise
1573|7|Wearables
1580|7|Smart Home & Security
1587|7|Home Audio
788|1587|Other Home Audio
793|1587|Audio Accessories
1556|1587|Studio recording equipment
1588|1587|Bluetooth Speakers
1590|1587|Docking Stations
1591|1587|Radios
1592|1587|Portable Stereos & Boomboxes
2162|1587|Home Speakers
2163|1587|Home Subwoofers
2197|1587|Microphone Accessories
2198|1587|Microphones
2199|1587|DJ Equipment
2200|1587|Karaoke Equipment
2203|1587|CD Players
2204|1587|Record Players
2269|1587|Compact Stereos
2270|1587|DA Converters
2271|1587|Home Audio Amplifiers
2272|1587|Home Audio Cables
2273|1587|Home Audio CD/SACD Players
2274|1587|Home Audio Equalizers
2275|1587|Home Audio Integrated Amplifiers
2276|1587|Home Audio Interconnects
2277|1587|Home Audio Preamplifiers
2278|1587|Home Audio Receivers
2279|1587|Home Audio Sound Bars
2280|1587|Home Audio Tape Decks
2281|1587|Home Audio Turntables
2282|1587|Music Streamers
2283|1587|Radio Tuners
1593|7|Headphones & MP3 Players
1597|7|Tablets & E-readers
1603|7|Drones
1606|7|Virtual Reality
3596|7|Wellness Tech
8|0|Sports & outdoors
72|8|Team sports
703|72|Soccer
704|72|Lacrosse
706|72|Hockey
707|72|Football
708|72|Tennis & racquets
709|72|Badminton
710|72|Volleyball
711|72|Rugby
712|72|All other sports
2127|72|Softball Equipment
73|8|Exercise
74|8|Footwear
75|8|Apparel
76|8|Golf
734|76|Men's golf clubs
735|76|Women's golf clubs
736|76|Golf apparel
737|76|Golf shoes
738|76|Golf bags
739|76|Golf balls
740|76|Electronics
741|76|Other
77|8|Outdoors
745|77|Water sports
746|77|Indoor/outdoor games
747|77|Boating
751|77|Other
2130|77|Biking Equipment
2131|77|Skating Equipment
2133|77|Hiking Equipment
3156|77|Electric Scooters
78|8|Fan shop
752|78|MLB
753|78|NFL
754|78|NHL
755|78|NBA
756|78|NCAA
757|78|Other
79|8|Other
705|8|Basketball Equipment
744|8|Fishing Gear
749|8|Snowboarding Gear
750|8|Skateboard Gear
2126|8|Baseball Equipment
3092|2126|Base Sets & Homeplates
3093|2126|Baseball Accessories
3094|2126|Baseball Bat Racks
3095|2126|Baseball Bats
3096|2126|Baseball Belts
3097|2126|Baseball Cleats
3098|2126|Baseball Equipment Bags
3099|2126|Baseball Face Guards
3100|2126|Baseball Gloves & Mitts
3101|2126|Baseball Helmets
3102|2126|Baseball Jackets
3103|2126|Baseball Pants
3104|2126|Baseball Protective Gear
3105|2126|Baseball Shirts & Jerseys
3106|2126|Baseball Socks
3107|2126|Baseball Uniforms
3108|2126|Baseballs
3109|2126|Batting Cages & Netting
3110|2126|Batting Gloves
3111|2126|Batting Tees
3112|2126|Pitching Machines
3113|2126|Other Baseball Equipment
2129|8|Yoga Equipment
2132|8|Camping Equipment
3124|2132|Camping Canopies
3125|2132|Camping Chairs
3126|2132|Camping Coolers & Ice Chests
3127|2132|Camping Tables
3128|2132|Camping Tents
3129|2132|Inflatable Beds
3130|2132|Insect Repellant Candles
3131|2132|Insect Repellant Sprays
3132|2132|Insect Repellant Torches
3133|2132|Outdoor Flashlights
3134|2132|Outdoor Headlamps
3135|2132|Camping Lanterns
3136|2132|Portable Grills
3137|2132|Sleeping Bags
3138|2132|Camping Sleeping Pads
3139|2132|Camping Tools
3140|2132|Other Camping Equipment
2571|8|Ski Gear
3141|8|Cycling Equipment
3622|8|Soccer Equipment
9|0|Handmade
112|9|Housewares
114|9|Woodworking
115|9|Ceramics and pottery
116|9|Glass
118|9|Weddings
119|9|Holidays
121|9|Children
122|9|Needlecraft
123|9|Geekery
124|9|Paper goods
125|9|Candles
126|9|Patterns
127|9|Crochet
128|9|Furniture
129|9|Quilts
130|9|Accessories
131|9|Pets
134|9|Knitting
135|9|Bags and purses
136|9|Jewelry
137|9|Books and zines
138|9|Clothing
139|9|Music
1472|139|Vinyl
1473|139|Poster
1474|139|Instrument
1475|139|Equipment
1476|139|Case
1477|139|Tape
1478|139|Other
140|9|Other
10|0|Other
144|10|Daily & travel items
145|10|Automotive
146|10|Office Supplies
147|10|Musical instruments
1544|147|Guitars
1545|147|Bass guitars
1547|147|Keyboards
1550|147|Brass instruments
1551|147|Stringed instruments
1552|147|Wind & woodwind instruments
1553|147|Band & orchestra
1554|147|Instrument accessories
1555|147|Live sound & stage
1558|147|Other
2193|147|Drums
2194|147|Percussion Instruments
2195|147|Musical Instrument Amplifiers
2196|147|Music Effects
148|10|Other
1033|10|Travel & Luggage
1523|10|Automotive Oils & Fluids
113|0|Arts & Crafts
1101|113|Photography
1103|113|Handmade Paintings
1104|113|Mixed media
1105|113|Sculptures
1106|113|Illustration
1107|113|Collages
1108|113|Drawing Supplies
1109|113|Fiber art
1110|113|Printmaking
1111|113|Aceo
1112|113|Other Arts & Crafts
1726|113|Paint
2630|113|Native American Arts & Crafts
3371|113|Art Paper & Surfaces
3395|113|Art Pencils
3401|113|Art Studio Furniture
3406|113|Ink & Calligraphy
3421|113|Paint Accessories
3433|113|Paint Brushes
3442|113|Pastels
3448|113|Mediums & Varnishes
3458|113|Resin Art Supplies
3465|113|Stamping & Embossing
141|0|Books
142|141|Magazines
1495|142|Lifestyle & Culture Magazines
1496|142|International Magazines
1497|142|Professional & Trade Magazines
1498|142|Other Magazines
1011|141|Fiction Books
1016|141|Nonfiction Books
1480|141|Reference Books
1494|141|Other Books
143|0|Pet Supplies
1508|143|Others
3008|143|Aquariums & Fish Supplies
3009|3008|Air Pumps
3010|3008|Aquarium Decor
3011|3008|Aquarium Heaters
3012|3008|Aquarium Lighting
3013|3008|Aquarium Water Cleaners
3014|3008|Aquariums & Tanks
3015|3008|Tank Filters
3016|3008|Fish Bowls
3017|3008|Fish Food
3018|3008|Aquarium Gravel & Substrate
3019|3008|Aquarium UV Sterilizers
3020|3008|Aquarium Water Pumps
3021|3008|Other Aquarium & Fish Supplies
3022|143|Bird Supplies
3031|143|Cat Supplies
3055|143|Dog Supplies
3086|143|Reptile Supplies
1611|0|Toys & Collectibles
1612|1611|Action Figures & Accessories
1619|1611|Dolls & Accessories
1629|1611|Collectibles & Hobbies
1631|1629|Model Vehicles
1632|1629|Model Kits
1633|1629|Squishies
1634|1629|Figurines
1635|1629|Glass
1636|1629|Souvenirs & Memorabilia
1637|1629|Porcelain
1638|1629|Dolls
1639|1629|Arcade
1640|1629|Autographs
1641|1629|Comics
1642|1629|Paper Collectibles
1643|1629|Keychains
1644|1629|Pins
1645|1629|Rocks, Fossils & Minerals
1646|1629|Bags & Totes
1647|1629|Other
2209|1629|Bobbleheads
2210|1629|Toy Statues
3625|1629|Acrylic Stands & Standees
3627|1629|Collectible Popcorn Buckets
3629|1629|Shoe & Croc Charms
1648|1611|Building Toys
1654|1611|Electronics for Kids
1668|1611|Games & Puzzles
1684|1611|Sports & Outdoor Play
1704|1611|Remote Control Toys & Vehicles
1712|1611|Stuffed Animals & Plush
1720|1611|Arts & Crafts
1731|1611|Baby & Toddler Toys
1745|1611|Learning & Education Toys
1759|1611|Dress Up & Pretend Play
1771|1611|Novelty & Gag Toys
1780|1611|Trading Cards
1789|1780|Other Trading Cards
3506|1780|Booster Packs
3507|1780|Trading Card Boxes
3508|1780|Trading Card Decks
3509|1780|Single Cards
3510|1780|Trading Card Tins
3628|1780|Anime & Manga TCG
1790|1611|Vintage & Antique Toys
1803|1611|Vintage & Antique Collectibles
1814|1611|Handmade Toys
1832|1611|Handmade Dolls & Miniatures
1851|1611|Other
3511|1611|Sports Trading Cards
1787|3511|Other Sports Trading Cards
2596|3511|Auto Racing Trading Cards
2597|3511|Baseball Trading Cards
2598|3511|Basketball Trading Cards
2599|3511|Boxing Trading Cards
2600|3511|Football Trading Cards
2601|3511|Hockey Trading Cards
2602|3511|Soccer Trading Cards
3512|3511|Wrestling Trading Cards
3632|3511|Golf Trading Cards
3633|3511|Tennis Trading Cards
3634|3511|MMA & UFC Trading Cards
3635|3511|Multi-Sport Trading Cards
3569|1611|Photocards
3570|1611|Music Memorabilia
3609|1611|Blind Box & Designer Toys
2633|0|Garden & Outdoor
2634|2633|Garden Decor
2660|2633|Garden Hand Tools & Equipment
2691|2633|Garden Protective Gear
2697|2633|Garden Structures & Shades
2710|2633|Outdoor Heating & Cooking
2711|2710|Barbecue Grills
2712|2710|Charcoal
2713|2710|Fire Pits
2714|2710|Firewood
2715|2710|Patio Heaters
2716|2710|Picnic Baskets
2717|2710|Smokers
2718|2710|Other Heating & Cooking
2719|2633|Outdoor Power Equipment
2737|2633|Outdoor Waste & Composting
2744|2633|Patio Furniture
2757|2633|Planting Accessories
2772|2633|Live Plants
2784|2633|Pool Equipment
2806|2633|Sauna & Hot Tub Equipment
2813|2633|Watering Equipment
2814|2813|Hose Nozzles
2815|2813|Hose Reels
2816|2813|Water Hoses
2817|2813|Lawn Sprinklers
2818|2813|Rain Barrels
2819|2813|Spigots
2820|2813|Spray Guns
2821|2813|Sprinkler Heads
2822|2813|Water Pumps
2823|2813|Watering Cans
2824|2813|Other Watering Equipment
2882|0|Office
3170|0|Tools
3171|3170|Air Tools
3190|3170|Chains & Ropes
3197|3170|Cutting Tools
3205|3170|Electrical Tools
3219|3170|Fastening Tools
3227|3170|Hammers
3233|3170|Hand Tools
3249|3170|Measuring & Layout
3257|3170|Pliers
3263|3170|Power Tools
3284|3170|Power Tool Accessories
3288|3170|Safety Gear
3308|3170|Saws
3317|3170|Saw Accessories
3325|3170|Screwdrivers
3332|3170|Tie Downs
3343|3170|Tools Storage
3349|3170|Welding Equipment
3362|3170|Wrenches
`;

/** Top-level families whose groups (level 1) were harvested completely. */
export const MERCARI_EXPANDED_TOP_IDS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 7, 8, 9, 10, 113, 141, 143, 1611, 2633, 3170];

/** Groups (level 1) whose leaves (level 2) were harvested completely. Only leaves under these may be targeted. */
export const MERCARI_EXPANDED_GROUP_IDS: ReadonlyArray<number> = [86, 84, 80, 85, 81, 139, 147, 1629, 1780, 3511, 142, 102, 103, 2603, 2609, 97, 76, 78, 2132, 77, 72, 65, 66, 61, 64, 67, 68, 69, 3008, 2710, 2813, 19, 12, 14, 17, 36, 27, 30, 33, 1587, 2126];

/** Leaves whose own page was loaded and showed no deeper level (the rest of level 2 is treated as leaves by inference). */
export const MERCARI_CONFIRMED_LEAF_IDS: ReadonlyArray<number> = [3100, 1472, 1641, 2606, 734, 3509];

export const MERCARI_ROOT_IDS = {
  WOMEN: 1,
  MEN: 2,
  KIDS: 3,
  HOME: 4,
  VINTAGE_COLLECTIBLES: 5,
  BEAUTY: 6,
  ELECTRONICS: 7,
  SPORTS_OUTDOORS: 8,
  HANDMADE: 9,
  OTHER: 10,
  ARTS_CRAFTS: 113,
  BOOKS: 141,
  PET_SUPPLIES: 143,
  TOYS_COLLECTIBLES: 1611,
  GARDEN_OUTDOOR: 2633,
  OFFICE: 2882,
  TOOLS: 3170,
} as const;

function buildMercariNodes(): Map<number, MercariNode> {
  const nodes = new Map<number, MercariNode>();
  for (const raw of MERCARI_CATALOG_RAW.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const first = line.indexOf('|');
    const second = line.indexOf('|', first + 1);
    const id = Number(line.slice(0, first));
    const parentId = Number(line.slice(first + 1, second));
    const title = line.slice(second + 1);
    const parent = parentId === 0 ? undefined : nodes.get(parentId);
    nodes.set(id, { id, parentId, title, depth: parent ? parent.depth + 1 : 1, childIds: [] });
    if (parent) parent.childIds.push(id);
  }
  return nodes;
}

export const MERCARI_NODES: ReadonlyMap<number, MercariNode> = buildMercariNodes();

export function getMercariNode(id: number): MercariNode | undefined {
  return MERCARI_NODES.get(id);
}

/**
 * True when the id is a leaf Mercari lets a seller pick: a level-2 node under a group whose leaves were harvested
 * (or a confirmed leaf). A group (level 1) is never selectable, and neither is anything we have not harvested.
 */
export function isMercariLeaf(id: number): boolean {
  const n = MERCARI_NODES.get(id);
  if (!n) return false;
  if (n.childIds.length !== 0) return false;
  if (MERCARI_CONFIRMED_LEAF_IDS.indexOf(id) !== -1) return true;
  return n.depth === 3 && MERCARI_EXPANDED_GROUP_IDS.indexOf(n.parentId) !== -1;
}

/** Root-to-node chain of nodes ([] for an unknown id). */
export function mercariPathNodes(id: number): MercariNode[] {
  const out: MercariNode[] = [];
  let cur = MERCARI_NODES.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId === 0 ? undefined : MERCARI_NODES.get(cur.parentId);
  }
  return out;
}

/** Titles from the family down to the node, e.g. ["Sports & outdoors", "Baseball Equipment", "Baseball Gloves & Mitts"]. */
export function mercariPathTitles(id: number): string[] {
  return mercariPathNodes(id).map((n) => n.title);
}

/** "Sports & outdoors > Baseball Equipment > Baseball Gloves & Mitts" ('' for an unknown id). */
export function mercariPathText(id: number): string {
  return mercariPathTitles(id).join(' > ');
}

/** Id of the top-level family an id lives under (0 for an unknown id). */
export function mercariRootId(id: number): number {
  const chain = mercariPathNodes(id);
  return chain.length ? chain[0].id : 0;
}

export function mercariAllLeafIds(): number[] {
  const out: number[] = [];
  MERCARI_NODES.forEach((n) => { if (isMercariLeaf(n.id)) out.push(n.id); });
  return out;
}
