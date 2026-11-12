import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Set these in app/.env.local (see .env.example). The publishable key is safe
// to ship inside the app; Row Level Security decides what it can read.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://not-configured', key ?? 'not-configured', {
  // No login in the thin slice. Sessions arrive with the auth step.
  auth: { persistSession: false, autoRefreshToken: false },
});
