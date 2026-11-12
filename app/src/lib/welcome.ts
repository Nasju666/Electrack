// Remembers whether the first-launch introduction has been shown on this phone.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'electrack.welcomeSeen';

/** Filled in by loadWelcomeSeen() while the splash is on screen, then read synchronously. */
export const welcome = { seen: true };

export async function loadWelcomeSeen() {
  try {
    welcome.seen = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    welcome.seen = true; // if storage fails, skip the introduction rather than repeat it forever
  }
}

export async function markWelcomeSeen() {
  welcome.seen = true;
  await AsyncStorage.setItem(KEY, '1').catch(() => {});
}
