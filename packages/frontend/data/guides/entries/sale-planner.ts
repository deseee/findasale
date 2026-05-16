import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'sale-planner',
  title: "Plan a day of sales with the sale planner",
  audience: 'shopper',
  format: 'written',
  priority: 3,
  relatedGuides: ['find-sales-near-you', 'browse-by-city', 'wishlist-and-notifications'],
  videoUrl: undefined,
  body: `# Plan a Day of Sales With the Sale Planner

Got a free Saturday and want to hit three sales in one trip? The sale planner lets you describe what you're hunting for and builds a prioritized list of sales to hit, in order, with items at each stop that match.

---

## What the sale planner is

The planner lives at /plan. It's a chat-style tool — type what you're looking for in plain language and it searches active sales near you for matches.

It's built for day-trip planning: you tell it what you want, when you're starting, and how far you're willing to drive. It does the rest.

---

## How to use it

**Step 1 — Open the planner.** Tap Plan from the home menu or go directly to /plan.

**Step 2 — Describe what you're hunting.** Type naturally. A few examples:

- "I want mid-century furniture within 20 miles on Saturday"
- "Looking for vintage kitchen stuff and tools, okay to drive 40 minutes"
- "Anything with kids' clothing sizes 4T–6T this weekend"

The planner reads your description and searches item listings across active sales in your area.

**Step 3 — Review the list.** You'll get a prioritized list of sales. Each entry shows:

- The sale name and type
- Distance from your location
- Items at that sale that match your description
- Sale hours

Sales are ordered by a mix of match quality and distance — the ones with the best matching items closest to you come first.

**Step 4 — Adjust if needed.** Don't like a sale in the list? Tap the X to remove it. Want to swap it for a different one? The planner will suggest alternatives.

You can also drag sales to reorder them if you have a preferred route in mind.

**Step 5 — Save or share the plan.** Tap Save to store the plan in your profile under My Plans. Tap Share to copy a link.

The share link shows the same list anyone can open — without needing an account. Good for coordinating with a group. Send it in the group chat and everyone sees the same stops.

**Step 6 — Add to calendar.** Tap Add to Calendar and the first sale's start time drops into your phone's calendar. If you have multiple stops, each sale gets its own calendar entry with the address.

---

## Tips for better results

**Be specific.** "Dining chairs" gets better results than "furniture." "Vintage Pyrex" beats "kitchenware." The planner matches against actual item listings, so specificity pays off.

**Set a start time.** If you tell the planner you're starting at 8 AM, it will skip sales that don't open until noon. You won't arrive after anything closes.

**Adjust the radius.** The default uses your current distance filter. If you want to stay local, tighten it. If you're willing to drive, open it up and you'll get more options.

**3 to 5 stops is the sweet spot.** More than that and you spend more time in the car than shopping. The planner will handle any number, but your Saturday will be better with a focused list.

---

## Common questions

**Q: How does the planner know what's at each sale?**
It searches organizers' posted item listings. If an organizer listed "solid oak dining table," it matches your search for "dining furniture." If an organizer hasn't listed items yet, that sale may not show up — or it may appear without matched items.

**Q: Can I change the route order after the planner builds it?**
Yes. Tap and drag any sale to reorder it. The planner recalculates estimated drive times for the new order.

**Q: What if a sale closes before I get there?**
The planner shows each sale's hours. If your route would arrive after closing, you'll see a warning. Adjust your start time or swap that sale for another.

**Q: Can I save multiple plans?**
Yes. Each saved plan appears in My Plans in your profile. Name them whatever you want — "August Saturday," "Mom's antique hunt," whatever.

**Q: What's the difference between a plan and a wishlist?**
A wishlist saves individual items across any sale. A plan saves a full route — multiple sales, ordered by drive time, with matched items at each stop. Plans are for day trips. Wishlists are for browsing over time.

**Q: Can I share a plan with someone who doesn't have an account?**
Yes. The share link opens in any browser without requiring a login. They'll see the full route and can follow along.

---

## Related guides

- [Find Sales Near You: Map, Search, and Calendar](/guides/find-sales-near-you)
- [Browse by City: Weekend Sale Pages](/guides/browse-by-city)
- [Save Items to Your Wishlist and Get Notified](/guides/wishlist-and-notifications)`,
};

export default entry;
