SELECT id, title, status, "ebayListingId", "ebayOfferId", price
FROM "Item"
WHERE title ILIKE '%fila%' OR title ILIKE '%wilson%'
ORDER BY "updatedAt" DESC
LIMIT 10;
