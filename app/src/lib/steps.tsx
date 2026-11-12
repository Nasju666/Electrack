import { View } from 'react-native';
import { colors } from './ui';

/** The three-part progress bar of the setup flow: home, pair, name. */
export function Steps({ done }: { done: 1 | 2 | 3 }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 22 }}>
      {[1, 2, 3].map((step) => (
        <View key={step} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step <= done ? colors.brand : colors.border }} />
      ))}
    </View>
  );
}
