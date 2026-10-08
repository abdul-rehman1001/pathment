'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface FileDragDropProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
  enablePaste?: boolean;
  disabled?: boolean;
  className?: string;
  onError?: (error: string) => void;
  /** Override the default "not a supported type" toast/message. */
  unsupportedTypeMessage?: (file: File) => string;
  children: React.ReactNode | ((props: { isDragging: boolean; openFilePicker: () => void }) => React.ReactNode);
}

function matchesAccept(file: File, accept: string): boolean {
  const acceptedTypes = accept.split(',').map((t) => t.trim()).filter(Boolean);
  if (acceptedTypes.length === 0) return true;

  const fileName = file.name || '';
  const ext = fileName.includes('.')
    ? `.${fileName.split('.').pop()!.toLowerCase()}`
    : '';
  const mime = (file.type || '').toLowerCase();

  return acceptedTypes.some((type) => {
    const token = type.toLowerCase();
    // Extension token: ".pdf"
    if (token.startsWith('.')) {
      return ext === token;
    }
    // Wildcard MIME: "image/*"
    if (token.endsWith('/*')) {
      const base = token.slice(0, -1); // "image/"
      return mime.startsWith(base);
    }
    // Exact MIME
    return mime === token;
  });
}

export function FileDragDrop({
  onFilesSelected,
  multiple = false,
  accept,
  maxSize,
  enablePaste = false,
  disabled = false,
  className = '',
  onError,
  unsupportedTypeMessage,
  children,
}: FileDragDropProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Keep latest callbacks in refs to avoid useEffect / event listener churn
  const onFilesSelectedRef = useRef(onFilesSelected);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onFilesSelectedRef.current = onFilesSelected;
  }, [onFilesSelected]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reportError = useCallback((errorMsg: string) => {
    if (onErrorRef.current) onErrorRef.current(errorMsg);
    else toast.error(errorMsg);
  }, []);

  const openFilePicker = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const validateFiles = useCallback((files: File[]): File[] => {
    return files.filter((file) => {
      if (maxSize && file.size > maxSize) {
        const maxMb = Math.round(maxSize / (1024 * 1024));
        reportError(`File "${file.name}" is too large (max ${maxMb}MB).`);
        return false;
      }

      if (accept && !matchesAccept(file, accept)) {
        reportError(
          unsupportedTypeMessage?.(file) ||
            `File "${file.name}" is not a supported type for this upload.`
        );
        return false;
      }

      return true;
    });
  }, [accept, maxSize, reportError, unsupportedTypeMessage]);

  const handleFiles = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    const validFiles = validateFiles(selectedFiles);
    if (validFiles.length > 0) {
      const filesToEmit = multiple ? validFiles : [validFiles[0]];
      onFilesSelectedRef.current(filesToEmit);
    }
  }, [multiple, validateFiles]);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Clipboard paste handler
  useEffect(() => {
    if (!enablePaste || disabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const fileBlob = item.getAsFile();
          if (fileBlob) {
            const ext = item.type.split('/')[1] || 'png';
            const pastedFile = new File(
              [fileBlob],
              `pasted-file-${Date.now()}.${ext}`,
              { type: item.type }
            );
            pastedFiles.push(pastedFile);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleFiles(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [enablePaste, disabled, handleFiles]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={className}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        className="hidden"
      />
      {typeof children === 'function'
        // eslint-disable-next-line react-hooks/refs
        ? children({ isDragging, openFilePicker })
        : children}
    </div>
  );
}
