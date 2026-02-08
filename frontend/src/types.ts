/**
 * Nestd Types
 */

export interface Listing {
  id: number;
  realtor_url: string;
  price: number;
  street: string;
  town: string;
  province: string;
  beds: number;
  baths: number;
  sqft: number | null;
  lat: number | null;
  lng: number | null;
  image_urls: string[];
  listed_at: string | null;
  first_seen_at: string;
  price_history?: PricePoint[];
  favorite_id?: number;
  notes?: string;
  rating?: number;
  favorited_at?: string;
}

export interface PricePoint {
  price: number;
  recorded_at: string;
}

export interface User {
  id: number;
  clerk_id: string;
  email: string;
  name: string;
  avatar_url: string;
}

export interface SavedSearch {
  id: number;
  name: string;
  min_price: number | null;
  max_price: number | null;
  min_beds: number | null;
  min_baths: number | null;
  towns: string[] | null;
  provinces: string[] | null;
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  alerts_enabled: boolean;
}

export interface Alert {
  id: number;
  listing_id: number;
  alert_type: 'new_listing' | 'price_drop' | 'price_increase';
  old_price: number | null;
  new_price: number | null;
  read_at: string | null;
  created_at: string;
  street: string;
  town: string;
  price: number;
  image_url: string;
}

export interface UserStats {
  swipes: {
    left: number;
    right: number;
    super: number;
  };
  totalSwipes: number;
  favorites: number;
  unreadAlerts: number;
}

export interface ListingFilters {
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  province?: string;
}
