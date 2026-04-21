import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Fuse from 'fuse.js';
import api from '../lib/api';
import styles from '../styles/support.module.css';

// FAQ Data — searchable via fuse.js
const FAQ_DATA = [
  // Getting Started FAQs
  {
    id: 'getting-started-1',
    category: 'Getting Started',
    question: 'How do I set up payments before my first sale?',
    answer:
      'Before you can receive payments, you\'ll need to connect a Stripe account. From your Dashboard, click Setup Payments and follow the short onboarding flow. Stripe will verify your identity and bank account — this usually takes a few minutes. Once connected, your share of each sale deposits to your bank account within 2 business days. You only need to do this once.',
  },
  {
    id: 'getting-started-2',
    category: 'Getting Started',
    question: 'What is the platform fee and how is it calculated?',
    answer:
      'FindA.Sale charges a flat 10% platform fee on each completed purchase. If an item sells for $100, we keep $10 and you receive $90 (minus any Stripe payment processing fee, typically 2.9% + $0.30). There are no listing fees, no monthly fees on SIMPLE, and no per-photo charges. PRO and TEAMS plans reduce the fee to 8%.',
  },
  {
    id: 'getting-started-3',
    category: 'Getting Started',
    question: 'Can I run a sale without setting up Stripe first?',
    answer:
      'You can create and preview a sale without connecting Stripe, but the sale cannot go live and accept payments until your Stripe account is verified. We recommend completing Stripe onboarding before you start building your inventory so there\'s no delay when you\'re ready to publish.',
  },

  // Sales Management FAQs
  {
    id: 'sales-1',
    category: 'Sales Management',
    question: 'What\'s the difference between a Draft, a Hidden sale, and a Published sale?',
    answer:
      'These are three distinct states that control who can see your sale. Draft — Your sale exists in your dashboard but is completely invisible to shoppers and search. Nothing is public. Use this while you\'re still building your inventory. Published — Your sale is live. It appears in search results, on the map, and can be found by shoppers. Items can be purchased. Hidden — Your sale is published (items can still be accessed and purchased by anyone with the direct link) but it does not appear in public search results or on the map. Use this when you want to soft-launch a preview for select shoppers before going fully public.',
  },
  {
    id: 'sales-2',
    category: 'Sales Management',
    question: 'How do I publish or hide a sale?',
    answer:
      'From your Dashboard, click into your sale and look for the Publish / Unpublish toggle. Published sales show a green "LIVE" badge. To hide a published sale from search without taking it fully offline, use the Hide from Search option in your sale settings.',
  },
  {
    id: 'sales-3',
    category: 'Sales Management',
    question: 'Can I schedule a sale to go live automatically?',
    answer:
      'Yes. When creating your sale, set the sale start date and time. You can pre-schedule the listing to appear in search results a set number of days before the sale starts — shoppers can see it, favorite it, and hold items before the doors open. The exact lead time is configurable per sale.',
  },
  {
    id: 'sales-4',
    category: 'Sales Management',
    question: 'How do I cancel a sale?',
    answer:
      'Go to your sale\'s settings and click Cancel Sale. Shoppers who have RSVP\'d or placed holds will be notified automatically. Any pending purchases that haven\'t been confirmed will be refunded. The sale page will be removed from search results within 10 minutes. Completed purchases are not affected.',
  },
  {
    id: 'sales-5',
    category: 'Sales Management',
    question: 'Can I edit a sale after it\'s published?',
    answer:
      'Yes — you can edit the sale title, description, dates, address, and photos at any time before the sale ends. Item prices, descriptions, and photos can be edited at any time. After the sale end date, the page becomes read-only but stays visible for 30 days so shoppers can reference what sold.',
  },

  // Item Management FAQs
  {
    id: 'item-mgmt-1',
    category: 'Item Management',
    question: 'What do the item status options mean — Available, Sold, and Unavailable?',
    answer:
      'These three statuses control whether an item can be purchased, but they are separate from whether the item is visible to shoppers. Available — The item is for sale. Shoppers can view it, favorite it, hold it (if holds are enabled), and purchase it online. Sold — The item has been sold. This could mean it was purchased through FindA.Sale, or you\'ve manually marked it sold (for in-person sales). Sold items remain visible on your sale page as a record of what sold — shoppers can see them but cannot purchase. Unavailable — The item is temporarily not purchasable online. Shoppers can still see the listing but cannot buy it or place a hold. Use this when an item is being held for an offline buyer, is under dispute, or you\'re pulling it briefly for any reason without wanting to delete or mark it sold.',
  },
  {
    id: 'item-mgmt-2',
    category: 'Item Management',
    question: 'What\'s the difference between marking an item Unavailable and Unpublishing it?',
    answer:
      'Great question — these look similar but do different things. Unpublishing (setting an item back to Draft) hides the item completely. Shoppers cannot see it at all. The item disappears from your public sale listing. Marking Unavailable keeps the item visible to shoppers — they can see the photo, title, and description — but removes the ability to purchase or hold it. Think of "unavailable" as a soft pause and "unpublish" as a full removal from view. For a quick offline hold, use Unavailable. For a photo that needs to be retaken or a listing you\'re not ready to show, use Unpublish.',
  },
  {
    id: 'item-mgmt-3',
    category: 'Item Management',
    question: 'What is Pending Review and when does it appear?',
    answer:
      'Items captured via Rapid Capture (the rapid-fire photo mode) enter a Pending Review state automatically. This means the system has analyzed the photo and generated a suggested title, description, category, and tags — but you haven\'t confirmed them yet. The item is in your inventory but is not visible to shoppers. Once you review and approve the Auto Tag suggestions on the Review page, the item moves to Published.',
  },
  {
    id: 'item-mgmt-4',
    category: 'Item Management',
    question: 'How do I add items to my sale?',
    answer:
      'You have three ways to add items: 1. Manual add — Click Add Item in your sale and fill in the details yourself. 2. Camera / Rapid Capture — Photograph items one by one (regular mode) or in rapid-fire mode. Auto Tags suggests titles, descriptions, categories, and tags from each photo. You review in batches on the Review page. 3. Bulk import — Upload a CSV with item data for larger inventory sets (PRO/TEAMS).',
  },
  {
    id: 'item-mgmt-5',
    category: 'Item Management',
    question: 'How does Auto Tags work?',
    answer:
      'When you take a photo or upload an image, FindA.Sale\'s system analyzes the visual content and generates a suggested title, description, category, and tags. You\'ll see these suggestions on the review screen. You can accept them as-is, edit any field, or dismiss and start fresh. You stay in control — Auto Tags gives you a first draft, not a final listing. This feature saves significant time on large inventories where writing every description manually isn\'t practical.',
  },
  {
    id: 'item-mgmt-6',
    category: 'Item Management',
    question: 'How many photos can I add per item?',
    answer:
      'Up to 5 photos per item. The first photo is the primary thumbnail that appears in search results. Additional photos give shoppers more detail — recommended for high-value, collectible, or condition-sensitive items.',
  },
  {
    id: 'item-mgmt-7',
    category: 'Item Management',
    question: 'How do I bulk edit or delete items?',
    answer:
      'From your sale\'s item list, check the boxes next to multiple items to select them. The bulk action bar appears at the top — use it to change status, delete, move items between sales, or export selected items. Bulk operations are available on PRO and TEAMS plans.',
  },

  // Photos & Rapid Capture FAQs
  {
    id: 'photos-1',
    category: 'Photos & Rapid Capture',
    question: 'What is Rapid Capture mode?',
    answer:
      'Rapid Capture is a high-speed photo workflow designed for large inventories. Open your camera in Rapid Capture mode and photograph items one after another without stopping to fill in details. Our system analyzes each photo in the background. When you\'re done shooting, go to the Review page and confirm, edit, or dismiss the Auto Tag suggestions in bulk. This is the fastest way to get 50+ items online quickly.',
  },
  {
    id: 'photos-2',
    category: 'Photos & Rapid Capture',
    question: 'How do I use the inline camera on the edit page?',
    answer:
      'On any item\'s edit page, the photo section has three buttons: 📁 (upload from files), 📷 (regular camera), and ⚡ (rapid capture). Tap either camera button to open the camera inline — photos you take are added directly to that item without leaving the page. No need to go to a separate add-items flow for existing items.',
  },
  {
    id: 'photos-3',
    category: 'Photos & Rapid Capture',
    question: 'What makes a good item photo?',
    answer:
      'Good lighting and a plain background help Auto Tags give better suggestions and help shoppers make decisions. For sellable items: shoot in natural daylight if possible, place the item against a neutral surface (floor, table, wall), and photograph from a slight angle to show dimension. For condition-sensitive items, include close-ups of any wear or damage — shoppers appreciate honesty and it reduces disputes.',
  },

  // Holds & Reservations FAQs
  {
    id: 'holds-1',
    category: 'Holds & Reservations',
    question: 'How do I enable holds for my sale?',
    answer:
      'In your sale settings, toggle on Allow Holds. When enabled, shoppers can request to hold items from their Wishlist or item detail page. You\'ll receive a notification to accept or decline each request. Holds you accept are marked on the item listing so other shoppers can see it\'s spoken for.',
  },
  {
    id: 'holds-2',
    category: 'Holds & Reservations',
    question: 'How long do holds last?',
    answer:
      'By default, accepted holds expire 24 hours after the sale opens. You can customize the hold duration in your sale settings. If a shopper doesn\'t complete their purchase within the hold window, the item becomes available again automatically.',
  },
  {
    id: 'holds-3',
    category: 'Holds & Reservations',
    question: 'Can I cancel a hold I already accepted?',
    answer:
      'Yes. From your Dashboard, go to the sale\'s Holds section. Find the hold and click Cancel Hold. The shopper is notified that the hold has been released. The item status returns to Available automatically.',
  },

  // Print Kit & QR Codes FAQs
  {
    id: 'print-kit-1',
    category: 'Print Kit & QR Codes',
    question: 'What is the Print Kit?',
    answer:
      'The Print Kit generates printable materials for your sale: Avery-style label stickers for each item (with QR codes that link directly to the item listing), a price sheet / cheat sheet for quick reference, and promotional signage. Access it from your sale\'s dashboard under Print Kit.',
  },
  {
    id: 'print-kit-2',
    category: 'Print Kit & QR Codes',
    question: 'How do I use QR stickers at my sale?',
    answer:
      'Print the item sticker sheet, cut the labels, and stick them on each item. When a shopper scans a sticker with their phone camera, they\'re taken directly to that item\'s listing where they can view details, check pricing, and purchase online. QR stickers make it easy for shoppers to self-serve on pricing and avoid crowding you with questions.',
  },

  // Analytics & Command Center FAQs
  {
    id: 'analytics-1',
    category: 'Analytics & Command Center',
    question: 'How do I see how many people are viewing my sale?',
    answer:
      'The Hype Meter shows real-time viewer count on your live sale page — you can see it from the sale detail page. PRO and TEAMS subscribers have full analytics in the Command Center Dashboard: visit counts, item view rankings, hold rates, purchase conversion, and revenue over time.',
  },
  {
    id: 'analytics-2',
    category: 'Analytics & Command Center',
    question: 'What is the Command Center?',
    answer:
      'The Command Center is a real-time operations dashboard available to TEAMS subscribers. It gives you a live view across all your active sales — track items, holds, messages, purchases, and performance metrics in one place. Useful for estate sale companies running multiple concurrent sales or teams managing large inventories together.',
  },
  {
    id: 'analytics-3',
    category: 'Analytics & Command Center',
    question: 'Can I export my sales data?',
    answer:
      'Yes. From your sale dashboard, click Export to download a CSV of your full inventory including titles, descriptions, prices, categories, tags, and sold status. Useful for accounting, record-keeping, or importing into other systems.',
  },

  // Teams & Permissions FAQs
  {
    id: 'teams-1',
    category: 'Teams & Permissions',
    question: 'How do I add team members to my sale?',
    answer:
      'On a TEAMS plan, go to Team Members and invite by email. You can assign roles: Admin (manage team & settings), Manager (assign tasks, approve work), Member (view inventory, process sales), or Viewer (read-only for accountants, executors, or family). Team members log in with their own accounts — no shared passwords needed.',
  },
  {
    id: 'teams-2',
    category: 'Teams & Permissions',
    question: 'Can team members work on multiple sales at once?',
    answer:
      'Yes. Team members you\'ve added can access all sales in your workspace. The Command Center lets you and your team see everything happening across all active sales simultaneously.',
  },

  // Integrations & Webhooks FAQs
  {
    id: 'pos-hardware-1',
    category: 'In-Person Payments',
    question: 'Can I use a physical card reader at my sale?',
    answer:
      'Yes. FindA.Sale\'s POS works with Stripe Terminal card readers. The most popular option for estate sales and yard sales is the Stripe Reader M2 (~$59) — a compact Bluetooth reader that accepts chip cards and contactless payments (Apple Pay, Google Pay, tap cards). Order from stripe.com/terminal. Once it arrives, pair it via Bluetooth and it will appear as a payment option inside your FindA.Sale POS cart. Your Stripe account must be fully onboarded before card readers will process payments.',
  },
  {
    id: 'pos-hardware-2',
    category: 'In-Person Payments',
    question: 'Do I need to buy hardware to accept cards in person?',
    answer:
      'No — if you have a supported iPhone or Android device, you can use Tap to Pay directly in the FindA.Sale POS without any extra hardware. Tap to Pay turns your phone into a contactless card reader and accepts Apple Pay, Google Pay, and contactless cards. It\'s a good option for organizers who run one or two sales a year and don\'t want to invest in a dedicated reader. For higher-volume events, the Stripe Reader M2 (~$59) is more ergonomic and also supports chip and swipe in addition to tap.',
  },
  {
    id: 'integrations-1',
    category: 'Integrations & Webhooks',
    question: 'How do I connect FindA.Sale to Zapier?',
    answer:
      'Go to Settings → Webhooks and add your Zapier webhook URL. Select which events should fire the Zap (purchase completed, sale published, auction won, hold accepted, etc.). Use Zapier to log sales to Google Sheets, send notification emails, post to Facebook, update a CRM, or any other automation you need. Full event list is on your Webhooks settings page.',
  },
  {
    id: 'integrations-2',
    category: 'Integrations & Webhooks',
    question: 'Does FindA.Sale have an API?',
    answer:
      'A public API is available to GRANDMASTER rank users and TEAMS plan subscribers. It allows read access to your sale and inventory data for custom integrations. Contact support for API documentation and credentials.',
  },
];

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  organizer?: {
    subscriptionTier: string;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const Support: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [remainingRequests, setRemainingRequests] = useState(20);

  // Fetch user on mount
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get('/users/me');
        setUser(res.data);
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  // Fuse.js search setup
  const fuse = useMemo(() => {
    return new Fuse(FAQ_DATA, {
      keys: ['question', 'answer', 'category'],
      threshold: 0.3,
      includeScore: true,
    });
  }, []);

  // Filter FAQ based on search and category
  const filteredFAQ = useMemo(() => {
    let results = FAQ_DATA;

    if (selectedCategory) {
      results = results.filter((item) => item.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const searchResults = fuse.search(searchQuery);
      results = searchResults.map((result) => result.item);
    }

    return results;
  }, [searchQuery, selectedCategory, fuse]);

  const categories = [
    'Getting Started',
    'Sales Management',
    'Item Management',
    'Photos & Rapid Capture',
    'Holds & Reservations',
    'Print Kit & QR Codes',
    'Analytics & Command Center',
    'Teams & Permissions',
    'Integrations & Webhooks',
  ];

  // Check if user has PRO/TEAMS tier (or is admin)
  const hasProOrTeams =
    user?.role === 'ADMIN' ||
    user?.organizer?.subscriptionTier === 'PRO' ||
    user?.organizer?.subscriptionTier === 'TEAMS';

  // Handle chat message submit
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);
    setChatError('');

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: chatInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setChatError('Chat is available for PRO and TEAMS tiers only.');
        } else if (res.status === 429) {
          setChatError('Daily chat limit reached (20 requests). Try again tomorrow.');
        } else {
          setChatError(data.message || 'Failed to get response');
        }
        return;
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: data.timestamp,
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
      setRemainingRequests(data.remainingRequests || 20);
    } catch (error) {
      console.error('Chat error:', error);
      setChatError('Failed to send message. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.container}>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Support — FindA.Sale</title>
        <meta name="description" content="FindA.Sale Support — FAQs and Chat" />
      </Head>

      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Support & Help</h1>
          <p>Browse our FAQ or chat with our support team</p>
        </div>

        <div className={styles.content}>
          {/* FAQ Section */}
          <div className={styles.faqSection}>
            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="Search FAQ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.categoryFilter}>
              <button
                className={`${styles.categoryButton} ${selectedCategory === null ? styles.active : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.categoryButton} ${selectedCategory === cat ? styles.active : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className={styles.faqList}>
              {filteredFAQ.length === 0 ? (
                <p className={styles.noResults}>No FAQ items found. Try a different search.</p>
              ) : (
                filteredFAQ.map((item) => (
                  <div key={item.id} className={styles.faqItem}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                    <span className={styles.categoryBadge}>{item.category}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Section */}
          <div className={styles.chatSection}>
            {hasProOrTeams ? (
              <>
                {!showChat ? (
                  <button className={styles.chatToggle} onClick={() => setShowChat(true)}>
                    💬 Chat with Support
                  </button>
                ) : (
                  <div className={styles.chatWidget}>
                    <div className={styles.chatHeader}>
                      <h3>Support Chat</h3>
                      <button onClick={() => setShowChat(false)} className={styles.closeChat}>
                        ✕
                      </button>
                    </div>

                    <div className={styles.chatMessages}>
                      {chatMessages.length === 0 ? (
                        <p className={styles.chatWelcome}>
                          Welcome! How can we help you today?
                        </p>
                      ) : (
                        chatMessages.map((msg) => (
                          <div key={msg.id} className={`${styles.chatMessage} ${styles[msg.role]}`}>
                            <p>{msg.content}</p>
                          </div>
                        ))
                      )}
                      {chatLoading && <div className={styles.chatSpinner}>Thinking...</div>}
                    </div>

                    {chatError && <div className={styles.chatError}>{chatError}</div>}

                    <div className={styles.chatFooter}>
                      <p className={styles.requestsLeft}>
                        {remainingRequests} requests left today
                      </p>
                      <form onSubmit={handleChatSubmit} className={styles.chatForm}>
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type your question..."
                          disabled={chatLoading}
                          className={styles.chatInput}
                        />
                        <button
                          type="submit"
                          disabled={chatLoading || !chatInput.trim()}
                          className={styles.chatSubmit}
                        >
                          Send
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.upgradePrompt}>
                <h3>Chat Support</h3>
                <p>Chat with our support team to get answers fast.</p>
                <p className={styles.upgradeNotice}>Available for PRO and TEAMS subscribers</p>
                <button
                  className={styles.upgradeButton}
                  onClick={() => router.push('/pricing')}
                >
                  Upgrade Now
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default Support;
