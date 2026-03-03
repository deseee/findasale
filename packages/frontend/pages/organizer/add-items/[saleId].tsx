import React, { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../../../lib/api';
import { useToast } from '../../../components/ToastContext';

// Zod schema for form validation
const itemSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  price: z.string().optional(),
  auctionStartPrice: z.string().optional(),
  bidIncrement: z.string().optional(),
  auctionEndTime: z.string().optional(),
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'AUCTION_ENDED']),
  isAuctionItem: z.boolean(),
  photoUrls: z.array(z.string()).optional(),
});

type ItemFormData = z.infer<typeof itemSchema>;

// Helper function to convert datetime-local value to ISO string
const toISOStringFromDatetimeLocal = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    console.error('Invalid date value:', value);
    return undefined;
  }
  return date.toISOString(); // e.g., "2026-02-26T10:00:00.000Z"
};

interface Sale {
  id: string;
  title: string;
  organizerId: string;
}

interface Item {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  auctionStartPrice: number | null;
  status: string;
  photoUrls: string[];
}

const AddItemsPage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photoFiles.length > 5) {
      showToast('Maximum 5 photos per item', 'error');
      return;
    }
    setPhotoFiles(prev => [...prev, ...files]);
    setPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Fetch sale details
  const { data: sale, isLoading: saleLoading, isError: saleError } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('No sale ID provided');
      const response = await api.get(`/sales/${saleId}`);
      return response.data as Sale;
    },
    enabled: !!saleId,
  });

  // Fetch items for this sale
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data as Item[];
    },
    enabled: !!saleId,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      title: '',
      description: '',
      price: '',
      auctionStartPrice: '',
      bidIncrement: '1',
      auctionEndTime: '',
      status: 'AVAILABLE',
      isAuctionItem: false,
    },
  });

  const isAuctionItem = watch('isAuctionItem');

  const addPhotoUrl = () => {
    if (photoUrl.trim()) {
      setPhotoUrls([...photoUrls, photoUrl.trim()]);
      setPhotoUrl('');
    }
  };

  const removePhotoUrl = (index: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: ItemFormData) => {
    try {
      // Upload photos to Cloudinary first if any selected
      let uploadedPhotoUrls: string[] = [];
      if (photoFiles.length > 0) {
        setUploadingPhotos(true);
        const uploadForm = new FormData();
        photoFiles.forEach(f => uploadForm.append('photos', f));
        const uploadRes = await api.post('/upload/sale-photos', uploadForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedPhotoUrls = uploadRes.data.urls;
        setUploadingPhotos(false);
      }

      // Build base item data
      const itemData: Record<string, any> = {
        saleId: saleId as string,
        title: data.title,
        description: data.description || '',
        status: data.status,
        photoUrls: uploadedPhotoUrls,
      };

      // Handle auction vs fixed price
      if (data.isAuctionItem) {
        // Only send auction fields if they have values (backend may require them)
        if (data.auctionStartPrice) {
          itemData.auctionStartPrice = parseFloat(data.auctionStartPrice);
        }
        if (data.bidIncrement) {
          itemData.bidIncrement = parseFloat(data.bidIncrement);
        }
        // Convert datetime-local string to ISO string for Prisma, only if provided and valid
        const isoDate = toISOStringFromDatetimeLocal(data.auctionEndTime);
        if (isoDate) {
          itemData.auctionEndTime = isoDate;
        }
        // If auctionEndTime is empty or invalid, do NOT send the field at all (omit it)
      } else {
        if (data.price) {
          itemData.price = parseFloat(data.price);
        }
      }

      // Remove undefined or null values to avoid Prisma validation issues
      Object.keys(itemData).forEach(key => {
        if (itemData[key] === undefined || itemData[key] === null) {
          delete itemData[key];
        }
      });

      await api.post('/items', itemData);
      
      // Refresh items list
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      
      // Reset form
      reset();
      setPhotoFiles([]);
      setPhotoPreviews([]);
    } catch (error: any) {
      console.error('Error creating item:', error);
      showToast(error.response?.data?.message || 'Failed to create item', 'error');
    }
  };

  if (saleLoading) return <div className="min-h-screen flex items-center justify-center">Loading sale details...</div>;
  if (saleError) return <div className="min-h-screen flex items-center justify-center">Error loading sale</div>;
  if (!sale && saleId) return <div className="min-h-screen flex items-center justify-center">Sale not found</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Add Items - FindA.Sale</title>
        <meta name="description" content="Add items to your sale" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Add Items to "{sale?.title}"</h1>
          <div className="flex space-x-4">
            <Link 
              href={`/sales/${saleId}`} 
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              View Sale
            </Link>
            <Link 
              href="/organizer/dashboard" 
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Item Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-6">Add New Item</h2>
              
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Item Title *
                  </label>
                  <input
                    id="title"
                    {...register('title')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                  {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    {...register('description')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>

                <div className="flex items-center mb-4">
                  <input
                    id="isAuctionItem"
                    type="checkbox"
                    {...register('isAuctionItem')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isAuctionItem" className="ml-2 block text-sm text-gray-900">
                    This is an auction item
                  </label>
                </div>

                {!isAuctionItem ? (
                  <div>
                    <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                      Price ($)
                    </label>
                    <input
                      id="price"
                      type="number"
                      step="0.01"
                      {...register('price')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="auctionStartPrice" className="block text-sm font-medium text-gray-700 mb-1">
                        Starting Price ($)
                      </label>
                      <input
                        id="auctionStartPrice"
                        type="number"
                        step="0.01"
                        {...register('auctionStartPrice')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="bidIncrement" className="block text-sm font-medium text-gray-700 mb-1">
                        Bid Increment ($)
                      </label>
                      <input
                        id="bidIncrement"
                        type="number"
                        step="0.01"
                        {...register('bidIncrement')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="auctionEndTime" className="block text-sm font-medium text-gray-700 mb-1">
                        Auction End Time (Optional)
                      </label>
                      <input
                        id="auctionEndTime"
                        type="datetime-local"
                        {...register('auctionEndTime')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    id="status"
                    {...register('status')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="SOLD">Sold</option>
                    <option value="RESERVED">Reserved</option>
                    <option value="AUCTION_ENDED">Auction Ended</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Item Photos <span className="text-gray-400 font-normal">(up to 5, max 15 MB each)</span>
                  </label>
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-500">Click to upload photos</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </div>
                  {photoPreviews.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {photoPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <img src={src} alt={`Item photo preview ${i + 1}`} className="w-full h-16 object-cover rounded border border-gray-200" />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting || uploadingPhotos}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                  >
                    {uploadingPhotos ? 'Uploading photos...' : isSubmitting ? 'Adding...' : 'Add Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Existing Items List */}
          <div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Existing Items</h2>
                <Link 
                  href={`/organizer/add-items/${saleId}`} 
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Refresh
                </Link>
              </div>
              
              {itemsLoading ? (
                <p>Loading items...</p>
              ) : items.length === 0 ? (
                <p className="text-gray-600">No items added yet.</p>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4">
                      <div className="flex justify-between">
                        <h3 className="font-bold text-lg">{item.title}</h3>
                        <Link 
                          href={`/organizer/edit-item/${item.id}`} 
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </Link>
                      </div>
                      <p className="text-gray-600 text-sm mt-1">
                        {item.description?.substring(0, 100)}{item.description && item.description.length > 100 ? '...' : ''}
                      </p>
                      <div className="mt-2 flex justify-between items-center">
                        <span className="font-bold text-blue-600">
                          {item.price ? `$${item.price}` : 
                           item.auctionStartPrice ? `Start: $${item.auctionStartPrice}` : 
                           'Price not set'}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                          item.status === 'SOLD' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </div>
                      {item.photoUrls.length > 0 && (
                        <div className="mt-2">
                          <img 
                            src={item.photoUrls[0]} 
                            alt={item.title} 
                            className="w-full h-32 object-cover rounded"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AddItemsPage;
