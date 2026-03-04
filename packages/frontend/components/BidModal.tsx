import { useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface Item {
  id: string;
  title: string;
  currentBid: number | null;
  auctionStartPrice: number | null;
  bidIncrement: number | null;
}

interface Props {
  item: Item;
  onClose: () => void;
  onBidPlaced: (newBid: number) => void;
}

const BidModal = ({ item, onClose, onBidPlaced }: Props) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const minBid = item.currentBid !== null && item.currentBid !== undefined
    ? item.currentBid + (item.bidIncrement ?? 1)
    : (item.auctionStartPrice ?? 1);

  const [amount, setAmount] = useState(minBid.toFixed(2));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bid = parseFloat(amount);
    if (isNaN(bid) || bid < minBid) {
      showToast(`Minimum bid is $${minBid.toFixed(2)}`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/items/${item.id}/bid`, { amount: bid });
      showToast(`Bid of $${bid.toFixed(2)} placed!`, 'success');
      onBidPlaced(bid);
      onClose();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to place bid', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-warm-900 mb-1">Place a Bid</h2>
        <p className="text-sm text-warm-500 mb-4 line-clamp-2">{item.title}</p>

        <div className="flex justify-between text-sm text-warm-600 mb-4">
          <span>
            Current bid:{' '}
            <strong>
              {item.currentBid !== null && item.currentBid !== undefined
                ? `$${Number(item.currentBid).toFixed(2)}`
                : '—'}
            </strong>
          </span>
          <span>
            Min next bid: <strong className="text-amber-600">${minBid.toFixed(2)}</strong>
          </span>
        </div>

        {!user ? (
          <p className="text-center text-sm text-warm-500 py-4">
            Please <a href="/login" className="text-amber-600 underline">log in</a> to place a bid.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-warm-700 mb-1">
                Your bid ($)
              </label>
              <input
                type="number"
                step="0.01"
                min={minBid}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full border border-warm-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-warm-300 rounded-lg text-warm-700 hover:bg-warm-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {submitting ? 'Placing…' : 'Place Bid'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BidModal;
