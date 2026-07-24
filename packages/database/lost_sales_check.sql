SELECT id, status, array_length("itemIds",1) AS item_count, amount, "createdAt"
FROM "POSPaymentLink"
WHERE array_length("itemIds",1) >= 2 AND status = 'ACTIVE' AND "createdAt" >= '2026-07-07'
ORDER BY "createdAt" DESC;
