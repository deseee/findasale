import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'webhooks-and-zapier',
  title: "Webhooks and Zapier: send sale events to your tools",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['connect-shopify', 'message-templates-and-the-built-in-inbox'],
  videoUrl: undefined,
  body: `When something happens in your sale — an item sells, a hold is placed, a shopper follows you — FindA.Sale can send that event to another tool automatically. You don't need to check FindA.Sale to know. Your spreadsheet, your Slack, your CRM can all hear it in real time.

The two ways to do this: webhooks (for developers or tools that accept raw data) and Zapier (for everyone else, no code needed).

For full event payload documentation, see the [Zapier and webhooks reference guide](/guide#zapier-webhooks).

---

## Webhooks: send raw events to any URL

A webhook is a POST request FindA.Sale sends to a URL you provide every time a selected event happens. If your tool can receive a POST request, it can receive FindA.Sale events.

**To add a webhook:**
1. Go to **Organizer → Webhooks**.
2. Tap **New Webhook**.
3. Paste your endpoint URL.
4. Select the events you want to receive.
5. Save.

That's it. FindA.Sale will send a JSON payload to that URL every time the selected event fires.

**Available events include:** item sold, hold placed, hold released, hold expired, new follower, sale published, sale closed.

For the full list of events and the exact JSON structure of each payload, see the [webhook event reference](/guide#zapier-webhooks).

---

## Zapier: connect to 5,000+ apps without writing code

If your tool is in Zapier's app library, you can connect it to FindA.Sale without any technical setup. Zapier receives the FindA.Sale event and sends it wherever you need it.

**To connect Zapier:**
1. In Zapier, create a new Zap.
2. Search for FindA.Sale as the trigger app.
3. Select the event you want to trigger on (item sold, new follower, etc.).
4. Connect your FindA.Sale account when prompted.
5. Set up the action — what Zapier does when the event fires.

**Common Zaps organizers use:**
- New item sold → add a row in Google Sheets (running sales log)
- New follower → send a Slack message to yourself (so you can follow up)
- Sale published → post a message to a Facebook group
- Hold placed → send yourself an SMS
- Sale closed → create a task in Notion or Trello to start settlement

You can also combine Zaps with filters — for example, only log items to your spreadsheet if the sale price was over $50.

---

## Related guides

- [Connect Shopify and cross-list items](connect-shopify.md)
- [Message templates and the built-in inbox](message-templates-and-the-built-in-inbox.md)`,
};

export default entry;
