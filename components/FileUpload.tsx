import React, { useRef, useState, useCallback } from 'react';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // bytes
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept,
  multiple = false,
  maxSize,
  className = '',
  disabled = false,
  children
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = useCallback((files: FileList | null): File[] => {
    if (!files || files.length === 0) return [];

    const validFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file) => {
      // 크기 검증
      if (maxSize && file.size > maxSize) {
        errors.push(`${file.name}: 파일 크기가 너무 큽니다 (최대 ${(maxSize / 1024 / 1024).toFixed(2)}MB)`);
        return;
      }

      // 타입 검증
      if (accept) {
        const acceptedTypes = accept.split(',').map(type => type.trim());
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        const fileType = file.type;

        const isAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return fileExtension === type.toLowerCase();
          }
          if (type.includes('/*')) {
            const baseType = type.split('/')[0];
            return fileType.startsWith(baseType + '/');
          }
          return fileType === type || fileExtension === type.toLowerCase();
        });

        if (!isAccepted) {
          errors.push(`${file.name}: 허용되지 않은 파일 형식입니다`);
          return;
        }
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      setError(errors.join('\n'));
      setTimeout(() => setError(null), 5000);
    } else {
      setError(null);
    }

    return validFiles;
  }, [accept, maxSize]);

  const handleFiles = useCallback((files: FileList | null) => {
    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      onFileSelect(validFiles);
    }
  }, [validateFiles, onFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // 같은 파일을 다시 선택할 수 있도록 리셋
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFiles]);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  // 드래그 앤 드롭 핸들러
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 드래그가 자식 요소로 이동한 경우는 무시
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (!multiple && files.length > 1) {
      setError('단일 파일만 업로드 가능합니다');
      setTimeout(() => setError(null), 5000);
      return;
    }

    handleFiles(files);
  }, [disabled, multiple, handleFiles]);

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          border-2 border-dashed rounded-lg transition-all duration-200
          ${children ? '' : 'p-8 text-center'}
        `}
      >
        {children || (
          <div className="flex flex-col items-center justify-center space-y-2">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-gray-600">
              파일을 드래그하여 놓거나 클릭하여 선택하세요
            </p>
            {accept && (
              <p className="text-xs text-gray-400">
                허용 형식: {accept}
              </p>
            )}
            {maxSize && (
              <p className="text-xs text-gray-400">
                최대 크기: {(maxSize / 1024 / 1024).toFixed(2)}MB
              </p>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />

      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm whitespace-pre-line">
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
