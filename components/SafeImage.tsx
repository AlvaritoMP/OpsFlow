import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService';

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  bucket?: string; // Bucket de Supabase Storage para regenerar URL si falla
  fallback?: React.ReactNode; // Componente a mostrar si la imagen falla
  onError?: () => void;
  onClick?: () => void; // Handler de click
}

/**
 * Componente que maneja imágenes con regeneración automática de URLs de Supabase Storage
 * Si una imagen falla al cargar, intenta regenerar la URL usando el bucket especificado
 */
export const SafeImage: React.FC<SafeImageProps> = ({ 
  src, 
  alt, 
  className = '', 
  bucket,
  fallback,
  onError,
  onClick
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(src || null);
  const [hasError, setHasError] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Actualizar src cuando cambie la prop
  useEffect(() => {
    if (src) {
      setImageSrc(src);
      setHasError(false);
    } else {
      setImageSrc(null);
      setHasError(true);
    }
  }, [src]);

  const handleImageError = async () => {
    if (hasError || !imageSrc || !bucket) {
      setHasError(true);
      onError?.();
      return;
    }

    // Si ya estamos regenerando, no intentar de nuevo
    if (isRegenerating) {
      setHasError(true);
      onError?.();
      return;
    }

    setIsRegenerating(true);

    try {
      // Intentar regenerar la URL
      const regeneratedUrl = await storageService.validateAndRegenerateImageUrl(imageSrc, bucket);
      
      if (regeneratedUrl && regeneratedUrl !== imageSrc) {
        console.log(`🔄 Regenerando URL de imagen fallida: ${imageSrc} -> ${regeneratedUrl}`);
        setImageSrc(regeneratedUrl);
        setHasError(false);
        setIsRegenerating(false);
        // La imagen se recargará automáticamente con la nueva URL
        return;
      }
    } catch (error) {
      console.error('❌ Error al regenerar URL de imagen:', error);
    }

    // Si no se pudo regenerar, marcar como error
    setHasError(true);
    setIsRegenerating(false);
    onError?.();
  };

  if (!imageSrc || hasError) {
    if (fallback) {
      return <>{fallback}</>;
    }
    // Fallback por defecto: mostrar iniciales o placeholder
    const initials = alt
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    return (
      <div className={`${className} bg-slate-200 flex items-center justify-center text-slate-500 font-bold`}>
        {initials || '?'}
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={handleImageError}
      onClick={onClick}
      loading="lazy"
    />
  );
};

