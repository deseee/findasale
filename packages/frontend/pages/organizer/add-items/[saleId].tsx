import { useState } from 'react';
import Head from 'next/head';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const itemSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  category: z.string(),
  estimatedValue: z.number().positive('Value must be positive'),
});

type ItemFormData = z.infer<typeof itemSchema>;

interface ExistingItem {
  id: string;
  title: string;
  estimatedValue: number;
  photoUrl?: string;
}

export default function AddItemsSaleIdPage() {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ItemFormData>();
  const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data: ItemFormData) => {
    setSubmitting(true);
    try {
      // Submit item
      console.log('Adding item:', data);
      reset();
    } catch (error) {
      console.error('Error adding item:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Add Items to Sale — FindA.Sale Organizer</title>
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Add Items to Sale</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Item Details</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  {...register('title')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Item title"
                />
                {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  {...register('description')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Item description"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  {...register('category')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Category"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value *</label>
                <input
                  {...register('estimatedValue', { valueAsNumber: true })}
                  type="number"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="$0.00"
                />
                {errors.estimatedValue && (
                  <p className="text-red-600 text-sm mt-1">{errors.estimatedValue.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {submitting ? 'Adding...' : 'Add Item'}
              </button>
            </form>
          </div>

          {/* Existing Items List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Items in This Sale</h2>
            {existingItems.length === 0 ? (
              <p className="text-gray-500">No items added yet. Use the form to add items.</p>
            ) : (
              <div className="space-y-4">
                {existingItems.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex gap-4">
                      {item.photoUrl && (
                        <img src={item.photoUrl} alt={item.title} className="w-16 h-16 object-cover rounded" />
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                        <p className="text-sm text-gray-600">Est. Value: ${item.estimatedValue}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
