// ============================================================================
// FILE: components/ImageUploader.tsx
// UPDATED WITH IMAGE COMPRESSION
// ============================================================================

'use client';

import { useState } from 'react';
import { Upload, X, ChevronUp, ChevronDown } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface ImageUploaderProps {
  onImageUpload: (base64: string | string[]) => void;
  multipleImages?: boolean;
  maxImages?: number;
}

export default function ImageUploader({ onImageUpload, multipleImages = false, maxImages = 3 }: ImageUploaderProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  // COMPRESSION DISABLED - Using original files
  // const compressImage = async (file: File): Promise<File> => {
  //   console.log('📦 Original file size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
  //   
  //   const options = {
  //     maxSizeMB: 0.8, // Target max 0.8MB per image
  //     maxWidthOrHeight: 1920, // Max dimension
  //     useWebWorker: true,
  //     fileType: 'image/jpeg' as const, // Convert to JPEG for better compression
  //   };
  //   
  //   try {
  //     const compressedFile = await imageCompression(file, options);
  //     console.log('✅ Compressed file size:', (compressedFile.size / 1024 / 1024).toFixed(2), 'MB');
  //     console.log('📊 Compression ratio:', ((1 - compressedFile.size / file.size) * 100).toFixed(1), '% reduction');
  //     return compressedFile;
  //   } catch (error) {
  //     console.error('❌ Compression error:', error);
  //     throw new Error('Failed to compress image. Please try a different image.');
  //   }
  // };

  const handleFiles = async (files: FileList) => {
    const fileArray = Array.from(files);
    
    if (!multipleImages && fileArray.length > 0) {
      await handleSingleFile(fileArray[0]);
      return;
    }

    const validFiles = fileArray.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
      alert('Please upload image files');
      return;
    }

    if (previews.length + validFiles.length > maxImages) {
      alert(`Maximum ${maxImages} images allowed`);
      return;
    }

    // Check individual file sizes BEFORE compression
    const oversizedFiles = validFiles.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      alert('Some images are too large (>10MB). Please choose smaller images.');
      return;
    }

    setIsCompressing(true);
    
    try {
      // NO COMPRESSION - Use original files directly
      // const compressedFiles = await Promise.all(
      //   validFiles.map(file => compressImage(file))
      // );

      // Convert original files to base64
      const readers = validFiles.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      });

      const base64Array = await Promise.all(readers);
      
      // Log total size
      const totalSize = base64Array.reduce((sum, b64) => sum + b64.length, 0);
      console.log('📊 Total base64 size (original):', (totalSize / 1024 / 1024).toFixed(2), 'MB');
      
      // Removed size check - allow original file sizes
      // if (totalSize > 4 * 1024 * 1024) {
      //   alert('Combined images still too large. Please try smaller or fewer images.');
      //   setIsCompressing(false);
      //   return;
      // }

      const newPreviews = [...previews, ...base64Array];
      setPreviews(newPreviews);
      onImageUpload(newPreviews);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to process images');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSingleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Check file size BEFORE compression
    if (file.size > 10 * 1024 * 1024) {
      alert('Image is too large (>10MB). Please choose a smaller image.');
      return;
    }

    setIsCompressing(true);

    try {
      // NO COMPRESSION - Use original file directly
      // const compressedFile = await compressImage(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        
        // Log original file size
        const sizeInMB = base64.length / 1024 / 1024;
        console.log('📊 Original base64 size:', sizeInMB.toFixed(2), 'MB');
        
        // Removed size check - allow original file sizes
        // if (sizeInMB > 3.5) {
        //   alert('Image still too large after compression. Please try a smaller image.');
        //   setIsCompressing(false);
        //   return;
        // }
        
        setPreviews([base64]);
        onImageUpload(base64);
        setIsCompressing(false);
      };
      reader.onerror = () => {
        alert('Failed to read image file');
        setIsCompressing(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to process image');
      setIsCompressing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isCompressing) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && !isCompressing) {
      handleFiles(e.target.files);
    }
  };

  const removeImage = (index: number) => {
    const newPreviews = previews.filter((_, i) => i !== index);
    setPreviews(newPreviews);
    onImageUpload(multipleImages ? newPreviews : (newPreviews[0] || ''));
  };

  const clearAllImages = () => {
    setPreviews([]);
    onImageUpload(multipleImages ? [] : '');
  };

  const moveImageUp = (index: number) => {
    if (index === 0) return; // Already at the top
    const newPreviews = [...previews];
    [newPreviews[index - 1], newPreviews[index]] = [newPreviews[index], newPreviews[index - 1]];
    setPreviews(newPreviews);
    onImageUpload(newPreviews);
  };

  const moveImageDown = (index: number) => {
    if (index === previews.length - 1) return; // Already at the bottom
    const newPreviews = [...previews];
    [newPreviews[index], newPreviews[index + 1]] = [newPreviews[index + 1], newPreviews[index]];
    setPreviews(newPreviews);
    onImageUpload(newPreviews);
  };

  return (
    <div className="w-full">
      {previews.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
            isDragging 
              ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
              : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
          } ${isCompressing ? 'opacity-50 cursor-wait' : ''}`}
        >
          <div className="flex flex-col items-center">
            <div className={`p-4 rounded-full mb-4 transition-colors ${
              isDragging ? 'bg-indigo-100' : 'bg-gray-100'
            }`}>
              {isCompressing ? (
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Upload className={`w-8 h-8 ${isDragging ? 'text-indigo-600' : 'text-gray-400'}`} />
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {isCompressing ? 'Compressing images...' : multipleImages ? 'Upload Multiple Images' : 'Upload Image'}
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              {isCompressing ? 'Please wait...' : 'Drag and drop or click to browse'}
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Supports: JPG, PNG, WebP (max 10MB) • Original quality preserved
            </p>
            {multipleImages && !isCompressing && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 max-w-md">
                <p className="text-xs text-blue-800 font-medium">
                  📚 Retrieval Quiz requires 3 images:
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Topic A • Topic B • Topic C
                </p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              multiple={multipleImages}
              onChange={handleChange}
              className="hidden"
              id="file-upload"
              disabled={isCompressing}
            />
            <label
              htmlFor="file-upload"
              className={`px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-indigo-700 active:scale-95 transition-all duration-150 shadow-sm hover:shadow-md ${
                isCompressing ? 'opacity-50 cursor-wait pointer-events-none' : ''
              }`}
            >
              Choose {multipleImages ? 'Images' : 'Image'}
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {multipleImages && (
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-sm font-medium text-gray-700">
                  {previews.length} of {maxImages} images uploaded
                </p>
              </div>
              <button
                onClick={clearAllImages}
                className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
                disabled={isCompressing}
              >
                Clear All
              </button>
            </div>
          )}
          {multipleImages && previews.length > 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800 font-medium flex items-center gap-2">
                <span>💡</span>
                <span className="hidden sm:inline">Use the ↑↓ arrows to reorder topics if needed</span>
                <span className="sm:hidden">Tap the ↑↓ arrows on images to reorder topics</span>
              </p>
            </div>
          )}
          <div className={`grid ${multipleImages ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-4`}>
            {previews.map((preview, index) => (
              <div key={index} className="group relative bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden border border-gray-200">
                {multipleImages && (
                  <div className="absolute top-3 left-3 bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold z-10 shadow-lg">
                    Topic {String.fromCharCode(65 + index)}
                  </div>
                )}
                <div className="h-32 overflow-hidden bg-gray-100">
                  <img 
                    src={preview} 
                    alt={`Preview ${index + 1}`} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                  />
                </div>
                
                {/* Reorder buttons for multiple images */}
                {multipleImages && previews.length > 1 && (
                  <div className="absolute bottom-3 left-3 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => moveImageUp(index)}
                      disabled={index === 0 || isCompressing}
                      className={`p-2 sm:p-1.5 rounded-full shadow-lg transition-all duration-150 touch-manipulation ${
                        index === 0 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-white/90 backdrop-blur-sm text-indigo-600 hover:bg-indigo-600 hover:text-white active:scale-95'
                      }`}
                      title="Move up"
                    >
                      <ChevronUp className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => moveImageDown(index)}
                      disabled={index === previews.length - 1 || isCompressing}
                      className={`p-2 sm:p-1.5 rounded-full shadow-lg transition-all duration-150 touch-manipulation ${
                        index === previews.length - 1
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-white/90 backdrop-blur-sm text-indigo-600 hover:bg-indigo-600 hover:text-white active:scale-95'
                      }`}
                      title="Move down"
                    >
                      <ChevronDown className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                )}
                
                <button
                  onClick={() => removeImage(index)}
                  className="absolute top-3 right-3 p-2 sm:p-1.5 bg-white/90 backdrop-blur-sm text-red-600 rounded-full hover:bg-red-600 hover:text-white transition-all duration-150 shadow-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 touch-manipulation active:scale-95"
                  title="Remove image"
                  disabled={isCompressing}
                >
                  <X className="w-5 h-5 sm:w-4 sm:h-4" />
                </button>
              </div>
            ))}
          </div>
          {multipleImages && previews.length < maxImages && !isCompressing && (
            <div className="text-center pt-2">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleChange}
                className="hidden"
                id="file-upload-more"
              />
              <label
                htmlFor="file-upload-more"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-dashed border-gray-300 text-gray-700 text-sm font-medium rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-all duration-150"
              >
                <Upload className="w-4 h-4" />
                Add More Images
              </label>
            </div>
          )}
          {isCompressing && (
            <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium">
                📁 Processing images for upload...
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Converting to base64 format
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}