/**
 * CSVImportModal — Feature #395: Bulk Import Tool (Phase 1)
 *
 * Two-step flow:
 *   Step 1: File upload (drag-drop or click, .csv only)
 *   Step 2: Column mapping — detected CSV headers → FindA.Sale fields
 *
 * On confirm: POST /api/items/:saleId/bulk-import?confirm=true with columnMap JSON
 * On preview: POST /api/items/:saleId/bulk-import (no confirm param)
 */

import React, { useState, useRef } from 'react';
import api from '../lib/api';
import AccessibleModal from './AccessibleModal';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
  onImportComplete: () => void;
}

const FINDASALE_FIELDS = [
  { key: 'title',       label: 'Title',       required: true },
  { key: 'price',       label: 'Price',       required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'condition',   label: 'Condition',   required: false },
  { key: 'category',    label: 'Category',    required: false },
] as const;

type FieldKey = typeof FINDASALE_FIELDS[number]['key'];

interface PreviewData {
  headers: string[];
  preview: Record<string, string>[];
  detectedMapping: Record<string, string>;
  totalRows: number;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  cappedAt200?: boolean;
}

type Step = 'upload' | 'mapping' | 'result';

const CSVImportModal: React.FC<CSVImportModalProps> = ({ isOpen, onClose, saleId, onImportComplete }) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [columnMap, setColumnMap] = useState<Record<FieldKey, string>>({
    title: '', price: '', description: '', condition: '', category: '',
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setIsDragOver(false);
    setIsLoading(false);
    setError(null);
    setPreviewData(null);
    setColumnMap({ title: '', price: '', description: '', condition: '', category: '' });
    setImportResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a .csv file.');
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleUploadAndPreview = async () => {
    if (!file) {
      setError('Please select a CSV file.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await api.post<PreviewData>(`/items/${saleId}/bulk-import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data;
      setPreviewData(data);
      // Pre-fill column map with auto-detected values
      const auto = data.detectedMapping;
      setColumnMap({
        title:       auto.title       || '',
        price:       auto.price       || '',
        description: auto.description || '',
        condition:   auto.condition   || '',
        category:    auto.category    || '',
      });
      setStep('mapping');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to read CSV. Please check the file format.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    if (!columnMap.title) {
      setError('Title mapping is required.');
      return;
    }
    if (!columnMap.price) {
      setError('Price mapping is required.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('columnMap', JSON.stringify(columnMap));
      const response = await api.post<ImportResult>(`/items/${saleId}/bulk-import?confirm=true`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(response.data);
      setStep('result');
      if (response.data.imported > 0) onImportComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Import failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `title,price,description,condition,category\nExample Lamp,25.99,Brass floor lamp in good condition,USED,Lighting\nVintage Chair,75.00,Mid-century modern armchair,USED,Furniture\nAntique Mirror,120.00,Ornate gilt frame,USED,Decor`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'findasale-import-template.csv';
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <AccessibleModal isOpen={isOpen} onClose={handleClose} ariaLabelledBy="bulk-import-modal-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 id="bulk-import-modal-title" className="text-xl font-bold text-warm-900 dark:text-warm-100">
            Bulk Import CSV
          </h3>
          <button onClick={handleClose} className="text-warm-500 hover:text-warm-700 dark:text-warm-400 dark:hover:text-warm-200" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-5 text-sm">
          {(['upload', 'mapping', 'result'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div className="h-px flex-1 bg-warm-200 dark:bg-gray-600" />}
              <span className={`flex items-center gap-1 font-medium ${step === s ? 'text-amber-600' : (step === 'result' && s !== 'result') || (step === 'mapping' && s === 'upload') ? 'text-green-600 dark:text-green-400' : 'text-warm-400 dark:text-warm-500'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === s ? 'bg-amber-600 text-white' : (step === 'result' && s !== 'result') || (step === 'mapping' && s === 'upload') ? 'bg-green-600 text-white' : 'bg-warm-200 dark:bg-gray-600 text-warm-500'}`}>
                  {((step === 'result' && s !== 'result') || (step === 'mapping' && s === 'upload')) ? '✓' : i + 1}
                </span>
                {s === 'upload' ? 'Upload' : s === 'mapping' ? 'Map Columns' : 'Done'}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-800 dark:text-red-300" role="alert">
            {error}
          </div>
        )}

        {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Upload a CSV file with your items. We will detect column names and let you map them in the next step.
            </p>

            <button onClick={downloadTemplate} className="mb-4 text-amber-600 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download template CSV
            </button>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragOver ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10' : 'border-warm-300 dark:border-gray-600 hover:border-amber-400 dark:bg-gray-700/30'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                aria-label="CSV file upload"
                onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-warm-400 dark:text-warm-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {file ? (
                <p className="text-sm font-medium text-amber-600">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-warm-600 dark:text-warm-400"><span className="font-medium text-amber-600">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">CSV files only — max 200 items per import</p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={handleClose} className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm">
                Cancel
              </button>
              <button
                onClick={handleUploadAndPreview}
                disabled={!file || isLoading}
                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
              >
                {isLoading ? 'Reading CSV...' : 'Next: Map Columns'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Column Mapping ──────────────────────────────────────── */}
        {step === 'mapping' && previewData && (
          <div>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">
              {previewData.totalRows} row{previewData.totalRows !== 1 ? 's' : ''} detected
              {previewData.totalRows > 200 ? ' — only first 200 will be imported' : ''}.
              Map your CSV columns to FindA.Sale fields.
            </p>

            {/* Preview table */}
            <div className="overflow-x-auto mb-4 rounded border border-warm-200 dark:border-gray-700">
              <table className="text-xs w-full">
                <thead className="bg-warm-50 dark:bg-gray-900">
                  <tr>
                    {previewData.headers.map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left text-warm-700 dark:text-warm-300 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.map((row, i) => (
                    <tr key={i} className="border-t border-warm-100 dark:border-gray-700">
                      {previewData.headers.map((h) => (
                        <td key={h} className="px-2 py-1.5 text-warm-600 dark:text-warm-400 max-w-[120px] truncate">{row[h] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mapping selectors */}
            <div className="space-y-2 mb-5">
              {FINDASALE_FIELDS.map(({ key, label, required }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-warm-700 dark:text-warm-300 font-medium flex-shrink-0">
                    {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                  <select
                    value={columnMap[key]}
                    onChange={(e) => setColumnMap((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="flex-1 text-sm border border-warm-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">{required ? '— select column —' : '— skip —'}</option>
                    {previewData.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-3">
              <button onClick={() => setStep('upload')} className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm">
                Back
              </button>
              <div className="flex gap-3">
                <button onClick={handleClose} className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={!columnMap.title || !columnMap.price || isLoading}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
                >
                  {isLoading ? 'Importing...' : `Import ${Math.min(previewData.totalRows, 200)} Items`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Result ──────────────────────────────────────────────── */}
        {step === 'result' && importResult && (
          <div>
            <div className={`rounded-md p-4 mb-4 ${importResult.imported > 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}>
              <p className={`font-semibold text-base ${importResult.imported > 0 ? 'text-green-800 dark:text-green-300' : 'text-yellow-800 dark:text-yellow-300'}`}>
                {importResult.imported > 0
                  ? `${importResult.imported} item${importResult.imported !== 1 ? 's' : ''} imported successfully`
                  : 'No items were imported'}
              </p>
              {importResult.skipped > 0 && (
                <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                  {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped
                  {importResult.cappedAt200 ? ' (200-item cap reached)' : ' due to validation errors'}.
                </p>
              )}
              {importResult.imported > 0 && (
                <p className="text-sm text-warm-500 dark:text-warm-400 mt-1">
                  Items are saved as drafts. Review and publish them from the items list.
                </p>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Rows with errors:</p>
                <div className="max-h-40 overflow-y-auto rounded border border-warm-200 dark:border-gray-700 text-xs">
                  {importResult.errors.map((e, i) => (
                    <div key={i} className="px-3 py-1.5 border-b border-warm-100 dark:border-gray-700 last:border-0 text-warm-600 dark:text-warm-400">
                      <span className="font-medium">Row {e.row}:</span> {e.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              {importResult.imported === 0 && (
                <button onClick={() => setStep('mapping')} className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm">
                  Back
                </button>
              )}
              <button onClick={handleClose} className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium">
                {importResult.imported > 0 ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
};

export default CSVImportModal;
