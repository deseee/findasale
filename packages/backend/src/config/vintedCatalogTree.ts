/**
 * vintedCatalogTree.ts -- Vinted's full category tree (vinted.com, locale en_US) as compact data, plus
 * small lookup helpers. Dependency-free on purpose: no imports, no env, no I/O, safe to import from
 * any BACKEND file (never from the frontend or @findasale/shared).
 *
 * SOURCE: the server-rendered payload of the public page https://www.vinted.com/catalog (the
 * "catalogTree" array embedded in its own __next_f data), read from an already-loaded page in a
 * normal browser tab on 2026-10-04. Nothing here was fetched from Vinted's private API.
 * Cross-checked against the live site: /catalog/4535 breadcrumb is
 * Sports > Team sports > Baseball & softball > Baseball & softball gloves, and /catalog/3851 is
 * Home > Home accessories > Wall decor > Signs.
 *
 * SHAPE: one line per node, "id|parentId|title", parents listed before children, parentId 0 = a root.
 * TOTALS (asserted by __tests__/vintedCategoryResolver.test.ts): 2899 nodes, 2480 leaves, max depth 5
 * (a root has depth 1), 9 roots, sum of all node ids 10468344.
 * Roots: 1904 Women, 5 Men, 2993 Designer, 1193 Kids, 1918 Home, 2994 Electronics,
 * 2309 Books & Media, 4824 Hobbies & collectibles, 4332 Sports.
 *
 * Titles are NOT unique (e.g. "Gloves" exists under Women, Men and Kids). Always address a category by
 * its numeric id, and by its full path text when a human or the browser picker must tell two apart.
 * Vinted can change this tree at any time; refresh this file (and re-run the tests) when it does.
 */

export interface VintedNode {
  id: number;
  parentId: number;
  title: string;
  /** 1 for a root. */
  depth: number;
  childIds: number[];
}

export const VINTED_CATALOG_RAW = `
1904|0|Women
4|1904|Clothing
1037|4|Outerwear
1773|1037|Capes & ponchos
1907|1037|Coats
2525|1907|Duffle coats
1090|1907|Faux fur coats
2526|1907|Overcoats & long coats
1087|1907|Parkas
1076|1907|Peacoats
1080|1907|Raincoats
1834|1907|Trench coats
2524|1037|Vests
1908|1037|Jackets
2527|1908|Biker & racer jackets
1078|1908|Bomber jackets
1079|1908|Denim jackets
2528|1908|Field & utility jackets
1086|1908|Fleece jackets
2614|1908|Puffer jackets
2596|1908|Quilted jackets
2529|1908|Shackets
2530|1908|Ski & snowboard jackets
2531|1908|Varsity jackets
2532|1908|Windbreakers
13|4|Jumpers & sweaters
196|13|Hoodies & sweatshirts
1917|13|Sweaters
190|1917|V-neck sweaters
191|1917|Turtleneck sweaters
192|1917|Long sweaters
529|1917|Knitted sweaters
193|1917|¾-sleeve sweaters
1066|1917|Other sweaters
1067|13|Kimonos
194|13|Cardigans
195|13|Boleros
1874|13|Vests
197|13|Other jumpers & sweaters
8|4|Suits & blazers
532|8|Blazers
1125|8|Pantsuits
1126|8|Skirt suits
1128|8|Suit separates
1129|8|Other suits & blazers
10|4|Dresses
178|10|Mini-dresses
1056|10|Midi-dresses
1055|10|Long dresses
1774|10|Special-occasion dresses
1775|1774|Party & cocktail dresses
1776|1774|Wedding dresses
1777|1774|Prom dresses
1778|1774|Evening dresses
1060|1774|Backless dresses
1065|10|Summer dresses
1779|10|Winter dresses
1057|10|Formal & work dresses
1059|10|Casual dresses
1061|10|Strapless dresses
1058|10|Little black dresses
179|10|Jean dresses
176|10|Other dresses
11|4|Skirts
198|11|Mini skirts
2927|11|Knee-length skirts
199|11|Midi skirts
200|11|Maxi skirts
2928|11|Asymmetric skirts
5491|4|Skorts
12|4|Tops & T-shirts
222|12|Shirts
1043|12|Blouses
14|12|Camis
221|12|T-shirts
534|12|Tank tops
227|12|Tunics
1041|12|Crop tops
223|12|Short-sleeved tops
225|12|¾-sleeve tops
224|12|Long-sleeved tops
1835|12|Bodysuits
1042|12|Off-the-shoulder tops
1045|12|Turtlenecks
1837|12|Peplum tops
1044|12|Halter tops
228|12|Other tops & t-shirts
183|4|Jeans
1839|183|Boyfriend jeans
1840|183|Cropped jeans
1841|183|Flared jeans
1842|183|High-waisted jeans
1843|183|Ripped jeans
1844|183|Skinny jeans
1845|183|Straight jeans
1864|183|Other
9|4|Pants & leggings
1070|9|Cropped pants & chinos
1071|9|Wide-leg pants
185|9|Skinny pants
187|9|Tailored pants
1846|9|Straight-leg pants
184|9|Leather pants
525|9|Leggings
526|9|Harem pants
189|9|Other trousers
15|4|Shorts & cropped pants
1838|15|Low-waist shorts
1099|15|High-waist shorts
203|15|Knee-length shorts
538|15|Jean shorts
1101|15|Lace shorts
1100|15|Leather shorts
1103|15|Cargo shorts
204|15|Cropped pants
205|15|Other shorts & cropped pants
1035|4|Jumpsuits & rompers
1131|1035|Jumpsuits
1132|1035|Rompers
1134|1035|Other jumpsuits & rompers
28|4|Swimwear
218|28|One-pieces
219|28|Bikinis & tankinis
1780|28|Cover-ups & sarongs
220|28|Other swimwear & beachwear
29|4|Lingerie & nightwear
119|29|Bras
120|29|Panties
229|29|Sets
1781|29|Shapewear
123|29|Sleepwear
1030|29|Dressing gowns
1263|29|Tights & stockings
1262|29|Socks
1847|29|Lingerie accessories
124|29|Other
1176|4|Maternity clothes
1179|1176|Maternity tops
1182|1176|Maternity dresses
1178|1176|Maternity skirts
1177|1176|Maternity pants
1185|1176|Maternity shorts
1181|1176|Maternity jumpsuits & rompers
1184|1176|Maternity sweaters
1183|1176|Maternity coats & jackets
1186|1176|Maternity swimwear & beachwear
1614|1176|Maternity underwear
1615|1614|Maternity panties
1616|1614|Sleepwear
1618|1614|Pregnancy & breastfeeding bras
2084|1176|Maternity activewear
73|4|Activewear
571|73|Outerwear
572|73|Tracksuits
573|73|Pants
578|73|Shorts
574|73|Dresses
575|73|Skirts
576|73|Tops & T-shirts
3268|73|Jerseys
577|73|Hoodies & sweatshirts
579|73|Sports accessories
1441|579|Glasses
1444|579|Gloves
1443|579|Hats
1440|579|Scarves
3049|579|Wristbands
1439|73|Sports bras
580|73|Other activewear
1782|4|Costumes & special outfits
18|4|Other clothing
16|1904|Shoes
2955|16|Ballerinas
2954|16|Boat shoes, loafers & moccasins
1049|16|Boots
2618|1049|Ankle boots
2619|1049|Mid-calf boots
211|1049|Knee-high boots
2620|1049|Over-the-knee boots
2621|1049|Snow boots
213|1049|Rain boots
2622|1049|Work boots
2623|16|Clogs & mules
2953|16|Espadrilles
2952|16|Flip-flops & slides
543|16|Heels
2951|16|Lace-up shoes
2950|16|Mary Janes & T-strap shoes
2949|16|Sandals
215|16|Slippers
2630|16|Sports shoes
2639|2630|Basketball shoes
2640|2630|Climbing & bouldering shoes
2641|2630|Cycling shoes
2642|2630|Dance shoes
2643|2630|Soccer cleats
2644|2630|Golf shoes
2645|2630|Hiking boots & shoes
2646|2630|Skates
2647|2630|Indoor soccer shoes
2648|2630|Indoor training shoes
2649|2630|Motorcycle boots
2650|2630|Roller skates & inline skates
2651|2630|Running shoes
2652|2630|Ski boots
2653|2630|Snowboard boots
2654|2630|Swimming & water shoes
2655|2630|Tennis shoes
2632|16|Sneakers
19|1904|Bags
157|19|Backpacks
2940|19|Beach bags
2941|19|Briefcases
2942|19|Bucket bags
1848|19|Fanny packs
159|19|Clutches
2943|19|Garment bags
2944|19|Gym bags
156|19|Handbags
2945|19|Hobo bags
1849|19|Holdalls & duffel bags
1850|19|Luggage & suitcases
161|19|Makeup bags
1784|19|Satchels & messenger bags
158|19|Shoulder bags
552|19|Tote bags
160|19|Wallets
2939|19|Wristlets
1187|1904|Accessories
2931|1187|Bandanas & headscarves
20|1187|Belts
90|1187|Gloves
1123|1187|Hair accessories
2932|1187|Handkerchiefs
88|1187|Hats & caps
2933|88|Balaclavas
2934|88|Beanies
230|88|Caps
2935|88|Earmuffs
2936|88|Fascinators
231|88|Hats
234|88|Headbands
21|1187|Jewelry
1785|21|Anklets
2937|21|Body jewelry
165|21|Bracelets
167|21|Brooches
2938|21|Charms & pendants
163|21|Earrings
166|21|Jewelry sets
164|21|Necklaces
553|21|Rings
162|21|Other jewelry
1852|1187|Keyrings
89|1187|Scarves & shawls
26|1187|Sunglasses
1851|1187|Umbrellas
22|1187|Watches
1140|1187|Other accessories
146|1904|Beauty
964|146|Makeup
152|146|Perfume
948|146|Facial care
1906|146|Beauty tools
1903|1906|Hair styling tools
950|1906|Facial care tools
958|1906|Body care tools
962|1906|Nail care tools
967|1906|Makeup tools
1264|146|Hand care
960|146|Nail care
956|146|Body care
1902|146|Hair care
153|146|Other beauty items
5|0|Men
2050|5|Clothing
257|2050|Jeans
1816|257|Ripped jeans
1817|257|Skinny jeans
1818|257|Slim fit jeans
1819|257|Straight fit jeans
1206|2050|Outerwear
2051|1206|Coats
1225|2051|Duffle coats
2533|2051|Overcoats & long coats
1227|2051|Parkas
1861|2051|Peacoats
1859|2051|Raincoats
1230|2051|Trench coats
2553|1206|Vests
2052|1206|Jackets
2534|2052|Biker & racer jackets
1223|2052|Bomber jackets
1224|2052|Denim jackets
2535|2052|Field & utility jackets
1858|2052|Fleece jackets
1226|2052|Harrington jackets
2536|2052|Puffer jackets
2537|2052|Quilted jackets
2538|2052|Shackets
2539|2052|Ski & snowboard jackets
2550|2052|Varsity jackets
2551|2052|Windbreakers
2552|1206|Ponchos
76|2050|Tops & T-shirts
536|76|Shirts
1801|536|Checked shirts
1802|536|Denim shirts
1803|536|Plain shirts
1804|536|Print shirts
1805|536|Striped shirts
1865|536|Other shirts
77|76|T-shirts
1806|77|Plain T-shirts
1807|77|Print T-shirts
1808|77|Striped T-shirts
1810|77|Long-sleeved T-shirts
1868|77|Other T-shirts
5492|76|Polo shirts
560|76|Tank tops
32|2050|Suits & blazers
1786|32|Suit jackets & blazers
1787|32|Suit pants
1788|32|Vests
1789|32|Suit sets
1790|32|Wedding suits
1866|32|Other suits & blazers
79|2050|Sweaters & sweatshirts
1811|79|Sweaters
267|79|Hoodies & sweatshirts
1812|79|Zip-up hoodies & sweatshirts
266|79|Cardigans
1813|79|Crew neck sweaters
264|79|V-neck sweaters
265|79|Turtleneck sweaters
1814|79|Long sweaters
1815|79|Thick-knit sweaters
1825|79|Sweater vests
268|79|Other sweaters & sweatshirts
34|2050|Pants
1820|34|Chinos
1821|34|Sweatpants
259|34|Skinny pants
271|34|Cropped pants
261|34|Tailored pants
260|34|Wide-leg pants
263|34|Other pants
80|2050|Shorts
1822|80|Cargo shorts
1823|80|Chino shorts
1824|80|Denim shorts
272|80|Other shorts
85|2050|Socks & underwear
1829|85|Underwear
1828|85|Socks
1830|85|Bathrobes
1867|85|Other socks & underwear
2910|2050|Sleepwear
2911|2910|One-piece pajamas
2912|2910|Pajama bottoms
2913|2910|Pyjama sets
2914|2910|Pajama tops
84|2050|Swimwear
30|2050|Activewear
581|30|Outerwear
582|30|Tracksuits
583|30|Pants
586|30|Shorts
584|30|Tops & T-shirts
3267|30|Jerseys
585|30|Hoodies & sweatshirts
587|30|Sports accessories
1471|587|Glasses
1474|587|Gloves
1473|587|Hats
1470|587|Scarves
3050|587|Wristbands
588|30|Other activewear
92|2050|Costumes & special outfits
83|2050|Other clothing
1231|5|Shoes
2656|1231|Boat shoes, loafers & moccasins
1233|1231|Boots
2661|1233|Chelsea & slip-on boots
2662|1233|Desert & lace-up boots
2663|1233|Snow boots
1795|1233|Rain boots
2664|1233|Work boots
2970|1231|Clogs & mules
2657|1231|Espadrilles
2969|1231|Flip-flops & slides
1238|1231|Formal shoes
2968|1231|Sandals
2659|1231|Slippers
1452|1231|Sport shoes
2672|1452|Basketball shoes
2673|1452|Climbing & bouldering shoes
2674|1452|Cycling shoes
2675|1452|Dance shoes
2676|1452|Soccer cleats
2677|1452|Golf shoes
2678|1452|Hiking boots & shoes
2679|1452|Skates
2680|1452|Indoor soccer shoes
1467|1452|Indoor training shoes
2681|1452|Motorcycle boots
2682|1452|Roller skates & inline skates
1453|1452|Running shoes
2683|1452|Ski boots
2684|1452|Snowboard boots
2685|1452|Swimming & water shoes
2686|1452|Tennis shoes
1242|1231|Sneakers
82|5|Accessories
94|82|Bags & backpacks
246|94|Backpacks
2963|94|Briefcases
1799|94|Fanny packs
2962|94|Garment bags
2961|94|Gym bags
1798|94|Holdalls & duffel bags
1862|94|Luggage & suitcases
1797|94|Satchels & messenger bags
247|94|Shoulder bags
248|94|Wallets
2960|82|Bandanas & headscarves
96|82|Belts
2959|82|Suspenders
91|82|Gloves
2958|82|Handkerchiefs
86|82|Hats & caps
2965|86|Balaclavas
2964|86|Beanies
287|86|Caps
288|86|Hats
95|82|Jewelry
243|95|Bracelets
2967|95|Charms & pendants
1800|95|Cufflinks
2966|95|Earrings
241|95|Necklaces
242|95|Rings
244|95|Other jewelry
2957|82|Pocket squares
87|82|Scarves & shawls
98|82|Sunglasses
2956|82|Ties & bow ties
97|82|Watches
99|82|Other accessories
139|5|Grooming
143|139|Facial care
2055|139|Tools & accessories
1826|2055|Shaving tools
1827|2055|Grooming tools
971|2055|Other tools
140|139|Hair care
141|139|Body care
142|139|Hand & nail care
145|139|Aftershave & cologne
144|139|Makeup
1863|139|Grooming kits
968|139|Other grooming items
2993|0|Designer
2983|2993|Designer women
2984|2983|Designer bags
2985|2983|Designer shoes
2986|2983|Designer accessories
2987|2983|Designer clothing
2988|2993|Designer men
2990|2988|Designer shoes
2991|2988|Designer accessories
2992|2988|Designer clothing
1193|0|Kids
1195|1193|Girls clothing
1243|1195|Baby clothing
1514|1243|Rompers
1515|1243|Bodysuits
1516|1243|Overalls
1517|1243|Sets
1875|1243|Other baby girls' clothing
1255|1195|Shoes
1525|1255|Baby shoes
1530|1255|Boots
2695|1530|Ankle boots
2696|1530|Mid-calf boots
2697|1530|Snow boots
2698|1530|Rain boots
2690|1255|Clogs & mules
1526|1255|Flat shoes
2753|1526|Ballerinas, Mary Janes & T-strap shoes
2701|1526|Espadrilles
2702|1526|Lace-up shoes
2691|1255|Flip-flops, sandals & slides
2704|2691|Flip-flops
2705|2691|Sandals
2707|2691|Slides
1528|1255|Formal & special occasion shoes
2692|1255|Heels
1534|1255|Slippers
2693|1255|Sports shoes
2708|2693|Basketball shoes
2709|2693|Dance shoes
2710|2693|Soccer cleats
2711|2693|Hiking boots & shoes
2712|2693|Skates
2713|2693|Roller skates & inline skates
2714|2693|Running shoes
2715|2693|Ski boots
2716|2693|Snowboard boots
2717|2693|Swimming & water shoes
1533|1255|Sneakers
2718|1533|Hook-and-loop sneakers
2719|1533|Lace-up sneakers
2720|1533|Slip-on sneakers
1244|1195|Outerwear
1519|1244|Coats
2540|1519|Duffle coats
2541|1519|Parkas
2542|1519|Peacoats
2543|1519|Trench coats
1518|1244|Vests
1521|1244|Jackets
2544|1521|Blazers
2545|1521|Bomber jackets
2546|1521|Denim jackets
2547|1521|Fleece jackets
2548|1521|Puffer jackets
2549|1521|Windbreakers
2554|1244|Rain gear
2556|2554|Ponchos
2557|2554|Rain suits & sets
2555|2554|Rain pants
2558|2554|Raincoats
2559|1244|Snow gear
2560|2559|Snow jackets & coats
2565|2559|Snow suits & sets
2582|2559|Snow pants
1246|1195|Sweaters & hoodies
1542|1246|Sweaters
1543|1246|V-neck sweaters
1544|1246|Turtleneck sweaters
1548|1246|Zip-up jumpers
1549|1246|Boleros
1550|1246|Hoodies & sweatshirts
1551|1246|Sweater vests
1877|1246|Other sweaters & hoodies
1245|1195|Tops & T-shirts
1535|1245|T-shirts
1536|1245|Polo shirts
1537|1245|Shirts
1538|1245|Short-sleeved tops
1539|1245|Long-sleeved tops
1540|1245|Sleeveless tops
1541|1245|Tunics
1878|1245|Other tops & T-shirts
1247|1195|Dresses
1554|1247|Short dresses
1553|1247|Long dresses
1248|1195|Skirts
1249|1195|Pants, shorts & overalls
1559|1249|Jeans
1560|1249|Skinny pants
1562|1249|Wide-leg pants
1565|1249|Leggings
1568|1249|Jumpsuits & overalls
1250|1249|Shorts & cropped pants
2079|1249|Harem pants
1880|1249|Other pants, shorts & overalls
1258|1195|Bags & backpacks
1574|1195|Accessories
1581|1574|Belts
1578|1574|Gloves
1582|1574|Hairbands & hairclips
1577|1574|Caps & hats
1586|1574|Jewelry
1580|1574|Scarves & shawls
1584|1574|Wallets & purses
1881|1574|Other accessories
1251|1195|Swimwear
1590|1251|One-piece swimsuits
1592|1251|Bikinis & tankinis
1593|1251|Bathrobes
1252|1195|Underwear & socks
1600|1252|Socks
1601|1252|Pantyhose & leggings
1602|1252|Underwear
1872|1252|Other underwear & socks
1594|1195|Sleepwear & nightwear
1596|1594|One-piece pajamas
1597|1594|Two-piece pajamas
1598|1594|Nightgowns
1253|1195|Activewear
1510|1195|Clothing bundles
1604|1195|Clothing for twins
1606|1195|Costumes
2080|1195|Formal wear & special occasion clothing
1254|1195|Other girls' clothing
1194|1193|Boys clothing
1196|1194|Baby boys' clothing
1642|1196|Rompers
1643|1196|Bodysuits
1644|1196|Overalls
1645|1196|Sets
1883|1196|Other baby boys' clothing
1256|1194|Shoes
1653|1256|Baby shoes
2721|1256|Boat shoes, loafers & moccasins
1657|1256|Boots
2726|1657|Ankle boots
2727|1657|Mid-calf boots
2728|1657|Snow boots
2729|1657|Rain boots
2722|1256|Espadrilles
2723|1256|Flip-flops, sandals & slides
2730|2723|Clogs & mules
2732|2723|Flip-flops
2733|2723|Sandals
2734|2723|Slides
1655|1256|Formal & special occasion shoes
1661|1256|Slippers
2724|1256|Sport shoes
2735|2724|Basketball shoes
2737|2724|Dance shoes
2738|2724|Soccer cleats
2742|2724|Hiking boots & shoes
2743|2724|Skates
2744|2724|Roller skates & inline skates
2745|2724|Running shoes
2746|2724|Ski boots
2748|2724|Snowboard boots
2749|2724|Swimming & water shoes
1660|1256|Sneakers
2750|1660|Hook-and-loop sneakers
2751|1660|Lace-up sneakers
2752|1660|Slip-on sneakers
1197|1194|Outerwear
1647|1197|Coats
2561|1647|Duffle coats
2562|1647|Parkas
2563|1647|Peacoats
2564|1647|Trench coats
1646|1197|Vests
1649|1197|Jackets
2571|1649|Blazers
2573|1649|Bomber jackets
2574|1649|Denim jackets
2575|1649|Fleece jackets
2576|1649|Puffer jackets
2577|1649|Windbreakers
2583|1197|Rain gear
2604|2583|Ponchos
2609|2583|Rain suits & sets
2602|2583|Rain pants
2606|2583|Raincoats
2590|1197|Snow gear
2610|2590|Snow jackets & coats
2613|2590|Snow suits & sets
2612|2590|Snow pants
1199|1194|Sweaters & hoodies
1668|1199|Sweaters
1669|1199|V-neck sweaters
1670|1199|Turtleneck sweaters
1671|1199|Zip-up sweaters
1672|1199|Hoodies & sweatshirts
1673|1199|Sweater vests
1887|1199|Other sweaters & hoodies
1198|1194|Tops & T-shirts
1662|1198|T-shirts
1663|1198|Polo shirts
1664|1198|Shirts
1665|1198|Short-sleeved tops
1666|1198|Long-sleeved tops
1667|1198|Sleeveless tops
1886|1198|Other tops & T-shirts
1200|1194|Pants, shorts & overalls
1696|1200|Jeans
1697|1200|Skinny pants
1698|1200|Wide-leg pants
1701|1200|Leggings
1702|1200|Jumpsuits & overalls
1201|1200|Shorts & cropped pants
2082|1200|Harem pants
1870|1200|Other pants, shorts & overalls
1257|1194|Bags & backpacks
1714|1194|Accessories
1743|1714|Belts
1740|1714|Gloves
1749|1714|Caps & hats
1741|1714|Scarves & shawls
1746|1714|Ties & bow ties
1745|1714|Wallets
1748|1714|Other accessories
1202|1194|Swimwear
1750|1202|Swimming trunks
1751|1202|Bathrobes
1203|1194|Underwear & socks
1757|1203|Socks
1758|1203|Tights & leggings
1759|1203|Underwear
1871|1203|Other underwear & socks
1752|1194|Sleepwear
1754|1752|One-piece pajamas
1755|1752|Two-piece pajamas
1204|1194|Activewear
1760|1194|Clothing bundles
1761|1194|Clothing for twins
1762|1194|Costumes
2083|1194|Formal wear & special occasion clothing
1205|1194|Other boys' clothing
1499|1193|Toys
1730|1499|Toy figures & accessories
3312|1730|Figures
3311|1730|Accessories
3313|1730|Playsets
3314|1499|Arts & crafts
3315|3314|Aprons & smocks
3316|3314|Beads & jewelry-making
3317|3314|Clay & dough
3319|3314|Craft kits
3320|3314|Drawing & painting supplies
3321|3314|Easels & writing boards
3322|3314|Printing & stamping
3323|3314|Stickers & stationery
3344|1499|Baby activities & toys
3347|3344|Activity centers & baby walkers
3348|3344|Baby gyms & activity mats
3345|3344|Bath toys
3349|3344|Busy boards
3350|3344|Push & pull toys
3352|3344|Sorting & stacking toys
3353|3344|Teethers & chew toys
1767|1499|Blocks & building toys
1731|1499|Dolls & accessories
3327|1731|Dolls
3324|1731|Doll clothes & accessories
3325|1731|Dollhouse furniture & accessories
3326|1731|Dollhouses
3328|1731|Doll playsets
3329|1499|Dress up & pretend play
3330|3329|Dress up
3331|3329|Play tents & tunnels
3332|3329|Toy food, cookware, & dishes
3333|3329|Toy jewelry boxes
3334|3329|Toy kitchens
3335|3329|Toy tools
1763|1499|Educational toys
3354|1763|Flash cards
3355|1763|Kaleidoscopes & prisms
3356|1763|Phonics toys
3357|1763|STEM & science toys
3358|1763|Other educational toys
1725|1499|Electronic toys
3364|1725|Audio player media
3360|1725|Electronic pets
3361|1725|Kid's karaoke equipment
3363|1725|Interactive audio players
3362|1725|Remote control toys
3359|1725|Kids' cameras
3365|1725|Walkie-talkies
3366|1725|Other electronic toys
1766|1499|Musical toys & toy instruments
3336|1499|Novelty & fidget toys
3337|3336|Fidget toys
3339|3336|Juggling sets
3340|3336|Magic sets & accessories
3338|3336|Prank toys & practical jokes
3341|3336|Slime & putty
3342|3336|Yo-yos
3343|3336|Other novelty toys
1771|1499|Outdoor & sports toys
3367|1771|Ball pits & accessories
3368|1771|Beach & water toys
3369|1771|Bubbles & bubble makers
3370|1771|Foam blasters & accessories
3371|1771|Yard games
3372|1771|Kites & rockets
3373|1771|Sandboxes & water tables
3374|1771|Sports toys
1764|1499|Soft toys & stuffed animals
3375|1499|Toy cars, trains & other vehicles
3471|3375|Airplanes
3468|3375|Cars
3470|3375|Trains
3469|3375|Trucks
3472|3375|Tracks & garages
3473|3375|Other toy vehicles
1496|1193|Strollers
1612|1496|Strollers
1511|1496|Stroller accessories
3376|1511|Carrycots & converter kits
3377|1511|Boards & add-on seats
3378|1511|Covers, canopies & umbrellas
3379|1511|Cup holders & snack trays
3380|1511|Stroller footmuffs
3381|1511|Organizers & nets
3382|1511|Parts
3385|1496|Car seat accessories
3386|3385|Car mirrors
3387|3385|Car sun shades & screens
3388|3385|Car seat inserts
3390|3385|Car seat travel bags
3391|3385|Car seat footmuffs
3392|3385|Other car seat accessories
1498|1193|Furniture & decor
1567|1498|Mattresses
1569|1567|Cot mattresses
1570|1567|Crib & cradle mattresses
1571|1567|Kid bed mattresses
1572|1498|Playmats & padded flooring
1573|1498|Playpens
3276|1498|Decor & keepsakes
3277|3276|Baby albums
3278|3276|Growth charts
3279|3276|Hanging mobiles
3280|3276|Milestone cards & photo props
3281|3276|Money boxes & piggy banks
3282|3276|Photo frames
3283|3276|Wall decor
3284|1498|Nursery furniture
3285|3284|Bedside sleepers
3286|3284|Changing tables
3287|3284|Cots
3288|3284|Cribs & cradles
3290|1498|Rugs & mats
3291|1498|Chairs
3292|1498|Play furniture
3293|1498|Shelves
3294|1498|Table & desks
3295|1498|Wardrobes
3393|1193|Bathing & changing
3394|3393|Baby changing bags
3412|3393|Bathing
3413|3412|Bath tubs & seats
3414|3412|Accessories
3415|3412|Bath towels
3416|3412|Washcloths
3395|3393|Changing mats & covers
3396|3395|Changing mats
3398|3395|Portable changing mats
3399|3393|Diapers
3400|3399|Cloth & reusable diapers
3401|3399|Swim diapers
3402|3399|Disposable diapers
3403|3393|Diaper storage & disposal
3404|3403|Diaper bins
3405|3403|Diaper bin accessories
3406|3403|Diaper storage
3407|3403|Wipe warmers & storage
3417|3393|Potties
3408|3393|Skincare & hygiene
3409|3408|Grooming & hygiene tools
3410|3408|Skincare, soaps & shampoos
3411|3408|Baby wipes
3418|3393|Step stools
3427|1193|Childproofing & safety equipment
3428|3427|Baby gates & guards
3429|3427|Childproofing accessories
3430|3427|Hearing protection
3431|3427|Safety harnesses & reins
3419|1193|Health & pregnancy
3420|3419|Humidifiers
3421|3419|Nasal aspirators
3423|3419|Postpartum care
3424|3419|Pregnancy pillows
3425|3419|Pregnancy support belts
3426|3419|Scales
3422|3419|Thermometers
3432|1193|Nursing & feeding
3433|3432|Baby food blenders & makers
3434|3432|Bibs
3435|3432|Bottle feeding
3436|3435|Baby bottles
3438|3435|Drying racks
3439|3435|Bottle brushes
3440|3435|Bottle warmers
3441|3435|Formula makers
3442|3435|Formula storage
3453|3432|Breastfeeding
3454|3453|Breast pumps
3455|3453|Breast pump accessories
3456|3453|Breastfeeding covers
3457|3453|Nipple shields & pads
3444|3432|Cups, dishes & utensils
3445|3444|Cutlery
3446|3444|Plates & bowls
3447|3444|Sets
3448|3444|Sippy cups
3449|3444|Water bottles
3458|3432|Pacifiers
3459|3432|Pacifier accessories
3450|3432|High chairs
3451|3432|High chair accessories
3443|3432|Muslins & burp cloths
3460|3432|Sterilizers
3296|1193|Sleep & bedding
3303|3296|Baby monitors
3297|3296|Bedding, blankets & throws
3298|3297|Blankets & throws
3299|3297|Mattress protectors & covers
3301|3297|Sheets
3305|3296|Blackout shades
3306|3296|Nightlights & wake-up lights
3307|3296|Sleep sacks & wearable blankets
3308|3296|Sleeping bags
3309|3296|Swaddles
3310|3296|White noise machines
1501|1193|School supplies
3269|1501|Lunch boxes & bags
1508|1501|School bags
1509|1501|School supplies
1502|1193|Other kids' items
1918|0|Home
3474|1918|Small kitchen appliances
3479|3474|Kettles & water boilers
3480|3474|Coffee, tea & espresso making
3492|3480|Coffee machines
3493|3480|Espresso machines
3494|3480|Tea machines
3495|3480|Coffee grinders
3496|3480|Milk frothers
3497|3480|Coffee, tea & espresso tools
3498|3480|Coffee, tea & espresso machine parts
3481|3474|Toasters
3482|3474|Blenders, mixers & food processors
3499|3482|Blenders
3500|3482|Immersion blenders
3501|3482|Stand mixers
3502|3482|Hand mixers
3503|3482|Food processors
3483|3474|Microwaves
3484|3474|Fryers
3486|3474|Electric grills & griddles
3485|3474|Hotplates
3487|3474|Juicers
3488|3474|Water & drink dispensers
3504|3488|Water filters & purifiers
3505|3488|Drink dispensers
3506|3488|Soda makers
3489|3474|Speciality appliances
3490|3474|Small kitchen appliance accessories
3491|3474|Small kitchen appliance parts
3476|1918|Cookware & bakeware
3507|3476|Pots
3508|3476|Pans
3509|3476|Baking trays
3510|3476|Oven & roasting dishes
3511|3476|Baking molds
3514|3476|Speciality cookware & bakeware
3512|3476|Cookware & bakeware sets
3513|3476|Cookware & bakeware accessories
3477|1918|Kitchen tools
3515|3477|Chopping boards
3516|3477|Cooking utensils
3518|3477|Kitchen scales
3519|3477|Measuring cups & spoons
3520|3477|Food thermometers
3521|3477|Mixing bowls
3522|3477|Strainers & sifters
3523|3477|Food storage
3562|3477|Bar tools
3524|3477|Speciality kitchen tools
1920|1918|Tableware
1931|1920|Cutlery
1950|1931|Cutlery sets
1951|1931|Forks
1970|1931|Table knives
1952|1931|Spoons
1932|1920|Dinnerware
1958|1932|Dinner sets
1959|1932|Bowls
1960|1932|Plates
2005|1920|Drinkware
2006|2005|Cups & mugs
2009|2005|Stemmed glasses
2010|2005|Tumblers
2011|2005|Drinkware sets
3854|1920|Serveware
3855|3854|Coasters
3856|3854|Coffee pots & teapots
3857|3854|Jugs & pitchers
3858|3854|Salt & pepper sets
3860|3854|Serving dishes
3861|3854|Sugar bowls & creamers
3862|3854|Trays
3863|3854|Trivets
3864|3854|Serving sets
3865|3854|Specialty serveware
3478|1918|Household care
3525|3478|Heating, cooling & air
3528|3525|Heaters & radiators
3529|3525|Fans
3531|3525|Air conditioners
3532|3525|Air purifiers
3533|3525|Humidifiers
3534|3525|Dehumidifiers
3535|3525|Speciality climate control appliances
3536|3525|Climate control accessories
3526|3478|Irons & garment care
3537|3526|Irons
3538|3526|Garment steamers
3539|3526|Ironing boards
3540|3526|Drying racks
3541|3526|Speciality garment care appliances
3542|3526|Garment care accessories
3527|3478|Vacuums & cleaning
3543|3527|Vacuums
3544|3527|Steam cleaners
3545|3527|Carpet cleaners
3546|3527|Mops
3548|3527|Speciality cleaning appliances
3549|3527|Cleaning appliance accessories
1919|1918|Textiles
1924|1919|Bedding
1942|1924|Bedding sets
1943|1924|Comforter covers
1944|1924|Pillowcases
1945|1924|Sheets
1925|1919|Blankets
1926|1919|Curtains & blinds
3866|1926|Blinds & shades
3867|1926|Curtain ties & hangbacks
1946|1926|Opaque curtains & drapes
1955|1926|Sheer curtains & drapes
3868|1926|Window valances
1974|1919|Throw pillows
3869|1919|Slipcovers
1927|1919|Rugs & mats
1953|1927|Doormats & floor mats
1954|1927|Rugs
1928|1919|Table linen
3870|1928|Cloth napkins
3871|1928|Doilies
3872|1928|Placemats
3873|1928|Tablecloths
3874|1928|Table runners
1929|1919|Tapestries
1930|1919|Towels
1947|1930|Bath towels
1948|1930|Beach towels
1949|1930|Hand towels
1934|1918|Home accessories
1935|1934|Candles & home fragrance
1957|1935|Candle holders
1956|1935|Candles
3814|1935|Wax melts
3816|1935|Reed diffusers & sticks
3815|1935|Aroma diffusers
3817|1935|Incense holders
3821|1935|Incense sticks
1936|1934|Clocks
1966|1936|Table clocks
1967|1936|Wall clocks
3822|1934|Sculptures & figurines
3823|1934|Decorative accessories
3824|3823|Ash trays
3825|3823|Bookends
3826|3823|Doorstops
3827|3823|Magnets
3828|3823|Snow globes
3829|3823|Accents
3830|1934|Artificial plants & flowers
3831|3830|Artificial plants
3832|3830|Artificial flowers
3833|1934|Fireplace accessories
3834|1934|Lighting
3835|3834|Floor lamps
3836|3834|Table lamps
3837|3834|String lights
3838|3834|Ceiling lights
3839|3834|Wall fixtures
3840|3834|Lampshades
3841|3834|Accent lights
3842|3834|Night lights
3843|3834|Novelty lights
1941|1934|Display shelves
1937|1934|Picture & photo frames
1938|1934|Mirrors
1969|1938|Table mirrors
1968|1938|Wall mirrors
1939|1934|Storage & organization
1962|1939|Baskets
1963|1939|Boxes
2012|1939|Clothes bags & hangers
3844|1939|Drawer organizers
1964|1939|Jewelry organizers
3845|1939|Soap dishes & dispensers
1965|1939|Makeup organizers
1940|1934|Vases
3846|1934|Wall decor
3847|3846|Paintings
3848|3846|Photography
3849|3846|Posters & prints
3850|3846|Memo boards
3851|3846|Signs
3852|3846|Wall stickers & decals
3853|3846|Wall hangings
5428|1918|Office supplies
5429|5428|Planners & personal organizers
5430|5428|Notebooks & writing pads
5431|5428|Pencil cases
5432|5428|Bookmarks
5433|5428|Calculators
5434|5428|Desk accessories
5443|5434|Desk organizers
5444|5434|Pen holders
5445|5434|Paperweights
5446|5434|Clipboards
5447|5434|Desk mats
5448|5434|Cable organizers
5449|5434|Wrist rests
5450|5434|Lap desks
5451|5434|Magnifiers
5435|5428|Document organizers
5452|5435|Folders
5453|5435|Binders
5454|5435|Binder accessories
5455|5435|Magazine racks
5436|5428|Writing supplies
5456|5436|Pens
5457|5436|Pencils
5458|5436|Pencil refills
5459|5436|Highlighters
5460|5436|Pencil sharpeners
5461|5436|Erasers
5437|5428|Technical drawing tools
5462|5437|Rulers
5463|5437|Drafting compasses
5464|5437|Protractors
5465|5437|Templates
5466|5437|Geometry sets
5438|5428|Tape, clips & fasteners
5467|5438|Tape dispensers
5468|5438|Transparent tape
5469|5438|Paper clips
5470|5438|Binder clips
5471|5438|Rubber bands
5472|5438|Pins & tacks
5439|5428|Staplers & hole punches
5473|5439|Staplers
5474|5439|Staple removers
5475|5439|Staples
5476|5439|Hole punches
5440|5428|Presentation supplies
5477|5440|Flipcharts
5478|5440|Chalkboards
5479|5440|Dry erase boards
5480|5440|Dry erase markers
5481|5440|Board erasers
5482|5440|Presentation clickers
5441|5428|Office electronics
5483|5441|Document cameras
5484|5441|Laminators
5485|5441|Heat sealers
5486|5441|Electronic dictionaries & translators
5487|5441|Binding machines
5488|5441|Paper cutting devices
5489|5441|Paper shredders
5490|5441|Typewriters
5442|5428|Safes
2915|1918|Celebrations & holidays
2917|2915|Banners, flags & bunting
2918|2915|Cards & envelopes
2921|2915|Gift wrap & bags
2922|2915|Holiday decor
2923|2915|Party decorations
2924|2915|Table decorations
2925|2915|Tree decorations
2926|2915|Wreaths
3811|1918|Tools & DIY
3875|3811|Power tools
3898|3875|Drills
4170|3898|Drill drivers
4171|3898|Hammer drills
4172|3898|Impact drivers
4173|3898|Rotary hammers
4174|3898|Mixing drills
4175|3898|Screw guns
4176|3898|Electric impact wrenches
3899|3875|Power saws
4177|3899|Circular saws
4178|3899|Jig saws
4179|3899|Reciprocating saws
3900|3875|Sanders
4185|3900|Orbital sanders
4186|3900|Belt sanders
4187|3900|Sheet sanders
4188|3900|Detail sanders
3901|3875|Power tool combo kits
4189|3901|Angle grinders
4190|3901|Bench grinders
4191|3901|Die grinders
3902|3875|Power tool combo kits
3903|3875|Air compressors
3904|3875|Air tools
4192|3904|Pneumatic nailers
4193|3904|Pneumatic staplers
4194|3904|Air impact wrenches
4195|3904|Air ratchets
4196|3904|Air hammers
4197|3904|Air chisels
4198|3904|Air paint sprayers
4199|3904|Sandblasters
3905|3875|Rotary tools
3906|3875|Oscillating tools
3907|3875|Biscuit joiners
3908|3875|Planers
3909|3875|Routers
3910|3875|Drill presses
3911|3875|Lathes
3912|3875|Electric screwdrivers
3913|3875|Heat guns
3914|3875|Wet-dry vacuums
3915|3875|Winches
3876|3811|Hand tools
3916|3876|Hammers
3918|3876|Screwdrivers
3919|3876|Wrenches
3920|3876|Ratchets
3921|3876|Pliers
3922|3876|Snips
3923|3876|Bolt cutters
3924|3876|Chisels
3925|3876|Files & rasps
3926|3876|Hand planes
3927|3876|Sanding blocks
3928|3876|Hand staplers & tackers
3929|3876|Riveters
3930|3876|Threading tools
3931|3876|Hand tool sets
3932|3876|Sledgehammers
3933|3876|Wrecking bars & crowbars
3877|3811|Measuring tools
3934|3877|Levels
3935|3877|Measuring tapes
3936|3877|Construction rulers
3937|3877|Squares
3938|3877|Chalk lines
3939|3877|Plumb bobs
3940|3877|Calipers
3941|3877|Carpenter's pencils
3942|3877|Contour gauges
3943|3877|Stud finders
3944|3877|Laser distance measurers
3945|3877|Inspection scopes
3946|3877|Thermal imagers
3947|3877|Pipe finders
3948|3877|Sound meters
3949|3877|Gas testers
3950|3877|Moisture meters
3951|3877|Water leak detectors
3878|3811|Painting tools & accessories
3952|3878|Paint brushes
3953|3878|Paint roller covers
3954|3878|Paint roller frames
3955|3878|Paint edgers
3956|3878|Paint buckets & trays
3957|3878|Painting poles
3958|3878|Pole extensions
3959|3878|Paint scrapers
3960|3878|Wallpaper
3961|3878|Wallpapering tools
3962|3878|Caulking guns
3963|3878|Coveralls
3964|3878|Drop sheets
3965|3878|Tarps
3966|3878|Painter's tape
3879|3811|Plumbing tools
3967|3879|Drain snakes
3968|3879|Plungers
3969|3879|Basin wrenches
3970|3879|Pipe cutters
3971|3879|Pipe expanders
3972|3879|Pipe swaging tools
3973|3879|Pipe brushes
3974|3879|Pipe deburrers
3975|3879|Pipe benders
3976|3879|Valve seat cutters
3880|3811|Electrician's tools
3977|3880|Multimeters
3978|3880|Circuit testers
3979|3880|Voltage testers
3980|3880|Cable testers
3981|3880|Clamp meters
3982|3880|Laser & infrared thermometers
3983|3880|Wire strippers
3984|3880|Wire crimpers
3985|3880|Electrician's fish rods
3986|3880|Electrician's fish tape
3987|3880|Wire pulling grips
3988|3880|Conduit benders
3881|3811|Masonry tools
3989|3881|Masonry floats
3990|3881|Masonry scrapers
3991|3881|Mortar boards
3992|3881|Tuck pointers
3993|3881|Masonry brushes
3994|3881|Brick jointers
3995|3881|Brick lifters
3996|3881|Tile cutters
3997|3881|Tile nippers
3998|3881|Tool accessories
3882|3811|Tool accessories
3999|3882|Drill bits
4200|3999|Wood drill bits
4201|3999|Metal drill bits
4202|3999|Masonry drill bits
4203|3999|Glass & tile drill bits
4000|3882|Screwdriver drill bits
4001|3882|Chuck keys
4002|3882|Drill chucks
4003|3882|Saw blades
4204|4003|Circular saw blades
4205|4003|Miter & table saw blades
4206|4003|Jig saw blades
4208|4003|Hacksaw blades
4209|4003|Bow saw blades
4210|4003|Crosscut saw blades
4211|4003|Coping saw blades
4212|4003|Band saw blades
4213|4003|Scroll saw blades
4004|3882|Hole saws
4005|3882|Power tool batteries
4006|3882|Power tool chargers
4007|3882|Sandpaper
4214|4007|Sanding sheets
4215|4007|Sanding belts
4216|4007|Sanding discs
4008|3882|Wheels & discs
4217|4008|Grinding discs
4218|4008|Grinding wheels
4219|4008|Cut-off wheels
4220|4008|Flap discs
4221|4008|Cup brushes
4222|4008|Wire brushes
4009|3882|Buffing pads
4010|3882|Air tool accessories
4223|4010|Air hoses
4224|4010|Air nozzles & guns
4225|4010|Air tool fittings
4226|4010|Air hose reels
4011|3882|Sockets & socket sets
4012|3882|Router bits
4013|3882|Oscillating tool attachments
4014|3882|Rotary tool attachments
4015|3882|Wet-dry vacuum attachments
4016|3882|Miter boxes
4017|3882|Mixing paddles
4018|3882|Work clamps
3883|3811|Protective gear
4019|3883|Work gloves
4020|3883|Safety glasses
4021|3883|Safety goggles
4022|3883|Face shields
4023|3883|Hard hats
4024|3883|Hearing protection
4025|3883|Knee pads
4026|3883|Work aprons
4027|3883|High-visibility vests
4029|3883|Back support & lumbar belts
3884|3811|Tool carrying & storage
4030|3884|Tool boxes
4031|3884|Tool chests
4032|3884|Tool belts
4033|3884|Drill holsters
4034|3884|Hammer loops
3885|3811|Workshop & worksite equipment
4035|3885|Ladders
4036|3885|Stepstools
4037|3885|Jobsite radios
4038|3885|Work lights
4039|3885|Sawhorses
4041|3885|Bench vises
4042|3885|Slat walls
3886|3811|Hardware
4043|3886|Cabinet pulls, knobs & handles
4044|3886|Door knobs & handles
4045|3886|Deadbolts
4046|3886|Hinges
4047|3886|Doorbells
4048|3886|Bathroom fixtures
4227|4048|Bathroom faucets
4228|4048|Bathroom sinks
4229|4048|Bathroom sink strainers
4234|4048|Shower heads
4235|4048|Kitchen fixtures
4236|4048|Toilet paper holders
4237|4048|Towel bars
4238|4048|Towel hooks & rings
4049|3886|Kitchen fixtures
4239|4049|Integrated soap dispensers
4240|4049|Kitchen faucets
4241|4049|Kitchen sinks
4242|4049|Kitchen sink strainers
4243|4049|Kitchen sink attachments
4245|4049|Kitchen cabinet doors
4050|3886|Chains, ropes & tie-downs
4246|4050|Chain
4247|4050|Rope
4248|4050|Cable ties
4249|4050|Bungee cords
4250|4050|Ratcheting tie-downs
4251|4050|Hook-and-loop straps
4252|4050|Rope & chain clips
4253|4050|Cable snaps
4254|4050|Cargo nets
4255|4050|Moving straps
4051|3886|Picture-hanging hardware
4052|3886|Support brackets
4053|3886|Mailboxes
4054|3886|Address plaques
4055|3886|House numbers
3887|3811|Smart home & security
4056|3887|Smart door locks
4057|3887|Video doorbells
4058|3887|Security cameras
4059|3887|Smart home hubs
4060|3887|Smart plugs & switches
4061|3887|Smart lights & bulbs
4062|3887|Smart thermostats
4063|3887|Smart smoke & gas detectors
4064|3887|Padlocks
3812|1918|Outdoor & garden
3888|3812|Outdoor power tools
4066|3888|String trimmers
4067|3888|Lawn edgers
4069|3888|Leaf blowers & vacuums
4070|3888|Pressure washers
4072|3888|Hedge trimmers
4073|3888|Grass & lawn shears
4075|3888|Augers
3889|3812|Outdoor power tool accessories
4079|3889|Outdoor power tool batteries
4080|3889|Outdoor power tool chargers
4081|3889|Lawn mower accessories
4256|4081|Lawn mower covers
4257|4081|Lawn mower blades
4258|4081|Lawn mower blade sharpeners
4259|4081|Lawn mower attachments
4260|4081|Mulcher attachments
4261|4081|Grass catchers
4262|4081|Dethatchers
4082|3889|String trimmer accessories
4263|4082|String trimmer lines
4264|4082|String trimmer attachments
4265|4082|String trimmer heads
4266|4082|String trimmer guards
4083|3889|Leaf blower & vacuum accessories
4267|4083|Leaf vacuum brushes
4268|4083|Leaf vacuum nozzles
4269|4083|Leaf blower & vacuum attachments
4270|4083|Leaf blower & vacuum cases
4271|4083|Leaf blower & vacuum hoses
4272|4083|Leaf blower gutter cleaners
4084|3889|Pressure washer accessories
4273|4084|Pressure washer covers
4274|4084|Pressure washer nozzles
4275|4084|Pressure washer wands
4276|4084|Pressure washer hoses
4277|4084|Pressure washer hose reels
4278|4084|Pressure washer water brooms
4085|3889|Chainsaw accessories
4279|4085|Chainsaw cases
4280|4085|Chainsaw covers
4281|4085|Chainsaw chains
4282|4085|Chainsaw bars
4283|4085|Chainsaw sharpeners
4086|3889|Other outdoor power tool accessories
3890|3812|Outdoor hand tools
4087|3890|Rakes
4088|3890|Shovels & spades
4089|3890|Gardening trowels
4090|3890|Hand weeders & hand forks
4091|3890|Bulb planters
4092|3890|Garden sprayers
4093|3890|Manual seeders & seed spreaders
4095|3890|Garden picks
4097|3890|Pruning shears
4098|3890|Manual post hole diggers
4099|3890|Hoes
4100|3890|Manual tillers & cultivators
4101|3890|Gardening protective gear
4284|4101|Gardening gloves
4285|4101|Gardening kneepads
4286|4101|Gardening aprons
4287|4101|Gardening cushions
3891|3812|Pots, planters & accessories
4102|3891|Flower pots
4103|3891|Rail planters
4104|3891|Wall planters
4105|3891|Window boxes
4106|3891|Planter baskets
4107|3891|Planter basket liners
4108|3891|Plant stakes
4109|3891|Plant cages
4110|3891|Plant covers
4111|3891|Hanging planters
4112|3891|Plant hanging equipment
4113|3891|Plant protective netting
4114|3891|Weed control fabric & membranes
4115|3891|Fabric grow bags
4116|3891|Plant terrariums
4117|3891|Flower pot saucers & trays
4118|3891|Planter risers
3892|3812|Watering equipment
4119|3892|Watering cans
4120|3892|Garden sprinklers
4121|3892|Garden hoses
4122|3892|Garden hose sprayers & nozzles
4123|3892|Garden hose carts
4124|3892|Garden hose reels
4125|3892|Garden hose watering wands
4126|3892|Self-watering equipment
3893|3812|Outdoor & garden decor
4127|3893|Garden parasols & umbrellas
4128|3893|Parasol bases
4129|3893|Doormats
4130|3893|Outdoor rugs
4131|3893|Outdoor & garden lighting
4288|4131|Floodlights & security lights
4289|4131|Garden lights
4290|4131|Outdoor lamps
4291|4131|Outdoor lanterns
4292|4131|Outdoor step lights
4293|4131|Pathway lights
4294|4131|Underwater lights
4132|3893|Bird baths
4133|3893|Bird feeders
4134|3893|Bird houses
4135|3893|Wind chimes
4138|3893|Sundials
4139|3893|Outdoor & garden clocks
4140|3893|Weathervanes
4141|3893|Fire pits
3894|3812|Outdoor cooking & grilling
4147|3894|Outdoor fryers
4148|3894|Outdoor cooking tools
4295|4148|Barbecue spatulas
4296|4148|Barbecue tongs
4297|4148|Barbecue forks
4298|4148|Barbecue skewers
4299|4148|Grilling baskets
4300|4148|Grilling planks
4301|4148|Outdoor pizza stones
4302|4148|Basting brushes
4303|4148|Grill brushes & scrapers
4304|4148|Grill rotisseries
4149|3894|Outdoor cooking accessories
4305|4149|Barbecue covers
4306|4149|Barbecue grills & grates
4307|4149|Drip trays
4308|4149|Flavorizer bars
4309|4149|Charcoal & pellets
4310|4149|Smoker chips
3895|3812|Spas, pools & equipment
4151|3895|Sauna accessories
4311|4151|Sauna chairs & seats
4312|4151|Sauna headrests
4313|4151|Sauna buckets
4314|4151|Sauna ladles
4315|4151|Sauna floor mats
4316|4151|Sauna timers
4317|4151|Sauna hygrometers
4318|4151|Sauna thermometers
4319|4151|Sauna stones
4153|3895|Swimming pool accessories
4320|4153|Pool skimmers
4321|4153|Leaf nets
4322|4153|Pool brushes
4323|4153|Pool vacuums
4324|4153|Pool thermometers
4325|4153|Pool alarms
4327|4153|Pool hoses
4155|3895|Hot tub accessories
4328|4155|Hot tub covers
4329|4155|Hot tub headrests
4330|4155|Hot tub drink holders & trays
4331|4155|Hot tub dispensers
3896|3812|Weather instruments
4156|3896|Weather thermometers
4157|3896|Weather stations
4158|3896|Barometers
4159|3896|Hygrometers
4160|3896|Wind vanes
4161|3896|Anemometers
3897|3812|Snow removal tools
4162|3897|Snow shovels
4163|3897|Snow brushes & brooms
4164|3897|Snow pushers
4165|3897|Snow roof rakes
4166|3897|Snow blowers
4167|3897|Ice choppers
4168|3897|Ice scrapers
4169|3897|Sand & grit spreaders
5106|1918|Pet care
5107|5106|Dogs
5113|5107|Beds & blankets
5121|5113|Beds
5122|5113|Blankets
5114|5107|Clothing & accessories
5123|5114|Coats & jackets
5124|5114|Sweaters
5126|5114|T-shirts
5127|5114|Costumes
5128|5114|Shoes & boots
5129|5114|Accessories
5115|5107|Toys
5130|5115|Balls & fetch toys
5131|5115|Soft toys
5132|5115|Tough & durable toys
5116|5107|Collars & leashes
5133|5116|Collars
5134|5116|Harnesses
5135|5116|Leashes
5136|5116|Muzzles
5117|5107|Training accessories
5137|5117|Whistles
5138|5117|Bags
5118|5107|Bowls & feeders
5139|5118|Bowls
5140|5118|Feeders
5119|5107|Carriers & crates
5141|5119|Travel carriers
5142|5119|Crates
5120|5107|Grooming
5143|5120|Brushes & combs
5144|5120|Claw care
5108|5106|Cats
5145|5108|Bowls & feeders
5162|5145|Bowls
5164|5145|Feeders
5146|5108|Toys
5167|5146|Teasers & wands
5171|5146|Balls
5172|5146|Soft toys
5173|5146|Scratchers
5174|5146|Interactive toys
5147|5108|Collars & leashes
5175|5147|Collars
5176|5147|Harnesses & leashes
5148|5108|Beds
5149|5108|Travel carriers
5180|5149|Soft carriers & backpacks
5181|5149|Hard carriers
5150|5108|Clothing & accessories
5182|5150|Clothing
5183|5150|Costumes
5189|5150|Accessories
5157|5108|Litter boxes
5160|5108|Grooming
5193|5160|Brushes & combs
5195|5160|Claw care
5111|5106|Small pets
5196|5111|Habitats & accessories
5197|5111|Toys
5112|5106|Fish
5198|5112|Aquarium equipment
5199|5112|Decoration & accessories
5110|5106|Birds
5201|5110|Toys
5202|5110|Cages & accessories
5109|5106|Reptiles
5203|5109|Decoration & accessories
5204|5109|Terrarium equipment
2994|0|Electronics
3002|2994|Video games & consoles
3025|3002|Consoles
3026|3002|Games
3570|3002|Controllers
3571|3002|Gaming headsets
3575|3002|Simulators
3576|3002|Virtual reality
3577|3576|VR headsets
3578|3576|VR accessories
3579|3576|VR device parts
3024|3002|Accessories
3027|3024|Cases
3572|3024|Gaming holders & stands
3573|3024|Gaming chargers & charging docks
3574|3024|Game strategy guides
3030|3024|Other accessories
3564|2994|Computers & accessories
3580|3564|Laptops
3581|3564|Desktop computers
3582|3564|Computer parts & components
3598|3582|Computer cases
3599|3582|CPUs & processors
3600|3582|Motherboards
3601|3582|Motherboard & CPU combos
3602|3582|Graphics cards
3603|3582|RAM units
3604|3582|Computer cooling & fans
3605|3582|Internal sound cards
3606|3582|Video capture & TV tuner cards
3607|3582|Internal storage devices
3608|3582|Computer power supplies
3609|3582|Computer repair tools
3610|3582|Laptop replacement parts
3611|3582|Other components & parts
3583|3564|Blank media
3612|3583|USB flash drives
3613|3583|External hard drives
3614|3583|CD, DVD & Blu-ray discs
3615|3583|Floppy discs
3616|3583|Zip & jaz drives
3617|3583|Media cases & sleeves
3618|3583|Other blank media
3584|3564|Computer accessories
3619|3584|Hard drive duplicators
3620|3584|Memory card adapters
3621|3584|Memory card readers
3623|3584|Other computer accessories
3585|3564|Laptop accessories
3624|3585|Laptop bags & cases
3625|3585|Laptop stands
3626|3585|Laptop chargers
3627|3585|Laptop privacy filters
3628|3585|Laptop cooling pads & fans
3629|3585|Laptop security locks
3630|3585|Laptop camera covers
3586|3564|Docking stations & USB hubs
3587|3564|Keyboards & accessories
3631|3587|Keyboards
3632|3587|Keyboard switches
3633|3587|Keyboard keycaps
3634|3587|Keyboard stickers
3635|3587|Keyboard covers
3588|3564|Mice
3589|3564|Mouse pads
3590|3564|Monitors & accessories
3637|3590|Monitors
3638|3590|Monitor stands
3639|3590|Monitor arms
3640|3590|Monitor privacy filters
3641|3590|Monitor covers
3591|3564|Computer speakers
3592|3564|Computer microphones
3593|3564|Webcams
3594|3564|Networking devices
3642|3594|Routers
3643|3594|Mesh systems
3644|3594|Network repeaters
3645|3594|Modems
3646|3594|Mobile hotspots
3647|3594|Network adapters
3648|3594|Satellite internet receivers
3595|3564|Printers & accessories
3649|3595|Inkjet printers
3650|3595|Laser printers
3651|3595|Photo printers
3652|3595|Label printers
3653|3595|Thermal printers
3654|3595|Commercial multifunction printers
3655|3595|Printer ink cartridges
3656|3595|Printer toner
3657|3595|Ink ribbons
3658|3595|Printer parts
3596|3564|Scanners & accessories
3659|3596|Scanners
3660|3596|Scanner accessories
3597|3564|Touch & stylus pads
3565|2994|Cell phones & communication
3661|3565|Cell phones
3662|3565|Cell phone parts & accessories
3667|3662|Cell phone cases
3668|3662|Cell phone screen protectors
3669|3662|Cell phone grips
3670|3662|Selfie sticks
3671|3662|Cell phone mounts & stands
3672|3662|Cell phone flashes & lights
3673|3662|Cell phone charms
3674|3662|Cell phone parts
3675|3662|Other cell phone accessories
3663|3565|Landline phones
3664|3565|Fax machines
3665|3565|Radio communication
3676|3665|Shortwave radios
3677|3665|Walkie-talkies
3666|3565|Dummy cell phones
3566|2994|Audio, headphones & hi-fi
3678|3566|Headphones & earbuds
3679|3566|Handheld music players
3688|3679|MP3 players
3689|3679|Handheld CD players
3690|3679|Handheld cassette players
3691|3679|Handheld MiniDisc players
3680|3566|Portable radios
3681|3566|Portable speakers
3682|3566|Smart speakers
3683|3566|Home audio systems
3694|3683|Hi-fi & shelf stereo systems
3695|3683|Speakers
3696|3683|Subwoofers
3697|3683|Soundbars
3698|3683|Equalizers
3699|3683|Amplifiers & pre-amplifiers
3700|3683|Receivers
3701|3683|Turntables
3702|3683|CD players & recorders
3703|3683|Cassette & tape players
3704|3683|Radio tuners
3705|3683|MiniDisc players & recorders
3706|3683|Other home audio devices
3686|3566|Audio device accessories
3707|3686|Headphone stands
3708|3686|Headphone earpads
3709|3686|Earbud tips
3710|3686|Turntable needles
3711|3686|Turntable slipmats
3712|3686|Speaker & subwoofer isolation pads
3713|3686|Other audio accessories
3687|3566|Home audio & hi-fi parts
3054|2994|Cameras & accessories
3060|3054|Cameras
3074|3060|Action cameras
3075|3060|Digital cameras
3076|3060|Film cameras
3077|3060|Instant cameras
3078|3060|Video cameras
3714|3060|Other cameras
3061|3054|Lenses
3062|3054|Flashes
3063|3054|Memory cards
3067|3054|Tripods & monopods
3065|3054|Stabilizers & mounts
3715|3054|Darkroom equipment
3718|3715|Darkroom processing equipment
3719|3715|Darkroom safelights
3720|3715|Enlargement lenses & equipment
3721|3715|Photographic paper
3722|3715|Other darkroom equipment
3066|3054|Studio equipment
3079|3066|Studio & photobooth props
3080|3066|Studio backdrops
3081|3066|Studio lighting
3716|3054|Camera drones & accessories
3723|3716|Camera drones
3724|3716|Drone bags
3725|3716|Drone parts
3059|3054|Accessories
3068|3059|Camera cases & bags
3069|3059|Camera straps
3071|3059|Film
3072|3059|Lens accessories
3726|3059|Flash accessories
3727|3059|Camera repair kits
3073|3059|Other camera accessories
3717|3054|Camera replacement parts
3064|3054|Other photography equipment
3567|2994|Tablets, e-readers & accessories
3728|3567|Tablets
3729|3567|e-Readers
3730|3567|Digital notepads
3731|3567|PDAs
3732|3567|Accessories
3733|3732|Tablet cases & folios
3734|3732|e-Reader cases & folios
3735|3732|Tablet keyboards
3736|3732|Tablet stands & mounts
3737|3732|Styluses
3809|3732|Tablet & e-reader parts
3568|2994|TV & home theater
3738|3568|Televisions
3739|3568|Projectors
3740|3568|Streaming devices
3741|3568|Television antennas
3742|3568|Satellite dishes
3743|3568|Video decoders
3744|3568|Television receivers
3745|3568|Home theater systems
3746|3568|Blu-ray players
3747|3568|DVD players
3748|3568|VCRs
3749|3568|Other video playback devices
3751|3749|HD DVD players
3752|3749|LaserDisc players
3753|3749|Video 2000 players
3754|3749|Betamax players
3750|3568|TV & home theater accessories
3755|3750|Projector mounts & stands
3756|3750|Projector screens
3757|3750|Remote controls
3569|2994|Beauty & personal care electronics
3758|3569|Hairstyling tools
3765|3758|Hair dryers
3766|3758|Hair straighteners
3767|3758|Hair curlers
3768|3758|Other hairstyling tools
3759|3569|Beauty tools
3769|3759|LED masks
3770|3759|Powered cleansing brushes & exfoliators
3771|3759|Beauty pens
3760|3569|Shaving & hair removal
3772|3760|IPL epilators
3773|3760|Rotating disc epilators
3774|3760|Trimmers
3775|3760|Nose hair trimmers
3776|3760|Electric razors
3761|3569|Massage tools
3777|3761|Face massagers
3778|3761|Massage guns
3779|3761|Massage belts
3780|3761|Infrared massagers
3762|3569|Electric dental & oral care
3781|3762|Electric toothbrushes
3782|3762|Dental irrigators
3783|3762|Electric toothbrush & dental irrigator parts
3763|3569|Nail care tools
3784|3763|Manicure & pedicure spas
3785|3763|Nail dryers
3786|3763|Nail UV lamps
3764|3569|Personal scales
3004|2994|Wearables
3035|3004|Smartwatches
3031|3004|Fitness trackers
3033|3004|Smart glasses
3034|3004|Smart rings
3032|3004|Replacement bands
3810|3004|Smartwatch cases
2995|2994|Other devices & accessories
3788|2995|3D printing & scanning
3795|3788|3D printers
3796|3788|3D scanners
3797|3788|3D pens
3798|3788|3D printer filament
3799|3788|3D printer parts
3789|2995|GPS & satellite navigation devices
3052|2995|Item finders
3791|2995|Luggage scales
3005|2995|Adapters
3006|2995|Cables
3008|2995|Chargers
3792|2995|Power banks
3793|2995|Surge protectors & power strips
3794|2995|Batteries & power supplies
3804|3794|Single-use batteries
3805|3794|Rechargeable batteries
3806|3794|Battery chargers
3807|3794|Power distribution units
3808|3794|Power inverters
3013|2995|Other accessories
2309|0|Books & Media
2312|2309|Books
2319|2312|Fiction
2320|2312|Non-fiction
2318|2312|Kids & young adults
2363|2318|Young adults
2364|2318|Kids
2365|2318|Babies & toddlers
5425|2312|Comics, manga & graphic novels
5426|2312|Textbooks & study materials
5427|2312|Coloring, puzzle & activity books
5424|2309|Magazines
3036|2309|Music
3038|3036|Audio cassettes
3039|3036|CDs
3040|3036|MiniDiscs
3041|3036|Vinyl records
3037|2309|Video
3042|3037|4K Blu-ray
3043|3037|Betamax
3044|3037|Blu-ray
3045|3037|DVD
3046|3037|HD DVD
3047|3037|LaserDisc
3048|3037|VHS
4824|0|Hobbies & collectibles
4874|4824|Trading cards
4875|4874|Single trading cards
4876|4874|Booster packs
4877|4874|Booster boxes
4878|4874|Card decks
4879|4874|Trading card lots
4880|4874|Uncut card sheets
4881|4824|Board games
4882|4824|Puzzles
4883|4824|Tabletop & miniature gaming
4901|4824|Memorabilia
4902|4901|Sports memorabilia
4903|4901|Music memorabilia
4904|4901|Film & TV memorabilia
4905|4901|Other memorabilia
4895|4824|Coins & banknotes
4896|4895|Banknotes
4897|4895|Coins
4898|4895|Lots & sets
4899|4895|Medals & tokens
4900|4895|Share certificates
4888|4824|Stamps
4889|4888|Individual stamps
4890|4888|Stamp lots & sets
4891|4888|First day covers
4892|4888|Stamp catalogs & guides
4893|4888|Stamp tools & equipment
4894|4824|Postcards
4825|4824|Musical instruments & gear
4828|4825|Guitars & bass guitars
4848|4828|Acoustic guitars
4849|4828|Classical guitars
4850|4828|Electric guitars
4851|4828|Electro-acoustic guitars
4853|4828|Bass guitars
4852|4828|Specialty guitars
4854|4828|Guitar accessories & parts
5006|4854|Bass guitar bags
5420|4854|Bass guitar cases
5007|4854|Bass guitar strings
5008|4854|Capos
5009|4854|Guitar & bass stands & hangers
5010|4854|Guitar & bass straps
5011|4854|Guitar bags
5422|4854|Guitar cases
5012|4854|Guitar care cloths & tools
5013|4854|Guitar dampeners
5014|4854|Guitar parts
5015|4854|Guitar picks
5016|4854|Guitar slides
5017|4854|Guitar strings
5018|4854|Other guitar accessories
4826|4825|Amps & pedals
4835|4826|Bass amps
4836|4826|Guitar amps
4837|4826|Electronic drum amps
4838|4826|Keyboard amps
4839|4826|Amp modelers & processors
4842|4826|Amp accessories & parts
4953|4842|Amp cases
5419|4842|Amp covers
4954|4842|Amp replacement footswitches
4955|4842|Amp replacement parts
4956|4842|Amp stands
4957|4842|Instrument cables
4958|4842|Other amp accessories
4840|4826|Pedals
4841|4826|Pedal accessories & parts
4949|4841|Pedal cases
4950|4841|Pedal power supplies
4951|4841|Pedalboards
4952|4841|Other pedal accessories & parts
4827|4825|Drums & percussion
4844|4827|Drums
4964|4844|Bass drums
4965|4844|Bodhrans, dafs & riqs
4966|4844|Bongos
4967|4844|Cajons
4970|4844|Electronic drums
4969|4844|Snare drums
4976|4844|Tabla drums
4977|4844|Toms
4978|4844|Specialty drums
4843|4827|Drum kit cymbals
4959|4843|Crash cymbals
4960|4843|Cymbal sets
4961|4843|Effect cymbals
4962|4843|Hi-hat cymbals
4963|4843|Ride cymbals
4845|4827|Hand percussion
4979|4845|Bells
4980|4845|Concert cymbals
4981|4845|Finger cymbals
4983|4845|Maracas & shakers
4982|4845|Rainsticks
4984|4845|Singing bowls
4985|4845|Tambourines
4986|4845|Thumb pianos
4987|4845|Triangles
4988|4845|Specialty hand percussion
4846|4827|Mallet percussion
4989|4846|Glockenspiels
4990|4846|Xylophones
4991|4846|Steel drums
4992|4846|Specialty mallet percussion
4847|4827|Drum accessories & parts
4993|4847|Drumsticks, brushes & mallets
4994|4847|Drum practice pads
4995|4847|Drum & cymbal stands
4996|4847|Drum heads
4997|4847|Drum mounts
4998|4847|Drum pedals
4999|4847|Drum racks
5000|4847|Drum tuners & keys
5001|4847|Other drum hardware & parts
5002|4847|Drum stools
5003|4847|Drum & percussion bags & cases
5004|4847|Drum & percussion care tools
5005|4847|Other percussion accessories
4830|4825|Keyboards & synths
4855|4830|Accordions
4859|4830|Electronic keyboards
4865|4830|Keyboard accessories & parts
5028|4865|Keyboard & piano bags
5421|4865|Keyboard & piano cases
5030|4865|Keyboard & piano covers
5029|4865|Keyboard & piano care cloths & tools
5031|4865|Keyboard & piano parts
5032|4865|Keyboard instrument stands
5033|4865|Keyboard benches & stools
5034|4865|Other keyboard & piano accessories
4860|4830|MIDI controllers
4861|4830|Synthesizers
4862|4830|Samplers & sound machines
5022|4862|Drum machines
5023|4862|Experimental noise instruments
5024|4862|Grooveboxes
5025|4862|Samplers
5026|4862|Sequencers
5027|4862|Sound modules
4863|4830|Specialty keyboards & synths
4864|4830|Synth accessories & parts
4832|4825|String instruments
4884|4832|Autoharps, psalteries & zithers
4885|4832|Banjos
4886|4832|Cellos
4922|4832|Mandolins
4923|4832|Sitars
4924|4832|Ukuleles
5102|4832|Violas
4925|4832|Violins
4926|4832|Specialty string instruments
4927|4832|Strings
5105|4927|Banjo strings
5035|4927|Cello strings
5036|4927|Ukulele strings
5037|4927|Violin strings
5038|4927|Other replacement strings
4928|4832|String instrument accessories & parts
5039|4928|String instrument bags
5423|4928|String instrument cases
5040|4928|String instrument bows
5041|4928|String instrument care cloths & tools
5042|4928|String instrument rests & pads
5043|4928|String instrument mutes
5044|4928|Other string instrument accessories
5045|4928|Other string instrument parts
4834|4825|Wind instruments
4942|4834|Brass
5064|4942|Bugles
5065|4942|French horns
5066|4942|Trombones
5067|4942|Trumpets
5068|4942|Tubas
5069|4942|Specialty brass instruments
4943|4834|Harmonicas
4944|4834|Kazoos
4945|4834|Melodicas
4946|4834|Music whistles
4947|4834|Woodwinds
5070|4947|Bagpipes
5071|4947|Bamboo flutes
5072|4947|Bassoons
5073|4947|Clarinets
5074|4947|Flutes
5075|4947|Oboes
5076|4947|Panpipes
5077|4947|Piccolos
5078|4947|Recorders
5079|4947|Saxophones
5080|4947|Specialty woodwinds
4948|4834|Wind accessories & parts
5081|4948|Brass mutes
5082|4948|Wind instrument bags & cases
5083|4948|Wind instrument care brushes & tools
5084|4948|Wind instrument mouthpieces
5085|4948|Wind instrument stands
5086|4948|Wind instrument straps
5087|4948|Woodwind ligatures
5088|4948|Woodwind reeds
5089|4948|Other wind accessories
5090|4948|Other wind instrument parts
4833|4825|Studio & live sound gear
4930|4833|Audio cables
5046|4930|Line-level cables
5047|4930|Microphone cables
5048|4930|MIDI cables
5050|4930|Patch cables
5051|4930|Speaker cables
5049|4930|Other audio cables
4931|4833|Audio interfaces
4932|4833|Audio mixers
4933|4833|Audio monitors
5052|4933|In-ear monitors
5053|4933|Stage monitors
5054|4933|Studio monitors
5103|4833|Microphones
4934|4833|Microphone accessories & stands
4935|4833|Outboard equipment
4936|4833|PA Speakers
5104|4833|Portable PA systems
4937|4833|Power amplifiers
4938|4833|DI boxes
4939|4833|Patchbays
4940|4833|Stage lighting
5055|4940|Black lights
5058|4940|Gel color filters
5059|4940|Laser lights
5060|4940|Mirror balls
5061|4940|Party bar light units
5062|4940|Strobe lights
5063|4940|Other Stage lighting
4941|4833|Other studio & live sound gear
5091|4825|DJ equipment
5092|5091|All-in-one DJ systems
5093|5091|DJ bags & cases
5094|5091|DJ controllers
5095|5091|DJ decks
5096|5091|DJ mixers
5097|5091|Specialty DJ gear
4829|4825|Karaoke gear
5098|4829|Karaoke machines
5099|4829|Karaoke microphones
5100|4829|Karaoke systems
5101|4829|Other karaoke gear
4831|4825|Music-making accessories
4866|4831|Conductor's batons
4867|4831|Metronomes
4871|4831|Musical instrument tuners
4869|4831|Music stands
4870|4831|Music stand lights
4868|4831|Music instruction media
4872|4831|Sheet music & songbooks
4873|4831|Other music accessories
5151|4824|Arts & crafts
5152|5151|Sewing, knitting & needlecraft
5153|5152|Wool & yarn
5154|5152|Fabric
5155|5152|Felt
5156|5152|Needlework cloth & canvas
5158|5152|Thread
5159|5152|Needles & hooks
5161|5159|Hand sewing needles
5163|5159|Sewing machine needles
5165|5159|Knitting needles
5166|5159|Darning needles
5168|5159|Crochet hooks
5169|5159|Embroidery needles
5170|5159|Tapestry needles
5177|5152|Tools
5190|5177|Thimbles
5191|5177|Needle threaders
5194|5177|Needle minders
5200|5177|Needle cases
5205|5177|Sewing pins
5206|5177|Pincushions
5208|5177|Seam rippers
5210|5177|Fabric marking pens
5211|5177|Sewing measuring tapes
5212|5177|Sewing gauges & rulers
5213|5177|Sewing grids & mats
5214|5177|Fabric clips
5215|5177|Bobbins & spools
5216|5177|Bobbin winders
5217|5177|Knitting frames & looms
5218|5177|Dress forms
5219|5177|Felting pads
5220|5177|Other needlecraft tools
5221|5152|Sewing machines
5222|5152|Serger machines
5223|5152|Sewing machine presser feet
5224|5152|Sewing machine parts & accessories
5225|5152|Cross stitch frames
5226|5152|Embroidery hoops
5227|5152|Embroidery kits
5228|5152|Needlecraft patterns
5229|5152|Closures
5230|5229|Zippers
5231|5229|Buttons
5232|5229|Eyelets
5233|5229|Snaps
5234|5229|Hooks & eyes
5235|5229|Other sewing closures
5236|5152|Embellishments
5237|5236|Rhinestones & sequins
5238|5236|Lace
5239|5236|Trim
5240|5236|Tassels
5241|5236|Appliques
5242|5236|Patches
5243|5236|Piping
5244|5236|Other embellishments
5245|5152|Sewing supplies
5246|5245|Transfer paper
5247|5245|Sewing elastic
5248|5245|Bias tape
5249|5245|Boning
5250|5245|Interfacing
5251|5151|Painting
5252|5251|Paintbrushes
5253|5251|Palette knives
5254|5251|Painting media
5255|5254|Paint
5256|5254|Stain
5257|5254|Lacquer
5258|5254|Varnish
5259|5254|Spray paint
5260|5254|Primer
5261|5254|Sealant
5262|5254|Other painting media
5263|5251|Paint sponges
5264|5251|Airbrushes
5265|5251|Palettes
5266|5251|Easels
5267|5251|Canvases & boards
5268|5251|Storage
5269|5268|Paintbrush storage
5270|5268|Painting portfolios
5271|5268|Storage tubes
5272|5268|Storage trays
5273|5251|Painting templates
5274|5251|Paint thinner
5275|5251|Color wheels
5276|5151|Drawing & sketching
5277|5276|Drawing & sketching media
5278|5277|Art pencils
5279|5277|Colored pencils
5280|5277|Art pens
5281|5277|Markers
5282|5277|Wax crayons
5283|5277|Pastels
5284|5277|Chalk
5285|5277|Charcoal
5286|5277|Other drawing & sketching media
5289|5276|Sketchbooks & pads
5290|5276|Loose art paper
5291|5276|Drawing boards
5292|5276|Fixatives
5293|5151|Calligraphy
5294|5293|Calligraphy pens
5295|5293|Calligraphy brushes
5296|5293|Calligraphy paper & notebooks
5297|5293|Ink
5298|5293|Ink refills
5299|5293|Pen nibs
5300|5293|Other calligraphy tools
5301|5151|Jewelry-making
5302|5301|Chains
5303|5301|Wire
5304|5301|String & twine
5305|5301|Cord
5306|5301|Beads
5307|5301|Cabochons & stones
5308|5301|Charms & pendants
5309|5301|Jewelry findings
5310|5309|Earring backs
5311|5309|Clasps
5312|5309|Jump rings
5313|5309|End pieces
5314|5309|Pins
5315|5309|Pin backs
5316|5309|Ring settings
5317|5309|Other jewelry findings
5318|5301|Jewelry-making kits & sets
5319|5301|Jewellery-making tools
5320|5301|Bead looms
5321|5301|Jewelry-making storage
5322|5151|Papercraft
5323|5322|Scrapbooks & albums
5324|5322|Scrapbooking tools
5325|5322|Scrapbooking embellishments
5326|5322|Paper & card
5327|5326|Origami paper
5328|5326|Construction paper
5329|5326|Card stock
5330|5326|Washi paper
5331|5326|Crêpe paper
5332|5326|Tissue paper
5333|5326|Kraft paper
5334|5326|Newsprint
5335|5326|Other paper types
5336|5322|Bookbinding equipment
5337|5322|Printmaking equipment
5338|5322|Paper quilling equipment
5339|5151|Die cutting
5340|5339|Die cutting machines
5341|5339|Cutting dies
5342|5339|Cutting plates
5343|5339|Die cutting shims
5344|5339|Release sheets
5345|5339|Stencil sheets
5346|5339|Embossing folders & mats
5347|5339|Die storage
5348|5339|Other die cutting equipment
5349|5151|Candle making
5350|5349|Candle wax
5351|5349|Wicks
5352|5349|Wax melters
5353|5349|Candle dyes & coloring
5354|5349|Candle fragrances & scents
5355|5349|Candle molds
5356|5349|Candle making kits & sets
5357|5151|Sculpting & pottery
5358|5357|Clay
5359|5357|Plaster
5360|5357|Bisques & unglazed pieces
5361|5357|Ceramic & pottery glazes
5362|5357|Ceramic & pottery paints
5363|5357|Pottery wheels
5364|5357|Sculpting & pottery tools
5365|5357|Clay presses & extruders
5366|5357|Sculpting & pottery molds
5367|5357|Pottery aprons
5368|5357|Sculpting wire
5370|5357|Kiln accessories
5371|5357|Other sculpting & pottery equipment
5372|5151|Crafting supplies
5373|5372|Glues & adhesives
5374|5373|White glue
5375|5373|Glue sticks
5376|5373|Glue gun refills
5377|5373|Wood glue
5378|5373|Fabric glue
5379|5373|Contact cement
5380|5373|Epoxy
5381|5373|Cyanoacrylate glue
5382|5373|Silicone-based glue
5383|5373|Spray glue
5384|5373|Other glues & adhesives
5385|5372|Tape
5386|5385|Transparent tape
5387|5385|Double-sided tape
5388|5385|Masking tape
5389|5385|Washi tape
5390|5385|Foam tape
5391|5385|Gaffer tape
5392|5385|Other tapes
5393|5372|Stickers
5394|5372|Glitter
5395|5372|Ribbon
5396|5372|Feathers
5397|5372|Pom poms
5398|5372|Ink pads
5399|5372|Embossing powder
5400|5372|Wax stamps & sealers
5401|5151|Crafting tools
5402|5401|Hot glue guns
5405|5401|Paper cutters
5406|5401|Cutting mats
5407|5401|Punches
5408|5401|Embossers
5409|5401|Button-making machines
5410|5401|Engraving tools
5411|5401|Soldering tools & equipment
5412|5401|Stamps & stamping equipment
5415|5401|Pom pom makers
5418|5401|Sealing wax warmers & spoons
5416|5401|Crafting clamps & presses
5417|5401|Crafting tweezers
4906|4824|Collectibles storage
4907|4906|Albums & binders
4908|4906|Collectibles storage boxes
4909|4906|Card sleeves
4910|4906|Card screwdowns
4911|4906|Deck boxes
4912|4906|Album & binder dividers
4913|4906|Album & binder refills
4914|4906|Puzzle mats
4915|4906|Other collectibles storage
4916|4824|Gaming accessories
4917|4916|Dice
4918|4916|Gaming stones & tokens
4919|4916|Gaming playmats
4920|4916|Other gaming accessories
4332|0|Sports
4333|4332|Cycling
4347|4333|Kids' bikes
4372|4347|Balance bikes
4373|4347|Kids' bikes
4375|4347|Tricycles
4349|4333|Cycling accessories & tools
4376|4349|Bike baskets
4377|4349|Bike bells & horns
4378|4349|Bike fenders & mudguards
4379|4349|Bike lights
4380|4349|Bike locks
4381|4349|Bike water bottles
4382|4349|Bottle cages
4383|4349|Bike pumps
4385|4349|Kickstands
4386|4349|Panniers & bike bags
4387|4349|Bike tools
4388|4349|Bike stands & wall-mounted racks
4389|4349|Bike pannier racks
4390|4349|Car bike racks
4391|4349|Bike boxes & travel bags
4392|4349|Other bike accessories
4351|4333|Bike trailers
4352|4333|Kids' bike seats
4353|4333|Bike parts
4393|4353|Bottom brackets
4394|4353|Brakes
4395|4353|Cassettes
4396|4353|Chainrings
4397|4353|Chains
4398|4353|Cranksets
4399|4353|Forks
4400|4353|Derailleurs
4401|4353|Handlebar grips
4402|4353|Handlebars
4403|4353|Headset
4404|4353|Pedals
4405|4353|Saddles
4406|4353|Seat posts
4407|4353|Shifters
4408|4353|Shocks
4409|4353|Tires
4410|4353|Tubes
4411|4353|Wheels
4412|4353|Other bike parts
4334|4332|Fitness, running & yoga
4414|4334|Strength training
4423|4414|Barbells & attachments
4439|4423|Barbells
4440|4423|Weight plates
4441|4423|Barbell collars
4424|4414|Dumbbells
4425|4414|Grip trainers
4427|4414|Kettlebells
4428|4414|Medicine balls
4429|4414|Pull-up bars
4430|4414|Resistance bands
4433|4414|Weight lifting belts
4434|4414|Weight lifting gloves
4435|4414|Weight storage
4436|4414|Weighted vests
4437|4414|Wrist & ankle weights
4438|4414|Other strength training accessories
4415|4334|Running
4443|4415|Running belts & phone holders
4444|4415|Running reflective gear
4445|4415|Running vests
4446|4415|Other running accessories
4416|4334|Yoga & pilates equipment
4447|4416|Pilates accessories
4448|4416|Yoga blocks & props
4449|4416|Yoga bolsters
4450|4416|Yoga mats
4451|4416|Yoga mat carriers & bags
4452|4416|Yoga straps
4453|4416|Yoga towels
4417|4334|Home fitness accessories
4454|4417|Balance boards
4455|4417|Balance cushions
4456|4417|Core training equipment
4457|4417|Dance knee pads
4458|4417|Exercise balls
4459|4417|Fitness steps
4460|4417|Foam rollers
4461|4417|Gymnastic rings
4462|4417|Mini trampolines
4463|4417|Nordic walking poles
4464|4417|Plyometric boxes
4465|4417|Rhythmic gymnastics equipment
4466|4417|Jump ropes
4467|4417|Tumbling mats
4468|4417|Weighted hoops
4469|4417|Other fitness accessories
4698|4334|Water bottles
4335|4332|Outdoor sports
4626|4335|Climbing & bouldering
4640|4626|Chalk bags
4628|4626|Climbing brushes
4629|4626|Climbing gloves
4631|4626|Climbing helmets
4632|4626|Climbing holds
4633|4626|Climbing training tools
4634|4626|Crash pads
4635|4626|Mountaineering equipment
4636|4626|Ropes, belay devices & carabiners
4637|4626|Slacklines
4638|4626|Via ferrata kits
4639|4626|Other climbing accessories
4652|4335|Camping tents & sleeping gear
4653|4652|Tents
4655|4652|Tent stakes
4656|4652|Tent footprints & groundsheets
4667|4652|Sleeping bags
4668|4652|Sleeping bag liners
4669|4652|Sleeping mats
4670|4652|Travel hammocks
4671|4652|Camping air mattresses
4657|4335|Camping stoves & cookware
4672|4657|Camping cookware
4673|4657|Camping dishes
4674|4657|Camping stoves
4675|4657|Camping utensils
4658|4335|Binoculars & scopes
4659|4335|Coolers
4660|4335|Hydration systems & packs
4661|4335|Camping furniture
4743|4661|Camping chairs
4744|4661|Camping cupboards
4745|4661|Camping kitchens
4746|4661|Camping tables
4662|4335|Flashlights, headlamps & lanterns
4676|4662|Headlamps
4677|4662|Lanterns
4678|4662|Flashlights
4663|4335|Hiking poles
4664|4335|Compasses
4665|4335|Hiking backpacks
4679|4665|Backpacking backpacks
4680|4665|Day hiking backpacks
4681|4665|Backpack covers
4627|4335|Fishing & hunting
4641|4627|Fishing rods
4642|4627|Fishing reels
4643|4627|Fishing tackle & lures
4644|4627|Fishing nets
4645|4627|Fishing tools
4646|4627|Tackle boxes & bags
4647|4627|Fishing rod storage
4648|4627|Game & trail cameras
4649|4627|Hunting calls & lures
4650|4627|Hunting hearing protection
4651|4627|Other fishing & hunting accessories
4666|4335|Other outdoor sports accessories
4336|4332|Water sports
4758|4336|Inflatable rafts
4747|4336|Swimming
4748|4747|Snorkel masks
4749|4747|Fins & flippers
4750|4747|Pool toys
4751|4747|Snorkels
4752|4747|Snorkeling sets
4753|4747|Swim caps
4754|4747|Swim goggles
4755|4747|Swim training equipment
4756|4747|Tow floats
4757|4747|Water aerobics & water fitness accessories
4759|4336|Kayaks
4789|4759|Folding kayaks
4788|4759|Inflatable kayaks
4792|4759|Kayak paddles
4760|4336|Kiteboards
4761|4336|Skimboards
4784|4336|Stand-up paddle boards
4785|4784|Inflatable paddle boards
4787|4784|Stand-up paddle board paddles
4763|4336|Towable tubes
4764|4336|Wakeboards
4765|4336|Water skis
4766|4336|Personal floatation devices
4767|4336|Water sport helmets
4768|4336|Wetsuits, gloves & booties
4780|4768|Wetsuits
4781|4768|Neoprene gloves
4782|4768|Neoprene booties
4783|4768|Wetsuit hoods
4769|4336|Water sport accessories
4770|4769|Dry bags
4771|4769|Water sport bindings
4772|4769|Water sport car racks
4773|4769|Water sport harnesses
4774|4769|Water sport impact vests
4775|4769|Water sport lines & tow ropes
4776|4769|Water sport parts
4777|4769|Water sport pumps
4778|4769|Water sport travel bags
4779|4769|Other water sport accessories
4337|4332|Team sports
4485|4337|Soccer
4500|4485|Soccer balls
4501|4485|Soccer goalie gloves
4502|4485|Soccer goals & nets
4503|4485|Soccer shin guards
4504|4485|Other soccer accessories
4486|4337|Basketball
4505|4486|Basketballs
4506|4486|Basketball hoops
4507|4486|Mini basketball hoops
4508|4486|Basketball accessories
4488|4337|Volleyball
4509|4488|Volleyballs
4510|4488|Volleyball knee pads
4511|4488|Volleyball nets & court accessories
4489|4337|Rugby
4512|4489|Rugby balls
4513|4489|Rugby gloves
4514|4489|Rugby kicking tees
4515|4489|Rugby scrum caps
4516|4489|Other rugby equipment
4490|4337|Practice & referee equipment
4517|4490|Agility ladders
4518|4490|Ball pumps
4519|4490|Rebound nets
4520|4490|Referee cards & flags
4521|4490|Sports bibs
4522|4490|Stopwatches
4523|4490|Tactical boards
4524|4490|Training cones & flat markers
4525|4490|Other practice & referee equipment
4491|4337|Football
4526|4491|Footballs
4527|4491|Football helmets
4528|4491|Football kicking tees
4529|4491|Football pads
4530|4491|Flag football belts
4531|4491|Other football equipment
4492|4337|Baseball & softball
4532|4492|Baseball & softball bats
4533|4492|Baseball & softball batting tees
4534|4492|Baseball & softball catchers gear
4535|4492|Baseball & softball gloves
4536|4492|Baseball & softball helmets
4537|4492|Baseballs
4538|4492|Softballs
4487|4337|Handball
4539|4487|Handballs
4540|4487|Handball knee pads
4541|4487|Handball nets
4493|4337|Cricket
4542|4493|Cricket balls
4543|4493|Cricket bats
4544|4493|Cricket batting tees
4545|4493|Cricket gloves
4546|4493|Cricket helmets
4547|4493|Cricket pads
4548|4493|Cricket stumps
4494|4337|Field hockey
4549|4494|Field hockey balls
4550|4494|Field hockey facial protection
4551|4494|Field hockey goalie protection
4552|4494|Field hockey gloves
4553|4494|Field hockey shin guards
4554|4494|Field hockey sticks
4495|4337|Floorball
4555|4495|Floorballs
4556|4495|Floorball sticks
4557|4495|Other floorball equipment
4496|4337|Gaelic sports
4568|4496|Gaelic football balls
4569|4496|Gaelic football gloves
4570|4496|Hurling & camogie sticks
4571|4496|Hurling & camogie helmets
4572|4496|Sliotars
4573|4496|Other Gaelic sports equipment
4497|4337|Lacrosse
4561|4497|Lacrosse balls
4562|4497|Lacrosse gloves
4563|4497|Lacrosse helmets
4564|4497|Lacrosse protective gear
4565|4497|Lacrosse sticks
4566|4497|Lacrosse bags
4567|4497|Other lacrosse accessories
4498|4337|Netball
4558|4498|Netball balls
4559|4498|Netball hoops
4560|4498|Other netball equipment
5590|4337|Australian rules
5591|5590|Australian rules balls
5592|5590|Other Australian rules equipment
4499|4337|Other team sports equipment
4338|4332|Racket sports
4477|4338|Tennis
4574|4477|Tennis rackets
4575|4477|Tennis bags & racket covers
4576|4477|Tennis balls
4577|4477|Tennis ball baskets
4578|4477|Tennis nets
4579|4477|Stringing & grip accessories
4580|4477|Other tennis accessories
4478|4338|Squash
4581|4478|Squash rackets
4582|4478|Squash balls
4583|4478|Squash bags & racket covers
4479|4338|Badminton
4584|4479|Badminton rackets
4585|4479|Badminton birdies
4586|4479|Badminton bags & racket covers
4587|4479|Badminton nets
4588|4479|Badminton sets
4480|4338|Racquetball
4589|4480|Racquetball rackets
4590|4480|Racquetball balls
4591|4480|Racketball bags & racket covers
4481|4338|Table tennis
4593|4481|Table tennis balls
4592|4481|Table tennis paddles
4594|4481|Table tennis nets
4596|4481|Table tennis accessories
4482|4338|Padel
4597|4482|Padel rackets
4598|4482|Padel balls
4599|4482|Padel nets
4600|4482|Padel bags & racket covers
4483|4338|Pickleball
4601|4483|Pickleball paddles
4602|4483|Pickleball balls
4603|4483|Pickleball nets
4604|4483|Pickleball bags
4605|4483|Pickleball sets
4484|4338|Racket sport eye protection
4339|4332|Golf
4470|4339|Golf accessories
4471|4339|Golf bags
4472|4339|Golf balls
4473|4339|Golf clubs
4474|4339|Golf gloves
4475|4339|Golf trolleys
4476|4339|Golf training equipment
4340|4332|Equestrian & horseback riding
4809|4340|Riding body protectors
4811|4340|Riding gloves
4810|4340|Riding helmet
4812|4340|Riding hat silks
4742|4340|Saddles & tack
4794|4742|Bits
4795|4742|Bridles
4796|4742|Girths
4797|4742|Horse blankets
4798|4742|Martingales & breastplates
4799|4742|Horse reins
4800|4742|Riding crops
4801|4742|Saddle bags
4808|4742|Horse saddle covers
4802|4742|Saddle cloths & saddle pads
4803|4742|Horse saddles
4805|4742|Stirrup leathers
4806|4742|Stirrups
4807|4742|Other tack
4341|4332|Skateboards & scooters
4606|4341|Longboards
4607|4341|Skateboards
4818|4341|Scooters
4608|4341|Skate helmets
4609|4341|Skate pads
4612|4609|Elbow pads
4613|4609|Knee pads
4614|4609|Wrist pads
4615|4609|Skate pad sets
4610|4341|Skate parts & accessories
4611|4341|Skateboard parts & accessories
4342|4332|Boxing & martial arts
4616|4342|Boxing & martial arts head protection
4617|4342|Boxing & martial arts body protection
4618|4342|Punching & kicking pads
4619|4342|Boxing & martial arts gloves
4620|4342|Hand wraps
4621|4342|Martial arts belts
4622|4342|Heavy punching bags
4624|4342|Speed punching bags
4625|4342|Other martial arts equipment
4343|4332|Casual sports & games
4682|4343|Boules & other games
4813|4682|Boules sets
4814|4682|Boules carrying cases
4815|4682|Boules accessories
4816|4682|Other yard games
4683|4343|Darts equipment
4691|4683|Dartboards
4692|4683|Darts
4693|4683|Dart accessories
4684|4343|Flying discs & disc golf
4697|4684|Ultimate & casual flying discs
4695|4684|Disc golf discs
4694|4684|Disc golf baskets
4696|4684|Disc golf accessories
4686|4343|Playground balls
4687|4343|Pool & snooker
4704|4687|Cues
4705|4687|Cue cases
4706|4687|Cue storage racks
4707|4687|Pool & snooker balls
4710|4687|Pool & snooker table covers
4711|4687|Pool & snooker table brushes
4712|4687|Other pool & snooker accessories
4688|4343|Roundnet & spikeball
4689|4343|Bowling
4699|4689|Bowling balls
4700|4689|Bowling ball bags
4701|4689|Bowling accessories
4344|4332|Winter sports
4713|4344|Ski equipment
4733|4713|Downhill skis
4734|4713|Downhill ski poles
4735|4713|Ski-touring skis
4736|4713|Cross-country skis
4737|4713|Cross-country ski poles
4738|4713|Ski straps
4739|4713|Ski bags & boot bags
4740|4713|Ski bindings
4741|4713|Other ski equipment
4714|4344|Snowboard equipment
4722|4714|Snowboards
4723|4714|Splitboards
4724|4714|Snowboard bindings
4725|4714|Snowboard bags & boot bags
4715|4344|Ice hockey
4726|4715|Ice hockey sticks
4727|4715|Ice hockey gloves
4728|4715|Ice hockey helmets
4729|4715|Ice hockey nets
4730|4715|Ice hockey pads
4731|4715|Ice hockey pucks
4732|4715|Other ice hockey equipment
4716|4344|Figure skating accessories
4717|4344|Sledding
4718|4344|Snowshoes
4719|4344|Gaiters
4720|4344|Ski goggles
4721|4344|Winter sport helmets
`;

function buildVintedNodes(): Map<number, VintedNode> {
  const nodes = new Map<number, VintedNode>();
  const lines = VINTED_CATALOG_RAW.split('\n');
  for (const line of lines) {
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

export const VINTED_NODES: ReadonlyMap<number, VintedNode> = buildVintedNodes();

export function getVintedNode(id: number): VintedNode | undefined {
  return VINTED_NODES.get(id);
}

export function isVintedLeaf(id: number): boolean {
  const n = VINTED_NODES.get(id);
  return !!n && n.childIds.length === 0;
}

/** Root-to-node chain of nodes ([] for an unknown id). */
export function vintedPathNodes(id: number): VintedNode[] {
  const out: VintedNode[] = [];
  let cur = VINTED_NODES.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId === 0 ? undefined : VINTED_NODES.get(cur.parentId);
  }
  return out;
}

/** Titles from the root down to the node, e.g. ["Sports", "Team sports", "Baseball & softball", ...]. */
export function vintedPathTitles(id: number): string[] {
  return vintedPathNodes(id).map((n) => n.title);
}

/** "Sports > Team sports > Baseball & softball > Baseball & softball gloves" ('' for an unknown id). */
export function vintedPathText(id: number): string {
  return vintedPathTitles(id).join(' > ');
}

/** Id of the root (top-level) node an id lives under (0 for an unknown id). */
export function vintedRootId(id: number): number {
  const chain = vintedPathNodes(id);
  return chain.length ? chain[0].id : 0;
}

/** Every leaf id at or below a node (the node itself when it is a leaf). */
export function vintedDescendantLeafIds(id: number): number[] {
  const start = VINTED_NODES.get(id);
  if (!start) return [];
  const out: number[] = [];
  const stack: VintedNode[] = [start];
  while (stack.length) {
    const n = stack.pop() as VintedNode;
    if (n.childIds.length === 0) out.push(n.id);
    else for (const c of n.childIds) { const cn = VINTED_NODES.get(c); if (cn) stack.push(cn); }
  }
  return out;
}

export function vintedAllLeafIds(): number[] {
  const out: number[] = [];
  VINTED_NODES.forEach((n) => { if (n.childIds.length === 0) out.push(n.id); });
  return out;
}

export const VINTED_ROOT_IDS = {
  WOMEN: 1904,
  MEN: 5,
  DESIGNER: 2993,
  KIDS: 1193,
  HOME: 1918,
  ELECTRONICS: 2994,
  BOOKS_MEDIA: 2309,
  HOBBIES: 4824,
  SPORTS: 4332,
} as const;
