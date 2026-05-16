export interface GuideEntry {
  slug: string;
  title: string;
  audience: 'organizer' | 'shopper' | 'both';
  format: 'written' | 'written+video' | 'written+explainer';
  priority: number;
  relatedGuides: string[];
  videoUrl?: string;
  body: string;
}

import rapidfire_mode from './entries/rapidfire-mode';
import lighting_and_framing from './entries/lighting-and-framing';
import when_to_retake from './entries/when-to-retake';
import multi_angle_photos from './entries/multi-angle-photos';
import photo_stations from './entries/photo-stations';
import photo_sessions_with_helpers from './entries/photo-sessions-with-helpers';
import review_queue from './entries/review-queue';
import pricing_items from './entries/pricing-items';
import condition_grades from './entries/condition-grades';
import categories_and_tags from './entries/categories-and-tags';
import edit_live_listing from './entries/edit-live-listing';
import rare_and_legendary from './entries/rare-and-legendary';
import where_to_post_flyers from './entries/where-to-post-flyers';
import promote_page from './entries/promote-page';
import yard_signs_and_qr_codes from './entries/yard-signs-and-qr-codes';
import brand_kit from './entries/brand-kit';
import send_sale_updates from './entries/send-sale-updates';
import share_cards from './entries/share-cards';
import holds_for_shoppers from './entries/holds-for-shoppers';
import condition_grades_for_shoppers from './entries/condition-grades-for-shoppers';
import bidding_on_auctions from './entries/bidding-on-auctions';
import trading_items from './entries/trading-items';
import pay_requests from './entries/pay-requests';
import loot_log from './entries/loot-log';
import find_sales_near_you from './entries/find-sales-near-you';
import wishlist_and_notifications from './entries/wishlist-and-notifications';
import follow_an_organizer from './entries/follow-an-organizer';
import browse_by_city from './entries/browse-by-city';
import trending_and_discovery_feed from './entries/trending-and-discovery-feed';
import sale_planner from './entries/sale-planner';
import organizer_reputation from './entries/organizer-reputation';
import refer_a_friend from './entries/refer-a-friend';
import introduce_an_organizer from './entries/introduce-an-organizer';
import build_organizer_reputation from './entries/build-organizer-reputation';
import affiliate_links from './entries/affiliate-links';
import ripples_page from './entries/ripples-page';
import disputes_and_refunds from './entries/disputes-and-refunds';
import run_the_pos from './entries/run-the-pos';
import settlement_and_payouts from './entries/settlement-and-payouts';
import line_queue from './entries/line-queue';
import message_templates from './entries/message-templates';
import treasure_trails_organizer from './entries/treasure-trails-organizer';
import manage_holds from './entries/manage-holds';
import color_rules from './entries/color-rules';
import discount_rules_and_markdowns from './entries/discount-rules-and-markdowns';
import print_inventory_sheets from './entries/print-inventory-sheets';
import label_composer from './entries/label-composer';
import onboard_a_consignor from './entries/onboard-a-consignor';
import list_items_on_ebay from './entries/list-items-on-ebay';
import connect_shopify from './entries/connect-shopify';
import webhooks_and_zapier from './entries/webhooks-and-zapier';
import community_appraisals from './entries/community-appraisals';
import bounties_organizer from './entries/bounties-organizer';
import flip_report from './entries/flip-report';
import create_your_first_sale from './entries/create-your-first-sale';
import pick_the_right_sale_type from './entries/pick-the-right-sale-type';
import schedule_and_visibility from './entries/schedule-and-visibility';
import multi_location_hubs from './entries/multi-location-hubs';
import shop_mode from './entries/shop-mode';
import set_up_your_account from './entries/set-up-your-account';
import connect_stripe from './entries/connect-stripe';
import choose_a_plan from './entries/choose-a-plan';
import add_staff from './entries/add-staff';
import connect_workspace from './entries/connect-workspace';
import hunt_pass from './entries/hunt-pass';
import how_ranks_work from './entries/how-ranks-work';
import earn_xp_for_free from './entries/earn-xp-for-free';
import rare_finds_and_early_access from './entries/rare-finds-and-early-access';
import achievements from './entries/achievements';
import streak_rewards from './entries/streak-rewards';
import loot_legend from './entries/loot-legend';
import post_a_haul from './entries/post-a-haul';
import crews from './entries/crews';
import treasure_trails_shopper from './entries/treasure-trails-shopper';
import bounties_shopper from './entries/bounties-shopper';
import leaderboard_and_league from './entries/leaderboard-and-league';

export const guides: GuideEntry[] = [
  rapidfire_mode,
  lighting_and_framing,
  when_to_retake,
  multi_angle_photos,
  photo_stations,
  photo_sessions_with_helpers,
  review_queue,
  pricing_items,
  condition_grades,
  categories_and_tags,
  edit_live_listing,
  rare_and_legendary,
  where_to_post_flyers,
  promote_page,
  yard_signs_and_qr_codes,
  brand_kit,
  send_sale_updates,
  share_cards,
  holds_for_shoppers,
  condition_grades_for_shoppers,
  bidding_on_auctions,
  trading_items,
  pay_requests,
  loot_log,
  find_sales_near_you,
  wishlist_and_notifications,
  follow_an_organizer,
  browse_by_city,
  trending_and_discovery_feed,
  sale_planner,
  organizer_reputation,
  refer_a_friend,
  introduce_an_organizer,
  build_organizer_reputation,
  affiliate_links,
  ripples_page,
  disputes_and_refunds,
  run_the_pos,
  settlement_and_payouts,
  line_queue,
  message_templates,
  treasure_trails_organizer,
  manage_holds,
  color_rules,
  discount_rules_and_markdowns,
  print_inventory_sheets,
  label_composer,
  onboard_a_consignor,
  list_items_on_ebay,
  connect_shopify,
  webhooks_and_zapier,
  community_appraisals,
  bounties_organizer,
  flip_report,
  create_your_first_sale,
  pick_the_right_sale_type,
  schedule_and_visibility,
  multi_location_hubs,
  shop_mode,
  set_up_your_account,
  connect_stripe,
  choose_a_plan,
  add_staff,
  connect_workspace,
  hunt_pass,
  how_ranks_work,
  earn_xp_for_free,
  rare_finds_and_early_access,
  achievements,
  streak_rewards,
  loot_legend,
  post_a_haul,
  crews,
  treasure_trails_shopper,
  bounties_shopper,
  leaderboard_and_league,
];

export function getGuideBySlug(slug: string): GuideEntry | undefined {
  return guides.find((g) => g.slug === slug);
}

export function getGuidesByAudience(
  audience: 'organizer' | 'shopper' | 'both'
): GuideEntry[] {
  return guides.filter(
    (g) => g.audience === audience || g.audience === 'both'
  );
}
