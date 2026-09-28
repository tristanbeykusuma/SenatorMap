import { useState, useRef } from 'react';
import ColumnMappingDialog from './ColumnMappingDialog';
import type { LocationData, Stats, ColumnMapping } from '../types';

interface PreviewData {
  columns: string[];
  sampleRows: any[];
  totalRows: number;
}

interface FileUploadProps {
  onUpload: (data: LocationData[], stats: Stats) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [showDialog, setShowDialog] = useState(false);
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
      startFlow(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startFlow(file);
    }
    e.target.value = '';
  };

  const startFlow = (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      setError('Invalid file type. Please upload .xlsx, .xls, or .csv files.');
      return;
    }

    setError(null);
    setPendingFile(file);
    fetchPreview(file);
  };

  const fetchPreview = async (file: File) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload/preview', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Preview failed');
      }

      const result = await response.json();

      setPreviewData({
        columns: result.columns,
        sampleRows: result.sampleRows,
        totalRows: result.totalRows,
      });
      setShowDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setPendingFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (mapping: ColumnMapping) => {
    if (!pendingFile) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', pendingFile);
    if (Object.keys(mapping).length > 0) {
      formData.append('mapping', JSON.stringify(mapping));
    }

    try {
      const response = await fetch('/api/upload/confirm', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const result = await response.json();

      if (result.success && result.data) {
        onUpload(result.data, result.stats);
        setShowDialog(false);
        setPreviewData(null);
        setPendingFile(null);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPreviewData(null);
    setPendingFile(null);
    setError(null);
  };

  return (
    <div className="file-upload">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label
          className="file-input-label"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="file-input"
            disabled={isLoading}
          />
          <span className="file-input-text">📁 Choose File</span>
          <span className="file-input-hint">Supports: .xlsx, .xls, .csv</span>
        </label>

        <div className="upload-content">
          <div className="upload-icon">📊</div>
          <h3>Drop Excel/CSV File Here</h3>
          <p>or tap below to browse</p>
        </div>

        {isLoading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>{showDialog ? 'Importing...' : 'Reading file...'}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message" role="alert">
          ⚠️ {error}
        </div>
      )}

      <ColumnMappingDialog
        isOpen={showDialog}
        file={pendingFile}
        previewData={previewData}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        isProcessing={isLoading}
      />
    </div>
  );
};

export default FileUpload;