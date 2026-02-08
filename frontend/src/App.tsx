/**
 * Nestd - Main App Component
 */

import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider, SignIn, useAuth } from '@clerk/clerk-react';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Nestd</h1>
            <p className="text-gray-600 mt-2">Swipe your way to your dream home</p>
          </div>
          <SignIn />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <h1 className="text-2xl font-bold">Welcome to Nestd!</h1>
    </div>
  );
}

export default function App() {
  if (!clerkPubKey) {
    return (
      <div className="h-screen flex items-center justify-center text-red-600">
        Missing VITE_CLERK_PUBLISHABLE_KEY
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </ClerkProvider>
  );
}
