/**
 * Nestd API Client
 */

import { useAuth } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing, Alert, SavedSearch, UserStats, ListingFilters } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Custom hook for authenticated fetch
 */
function useAuthFetch() {
  const { getToken } = useAuth();

  return async (endpoint: string, options: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  };
}

/**
 * Hook to fetch listings for swiping
 */
export function useListings(filters: ListingFilters = {}) {
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters.minPrice) params.set('minPrice', filters.minPrice.toString());
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice.toString());
  if (filters.minBeds) params.set('minBeds', filters.minBeds.toString());
  if (filters.minBaths) params.set('minBaths', filters.minBaths.toString());
  if (filters.province) params.set('province', filters.province);
  params.set('limit', '20');

  return useQuery({
    queryKey: ['listings', filters],
    queryFn: () => authFetch(`/api/listings?${params}`),
    select: (data: { listings: Listing[] }) => data.listings,
  });
}

/**
 * Hook to fetch a single listing
 */
export function useListing(id: number) {
  const authFetch = useAuthFetch();

  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => authFetch(`/api/listings/${id}`),
    enabled: !!id,
  });
}

/**
 * Hook to record a swipe
 */
export function useSwipe() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, direction }: { listingId: number; direction: 'left' | 'right' | 'super' }) =>
      authFetch('/api/swipes', {
        method: 'POST',
        body: JSON.stringify({ listingId, direction }),
      }),
    onSuccess: () => {
      // Invalidate listings to remove swiped ones
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      // Invalidate favorites if it was a right/super swipe
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      // Update stats
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/**
 * Hook to fetch favorites
 */
export function useFavorites() {
  const authFetch = useAuthFetch();

  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => authFetch('/api/favorites'),
    select: (data: { favorites: Listing[] }) => data.favorites,
  });
}

/**
 * Hook to update favorite notes/rating
 */
export function useUpdateFavorite() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, notes, rating }: { listingId: number; notes?: string; rating?: number }) =>
      authFetch(`/api/favorites/${listingId}`, {
        method: 'PUT',
        body: JSON.stringify({ notes, rating }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

/**
 * Hook to remove from favorites
 */
export function useRemoveFavorite() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: number) =>
      authFetch(`/api/favorites/${listingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/**
 * Hook to fetch alerts
 */
export function useAlerts(unreadOnly = false) {
  const authFetch = useAuthFetch();

  return useQuery({
    queryKey: ['alerts', unreadOnly],
    queryFn: () => authFetch(`/api/alerts?unreadOnly=${unreadOnly}`),
    select: (data: { alerts: Alert[] }) => data.alerts,
  });
}

/**
 * Hook to mark alert as read
 */
export function useMarkAlertRead() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: number) =>
      authFetch(`/api/alerts/${alertId}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/**
 * Hook to fetch saved searches
 */
export function useSavedSearches() {
  const authFetch = useAuthFetch();

  return useQuery({
    queryKey: ['searches'],
    queryFn: () => authFetch('/api/searches'),
    select: (data: { searches: SavedSearch[] }) => data.searches,
  });
}

/**
 * Hook to create saved search
 */
export function useCreateSearch() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (search: Omit<SavedSearch, 'id'>) =>
      authFetch('/api/searches', {
        method: 'POST',
        body: JSON.stringify(search),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searches'] });
    },
  });
}

/**
 * Hook to delete saved search
 */
export function useDeleteSearch() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (searchId: number) =>
      authFetch(`/api/searches/${searchId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searches'] });
    },
  });
}

/**
 * Hook to fetch user stats
 */
export function useStats() {
  const authFetch = useAuthFetch();

  return useQuery({
    queryKey: ['stats'],
    queryFn: () => authFetch('/api/stats') as Promise<UserStats>,
  });
}
