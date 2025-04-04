'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react' // Import useMemo
import { useRouter, usePathname } from 'next/navigation'
import { User, Session, AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client' // Assuming this correctly creates a client-side Supabase instance
import type { Database } from '@/lib/supabase/database.types' // Import generated types
import { AUTH_REDIRECT_URLS } from '@/lib/constants'
import { getBaseUrl } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'

const REDIRECT_PATH_STORAGE_KEY = 'auth_redirect_path'

// Define Profile type based on your database.types.ts (adjust if needed)
type Profile = Database['public']['Tables']['profiles']['Row'];

type AuthContextType = {
  supabase: SupabaseClient<Database> // Use typed client
  user: User | null
  profile: Profile | null // Add profile state
  isSubscribed: boolean // Simple flag for active subscription
  loadingAuth: boolean // Rename loading to be specific
  loadingProfile: boolean // Add loading state for profile/subscription
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, redirectToPath?: string | null) => Promise<{ error?: string, success?: boolean }>
  signOut: (returnUrl?: string) => Promise<void>
  signInWithGoogle: (redirectToPath?: string | null) => Promise<{ error: string | null }>
  sendPasswordResetEmail: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true); // Renamed from loading
  const [loadingProfile, setLoadingProfile] = useState(true); // Loading state for profile/subscription
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [initialAuthCheckComplete, setInitialAuthCheckComplete] = useState(false); // Track initial check
  const supabase = createClient(); // Assuming this returns SupabaseClient<Database>

  // Initialize session and listen for auth changes
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    // Check active session and set the user
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (isMounted) {
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        if (isMounted) {
          setLoadingAuth(false); // Auth loading done
          setInitialAuthCheckComplete(true); // Mark initial check done
          // Profile loading might still be ongoing if user exists
        }
      }
    }

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;

        const currentUser = session?.user ?? null;
        const wasPreviouslyLoggedOut = !user; // Check state *before* setUser runs

        setUser(currentUser); // Update user state first
        setLoadingAuth(false); // Auth loading done on change
        // Reset profile loading state when user changes (will be set again by fetchProfile)
        if (!currentUser) {
            setProfile(null);
            setIsSubscribed(false);
            setLoadingProfile(false); // No profile to load if no user
        } else {
            setLoadingProfile(true); // Start loading profile for the new user
        }

        // --- Modified Redirect Logic ---
        // Redirect *only* if:
        // 1. It's a SIGNED_IN event.
        // 2. There's a current user now.
        // 3. The user was definitely logged out *before* this event fired.
        // 4. The initial auth check is complete (prevents premature redirects).
        if (_event === 'SIGNED_IN' && currentUser && wasPreviouslyLoggedOut && initialAuthCheckComplete) {
          const redirectPath = localStorage.getItem(REDIRECT_PATH_STORAGE_KEY);
          localStorage.removeItem(REDIRECT_PATH_STORAGE_KEY); // Clear it

          if (redirectPath && !redirectPath.startsWith('/auth/')) {
            console.log(`[AuthProvider] Redirecting to stored path after sign-in: ${redirectPath}`);
            router.push(redirectPath);
          } else {
            console.log(`[AuthProvider] Redirecting to default path after sign-in: ${ROUTES.HOME}`);
            router.push(ROUTES.HOME); // Default redirect
          }
        }
        // --- End Modified Redirect Logic ---
      }
    );

    // Initial session check (keep as is)
    getSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe()
    }
  }, [supabase.auth, router, initialAuthCheckComplete, user]) // Added user dependency for redirect logic

  // Helper to store redirect path
  const storeRedirectPath = (path?: string | null) => {
    const pathToStore = path || pathname; // Use provided path or current pathname
    if (pathToStore && !pathToStore.startsWith('/auth/')) {
      localStorage.setItem(REDIRECT_PATH_STORAGE_KEY, pathToStore);
      console.log(`[AuthProvider] Stored redirect path: ${pathToStore}`);
    } else {
      // Avoid storing auth paths
      localStorage.removeItem(REDIRECT_PATH_STORAGE_KEY);
    }
  }

  // --- Fetch Profile and Subscription Status ---
  useEffect(() => {
    let isMounted = true;
    setLoadingProfile(true); // Start loading profile whenever user changes

    const fetchProfile = async () => {
      if (user) {
        try {
          const { data, error, status } = await supabase
            .from('profiles')
            .select('*') // Select all profile fields including subscription status
            .eq('id', user.id)
            .single();

          if (error && status !== 406) { // 406 = 'Not Acceptable', usually means no row found
            console.error('Error fetching profile:', error);
            throw error;
          }

          if (isMounted) {
            if (data) {
              setProfile(data);
              // Check for active subscription status
              const isActive = data.subscription_status === 'active' || data.subscription_status === 'trialing';
              setIsSubscribed(isActive);
              console.log(`[AuthProvider] Profile fetched for ${user.id}. Subscribed: ${isActive}`);
            } else {
              // Handle case where profile might not exist yet (e.g., trigger failed)
              setProfile(null);
              setIsSubscribed(false);
               console.warn(`[AuthProvider] Profile not found for user ${user.id}.`);
            }
          }
        } catch (error) {
          if (isMounted) {
            console.error('An error occurred while fetching the profile:', error);
            setProfile(null);
            setIsSubscribed(false);
          }
        } finally {
          if (isMounted) {
            setLoadingProfile(false); // Profile loading finished (success or fail)
          }
        }
      } else {
        // No user, clear profile state and set loading to false
        if (isMounted) {
            setProfile(null);
            setIsSubscribed(false);
            setLoadingProfile(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.id, supabase]); // Re-run only when user ID changes (or user becomes null/defined)

  // Sign in with email and password
  const signIn = useCallback(async (email: string, password: string) => {
    storeRedirectPath(); // Store current path before signing in
    setLoadingAuth(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' }
    } finally {
      // setLoadingAuth(false) // Auth state change handles this
    }
  }, [supabase.auth, pathname]) // Add pathname dependency

  // Sign up with email and password
  const signUp = useCallback(async (email: string, password: string, redirectToPath?: string | null) => {
    storeRedirectPath(redirectToPath); // Store intended redirect path before signing up
    setLoadingAuth(true)
    try {
      // Use redirectToPath if provided, otherwise fallback to current pathname
      const finalRedirectPath = redirectToPath || pathname;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Keep emailRedirectTo for email verification link, but don't rely on its 'next' for post-signin redirect
          emailRedirectTo: `${getBaseUrl()}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}?next=${encodeURIComponent(finalRedirectPath)}`,
        },
      })

      if (error) throw error

      // Redirect to verify page, the main redirect happens via onAuthStateChange
      router.push(AUTH_REDIRECT_URLS.AFTER_SIGN_UP)
      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' }
    } finally {
      // setLoadingAuth(false) // Auth state change handles this
    }
  }, [router, pathname, supabase.auth]) // Add pathname dependency

  // Sign out
  const signOut = useCallback(async (returnUrl?: string) => {
    localStorage.removeItem(REDIRECT_PATH_STORAGE_KEY); // Clear any stored path on sign out
    try {
      await supabase.auth.signOut()
      if (returnUrl) {
        router.push(returnUrl)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }, [router, supabase.auth])

  // Sign in with Google
  const signInWithGoogle = useCallback(async (redirectToPath?: string | null) => {
    storeRedirectPath(redirectToPath); // Store intended redirect path before OAuth
    setLoadingAuth(true)
    try {
       // Use redirectToPath if provided, otherwise fallback to current pathname
      const finalRedirectPath = redirectToPath || pathname;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
           // Keep redirectTo for the OAuth callback itself, but don't rely on its 'next' for post-signin redirect
          redirectTo: `${getBaseUrl()}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}?next=${encodeURIComponent(finalRedirectPath)}`,
        },
      })

      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Google sign in failed' }
    } finally {
      // Don't set loading false here for OAuth, page redirects
      // setLoading(false)
    }
  }, [pathname, supabase.auth])

  // Send Password Reset Email
  const sendPasswordResetEmail = useCallback(async (email: string) => {
    setLoadingAuth(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getBaseUrl()}/auth/update-password`,
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to send password reset email' }
    } finally {
      setLoadingAuth(false)
    }
  }, [supabase.auth])

  // Update User Password
  const updatePassword = useCallback(async (password: string) => {
    setLoadingAuth(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to update password' }
    } finally {
      setLoadingAuth(false)
    }
  }, [supabase.auth])

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    supabase,
    user,
    profile,
    isSubscribed,
    loadingAuth,
    loadingProfile,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    sendPasswordResetEmail,
    updatePassword,
  }), [
    supabase, user, profile, isSubscribed, loadingAuth, loadingProfile,
    signIn, signUp, signOut, signInWithGoogle, sendPasswordResetEmail, updatePassword
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Export useSupabase as alias for useAuth to maintain compatibility with existing code
export const useSupabase = useAuth; 