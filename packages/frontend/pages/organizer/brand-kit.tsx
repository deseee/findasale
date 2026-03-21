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
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
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
  customStorefrontSlug: string | null;
  brandFontFamily: string | null;
  brandBannerImageUrl: string | null;
  brandAccentColor: string | null;
}

const BrandKitPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { tier } = useOrganizerTier();

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
    customStorefrontSlug: '',
    brandFontFamily: '',
    brandBannerImageUrl: '',
    brandAccentColor: '',
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Redirect if not authenticated or not an organizer
  if (!isLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch current organizer data on mount
  useEffect(() => {
    const fetchOrganizerData = async () => {
      try {
        const response = await api.get('/organizers/me');
        const data = response.data;

        if (!data.id) {
          showToast('Failed to fetch organizer ID', 'error');
          setIsLoading_(false);
          return;
        }

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
          customStorefrontSlug: orgData.customStorefrontSlug || '',
          brandFontFamily: orgData.brandFontFamily || '',
          brandBannerImageUrl: orgData.brandBannerImageUrl || '',
          brandAccentColor: orgData.brandAccentColor || '',
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
      const payload: any = {
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
        customStorefrontSlug: formData.customStorefrontSlug,
      };

      // Only include PRO fields if user is PRO or TEAMS
      if (tier !== 'SIMPLE') {
        payload.brandFontFamily = formData.brandFontFamily;
        payload.brandBannerImageUrl = formData.brandBannerImageUrl;
        payload.brandAccentColor = formData.brandAccentColor;
      }

      await api.patch('/organizers/me', payload);
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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">Brand Kit</h1>
          <p className="text-warm-600 dark:text-gray-400 mb-8">
            Customize your business branding and social presence. These details appear on your organizer profile and sale listings.
          </p>

          <div className="card p-8">
            <div className="space-y-8">
              {/* Business Information Section */}
              <div>
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Business Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleInputChange}
                      placeholder="Enter your business name"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="Enter your phone number"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Bio</label>
                    <textarea
                      name="bio"
                      value={formData.bio || ''}
                      onChange={handleInputChange}
                      placeholder="Tell shoppers about your business and specialties..."
                      rows={4}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Website URL</label>
                    <input
                      type="url"
                      name="website"
                      value={formData.website || ''}
                      onChange={handleInputChange}
                      placeholder="https://example.com"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>
                </div>
              </div>

              {/* Social Links Section */}
              <div className="border-t border-warm-200 dark:border-gray-700 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Social & Marketplace Links</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Facebook Page URL</label>
                    <input
                      type="url"
                      name="facebook"
                      value={formData.facebook || ''}
                      onChange={handleInputChange}
                      placeholder="https://facebook.com/yourpage"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Instagram Profile URL</label>
                    <input
                      type="url"
                      name="instagram"
                      value={formData.instagram || ''}
                      onChange={handleInputChange}
                      placeholder="https://instagram.com/yourprofile"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Etsy Shop URL</label>
                    <input
                      type="url"
                      name="etsy"
                      value={formData.etsy || ''}
                      onChange={handleInputChange}
                      placeholder="https://etsy.com/shop/yourshop"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>
                </div>
              </div>

              {/* Logo Section */}
              <div className="border-t border-warm-200 dark:border-gray-700 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Logo</h2>
                <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
                  Provide a URL to your logo image (Cloudinary or similar CDN). Recommended size: 200x200px or larger, PNG or JPG.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Logo URL</label>
                    <input
                      type="url"
                      name="brandLogoUrl"
                      value={formData.brandLogoUrl || ''}
                      onChange={handleLogoChange}
                      placeholder="https://example.com/logo.png"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>

                  {logoPreview && (
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs font-semibold text-warm-600 dark:text-gray-400 mb-2">Preview</p>
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="h-24 w-24 object-contain border border-warm-200 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700"
                          onError={() => setLogoPreview(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Storefront Slug Section */}
              <div className="border-t border-warm-200 dark:border-gray-700 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Storefront URL</h2>
                <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
                  Create a custom URL slug for your organizer storefront (e.g., findasale.local/storefronts/your-slug)
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Custom Slug</label>
                    <input
                      type="text"
                      name="customStorefrontSlug"
                      value={formData.customStorefrontSlug || ''}
                      onChange={handleInputChange}
                      placeholder="e.g., janes-estate-sales"
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-warm-100"
                    />
                    <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">Use lowercase letters, numbers, and hyphens only</p>
                  </div>
                </div>
              </div>

              {/* Brand Colors Section */}
              <div className="border-t border-warm-200 dark:border-gray-700 pt-8">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Brand Colors</h2>
                <p className="text-sm text-warm-600 dark:text-gray-400 mb-6">
                  Choose your primary and secondary brand colors. These will appear on your sale listings and organizer profile.
                </p>
                <div className="space-y-6">
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Primary Color</label>
                      <input
                        type="text"
                        name="brandPrimaryColor"
                        value={formData.brandPrimaryColor || ''}
                        onChange={handleColorChange}
                        placeholder="#2563EB"
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm dark:bg-gray-700 dark:text-warm-100"
                      />
                      <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">Hex format (e.g., #2563EB)</p>
                    </div>
                    {formData.brandPrimaryColor && (
                      <div
                        className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600 flex-shrink-0"
                        style={{ backgroundColor: formData.brandPrimaryColor }}
                        title={formData.brandPrimaryColor}
                      />
                    )}
                  </div>

                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Secondary Color</label>
                      <input
                        type="text"
                        name="brandSecondaryColor"
                        value={formData.brandSecondaryColor || ''}
                        onChange={handleColorChange}
                        placeholder="#1E40AF"
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm dark:bg-gray-700 dark:text-warm-100"
                      />
                      <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">Hex format (e.g., #1E40AF)</p>
                    </div>
                    {formData.brandSecondaryColor && (
                      <div
                        className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600 flex-shrink-0"
                        style={{ backgroundColor: formData.brandSecondaryColor }}
                        title={formData.brandSecondaryColor}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* PRO Features Section */}
              <div className={`border-t border-warm-200 dark:border-gray-700 pt-8 p-6 rounded-lg border ${
                tier === 'SIMPLE'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              }`}>
                <h2 className={`text-xl font-semibold mb-4 flex items-center gap-2 ${
                  tier === 'SIMPLE'
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-green-900 dark:text-green-100'
                }`}>
                  <span className={`text-white text-xs font-bold px-2.5 py-0.5 rounded ${
                    tier === 'SIMPLE'
                      ? 'bg-blue-600'
                      : 'bg-green-600'
                  }`}>
                    {tier === 'SIMPLE' ? 'PRO' : tier}
                  </span>
                  Advanced Brand Customization
                </h2>
                <p className={`text-sm mb-6 ${
                  tier === 'SIMPLE'
                    ? 'text-blue-800 dark:text-blue-200'
                    : 'text-green-800 dark:text-green-200'
                }`}>
                  {tier === 'SIMPLE'
                    ? 'These features are available to PRO and TEAMS tier subscribers. Upgrade your plan to customize fonts, banners, and accent colors.'
                    : 'Customize your brand fonts, banners, and accent colors to match your business identity.'}
                </p>
                <div className="space-y-6">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${
                      tier === 'SIMPLE'
                        ? 'text-blue-900 dark:text-blue-100'
                        : 'text-green-900 dark:text-green-100'
                    }`}>Font Family</label>
                    <input
                      type="text"
                      name="brandFontFamily"
                      value={formData.brandFontFamily || ''}
                      onChange={handleInputChange}
                      placeholder="e.g., Georgia"
                      disabled={tier === 'SIMPLE'}
                      className={`w-full px-4 py-2 border rounded-lg font-mono text-sm ${
                        tier === 'SIMPLE'
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                          : 'border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100'
                      }`}
                    />
                    {tier === 'SIMPLE' && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Upgrade to PRO to customize your brand font</p>
                    )}
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${
                      tier === 'SIMPLE'
                        ? 'text-blue-900 dark:text-blue-100'
                        : 'text-green-900 dark:text-green-100'
                    }`}>Banner Image URL</label>
                    <input
                      type="url"
                      name="brandBannerImageUrl"
                      value={formData.brandBannerImageUrl || ''}
                      onChange={handleInputChange}
                      placeholder="https://example.com/banner.jpg"
                      disabled={tier === 'SIMPLE'}
                      className={`w-full px-4 py-2 border rounded-lg ${
                        tier === 'SIMPLE'
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                          : 'border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100'
                      }`}
                    />
                    {tier === 'SIMPLE' && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Upgrade to PRO to add a custom banner image</p>
                    )}
                  </div>

                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className={`block text-sm font-medium mb-1 ${
                        tier === 'SIMPLE'
                          ? 'text-blue-900 dark:text-blue-100'
                          : 'text-green-900 dark:text-green-100'
                      }`}>Accent Color</label>
                      <input
                        type="text"
                        name="brandAccentColor"
                        value={formData.brandAccentColor || ''}
                        onChange={handleInputChange}
                        placeholder="#FF6B6B"
                        disabled={tier === 'SIMPLE'}
                        className={`w-full px-4 py-2 border rounded-lg font-mono text-sm ${
                          tier === 'SIMPLE'
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                            : 'border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100'
                        }`}
                      />
                      {tier === 'SIMPLE' && (
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Upgrade to PRO to customize your accent color</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="border-t border-warm-200 dark:border-gray-700 pt-8">
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
