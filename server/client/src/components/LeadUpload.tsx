import { useState, useRef } from 'react';
import type { BranchPerformance } from '../types';

interface LeadUploadProps {
  onUpload: (data: BranchPerformance[]) => void;
}

const LeadUpload: React.FC<LeadUploadProps> = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
    e.target.value = '';
  };

  const uploadFile = async (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      setError('Invalid file type. Please upload .xlsx, .xls, or .csv files.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload/radar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const result = await response.json();

      if (result.success && result.data) {
        const branches = result.data.map((row: any, idx: number) => ({
          id: idx + 1,
          branchCode: row.branchCode || row.code || '',
          branchName: row.branchName || row.name || '',
          lat: parseFloat(row.lat) || 0,
          lng: parseFloat(row.lng) || 0,
          performance: row.performance || 'growing',
          performanceValue: parseFloat(row.performanceValue) || 0,
          address: row.address || '',
          growthRate: row.growthRate != null ? parseFloat(row.growthRate) : undefined,
          aum: row.aum != null ? parseFloat(row.aum) : undefined,
          customerCount: row.customerCount != null ? parseInt(row.customerCount) : undefined,
          product: row.product || '',
          laggingScore: row.laggingScore != null ? parseFloat(row.laggingScore) : undefined,
          laggingClass: row.laggingClass || undefined,
          leadingScore: row.leadingScore != null ? parseFloat(row.leadingScore) : undefined,
          leadingClass: row.leadingClass || undefined,
          leadingGreen: row.leadingGreen || undefined,
          leadingTotal: row.leadingTotal || undefined,
          dpkProducts: row.dpkProducts || [],
          kreditProducts: row.kreditProducts || [],
          leadingProducts: row.leadingProducts || [],
        }));

        onUpload(branches);
        setSuccess(true);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-upload">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''} ${success ? 'success' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileSelect}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="file-input"
          disabled={isLoading}
        />

        <div className="upload-content">
          <div className="upload-icon">
            {success ? '✅' : '📁'}
          </div>
          <h3>
            {success ? 'Imported!' : 'Drop Bank Branch File Here'}
          </h3>
          <p>or click to browse</p>
          <p className="formats">Supports: .xlsx, .xls, .csv</p>

          {isLoading && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Processing file...</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default LeadUpload;