import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/authToken";

interface ImageUploaderProps {
  onUploadComplete: (url: string) => void;
  onPreviewReady?: (previewUrl: string) => void; // For immediate local preview
  maxFileSize?: number; // in bytes
  accept?: string;
  multiple?: boolean;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

export function ImageUploader({
  onUploadComplete,
  onPreviewReady,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  accept = "image/jpeg,image/png,image/webp",
  multiple = false,
  className,
  children,
  disabled = false,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set()); // Track blob URLs for cleanup
  const { toast } = useToast();

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      // Clean up all blob URLs to prevent memory leaks
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  const handleFiles = async (files: FileList) => {
    if (files.length === 0) return;

    const validFiles = Array.from(files).filter(file => {
      // Check file type
      const validTypes = accept.split(',').map(type => type.trim());
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `Only ${validTypes.join(', ')} files are allowed.`,
          variant: "destructive",
        });
        return false;
      }

      // Check file size
      if (file.size > maxFileSize) {
        toast({
          title: "File too large",
          description: `File must be smaller than ${Math.round(maxFileSize / (1024 * 1024))}MB.`,
          variant: "destructive",
        });
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) return;

    // If single upload mode, only process the first file
    const filesToUpload = multiple ? validFiles : [validFiles[0]];

    for (const file of filesToUpload) {
      // Create immediate local preview using blob URL
      const blobUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(blobUrl);
      
      // Call onPreviewReady immediately for instant preview
      if (onPreviewReady) {
        onPreviewReady(blobUrl);
      }

      // Then start the upload process
      await uploadFile(file, blobUrl);
    }
  };

  const uploadFile = async (file: File, blobUrl: string) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Handle upload completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            
            // Clean up the blob URL since we now have the server URL
            if (blobUrl && blobUrlsRef.current.has(blobUrl)) {
              URL.revokeObjectURL(blobUrl);
              blobUrlsRef.current.delete(blobUrl);
            }
            
            // Call onUploadComplete with the server URL
            onUploadComplete(response.url);
            toast({
              title: "Upload successful",
              description: "Your image has been uploaded successfully.",
            });
          } catch (error) {
            throw new Error("Invalid response format");
          }
        } else {
          // Enhanced error handling for non-JSON responses
          let errorMessage = `Upload failed with status ${xhr.status}`;
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorMessage;
          } catch (parseError) {
            // Handle non-JSON error responses (e.g., HTML error pages)
            if (xhr.responseText && xhr.responseText.trim()) {
              // Extract meaningful error from HTML if present
              const textContent = xhr.responseText.replace(/<[^>]*>/g, '').trim();
              if (textContent.length > 0 && textContent.length < 200) {
                errorMessage = textContent;
              }
            }
          }
          throw new Error(errorMessage);
        }
        setIsUploading(false);
        setUploadProgress(0);
      });

      // Handle upload errors
      xhr.addEventListener('error', () => {
        setIsUploading(false);
        setUploadProgress(0);
        toast({
          title: "Upload failed",
          description: "Network error occurred during upload. Please check your connection.",
          variant: "destructive",
        });
      });

      // Handle upload timeouts
      xhr.addEventListener('timeout', () => {
        setIsUploading(false);
        setUploadProgress(0);
        toast({
          title: "Upload timeout",
          description: "Upload took too long. Please try again.",
          variant: "destructive",
        });
      });

      xhr.open('POST', '/api/uploads/images');
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      const token = getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 60000;
      xhr.send(formData);

    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      
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

  return (
    <div className={cn("relative", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
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

interface ImagePreviewProps {
  src: string;
  alt: string;
  onRemove: () => void;
  className?: string;
}

export function ImagePreview({ src, alt, onRemove, className }: ImagePreviewProps) {
  return (
    <div className={cn("relative group", className)}>
      <img 
        src={src} 
        alt={alt} 
        className="w-full h-full object-cover rounded-lg"
      />
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
        onClick={onRemove}
        data-testid="button-remove-image"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
