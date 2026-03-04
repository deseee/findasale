import { useState } from 'react';
import Head from 'next/head';
import axios from 'axios';

export default function CreateSalePage() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Geocoding via backend
  const handleGeocoding = async () => {
    if (!formData.address || !formData.city) {
      alert('Please enter address and city');
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post('/api/geocode', {
        address: `${formData.address}, ${formData.city}, ${formData.state}`,
      });

      setCoordinates(data);
    } catch (error) {
      console.error('Geocoding error:', error);
      alert('Failed to geocode address');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (files: FileList) => {
    const newPhotos = Array.from(files);
    setPhotos((prev) => [...prev, ...newPhotos]);

    // Upload each photo
    for (const file of newPhotos) {
      const photoFormData = new FormData();
      photoFormData.append('file', file);

      try {
        await axios.post('/api/upload', photoFormData);
      } catch (error) {
        console.error('Photo upload failed:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await axios.post('/api/sales', {
        ...formData,
        latitude: coordinates?.lat,
        longitude: coordinates?.lng,
        photoCount: photos.length,
      });

      alert('Sale created successfully!');
      // Redirect to organizer dashboard
    } catch (error) {
      console.error('Create sale error:', error);
      alert('Failed to create sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create Sale — FindA.Sale Organizer</title>
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Create a New Sale</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sale Details */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sale Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Estate Sale - Downtown"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe the sale..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={formData.endDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900">Location</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Street address"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="City"
                  />
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="State"
                  />
                  <input
                    type="text"
                    value={formData.zip}
                    onChange={(e) => setFormData((prev) => ({ ...prev, zip: e.target.value }))}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ZIP"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGeocoding}
                  disabled={loading}
                  className="text-blue-600 hover:underline text-sm disabled:text-gray-400"
                >
                  {coordinates ? '✓ Coordinates found' : 'Find coordinates'}
                </button>
              </div>
            </div>

            {/* Photos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Photos</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => e.target.files && handlePhotoUpload(e.target.files)}
                  className="hidden"
                  id="photoInput"
                />
                <label htmlFor="photoInput" className="cursor-pointer">
                  <p className="text-gray-600">Click to upload photos</p>
                  <p className="text-sm text-gray-500">{photos.length} photo(s) selected</p>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Creating...' : 'Create Sale'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
