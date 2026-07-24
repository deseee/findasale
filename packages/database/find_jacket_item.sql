SELECT id, title, status, "ebayListingId", "ebayOfferId", "listedOnEbayAt", "updatedAt", "saleId"
FROM "Item"
WHERE title ILIKE '%tyvek%' OR title ILIKE '%camel%jacket%'
ORDER BY "updatedAt" DESC
LIMIT 10;
