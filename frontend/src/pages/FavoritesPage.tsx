/**
 * FavoritesPage - View and manage saved listings
 */

import { useState } from 'react';
import { Loader2, MapPin, Bed, Bath, Ruler, ExternalLink, Trash2, Star, TrendingDown, TrendingUp, MessageSquare } from 'lucide-react';
import { useFavorites, useUpdateFavorite, useRemoveFavorite } from '../api';
import type { Listing } from '../types';

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(price);
}

interface FavoriteCardProps {
  listing: Listing;
  onRemove: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateRating: (rating: number) => void;
}

function FavoriteCard({ listing, onRemove, onUpdateNotes, onUpdateRating }: FavoriteCardProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(listing.notes || '');

  const priceHistory = listing.price_history || [];
  const hasPriceChange = priceHistory.length > 1;
  const priceChange = hasPriceChange
    ? listing.price - priceHistory[0].price
    : 0;

  const handleSaveNotes = () => {
    onUpdateNotes(notes);
    setShowNotes(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Image */}
      <div className="relative h-48">
        {listing.image_urls?.[0] ? (
          <img
            src={listing.image_urls[0]}
            alt={listing.street}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-400">No image</span>
          </div>
        )}
        {/* Price badge with change indicator */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="bg-black/70 text-white px-3 py-1 rounded-full font-bold">
            {formatPrice(listing.price)}
          </span>
          {hasPriceChange && priceChange !== 0 && (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                priceChange < 0
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              }`}
            >
              {priceChange < 0 ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <TrendingUp className="w-3 h-3" />
              )}
              {formatPrice(Math.abs(priceChange))}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-bold text-gray-900 truncate">{listing.street}</h3>
        <div className="flex items-center text-gray-600 text-sm mt-1">
          <MapPin className="w-4 h-4 mr-1" />
          {[listing.town, listing.province].filter(Boolean).join(', ')}
        </div>

        <div className="flex items-center gap-4 mt-3 text-sm text-gray-700">
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
              <span>{listing.sqft.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-3">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onUpdateRating(star)}
              className="focus:outline-none"
            >
              <Star
                className={`w-5 h-5 ${
                  star <= (listing.rating || 0)
                    ? 'text-yellow-400 fill-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Notes */}
        {showNotes ? (
          <div className="mt-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this listing..."
              className="w-full border rounded-lg p-2 text-sm resize-none h-20"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setShowNotes(false)}
                className="px-3 py-1 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        ) : listing.notes ? (
          <div
            onClick={() => setShowNotes(true)}
            className="mt-3 p-2 bg-gray-50 rounded-lg text-sm text-gray-600 cursor-pointer"
          >
            {listing.notes}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
              title="Add notes"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <a
              href={listing.realtor_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-gray-100 text-blue-600"
              title="View on Realtor.ca"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
          <button
            onClick={onRemove}
            className="p-2 rounded-full hover:bg-red-100 text-red-600"
            title="Remove from favorites"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function FavoritesPage() {
  const { data: favorites, isLoading } = useFavorites();
  const updateMutation = useUpdateFavorite();
  const removeMutation = useRemoveFavorite();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!favorites || favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <Star className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-lg font-medium">No favorites yet</p>
        <p className="text-sm mt-1 text-center">
          Swipe right on listings you like to save them here
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-100">
      <header className="bg-white shadow-sm px-4 py-3 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">
          Favorites ({favorites.length})
        </h1>
      </header>

      <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {favorites.map((listing) => (
          <FavoriteCard
            key={listing.id}
            listing={listing}
            onRemove={() => removeMutation.mutate(listing.id)}
            onUpdateNotes={(notes) =>
              updateMutation.mutate({ listingId: listing.id, notes })
            }
            onUpdateRating={(rating) =>
              updateMutation.mutate({ listingId: listing.id, rating })
            }
          />
        ))}
      </div>
    </div>
  );
}
