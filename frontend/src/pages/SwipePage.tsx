/**
 * SwipePage - Main Tinder-style swiping interface
 */

import { useState, useCallback } from 'react';
import { Filter, Loader2, RefreshCw } from 'lucide-react';
import { SwipeCard, SwipeButtons } from '../components/SwipeCard';
import { useListings, useSwipe } from '../api';
import type { ListingFilters } from '../types';

export function SwipePage() {
  const [filters, setFilters] = useState<ListingFilters>({
    maxPrice: 700000,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: listings, isLoading, refetch, isFetching } = useListings(filters);
  const swipeMutation = useSwipe();

  const handleSwipe = useCallback(
    (direction: 'left' | 'right' | 'super') => {
      if (!listings || currentIndex >= listings.length) return;

      const listing = listings[currentIndex];
      swipeMutation.mutate({ listingId: listing.id, direction });
      setCurrentIndex((prev) => prev + 1);
    },
    [listings, currentIndex, swipeMutation]
  );

  const handleRefresh = () => {
    setCurrentIndex(0);
    refetch();
  };

  const visibleListings = listings?.slice(currentIndex, currentIndex + 2) || [];
  const hasMore = listings && currentIndex < listings.length;

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Nestd</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full ${showFilters ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-b px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Max Price</label>
              <select
                value={filters.maxPrice || ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    maxPrice: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                <option value="300000">$300k</option>
                <option value="400000">$400k</option>
                <option value="500000">$500k</option>
                <option value="600000">$600k</option>
                <option value="700000">$700k</option>
                <option value="800000">$800k</option>
                <option value="1000000">$1M</option>
                <option value="1500000">$1.5M</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Min Beds</label>
              <select
                value={filters.minBeds || ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minBeds: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
                <option value="5">5+</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Min Baths</label>
              <select
                value={filters.minBaths || ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minBaths: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Province</label>
              <select
                value={filters.province || ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    province: e.target.value || undefined,
                  }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                <option value="Ontario">Ontario</option>
                <option value="British Columbia">BC</option>
                <option value="Quebec">Quebec</option>
                <option value="Alberta">Alberta</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => {
              setCurrentIndex(0);
              refetch();
              setShowFilters(false);
            }}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium"
          >
            Apply Filters
          </button>
        </div>
      )}

      {/* Card Stack */}
      <div className="flex-1 relative overflow-hidden p-4">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : !hasMore ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <p className="text-lg font-medium">No more listings</p>
            <p className="text-sm mt-1">Adjust your filters or check back later</p>
            <button
              onClick={handleRefresh}
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg"
            >
              Refresh
            </button>
          </div>
        ) : (
          visibleListings.map((listing, index) => (
            <SwipeCard
              key={listing.id}
              listing={listing}
              onSwipe={handleSwipe}
              isTop={index === 0}
            />
          ))
        )}
      </div>

      {/* Swipe Buttons */}
      {hasMore && <SwipeButtons onSwipe={handleSwipe} />}
    </div>
  );
}
