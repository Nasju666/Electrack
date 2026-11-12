import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Set these in app/.env.local (see .env.example). The publishable key is safe
// to ship inside the app; Row Level Security decides what each user can read.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://not-configured', key ?? 'not-configured', {
  auth: {
    storage: AsyncStorage, // stay signed in between app launches
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the login token only while the app is on screen.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
