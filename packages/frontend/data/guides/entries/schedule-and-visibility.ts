import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'schedule-and-visibility',
  title: "Schedule a sale and set your visibility window",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['create-your-first-sale', 'pick-the-right-sale-type', 'multi-location-hubs'],
  videoUrl: undefined,
  body: `The date and time fields control when shoppers can attend your sale in person.
The Visibility Window controls when they can first find it in search.
Set both before you publish.

---

## Date fields

**Start Date** — the first day your sale is open to the public.

**End Date** — the last day your sale is open. For a one-day yard sale, start and end dates are the same.

For a multi-day auction or estate sale, set the full date range.
Each day in the range will show on your public listing.

---

## Time fields

**Start Time** — when the doors open on your first day.

**End Time** — when the sale closes for in-person shoppers on each day.

End time is about in-person access, not when online listings expire.
Online items stay visible until you close or unpublish the sale.

If your hours change from day to day (for example, Saturday 9 AM–5 PM and Sunday 10 AM–2 PM), you can set times per day in the form.

---

## Time zone

FindA.Sale sets the time zone automatically based on the zip code in your sale address.
You don't need to pick a time zone manually.
If your sale crosses a time zone border, the address zip code is used.

---

## Recommended lead times by sale type

How far in advance should you publish before your start date?

| Sale type | Recommended lead time |
|---|---|
| Estate Sale | 10–14 days |
| Yard / Garage Sale | 3–5 days |
| Auction (timed, online) | 7–14 days |
| Auction (live, in-person) | 7–10 days |
| Flea Market | 5–7 days |
| Consignment | 7–10 days |

These are guidelines. You can publish as little as one day in advance.
But shoppers who follow saved-sale notifications need time to plan — especially for multi-day events.

---

## Visibility Window

The Visibility Window is how many days before your start date shoppers can see your sale in search results.

**Default: 7 days.**

Example: Your estate sale starts Saturday the 15th. With a 7-day window, it appears in search on Saturday the 8th. Shoppers have a week to browse items, save the sale, and plan the trip.

**When to use 14 days:**
- Large estate sales with a lot of inventory
- Auctions where bidders need time to review items before the close date
- Any event where pre-sale browsing is part of the draw

**When to use 3–5 days:**
- One-day yard sales or garage sales
- Last-minute pop-ups or consignment drops
- Events where the inventory isn't listed ahead of time

---

## What "Active Now" means in search

Once your sale start date has passed and the sale is published, it shows as **Active Now** in search results.
Shoppers see this as a currently-open event — not a preview.

Sales past their end date are automatically marked closed and drop out of active search.
They remain accessible by direct link for a short time after closing.

---

## Common questions

**I set the dates wrong. Can I fix it after publishing?**
Yes. Open the sale from your dashboard, tap **Edit Sale**, and update the dates. The sale stays published — no need to unpublish first.

**My sale is published but it's not showing in search yet. Is something wrong?**
Check your Visibility Window. If your sale starts in 10 days and your window is set to 7 days, it won't appear in search for another 3 days. Extend the Visibility Window in edit-sale to make it appear sooner.

**Does the end time affect online item listings?**
No. End time is for in-person shoppers. Items listed online stay visible until you mark them sold, unpublish the sale, or close it manually.

**Can I schedule a sale to publish automatically at a future time?**
Not currently. You publish manually by tapping Publish from your dashboard. Set a reminder to publish on the date you want.

---

## Related guides

- [Create your first sale, step by step](create-your-first-sale.md)
- [Pick the right sale type](pick-the-right-sale-type.md)
- [Run a sale across multiple locations (Hubs)](multi-location-hubs.md)`,
};

export default entry;
