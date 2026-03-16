/**
 * Brand Kit
 *
 * Allows organizers to manage their brand identity:
 * - Logo URL
 * - Primary and secondary brand colors
 * - Business name, website, and social links
 * - Bio
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

interface BrandData {
  businessName: string;
  bio: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  etsy: string | null;
  phone: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
}

const BrandKitPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading_, setIsLoading_] = useState(true);

  const [formData, setFormData] = useState<BrandData>({
    businessName: '',
    bio: '',
    website: '',
    facebook: '',
    instagram: '',
    etsy: '',
    phone: '',
    brandLogoUrl: '',
    brandPrimaryColor: '',
    brandSecondaryColor: '',
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Redirect if not authenticated or not an organizer
  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch current organizer data on mount
  useEffect(() => {
    const fetchOrganizerData = async () => {
      try {
        const response = await api.get('/organizers/me');
        const data = response.data;

        // Also fetch the full profile to get all brand fields
        const orgResponse = await api.get(`/organizers/${data.id}`);
        const orgData = orgResponse.data;

        setFormData({
          businessName: orgData.businessName || '',
          bio: orgData.bio || '',
          website: orgData.website || '',
          facebook: orgData.facebook || '',
          instagram: orgData.instagram || '',
          etsy: orgData.etsy || '',
          phone: orgData.phone || '',
          brandLogoUrl: orgData.brandLogoUrl || '',
          brandPrimaryColor: orgData.brandPrimaryColor || '',
          brandSecondaryColor: orgData.brandSecondaryColor || '',
        });

        if (orgData.brandLogoUrl) {
          setLogoPreview(orgData.brandLogoUrl);
        }
      } catch (error: any) {
        console.error('Failed to fetch organizer data:', error);
        showToast('Failed to load brand kit data', 'error');
      } finally {
        setIsLoading_(false);
      }
    };

    if (user?.id) {
      fetchOrganizerData();
    }
  }, [user?.id, showToast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData((prev) => ({
      ...prev,
      brandLogoUrl: value,
    }));
    setLogoPreview(value || null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patch('/organizers/me', {
        businessName: formData.businessName,
        bio: formData.bio,
        website: formData.website,
        facebook: formData.facebook,
        instagram: formData.instagram,
        etsy: formData.etsy,
        phone: formData.phone,
        brandLogoUrl: formData.brandLogoUrl,
        brandPrimaryColor: formData.brandPrimaryColor,
        brandSecondaryColor: formData.brandSecondaryColor,
      });
      showToast('Brand Kit updated successfully', 'success');
    } catch (error: any) {
      console.error('Failed to save brand kit:', error);
      showToast(error.response?.data?.message || 'Failed to save brand kit', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading_) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Brand Kit - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 mb-2">Brand Kit</h1>
          <p className="text-warm-600 mb-8">
            Customize your business branding and social presence. These details appear on your organizer profile and sale listings.
          </p>

          <div className="card p-8">
            <div className="space-y-8">
              {/* Business Information Section */}
              <div>
                <h2 className="text-xl font-semibold text-warm-900 mb-4">Business Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleInputChange}
                      placeholder="Enter your business name"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="Enter your phone number"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Bio</label>
                    <textarea
                      name="bio"
                      value={formData.bio || ''}
                      onChange={handleInputChange}
                      placeholder="Tell shoppers about your business and specialties..."
                      rows={4}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Website URL</label>
                    <input
                      type="url"
                      name="website"
                      value={formData.website || ''}
                      onChange={handleInputChange}
                      placeholder="https://example.com"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Social Links Section */}
              <div className="border-t border-warm-200 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 mb-4">Social & Marketplace Links</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Facebook Page URL</label>
                    <input
                      type="url"
                      name="facebook"
                      value={formData.facebook || ''}
                      onChange={handleInputChange}
                      placeholder="https://facebook.com/yourpage"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Instagram Profile URL</label>
                    <input
                      type="url"
                      name="instagram"
                      value={formData.instagram || ''}
                      onChange={handleInputChange}
                      placeholder="https://instagram.com/yourprofile"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Etsy Shop URL</label>
                    <input
                      type="url"
                      name="etsy"
                      value={formData.etsy || ''}
                      onChange={handleInputChange}
                      placeholder="https://etsy.com/shop/yourshop"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Logo Section */}
              <div className="border-t border-warm-200 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 mb-4">Logo</h2>
                <p className="text-sm text-warm-600 mb-4">
                  Provide a URL to your logo image (Cloudinary or similar CDN). Recommended size: 200x200px or larger, PNG or JPG.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Logo URL</label>
                    <input
                      type="url"
                      name="brandLogoUrl"
                      value={formData.brandLogoUrl || ''}
                      onChange={handleLogoChange}
                      placeholder="https://example.com/logo.png"
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  {logoPreview && (
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs font-semibold text-warm-600 mb-2">Preview</p>
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="h-24 w-24 object-contain border border-warm-200 rounded-lg p-2 bg-white"
                          onError={() => setLogoPreview(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Brand Colors Section */}
              <div className="border-t border-warm-200 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 mb-4">Brand Colors</h2>
                <p className="text-sm text-warm-600 mb-6">
                  Choose your primary and secondary brand colors. These will appear on your sale listings and organizer profile.
                </p>
                <div className="space-y-6">
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-warm-700 mb-1">Primary Color</label>
                      <input
                        type="text"
                        name="brandPrimaryColor"
                        value={formData.brandPrimaryColor || ''}
                        onChange={handleColorChange}
                        placeholder="#2563EB"
                        className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
                      />
                      <p className="text-xs text-warm-500 mt-1">Hex format (e.g., #2563EB)</p>
                    </div>
                    {formData.brandPrimaryColor && (
                      <div
                        className="h-12 w-12 rounded-lg border-2 border-warm-300 flex-shrink-0"
                        style={{ backgroundColor: formData.brandPrimaryColor }}
                        title={formData.brandPrimaryColor}
                      />
                    )}
                  </div>

                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-warm-700 mb-1">Secondary Color</label>
                      <input
                        type="text"
                        name="brandSecondaryColor"
                        value={formData.brandSecondaryColor || ''}
                        onChange={handleColorChange}
                        placeholder="#1E40AF"
                        className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
                      />
                      <p className="text-xs text-warm-500 mt-1">Hex format (e.g., #1E40AF)</p>
                    </div>
                    {formData.brandSecondaryColor && (
                      <div
                        className="h-12 w-12 rounded-lg border-2 border-warm-300 flex-shrink-0"
                        style={{ backgroundColor: formData.brandSecondaryColor }}
                        title={formData.brandSecondaryColor}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="border-t border-warm-200 pt-8">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-warm-400 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Brand Kit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BrandKitPage;
