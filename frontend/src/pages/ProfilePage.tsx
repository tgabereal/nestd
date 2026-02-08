/**
 * ProfilePage - User profile and stats
 */

import { useUser, useClerk } from '@clerk/clerk-react';
import { Loader2, LogOut, ChevronRight, Heart, X, Star, TrendingUp, Search, Bell, Settings } from 'lucide-react';
import { useStats, useSavedSearches } from '../api';

export function ProfilePage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { signOut } = useClerk();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: searches } = useSavedSearches();

  if (!userLoaded || statsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-br from-blue-500 to-purple-600 px-4 pt-8 pb-12">
        <div className="flex items-center gap-4">
          <img
            src={user?.imageUrl}
            alt={user?.fullName || 'User'}
            className="w-16 h-16 rounded-full border-2 border-white shadow-lg"
          />
          <div className="text-white">
            <h1 className="text-xl font-bold">{user?.fullName || 'User'}</h1>
            <p className="text-white/80 text-sm">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="px-4 -mt-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Your Activity</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-green-500">
                <Heart className="w-5 h-5" />
                <span className="text-2xl font-bold">{stats?.swipes.right || 0}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Liked</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-red-500">
                <X className="w-5 h-5" />
                <span className="text-2xl font-bold">{stats?.swipes.left || 0}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Passed</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-blue-500">
                <Star className="w-5 h-5" />
                <span className="text-2xl font-bold">{stats?.swipes.super || 0}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Super</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Heart className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold">{stats?.favorites || 0}</p>
                <p className="text-xs text-gray-500">Favorites</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-lg font-bold">{stats?.totalSwipes || 0}</p>
                <p className="text-xs text-gray-500">Total Swipes</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Searches */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl shadow-sm">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-medium">Saved Searches</h2>
            <button className="text-blue-600 text-sm">+ New</button>
          </div>
          {searches && searches.length > 0 ? (
            <div className="divide-y">
              {searches.map((search) => (
                <div
                  key={search.id}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Search className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{search.name}</p>
                      <p className="text-xs text-gray-500">
                        {[
                          search.max_price && `Under $${(search.max_price / 1000).toFixed(0)}k`,
                          search.min_beds && `${search.min_beds}+ beds`,
                          search.provinces?.join(', '),
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {search.alerts_enabled && (
                      <Bell className="w-4 h-4 text-blue-500" />
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm">No saved searches yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 mt-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm divide-y">
          <button className="flex items-center justify-between w-full p-4">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-gray-500" />
              <span>Settings</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <button
            onClick={() => signOut()}
            className="flex items-center justify-between w-full p-4 text-red-600"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
