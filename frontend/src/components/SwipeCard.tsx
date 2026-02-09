/**
 * SwipeCard - Tinder-style swipeable listing card
 * Uses framer-motion for smooth gestures
 */

import { useState } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Heart, X, Star, MapPin, Bed, Bath, Ruler, ExternalLink } from 'lucide-react';
import type { Listing } from '../types';

interface SwipeCardProps {
  listing: Listing;
  onSwipe: (direction: 'left' | 'right' | 'super') => void;
  isTop: boolean;
}

export function SwipeCard({ listing, onSwipe, isTop }: SwipeCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [exitX, setExitX] = useState(0);
  const [exitY, setExitY] = useState(0);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Rotate card based on drag
  const rotate = useTransform(x, [-200, 200], [-15, 15]);

  // Opacity for left/right indicators
  const leftOpacity = useTransform(x, [-100, 0], [1, 0]);
  const rightOpacity = useTransform(x, [0, 100], [0, 1]);
  const superOpacity = useTransform(y, [-100, 0], [1, 0]);

  const images = listing.image_urls?.filter(Boolean) || [];
  const hasImages = images.length > 0;

  const handleDragEnd = (_: never, info: PanInfo) => {
    const swipeThreshold = 100;
    const velocityThreshold = 500;

    // Super like (swipe up)
    if (info.offset.y < -swipeThreshold || info.velocity.y < -velocityThreshold) {
      setExitY(-1000);
      onSwipe('super');
      return;
    }

    // Right swipe (like)
    if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      setExitX(1000);
      onSwipe('right');
      return;
    }

    // Left swipe (pass)
    if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      setExitX(-1000);
      onSwipe('left');
      return;
    }
  };

  const nextImage = () => {
    if (currentImageIndex < images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <motion.div
      className={`absolute inset-0 ${isTop ? 'z-10' : 'z-0'}`}
      style={{ x, y, rotate }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={1}
      onDragEnd={handleDragEnd}
      animate={exitX !== 0 || exitY !== 0 ? { x: exitX, y: exitY, opacity: 0 } : {}}
      transition={{ duration: 0.3 }}
    >
      <div className="h-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Image Section */}
        <div className="relative flex-1 min-h-0">
          {hasImages ? (
            <>
              <img
                src={images[currentImageIndex]}
                alt={listing.street}
                className="w-full h-full object-cover"
                onError={(_e) => {
                  // Try next image on error
                  if (currentImageIndex < images.length - 1) {
                    setCurrentImageIndex(currentImageIndex + 1);
                  }
                }}
              />
              {/* Image navigation areas */}
              <div className="absolute inset-0 flex">
                <div className="w-1/3 h-full" onClick={prevImage} />
                <div className="w-1/3 h-full" />
                <div className="w-1/3 h-full" onClick={nextImage} />
              </div>
              {/* Image indicators */}
              {images.length > 1 && (
                <div className="absolute top-3 left-0 right-0 flex justify-center gap-1">
                  {images.slice(0, 10).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all ${
                        i === currentImageIndex ? 'w-6 bg-white' : 'w-2 bg-white/50'
                      }`}
                    />
                  ))}
                  {images.length > 10 && (
                    <span className="text-white text-xs ml-1">+{images.length - 10}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-400">No images</span>
            </div>
          )}

          {/* Swipe indicators */}
          {isTop && (
            <>
              <motion.div
                className="absolute top-4 left-4 bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xl rotate-[-15deg] border-4 border-red-500"
                style={{ opacity: leftOpacity }}
              >
                NOPE
              </motion.div>
              <motion.div
                className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-xl rotate-[15deg] border-4 border-green-500"
                style={{ opacity: rightOpacity }}
              >
                LIKE
              </motion.div>
              <motion.div
                className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-xl border-4 border-blue-500"
                style={{ opacity: superOpacity }}
              >
                SUPER
              </motion.div>
            </>
          )}

          {/* Price badge */}
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded-full text-lg font-bold">
            {listing.price ? formatPrice(listing.price) : 'Price N/A'}
          </div>
        </div>

        {/* Info Section */}
        <div className="p-4 bg-white">
          <h2 className="text-lg font-bold text-gray-900 truncate">
            {listing.street}
          </h2>
          <div className="flex items-center text-gray-600 text-sm mt-1">
            <MapPin className="w-4 h-4 mr-1" />
            {[listing.town, listing.province].filter(Boolean).join(', ')}
          </div>

          <div className="flex items-center gap-4 mt-3 text-gray-700">
            {listing.beds > 0 && (
              <div className="flex items-center gap-1">
                <Bed className="w-4 h-4" />
                <span>{listing.beds}</span>
              </div>
            )}
            {listing.baths > 0 && (
              <div className="flex items-center gap-1">
                <Bath className="w-4 h-4" />
                <span>{listing.baths}</span>
              </div>
            )}
            {listing.sqft && (
              <div className="flex items-center gap-1">
                <Ruler className="w-4 h-4" />
                <span>{listing.sqft.toLocaleString()} sqft</span>
              </div>
            )}
            <a
              href={listing.realtor_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-blue-600 hover:text-blue-800"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface SwipeButtonsProps {
  onSwipe: (direction: 'left' | 'right' | 'super') => void;
}

export function SwipeButtons({ onSwipe }: SwipeButtonsProps) {
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      <button
        onClick={() => onSwipe('left')}
        className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center text-red-500 hover:scale-110 transition-transform active:scale-95"
      >
        <X className="w-8 h-8" />
      </button>
      <button
        onClick={() => onSwipe('super')}
        className="w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center text-blue-500 hover:scale-110 transition-transform active:scale-95"
      >
        <Star className="w-6 h-6" />
      </button>
      <button
        onClick={() => onSwipe('right')}
        className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center text-green-500 hover:scale-110 transition-transform active:scale-95"
      >
        <Heart className="w-8 h-8" />
      </button>
    </div>
  );
}
