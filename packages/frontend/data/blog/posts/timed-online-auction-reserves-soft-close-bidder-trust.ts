import { BlogPost } from '../index';

export const postAG: BlogPost = {
  slug: 'timed-online-auction-reserves-soft-close-bidder-trust',
  title: "Running a Timed Online Auction: Reserves, End Times, and Bidder Trust",
  metaDescription: "Practical setup advice for timed online auctions: start prices, reserves, bid increments, staggered end times, and the fees bidders should see up front.",
  publishDate: '2026-10-23',
  category: 'guides',
  readingTimeMinutes: 6,
  excerpt: "A timed online auction lives or dies on a handful of settings: start price, reserve, increment, and when each lot closes. Here's how to set them so bidders stay engaged and the results hold up.",
  body: `## The settings do more work than the catalog

Auctioneers already know that a good catalog brings people in. What keeps them bidding is quieter: how each lot is priced to start, whether there is a floor under it, how far each bid has to move, and what happens in the last few minutes. Get those right and a timed online auction runs itself through closing night. Get them wrong and you either give away good lots or watch bidders lose interest halfway through the week.

Here is how to think through each one, whether you run a full auction company, a storage unit sale, or a one-time collection that is better sold by bidding than by price tag.

## Start low, protect the lots that matter

A low opening bid draws early activity, and early activity is what gets a lot onto watch lists. Most lots in a mixed sale can safely open low because competition will carry them.

The exceptions are lots where you or your client has a real number in mind: a piece of furniture with a known market, a signed item, a full set. Those get a reserve. A reserve lets the lot open at an inviting price while still guaranteeing it will not sell below the floor. If bidding stops short, the lot closes unsold and you decide what to do next, instead of honoring a price nobody wanted.

A few practical rules:

- Use reserves sparingly. A catalog where every lot has one reads as cautious, and bidders can tell.
- Set the reserve at the lowest price you would genuinely accept, not the price you hope for.
- Tell consignors and family clients in advance which lots have reserves and why.

## Pick increments that match the price range

The bid increment is the minimum amount each new bid has to add. One dollar is fine on a box lot. On a lot heading toward a few hundred dollars, a one dollar increment turns the last hour into a slow crawl of tiny raises. A larger increment on higher-value lots keeps the bidding moving and reduces the number of near-identical bids.

## Stagger end times and plan for the last five minutes

If every lot closes at the same minute, bidders have to choose which lots to fight for and the rest close quietly. Staggering end times, even a minute or two apart down the catalog, lets people follow the action from lot to lot.

The other closing-night problem is sniping: a bid placed in the final seconds so nobody can respond. It feels unfair to the bidders who were there all week, and it usually leaves money on the table. The common fix is a soft close, where a late bid pushes the end time back so others get a real chance to answer.

## Be upfront about fees and pickup

Bidders who feel surprised at checkout do not come back. Before the auction opens, make these easy to find:

- Any buyer's premium and exactly how it is calculated
- Payment deadline after the auction closes
- Pickup dates, times, and whether you ship or not
- Condition notes for anything with damage, missing parts, or repairs

Clear photos from more than one angle do as much for trust as any written policy. A crack that shows up in the listing photo is a disclosure. The same crack discovered at pickup is a dispute.

## How FindA.Sale handles a timed auction

Auctions are one of the sale types you can choose when creating a sale on FindA.Sale, alongside estate sales, yard sales, flea markets, and retail storefronts. For each auction item you can set:

- A starting price
- An optional reserve price. If the high bid does not meet it, the lot closes without a sale and no one is charged.
- A bid increment
- Its own end time, so you can stagger closings down the catalog

Bidders enter the most they are willing to pay, and the system bids for them in increments up to that amount, so they do not have to sit at a screen all week. When a bid lands in the final five minutes, the lot extends by five minutes. Bidders get notified when they are outbid and when they win, and winners are sent to checkout to pay.

Auctions carry a 5% buyer's premium set by FindA.Sale and paid by the winning bidder on top of the hammer price. It is shown to bidders before they bid. If you would rather your winners pay exactly their bid, you can turn on the option to cover the premium yourself, and it comes out of your payout instead.

Your own fee on auction sales is the same one that applies to every sale: on the free SIMPLE plan, 9.5% for online sales such as auction wins, with card processing included and a $0.75 minimum per transaction. On a $200 winning bid, the bidder pays $210, your fee is $19.00, and you receive $181.00. PRO ($29 a month) lowers the online rate to 7.5% and adds Fraud Signals, which flags bidding patterns worth a second look, such as rapid-fire bids or a pattern of cancelled bids.

On the shopper side, auctions show up in city-level auction listings and in regular sale search, so bidders who have never heard of your company can still find the sale.

## The short version

Open most lots low. Put reserves only where they matter. Size increments to the price. Stagger closings and let late bids extend the clock. Tell bidders every fee before they bid. Those choices do more for a timed auction's results than any amount of promotion, and they are the same choices whether the catalog has thirty lots or three hundred.

finda.sale is free to try.`,
};
