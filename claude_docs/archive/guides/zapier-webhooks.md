# FindA.Sale Zapier & Webhook Integration Guide

## Overview

FindA.Sale fires webhooks for key business events, enabling you to automate workflows with Zapier and other integration platforms. When an event occurs on FindA.Sale—such as a sale being created, an item being purchased, or an auction closing—we send a JSON payload to your webhook endpoint. You can use these events to trigger actions in thousands of third-party apps, from Google Sheets to email, CRM systems, and social media platforms.

## Available Webhook Events

The following events trigger webhooks:

- **new_sale_created** — Fires when an organizer creates a new sale
- **item_purchased** — Fires when a shopper completes a purchase
- **auction_won** — Fires when an auction ends and a winner is determined
- **new_follower** — Fires when a shopper follows an organizer's account
- **new_review** — Fires when a shopper leaves a review for an organizer
- **sale_started** — Fires when a sale's start time arrives
- **sale_ended** — Fires when a sale's end time passes

## Payload Schema

Each webhook event includes a JSON payload with event-specific data. Below are example payloads for each event type.

### new_sale_created

```json
{
  "event": "new_sale_created",
  "timestamp": "2026-03-05T14:30:00Z",
  "organizerId": "org_abc123",
  "organizer": {
    "id": "org_abc123",
    "name": "Heritage Estate Sales",
    "email": "contact@heritageestatesales.com"
  },
  "sale": {
    "id": "sale_xyz789",
    "title": "Oak Valley Estate Collection",
    "description": "Vintage furniture, china, and collectibles",
    "startDate": "2026-03-15T08:00:00Z",
    "endDate": "2026-03-17T17:00:00Z",
    "address": "123 Elm Street, Grand Rapids, MI 49503",
    "saleType": "regular",
    "itemCount": 147
  }
}
```

### item_purchased

```json
{
  "event": "item_purchased",
  "timestamp": "2026-03-05T15:45:00Z",
  "saleId": "sale_xyz789",
  "organizer": {
    "id": "org_abc123",
    "name": "Heritage Estate Sales"
  },
  "shopper": {
    "id": "shopper_user456",
    "name": "Jane Smith",
    "email": "jane.smith@example.com"
  },
  "item": {
    "id": "item_123",
    "title": "Blue Willow China Serving Plate",
    "category": "Dinnerware",
    "price": 25.00,
    "quantity": 1
  },
  "order": {
    "id": "order_789abc",
    "total": 26.25,
    "platformFee": 1.25,
    "organizer_net": 25.00
  }
}
```

### auction_won

```json
{
  "event": "auction_won",
  "timestamp": "2026-03-05T18:00:00Z",
  "saleId": "sale_auction_001",
  "organizer": {
    "id": "org_abc123",
    "name": "Heritage Estate Sales"
  },
  "item": {
    "id": "item_456",
    "title": "Antique Mahogany Desk",
    "startingBid": 50.00,
    "finalBid": 225.00
  },
  "winner": {
    "id": "shopper_user789",
    "name": "Robert Jones",
    "email": "robert.jones@example.com"
  },
  "auctionEndTime": "2026-03-05T18:00:00Z"
}
```

### new_follower

```json
{
  "event": "new_follower",
  "timestamp": "2026-03-05T16:20:00Z",
  "organizer": {
    "id": "org_abc123",
    "name": "Heritage Estate Sales"
  },
  "follower": {
    "id": "shopper_user999",
    "name": "Linda Brown",
    "email": "linda.brown@example.com"
  },
  "followerCount": 42
}
```

### new_review

```json
{
  "event": "new_review",
  "timestamp": "2026-03-05T17:10:00Z",
  "organizer": {
    "id": "org_abc123",
    "name": "Heritage Estate Sales"
  },
  "reviewer": {
    "id": "shopper_user111",
    "name": "Michael Chen",
    "email": "michael.chen@example.com"
  },
  "review": {
    "rating": 5,
    "title": "Great selection and friendly service!",
    "text": "Found several items I was looking for. The organizer was responsive and helpful.",
    "relatedSaleId": "sale_xyz789"
  }
}
```

### sale_started

```json
{
  "event": "sale_started",
  "timestamp": "2026-03-15T08:00:00Z",
  "sale": {
    "id": "sale_xyz789",
    "title": "Oak Valley Estate Collection",
    "organizer": {
      "id": "org_abc123",
      "name": "Heritage Estate Sales"
    }
  }
}
```

### sale_ended

```json
{
  "event": "sale_ended",
  "timestamp": "2026-03-17T17:00:00Z",
  "sale": {
    "id": "sale_xyz789",
    "title": "Oak Valley Estate Collection",
    "organizer": {
      "id": "org_abc123",
      "name": "Heritage Estate Sales"
    },
    "totalItemsSold": 89,
    "totalRevenue": 3250.00
  }
}
```

## Connecting Zapier

### Step 1: Create a Zapier Account

If you don't already have a Zapier account, sign up at zapier.com.

### Step 2: Create a New Zap

Click "Create" to start a new Zap. You'll be prompted to choose a trigger app.

### Step 3: Select "Webhooks by Zapier" as Your Trigger

Search for and select "Webhooks by Zapier." Choose "Catch Raw Hook" as the trigger event.

### Step 4: Copy Your Webhook URL

Zapier will generate a unique webhook URL. Copy this URL.

### Step 5: Add the Webhook URL to FindA.Sale

Log in to your FindA.Sale account, go to Settings → Integrations → Zapier, and paste your webhook URL. Select which events you want to trigger your Zap (new sales, purchases, auction wins, etc.), then save.

FindA.Sale will now send selected events to your Zapier webhook URL.

### Step 6: Continue Building Your Zap

Back in Zapier, click "Continue." Zapier will wait for a test webhook from FindA.Sale. Once received, you'll see the payload structure. Click "Continue" to proceed to the action step.

### Step 7: Choose an Action App and Configure It

Select what you want to happen when the webhook fires. For example, you might choose Google Sheets (add a row), Gmail (send an email), Facebook (post a message), or any of thousands of other apps. Follow Zapier's prompts to map webhook data to the action fields.

### Step 8: Test and Activate

Send a test event from FindA.Sale (or manually trigger a webhook for testing) and confirm Zapier received it and executed the action. Once confirmed, activate your Zap.

## Authentication

All webhook requests from FindA.Sale include an API key in the HTTP headers for security. When configuring Zapier, include the following header in your webhook configuration:

```
X-API-Key: your_api_key
```

Your API key is unique to your FindA.Sale account and can be found in Settings → API Keys. Treat it like a password and never share it publicly.

When using "Webhooks by Zapier," Zapier handles header validation automatically once you've registered your webhook URL in FindA.Sale settings. No manual header entry is required.

## Example Zap Recipes

### Recipe 1: New Purchase → Add Row to Google Sheets Inventory Tracker

**Trigger:** item_purchased  
**Action:** Google Sheets — Create Spreadsheet Row

Map these fields:
- Spreadsheet: Your inventory tracker
- Worksheet: "Sold Items"
- Item Title → Column A (Item Name)
- Price → Column B (Sale Price)
- Shopper Name → Column C (Buyer)
- Order ID → Column D (Order ID)
- Timestamp → Column E (Date Sold)

This automatically logs every purchase to your Google Sheet for record-keeping and accounting.

### Recipe 2: Auction Won → Send Winner Congratulations Email via Gmail

**Trigger:** auction_won  
**Action:** Gmail — Send Email

Configure:
- To: Winner email (from payload)
- Subject: "Congratulations! You won {{ Item Title }} at {{ Final Bid }}"
- Body: "You won the auction! Next steps: [link to payment]. Pickup at [address]."

This automatically sends a friendly confirmation email to auction winners.

### Recipe 3: New Sale Created → Post to Facebook Page

**Trigger:** new_sale_created  
**Action:** Facebook Pages — Create Post

Configure:
- Page: Your Facebook business page
- Message: "New estate sale: {{ Sale Title }}. Starting {{ Start Date }}. Find out more: [link to sale]"
- Include attachment: Sale QR code or image

This auto-posts new sales to your Facebook page to boost visibility.

### Recipe 4: New Follower → Add to Mailchimp Audience

**Trigger:** new_follower  
**Action:** Mailchimp — Add/Update Subscriber

Configure:
- List: Your mailing list (e.g., "Estate Sale Subscribers")
- Email: Follower email (from payload)
- First Name: Follower first name
- Tags: "Estate Sale Follower"

This automatically segments engaged shoppers into your email marketing list.

## Rate Limits

FindA.Sale sends webhooks at a maximum rate of 100 deliveries per minute. If your Zap receives more than 100 events in a minute, they will be queued and delivered as soon as capacity becomes available. Webhooks are retried up to 3 times if delivery fails, with exponential backoff between attempts.

## Testing and Debugging

To test your webhook integration, log in to FindA.Sale, go to Settings → Integrations → Zapier, and click "Send Test Event." This will fire a sample webhook payload to your Zapier URL. Check your Zap's activity log to confirm receipt and execution.

If a webhook fails, check the error log in Zapier's activity dashboard. Common issues include:

- Incorrect webhook URL (copy-paste carefully)
- Missing or invalid API key header
- Target app (Google Sheets, Gmail, etc.) authentication lapsed
- Zap is paused or disabled

Refer to Zapier's support documentation for app-specific troubleshooting.