import { useState } from 'react';
import Head from 'next/head';
import axios from 'axios';

export default function AddItemsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoScans, setPhotoScans] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    estimatedValue: '',
    category: '',
  });
  const [loading, setLoading] = useState(false);

  // H2: AI photo scan using qwen3-vl:4b model
  const handlePhotoScan = async (file: File) => {
    if (photoScans.length >= 5) {
      alert('Maximum 5 photos allowed');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Analyze photo with AI
      const { data: analysis } = await axios.post('/api/analyze-photo', {
        imageUrl: data.url,
      });

      // Auto-fill form fields from analysis
      if (analysis.category) {
        setFormData((prev) => ({ ...prev, category: analysis.category }));
      }
      if (analysis.estimatedValue) {
        setFormData((prev) => ({
          ...prev,
          estimatedValue: analysis.estimatedValue.toString(),
        }));
      }
      if (analysis.description) {
        setFormData((prev) => ({
          ...prev,
          description: analysis.description,
        }));
      }

      setPhotoScans((prev) => [...prev, data.url]);
    } catch (error) {
      console.error('Photo scan failed:', error);
      alert('Failed to scan photo');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      handlePhotoScan(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Submit item with photos
    console.log('Submitting item:', { ...formData, photos: photoScans });
  };

  return (
    <>
      <Head>
        <title>Add Items — FindA.Sale Organizer</title>
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Add Items to Sale</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Photos (Max 5)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={photoScans.length >= 5}
                  className="hidden"
                  id="photoInput"
                />
                <label htmlFor="photoInput" className="cursor-pointer">
                  <p className="text-gray-600">Click to upload or drag and drop</p>
                  <p className="text-sm text-gray-500">{photoScans.length}/5 photos uploaded</p>
                </label>
              </div>

              {/* Photo previews */}
              <div className="flex gap-2 mt-4 flex-wrap">
                {photoScans.map((url, idx) => (
                  <div key={idx} className="relative">
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-20 h-20 object-cover rounded" />
                    <button
                      type="button"
                      onClick={() => setPhotoScans((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Item Details */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Item title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Item description"
                rows={4}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Category"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value</label>
              <input
                type="number"
                value={formData.estimatedValue}
                onChange={(e) => setFormData((prev) => ({ ...prev, estimatedValue: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="$0.00"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Processing...' : 'Add Item'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
