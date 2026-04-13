import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

const IMAGE_CACHE_STORAGE_KEY = 'optimized-image-cache.v1'
const MAX_CACHED_IMAGE_COUNT = 200
const loadedImageCache = new Set()
let loadedImageCacheHydrated = false

const normalizeCachedImageSrc = (value = '') => String(value || '').trim()

const hydrateLoadedImageCache = () => {
  if (loadedImageCacheHydrated || typeof window === 'undefined') return
  loadedImageCacheHydrated = true

  try {
    const raw = window.sessionStorage.getItem(IMAGE_CACHE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    parsed
      .map((entry) => normalizeCachedImageSrc(entry))
      .filter(Boolean)
      .slice(-MAX_CACHED_IMAGE_COUNT)
      .forEach((entry) => loadedImageCache.add(entry))
  } catch {
    // Ignore session cache read failures.
  }
}

const persistLoadedImageCache = () => {
  if (typeof window === 'undefined') return

  try {
    const values = Array.from(loadedImageCache).slice(-MAX_CACHED_IMAGE_COUNT)
    window.sessionStorage.setItem(IMAGE_CACHE_STORAGE_KEY, JSON.stringify(values))
  } catch {
    // Ignore session cache write failures.
  }
}

const hasLoadedImageCached = (src) => {
  const normalized = normalizeCachedImageSrc(src)
  if (!normalized) return false
  hydrateLoadedImageCache()
  return loadedImageCache.has(normalized)
}

const markImageAsCached = (src) => {
  const normalized = normalizeCachedImageSrc(src)
  if (!normalized) return
  hydrateLoadedImageCache()
  if (loadedImageCache.has(normalized)) return
  loadedImageCache.add(normalized)
  if (loadedImageCache.size > MAX_CACHED_IMAGE_COUNT) {
    const oldest = loadedImageCache.values().next().value
    if (oldest) {
      loadedImageCache.delete(oldest)
    }
  }
  persistLoadedImageCache()
}

/**
 * OptimizedImage Component
 * 
 * Features:
 * - Lazy loading with Intersection Observer
 * - Responsive srcset for different screen sizes
 * - WebP/AVIF format support with fallback
 * - Blur placeholder (LQIP) for smooth loading
 * - Preloading for critical images
 * - Proper decoding and fetchpriority
 * - Error handling with fallback
 */
const OptimizedImage = ({
  src,
  alt,
  className = '',
  priority = false, // For above-the-fold images
  sizes = '100vw',
  objectFit = 'cover',
  placeholder = 'blur',
  blurDataURL,
  onLoad,
  onError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(() => hasLoadedImageCached(src))
  const [hasError, setHasError] = useState(false)
  const [isInView, setIsInView] = useState(() => priority || hasLoadedImageCached(src))
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  useEffect(() => {
    const cached = hasLoadedImageCached(src)
    setIsLoaded(cached)
    setHasError(false)
    setIsInView(priority || cached)
  }, [src, priority])

  const isCloudinaryUrl = (imageSrc) => {
    if (!imageSrc || typeof imageSrc !== 'string') return false

    try {
      const url = new URL(imageSrc)
      return url.hostname.includes('res.cloudinary.com')
    } catch {
      return false
    }
  }

  // Check if image URL supports optimization transforms
  const supportsOptimization = (imageSrc) => {
    if (!imageSrc || typeof imageSrc !== 'string' || imageSrc === '') return false
    if (imageSrc.startsWith('data:') || imageSrc.startsWith('/')) return false
    return isCloudinaryUrl(imageSrc)
  }

  // Generate responsive srcset
  const generateSrcSet = (imageSrc) => {
    if (!supportsOptimization(imageSrc)) return undefined

    // Generate different sizes for responsive images
    const widths = [400, 600, 800, 1200, 1600]

    try {
      const url = new URL(imageSrc)
      return widths
        .map((width) => {
          const sizedUrl = new URL(url.toString())
          sizedUrl.searchParams.set('w', String(width))
          if (!sizedUrl.searchParams.has('q')) {
            sizedUrl.searchParams.set('q', '80')
          }
          return `${sizedUrl.toString()} ${width}w`
        })
        .join(', ')
    } catch {
      return undefined
    }
  }

  // Generate WebP srcset
  const generateWebPSrcSet = (imageSrc) => {
    if (!supportsOptimization(imageSrc)) return undefined

    const widths = [400, 600, 800, 1200, 1600]

    try {
      const url = new URL(imageSrc)
      return widths
        .map((width) => {
          const sizedUrl = new URL(url.toString())
          sizedUrl.searchParams.set('w', String(width))
          if (!sizedUrl.searchParams.has('q')) {
            sizedUrl.searchParams.set('q', '80')
          }
          sizedUrl.searchParams.set('format', 'webp')
          return `${sizedUrl.toString()} ${width}w`
        })
        .join(', ')
    } catch {
      return undefined
    }
  }

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return

    if (!imgRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            if (observerRef.current && imgRef.current) {
              observerRef.current.unobserve(imgRef.current)
            }
          }
        })
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01
      }
    )

    observerRef.current.observe(imgRef.current)

    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current)
      }
    }
  }, [priority, isInView, src])

  // Preload critical images
  useEffect(() => {
    if (priority && src && !src.startsWith('data:') && !supportsOptimization(src)) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = src
      link.fetchPriority = 'high'
      document.head.appendChild(link)

      return () => {
        document.head.removeChild(link)
      }
    }
  }, [priority, src])

  const handleLoad = (e) => {
    markImageAsCached(src)
    setIsLoaded(true)
    if (onLoad) onLoad(e)
  }

  const handleError = (e) => {
    setHasError(true)
    if (onError) onError(e)
  }

  // Default blur placeholder (tiny gray square)
  const defaultBlurDataURL = blurDataURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg=='

  // Don't render if src is empty or null
  if (!src || src === '') {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      </div>
    )
  }

  const imageSrc = hasError ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle"%3EImage not found%3C/text%3E%3C/svg%3E' : src

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {/* Blur Placeholder */}
      {placeholder === 'blur' && !isLoaded && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 1 }}
          animate={{ opacity: isLoaded ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          style={{
            backgroundImage: `url(${defaultBlurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Loading Skeleton */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-pulse" />
      )}

      {/* Actual Image */}
      {isInView && (
        <picture className="absolute inset-0 w-full h-full">
          {/* WebP source for modern browsers */}
          {generateWebPSrcSet(imageSrc) && (
            <source
              srcSet={generateWebPSrcSet(imageSrc)}
              sizes={sizes}
              type="image/webp"
            />
          )}
          
          {/* Fallback to original format */}
          <motion.img
            src={imageSrc}
            srcSet={generateSrcSet(imageSrc)}
            sizes={supportsOptimization(imageSrc) ? sizes : undefined}
            alt={alt}
            className={`w-full h-full ${objectFit === 'cover' ? 'object-cover' : objectFit === 'contain' ? 'object-contain' : ''} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            referrerPolicy="no-referrer"
            onLoad={handleLoad}
            onError={handleError}
            {...props}
          />
        </picture>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      )}
    </div>
  )
}

export default OptimizedImage

