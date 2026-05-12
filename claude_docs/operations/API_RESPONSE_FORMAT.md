# FindA.Sale API Response Format Guide

This document outlines the standard response shapes for FindA.Sale REST API endpoints.

## Standard Response Envelope

### Success Response (200-299)
```json
{
  "data": { /* endpoint-specific data */ },
  "message": "Optional success message"
}
```

Or, for simple responses:
```json
{
  "id": "uuid",
  "createdAt": "2026-05-06T10:30:00Z",
  "updatedAt": "2026-05-06T10:30:00Z"
  /* endpoint-specific fields */
}
```

### Error Response (400-599)
```json
{
  "message": "Human-readable error description",
  "code": "OPTIONAL_ERROR_CODE"
}
```

**Common HTTP Status Codes:**
- `200 OK`: Successful GET/PATCH
- `201 Created`: Successful POST (resource created)
- `204 No Content`: Successful DELETE or action with no return data
- `400 Bad Request`: Invalid input (validation error)
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Authenticated but lacks permission
- `404 Not Found`: Resource does not exist
- `409 Conflict`: Duplicate resource or conflicting state
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server-side error

---

## Authentication Responses

### POST /auth/register
**Success (201):**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "roles": ["USER"],
    "guildXp": 0,
    "createdAt": "2026-05-06T10:30:00Z"
  },
  "token": "eyJhbGc...",
  "message": "Account created successfully"
}
```

**Error (409 - Conflict):**
```json
{
  "message": "An account already exists with this email address."
}
```

**Error (429 - Rate Limited):**
```json
{
  "code": "REGISTRATION_RATE_LIMITED",
  "message": "Too many accounts created from this IP. Please try again later.",
  "resetAt": "2026-05-06T10:45:00Z"
}
```

### POST /auth/login
**Success (200):**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "roles": ["USER"]
  },
  "token": "eyJhbGc..."
}
```

**Error (401):**
```json
{
  "message": "Invalid email or password"
}
```

---

## User Endpoints

### GET /api/users/me
**Success (200):**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "USER",
  "roles": ["USER"],
  "guildXp": 450,
  "explorerRank": "RANGER",
  "phone": "+1234567890",
  "createdAt": "2026-05-06T10:30:00Z",
  "updatedAt": "2026-05-06T10:30:00Z",
  "userBadges": [
    {
      "id": "badge_456",
      "badgeId": "badge_123",
      "badge": {
        "id": "badge_123",
        "name": "First Purchase",
        "description": "Complete your first purchase"
      }
    }
  ],
  "organizer": null
}
```

### GET /api/users/me/export
**Success (200):**
Returns a downloadable JSON file attachment with the structure:
```json
{
  "exportedAt": "2026-05-06T10:30:00Z",
  "userProfile": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "guildXp": 450,
    "explorerRank": "RANGER"
  },
  "organizedSales": [ /* array of sales */ ],
  "itemsListed": [ /* array of items */ ],
  "bids": [ /* array of bids */ ],
  "purchases": [ /* array of purchases */ ],
  "favorites": [ /* array of favorites */ ],
  "notifications": [ /* array of notifications, limited to 100 */ ]
}
```

**Error (429):**
```json
{
  "error": "Data export only available once every 24 hours",
  "nextAvailableAt": "2026-05-07T10:30:00Z"
}
```

### GET /api/users/purchases
**Success (200):**
```json
[
  {
    "id": "purchase_123",
    "userId": "user_123",
    "itemId": "item_456",
    "saleId": "sale_789",
    "amount": 2500,
    "status": "COMPLETED",
    "createdAt": "2026-05-06T10:30:00Z",
    "item": {
      "title": "Vintage Chair",
      "photoUrls": ["https://..."]
    },
    "sale": {
      "id": "sale_789",
      "title": "Estate Sale - Downtown",
      "startDate": "2026-05-10T08:00:00Z",
      "organizer": {
        "businessName": "ABC Estate Sales"
      }
    }
  }
]
```

### POST /api/users/me/do-not-sell
**Success (200):**
```json
{
  "success": true,
  "message": "Your preference has been recorded."
}
```

---

## Item Endpoints

### GET /api/items/:itemId
**Success (200):**
```json
{
  "id": "item_123",
  "title": "Vintage Table Lamp",
  "description": "Brass base, linen shade",
  "category": "Decor",
  "price": 5000,
  "condition": "GOOD",
  "photoUrls": [
    "https://res.cloudinary.com/..."
  ],
  "listingType": "FOR_SALE",
  "saleId": "sale_789",
  "createdAt": "2026-05-06T10:30:00Z",
  "updatedAt": "2026-05-06T10:30:00Z"
}
```

**Error (404):**
```json
{
  "message": "Item not found"
}
```

---

## Admin Endpoints

### GET /api/admin/xp-velocity
**Success (200):**
```json
{
  "flagged": [
    {
      "userId": "user_999",
      "userName": "Suspicious User",
      "email": "test@example.com",
      "maxHourlyXp": 750,
      "totalXpLast7Days": 3500,
      "recentEvents": [
        {
          "points": 250,
          "reason": "Purchase completed",
          "createdAt": "2026-05-06T10:30:00Z"
        }
      ]
    }
  ]
}
```

---

## Pagination Responses

For list endpoints that support pagination:
```json
{
  "data": [ /* array of items */ ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "hasMore": true
  }
}
```

Or using cursors:
```json
{
  "data": [ /* array of items */ ],
  "cursor": "eyJsYXN0SWQiOiAiaXRlbV85OTkifQ==",
  "hasMore": true
}
```

---

## Field Type Standards

- **Dates**: ISO 8601 format (e.g., `2026-05-06T10:30:00Z`)
- **Currency (Prices)**: Integer cents (e.g., `5000` = $50.00)
- **IDs**: CUID or UUID strings
- **Booleans**: `true` / `false` (lowercase JSON)
- **Null values**: `null` (not omitted)
- **Arrays**: Always arrays, even if empty `[]`

---

## Error Details

Error responses include one of these codes:

| Code | HTTP Status | Meaning |
|------|------------|---------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `AUTHENTICATION_REQUIRED` | 401 | No valid auth token |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `PERMISSION_DENIED` | 403 | Insufficient role/permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate or conflicting state |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `NSFW_DETECTED` | 400 | Image rejected for policy violation |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Response Serialization Rules

1. **Decimal values**: Converted to numbers for JSON serialization
2. **Passwords**: Never included in responses
3. **Sensitive data**: PII (SSN, tokens) never returned unless explicitly requested
4. **Private fields**: Excluded by default (use explicit `select` in queries)
5. **Empty relations**: Included as `null` or `[]` depending on cardinality
