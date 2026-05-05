---
title: Webhooks and Zapier: Send Sale Events to Your Tools
slug: webhooks-and-zapier-send-sale-events-to-your-tools
audience: organizer
format: W
treatment: WRAPPER
section: 4.8
links-from: /organizer/webhooks, existing /guide Zapier section
---

# Webhooks and Zapier: Send Sale Events to Your Tools

FindA.Sale can send real-time notifications to Zapier (or any tool that accepts webhooks) when things happen in your sale: items sell, consignors are paid, new shoppers arrive. Use these notifications to automate workflows in Google Sheets, Slack, email, or any connected app.

For a complete reference on available events and advanced webhook setup, see the Webhooks API documentation in your account settings. This guide covers the basics: what events are available and how to set up Zapier.

## What events can trigger

When you enable webhooks, FindA.Sale sends real-time data for:

- **Item sold:** Product name, price, buyer, payment method
- **Customer purchased:** Customer name, email, items, total
- **Consignor payment issued:** Consignor name, amount, date
- **Sale started / closed:** Sale name, date, status
- **Shopper joined:** Shopper name, timestamp
- **Inventory updated:** Item added or removed from sale

Each event includes metadata (sale ID, timestamp, user ID) so your tools can match data across systems.

## Basic Zapier setup

**1. Log into Zapier**
Go to zapier.com. Create an account or log in.

**2. Create a new Zap**
Click "Create a Zap." For Trigger, search for "Webhooks by Zapier" and select "Catch Raw Hook."

**3. Copy the webhook URL**
Zapier generates a unique webhook URL. Copy it.

**4. Add the webhook to FindA.Sale**
Go to your FindA.Sale sale settings. Find "Webhooks" or "Integrations." Paste the Zapier webhook URL. Select which events to send (e.g., "Item sold," "Sale closed").

**5. Test the webhook**
In Zapier, click "Test trigger." Go back to FindA.Sale and trigger an event (e.g., mark an item sold). Zapier will catch the data.

**6. Build the action**
Once the test passes, tell Zapier what to do with the data. Examples:
- Add a row to a Google Sheet with item details
- Send a Slack message to your team: "New sale: $250"
- Create a to-do in your task manager
- Send an email receipt to the buyer

**7. Turn it on**
Click "Publish" and your Zap is live. Every time the event happens, Zapier acts.

## Common use cases

**Google Sheets tracker:** Each item that sells gets a new row in a spreadsheet (item name, price, buyer, time). You have a live sales log.

**Slack notifications:** Your team gets a ping when a big item sells. "Vintage dresser sold for $150 at the Estate Sale."

**Email receipt:** Shopper buys 3 items for $75. You automatically send them a receipt email (instead of manually texting it).

**Task creation:** Each sale creates a "Settlement" task in your to-do app with the sale date and consignor names so you don't forget to pay them.

**Inventory sync to Shopify:** An item sells on FindA.Sale, and Zapier automatically updates your Shopify inventory so you don't oversell.

## Common questions

**Q: Is there a limit to how many webhooks I can set up?**
A: No. Set up as many as you want. Each sale can have multiple webhooks firing to different apps.

**Q: Can I send webhooks to a custom URL (not Zapier)?**
A: Yes. If you have a developer, you can create a custom integration. FindA.Sale sends raw JSON to any HTTPS endpoint you provide.

**Q: What if Zapier is down?**
A: If Zapier's service is unavailable, webhooks won't go through until it's back up. Critical automations should have a backup (e.g., also set up an email notification).

**Q: Can I filter events?**
A: Yes, in Zapier. For example, "Only send me Slack messages if an item sells for over $100." Build the filter into your Zap's action.

**Q: Does FindA.Sale retry if a webhook fails?**
A: Yes. If Zapier doesn't receive the data, FindA.Sale retries up to 3 times over 24 hours.

## Related guides

For the full technical reference on webhook events, payload schemas, and advanced setup, see the Webhooks API documentation in your account settings under Integrations.

- [List Items on eBay From Your Sale](/guides/list-items-on-ebay-from-your-sale)
- [Connect Shopify and Cross-List](/guides/connect-shopify-and-cross-list)
- [Settle Up: Reconcile Sales, Pay Consignors, Get Your Payout](/guides/settle-up-reconcile-sales-and-get-your-payout)
