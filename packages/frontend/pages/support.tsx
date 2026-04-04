import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Fuse from 'fuse.js';
import styles from '../styles/support.module.css';

// FAQ Data — searchable via fuse.js
const FAQ_DATA = [
  // Billing FAQs
  {
    id: 'billing-1',
    category: 'Billing',
    question: 'How much does FindA.Sale cost?',
    answer:
      'FindA.Sale offers three tiers: SIMPLE (free, 10% platform fee), PRO ($29/month, 8% fee), and TEAMS ($79/month, 8% fee). Each tier includes different features for organizers. Shoppers always use FindA.Sale for free.',
  },
  {
    id: 'billing-2',
    category: 'Billing',
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards through Stripe. Billing is automatic and recurring.',
  },
  {
    id: 'billing-3',
    category: 'Billing',
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes, you can cancel your subscription at any time from your account settings. Cancellation takes effect at the end of your billing cycle.',
  },
  {
    id: 'billing-4',
    category: 'Billing',
    question: 'Do you offer refunds?',
    answer:
      'We offer a 30-day money-back guarantee for annual plans. Monthly subscriptions are non-refundable after purchase but can be cancelled anytime.',
  },
  {
    id: 'billing-5',
    category: 'Billing',
    question: 'Is there a discount for annual billing?',
    answer:
      'Yes! Choose the annual plan during signup and save 20% compared to monthly billing. You can also contact support for multi-year discounts.',
  },

  // Sales Management FAQs
  {
    id: 'sales-1',
    category: 'Sales Management',
    question: 'How do I list a new sale on FindA.Sale?',
    answer:
      'Go to your Dashboard and click "Create Sale". Fill in the sale details (title, date, location, category), add a description and photos, then publish. Your sale will appear in search results within 1 hour.',
  },
  {
    id: 'sales-2',
    category: 'Sales Management',
    question: 'How many items can I list per sale?',
    answer:
      'SIMPLE tier: unlimited items. PRO tier: add custom photos and descriptions. TEAMS tier: collaborate with team members on inventory management.',
  },
  {
    id: 'sales-3',
    category: 'Sales Management',
    question: 'Can I edit a sale after publishing?',
    answer:
      'Yes, you can edit all sale details until the sale date. After the sale ends, the page becomes read-only but remains visible for 30 days.',
  },
  {
    id: 'sales-4',
    category: 'Sales Management',
    question: 'How do I track attendance and sales performance?',
    answer:
      'PRO and TEAMS subscribers have access to the Command Center Dashboard, which shows real-time visitor counts, item views, questions, and sales metrics.',
  },
  {
    id: 'sales-5',
    category: 'Sales Management',
    question: 'What happens if I cancel my sale?',
    answer:
      'You can cancel a sale anytime from your Dashboard. Shoppers who RSVP will be notified, and the sale will be removed from search results within 10 minutes.',
  },

  // Shopper FAQs
  {
    id: 'shopper-1',
    category: 'Shopper FAQs',
    question: 'How do I find sales near me?',
    answer:
      'Use the Search page to filter by distance, category, and date. Turn on location services for the best results. You can also set preferred neighborhoods to get notified of new sales.',
  },
  {
    id: 'shopper-2',
    category: 'Shopper FAQs',
    question: 'Can I reserve items before the sale starts?',
    answer:
      'Yes, organizers can enable reservations (holds) for items. You can put items on hold from your Wishlist. Holds expire 24 hours after the sale starts.',
  },
  {
    id: 'shopper-3',
    category: 'Shopper FAQs',
    question: 'How do I get notifications about upcoming sales?',
    answer:
      'Create saved searches, follow organizers you like, and enable push notifications in your settings. You\'ll get alerts when new sales match your interests.',
  },
  {
    id: 'shopper-4',
    category: 'Shopper FAQs',
    question: 'What does the "Hype Meter" show?',
    answer:
      'The Hype Meter shows how many people are actively viewing a sale in real-time. A high hype meter means high competition — arrive early for popular items!',
  },
  {
    id: 'shopper-5',
    category: 'Shopper FAQs',
    question: 'Can I earn rewards as a shopper?',
    answer:
      'Yes! Every purchase earns you points toward rewards. Loyalty Passport members earn stamps at each sale. Refer friends to earn even more bonuses.',
  },

  // Technical FAQs
  {
    id: 'tech-1',
    category: 'Technical',
    question: 'What devices does FindA.Sale work on?',
    answer:
      'FindA.Sale is a Progressive Web App (PWA) that works on all smartphones, tablets, and desktop browsers. Install it to your home screen for app-like performance.',
  },
  {
    id: 'tech-2',
    category: 'Technical',
    question: 'Does FindA.Sale work offline?',
    answer:
      'Yes, you can search sales and view saved items offline. New data syncs automatically when you reconnect to the internet.',
  },
  {
    id: 'tech-3',
    category: 'Technical',
    question: 'How do I report a bug or suggest a feature?',
    answer:
      'Use the Feedback button in the app or contact support@finda.sale. We read every suggestion and prioritize based on community demand.',
  },
  {
    id: 'tech-4',
    category: 'Technical',
    question: 'Is my data secure on FindA.Sale?',
    answer:
      'Yes, we use industry-standard encryption (HTTPS), secure password hashing, and follow GDPR privacy standards. Your data is never sold to third parties.',
  },
  {
    id: 'tech-5',
    category: 'Technical',
    question: 'How do I delete my account?',
    answer:
      'Go to Settings > Account > Delete Account. Your account will be permanently deleted within 30 days. Historical transactions are preserved for legal compliance.',
  },
];

interface User {
  id: string;
  name: string;
  email: string;
  roleSubscriptions: Array<{
    role: string;
    subscriptionTier: string;
  }>;
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
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        }
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

  const categories = ['Billing', 'Sales Management', 'Shopper FAQs', 'Technical'];

  // Check if user has PRO/TEAMS tier
  const hasProOrTeams = user?.roleSubscriptions.some(
    (sub) => sub.subscriptionTier === 'PRO' || sub.subscriptionTier === 'TEAMS'
  );

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
                <p>Chat with our AI-powered support team to get answers fast.</p>
                <p className={styles.upgradeNotice}>Available for PRO and TEAMS subscribers</p>
                <button
                  className={styles.upgradeButton}
                  onClick={() => router.push('/account/billing')}
                >
                  Upgrade Now
                </button>
              </div>
            )}

            {/* Community Forum Link for TEAMS */}
            {user?.roleSubscriptions.some((sub) => sub.subscriptionTier === 'TEAMS') && (
              <div className={styles.communityLink}>
                <h4>Community Forum</h4>
                <p>Connect with other TEAMS members and share best practices.</p>
                <a href="#" className={styles.forumLink}>
                  Join Community Forum →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Support;
