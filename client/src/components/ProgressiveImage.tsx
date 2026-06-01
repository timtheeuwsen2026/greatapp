import { useProgressiveImage } from '@/hooks/useProgressiveImage';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ProgressiveImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  aspectRatio?: 'video' | 'square' | 'auto';
  objectFit?: 'cover' | 'contain';
}

export function ProgressiveImage({
  src,
  alt,
  className,
  aspectRatio = 'auto',
  objectFit = 'cover',
}: ProgressiveImageProps) {
  const { imgSrc, isLoading, imgRef } = useProgressiveImage(src);

  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    auto: '',
  };

  const objectFitClasses = {
    cover: 'object-cover',
    contain: 'object-contain',
  };

  if (isLoading || !imgSrc) {
    return (
      <div
        ref={imgRef as any}
        className={cn(aspectClasses[aspectRatio], className)}
      >
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  return (
    <img
      ref={imgRef as any}
      src={imgSrc}
      alt={alt}
      loading="lazy"
      className={cn(
        aspectClasses[aspectRatio],
        objectFitClasses[objectFit],
        'w-full h-full',
        className
      )}
    />
  );
}
