import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Image as ImageIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SharedPhotoUploadProps {
  onUploadComplete: (url: string) => void;
  onPreviewReady?: (previewUrl: string) => void;
  maxFileSize?: number; // in bytes
  multiple?: boolean;
  maxFiles?: number;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'compact' | 'gallery';
  uploadType?: 'direct' | 's3'; // Choose upload method
  getUploadParameters?: () => Promise<{ method: 'PUT'; url: string }>; // For S3 uploads
  isDemoEvent?: boolean; // For Mystic Marrakesh demo bypass
}

export function SharedPhotoUpload({
  onUploadComplete,
  onPreviewReady,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  multiple = false,
  maxFiles = 10,
  className,
  children,
  disabled = false,
  variant = 'default',
  uploadType = 'direct',
  getUploadParameters,
  isDemoEvent = false,
}: SharedPhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  // Accepted file types for validation
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  const validateFile = (file: File): boolean => {
    // Check file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only JPG, PNG, and WEBP images are allowed.",
        variant: "destructive",
      });
      return false;
    }

    // Check file size
    if (file.size > maxFileSize) {
      toast({
        title: "File too large",
        description: `Image must be smaller than ${Math.round(maxFileSize / (1024 * 1024))}MB.`,
        variant: "destructive",
      });
      return false;
    }

    // Validate file extension as additional security
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ACCEPTED_EXTENSIONS.some(ext => fileName.endsWith(ext));
    if (!hasValidExtension) {
      toast({
        title: "Invalid file",
        description: "Please select a valid image file.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleFiles = async (files: FileList) => {
    if (files.length === 0) return;

    // Filter valid files
    const validFiles = Array.from(files).filter(validateFile);
    if (validFiles.length === 0) return;

    // Limit number of files if specified
    const filesToUpload = multiple 
      ? validFiles.slice(0, maxFiles) 
      : [validFiles[0]];

    // Process each file
    for (const file of filesToUpload) {
      // Create immediate local preview using blob URL
      const blobUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(blobUrl);
      
      // Call onPreviewReady immediately for instant preview
      if (onPreviewReady) {
        onPreviewReady(blobUrl);
      }

      // Upload the file
      await uploadFile(file, blobUrl);
    }
  };

  const uploadFile = async (file: File, blobUrl: string) => {
    if (uploadType === 's3' && !getUploadParameters) {
      toast({
        title: "Configuration error",
        description: "S3 upload parameters not provided.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      if (uploadType === 's3') {
        await uploadToS3(file, blobUrl);
      } else {
        await uploadDirect(file, blobUrl);
      }
    } catch (error) {
      console.error('Upload error:', error);
      
      // Demo bypass: Use placeholder image for Mystic Marrakesh demo events
      if (isDemoEvent) {
        // Clean up blob URL since we're using placeholder
        if (blobUrl && blobUrlsRef.current.has(blobUrl)) {
          URL.revokeObjectURL(blobUrl);
          blobUrlsRef.current.delete(blobUrl);
        }
        
        // Use placeholder image for demo
        const placeholderImageUrl = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&crop=center";
        onUploadComplete(placeholderImageUrl);
        
        toast({
          title: "Demo mode - Placeholder used",
          description: "Upload failed, but using demo placeholder image for Mystic Marrakesh event.",
          variant: "default",
        });
      } else {
        // Normal error handling for non-demo events
        // Clean up blob URL on error
        if (blobUrl && blobUrlsRef.current.has(blobUrl)) {
          URL.revokeObjectURL(blobUrl);
          blobUrlsRef.current.delete(blobUrl);
        }
        
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
          variant: "destructive",
        });
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const uploadToS3 = async (file: File, blobUrl: string): Promise<void> => {
    if (!getUploadParameters) throw new Error("Upload parameters function not provided");

    const uploadParams = await getUploadParameters();
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        // S3 PUT requests return either 200 or 204 (No Content) on success
        if (xhr.status === 200 || xhr.status === 204) {
          // Clean up blob URL since we now have the server URL
          if (blobUrl && blobUrlsRef.current.has(blobUrl)) {
            URL.revokeObjectURL(blobUrl);
            blobUrlsRef.current.delete(blobUrl);
          }

          // For S3, the final URL is typically the upload URL without query params
          const finalUrl = uploadParams.url.split('?')[0];
          onUploadComplete(finalUrl);
          
          toast({
            title: "Upload successful",
            description: "Your image has been uploaded successfully.",
          });
          resolve();
        } else {
          reject(new Error(`S3 upload failed with status ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error("Network error during S3 upload"));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error("S3 upload timed out"));
      });

      // Start S3 upload
      xhr.open(uploadParams.method, uploadParams.url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.timeout = 60000; // 60 second timeout
      xhr.send(file);
    });
  };

  const uploadDirect = async (file: File, blobUrl: string): Promise<void> => {
    const formData = new FormData();
    formData.append('image', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            
            // Clean up blob URL since we now have the server URL
            if (blobUrl && blobUrlsRef.current.has(blobUrl)) {
              URL.revokeObjectURL(blobUrl);
              blobUrlsRef.current.delete(blobUrl);
            }
            
            onUploadComplete(response.url);
            toast({
              title: "Upload successful",
              description: "Your image has been uploaded successfully.",
            });
            resolve();
          } catch (error) {
            reject(new Error("Invalid response format"));
          }
        } else {
          // Enhanced error handling
          let errorMessage = `Upload failed with status ${xhr.status}`;
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorMessage;
          } catch (parseError) {
            if (xhr.responseText && xhr.responseText.trim()) {
              const textContent = xhr.responseText.replace(/<[^>]*>/g, '').trim();
              if (textContent.length > 0 && textContent.length < 200) {
                errorMessage = textContent;
              }
            }
          }
          reject(new Error(errorMessage));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error("Network error during upload. Please check your connection."));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error("Upload took too long. Please try again."));
      });

      // Start upload
      xhr.open('POST', '/api/uploads/images');
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.withCredentials = true;
      xhr.timeout = 60000; // 60 second timeout
      xhr.send(formData);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (disabled || isUploading) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Render different variants
  if (variant === 'compact') {
    return (
      <div className={cn("relative", className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || isUploading}
        />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleButtonClick}
          disabled={disabled || isUploading}
          className="h-8"
          data-testid="button-upload-compact"
        >
          {isUploading ? (
            <>Uploading... {uploadProgress}%</>
          ) : (
            <>
              <Plus className="w-3 h-3 mr-1" />
              Add Photo
            </>
          )}
        </Button>
      </div>
    );
  }

  if (variant === 'gallery') {
    return (
      <div className={cn("relative", className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || isUploading}
        />
        
        <div
          className={cn(
            "aspect-square border-2 border-dashed rounded-lg transition-colors flex items-center justify-center",
            dragActive ? "border-primary bg-primary/5" : "border-gray-300 dark:border-gray-700",
            disabled || isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={!disabled && !isUploading ? handleButtonClick : undefined}
        >
          {isUploading ? (
            <div className="text-center">
              <Progress value={uploadProgress} className="mb-2 w-16" />
              <p className="text-xs text-gray-600">{uploadProgress}%</p>
            </div>
          ) : (
            <div className="text-center p-2">
              <Plus className="w-6 h-6 text-gray-400 mx-auto mb-1" />
              <p className="text-xs text-gray-500">Add Photo</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className={cn("relative", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isUploading}
      />
      
      <div
        className={cn(
          "border-2 border-dashed rounded-lg transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-gray-300 dark:border-gray-700",
          disabled || isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={!disabled && !isUploading ? handleButtonClick : undefined}
      >
        {children ? (
          children
        ) : (
          <div className="p-8 text-center">
            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <Button 
              type="button" 
              onClick={handleButtonClick}
              disabled={disabled || isUploading}
              className="mb-2"
              data-testid="button-upload-image"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? "Uploading..." : "Upload Image"}
            </Button>
            <p className="text-sm text-gray-500">
              or drag and drop files here
            </p>
            <p className="text-xs text-gray-400 mt-1">
              JPG, PNG, or WEBP up to {Math.round(maxFileSize / (1024 * 1024))}MB
              {multiple && ` • Up to ${maxFiles} files`}
            </p>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-lg flex items-center justify-center">
          <div className="text-center w-full max-w-xs px-4">
            <Progress value={uploadProgress} className="mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Uploading... {uploadProgress}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface PhotoPreviewProps {
  src: string;
  alt: string;
  onRemove: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PhotoPreview({ src, alt, onRemove, className, size = 'md' }: PhotoPreviewProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  return (
    <div className={cn("relative group", sizeClasses[size], className)}>
      <img 
        src={src} 
        alt={alt} 
        className="w-full h-full object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600"
      />
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6 rounded-full"
        onClick={onRemove}
        data-testid="button-remove-image"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}