// ElecTrack design system: dark theme, one set of building blocks for every screen.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type IconName = keyof typeof Ionicons.glyphMap;

export const colors = {
  bg: '#07111F',
  card: '#0F1D30',
  cardRaised: '#13243A',
  border: '#1E3048',
  accentCard: '#0D2C33',
  accentBorder: '#1C5550',
  brand: '#22D39A',
  onBrand: '#04241A',
  text: '#FFFFFF',
  sub: '#A9B8CA',
  muted: '#7F90A6',
  bar: '#1F5673',
  cyan: '#38C6F4',
  amber: '#F5B544',
  danger: '#FF5C6C',
  onDanger: '#2A0A0E',
};

export type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'muted';
const TONE: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: colors.brand, bg: 'rgba(34,211,154,0.14)' },
  info: { fg: colors.cyan, bg: 'rgba(56,198,244,0.14)' },
  warn: { fg: colors.amber, bg: 'rgba(245,181,68,0.14)' },
  danger: { fg: colors.danger, bg: 'rgba(255,92,108,0.14)' },
  muted: { fg: colors.sub, bg: 'rgba(169,184,202,0.12)' },
};
export const tone = (t: Tone) => TONE[t];

/** Page. Tab screens pad the top only; stack screens (with a back button) pad top and bottom. */
export function Screen({
  children,
  bottom = false,
  footer,
}: {
  children: ReactNode;
  bottom?: boolean;
  footer?: ReactNode; // pinned below the scrolling content, e.g. the main button
}) {
  // Content rises into place when the screen opens.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [enter]);
  const rise = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] };
  return (
    <SafeAreaView style={styles.screen} edges={bottom || footer ? ['top', 'bottom'] : ['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View style={rise}>{children}</Animated.View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Header({
  title,
  subtitle,
  onBack,
  right,
  admin = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  admin?: boolean;
}) {
  return (
    <View style={styles.header}>
      {onBack ? <IconButton icon="chevron-back" onPress={onBack} label="Back" /> : null}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.h1} numberOfLines={1}>
            {title}
          </Text>
          {admin ? <Pill text="ADMIN" tone="ok" /> : null}
        </View>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function IconButton({ icon, onPress, label, dot = false }: { icon: IconName; onPress: () => void; label: string; dot?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.iconButton} accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={18} color={colors.sub} />
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export function Card({
  children,
  accent = false,
  onPress,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const look = [styles.card, accent && styles.cardAccent, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [look, pressed && { opacity: 0.8 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={look}>{children}</View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const off = busy || disabled;
  const fg = kind === 'primary' ? colors.onBrand : kind === 'danger' ? colors.onDanger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && { backgroundColor: colors.danger },
        disabled && { backgroundColor: colors.cardRaised },
        (busy || pressed) && { opacity: 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={disabled ? colors.muted : fg} /> : null}
          <Text style={[styles.buttonText, { color: disabled ? colors.muted : fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  icon,
  hint,
  password = false,
  ...input
}: { label: string; icon?: IconName; hint?: string; password?: boolean } & TextInputProps) {
  const [hidden, setHidden] = useState(password);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>
        {icon ? <Ionicons name={icon} size={18} color={colors.muted} style={{ marginRight: 10 }} /> : null}
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.muted}
          selectionColor={colors.brand}
          secureTextEntry={hidden}
          {...input}
        />
        {password ? (
          <Pressable onPress={() => setHidden(!hidden)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

type Option<T extends string> = { id: T; label: string };

/** Filter chips: one selected at a time. */
export function Chips<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && { color: colors.onBrand, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Segmented control for switching a view (Day / Week / Month). */
export function Segmented<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segments}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} style={[styles.segment, on && styles.segmentOn]}>
            <Text style={[styles.segmentText, on && { color: colors.text, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tappable tiles for picking one thing, e.g. an appliance category. */
export function TileChoice({
  options,
  value,
  onChange,
}: {
  options: { id: string; icon: IconName }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.tiles}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} style={[styles.tile, on && styles.tileOn]}>
            <Ionicons name={o.icon} size={22} color={on ? colors.brand : colors.sub} />
            <Text style={[styles.tileText, on && { color: colors.brand }]} numberOfLines={1}>
              {o.id}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ text, tone: t = 'muted', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const look = TONE[t];
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={look.fg} /> : null}
      <Text style={[styles.pillText, { color: look.fg }]}>{text}</Text>
    </View>
  );
}

export function IconTile({ icon, tone: t = 'ok', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const look = TONE[t];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.48} color={look.fg} />
    </View>
  );
}

/** One line in a settings-style list. */
export function Row({
  icon,
  tone: t = 'info',
  title,
  value,
  onPress,
  first = false,
}: {
  icon: IconName;
  tone?: Tone;
  title: string;
  value?: string;
  onPress?: () => void;
  first?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, !first && styles.rowBorder]}>
      <IconTile icon={icon} tone={t} size={34} />
      <Text style={[styles.rowTitle, t === 'danger' && { color: colors.danger }]}>{title}</Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
    </Pressable>
  );
}

export function Stat({ label, value, note, valueColor }: { label: string; value: string; note?: string; valueColor?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.caps}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      {note ? <Text style={styles.tiny}>{note}</Text> : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.h2}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type Bar = { key: string; label: string; value: number; title: string };

/**
 * Single-series bar chart. The selected bar (or, with nothing selected, the
 * tallest) is highlighted; tap a bar to select it.
 */
export function Bars({ data, selected, onSelect, height = 130 }: { data: Bar[]; selected: string | null; onSelect: (key: string | null) => void; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const tallest = max > 0 ? data.find((d) => d.value === max)?.key : null;
  const lit = selected ?? tallest;
  return (
    <View>
      <View style={[styles.plot, { height }]}>
        {data.map((d) => {
          const h = max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0) : 0;
          return (
            <Pressable
              key={d.key}
              style={styles.plotColumn}
              onPress={() => onSelect(selected === d.key ? null : d.key)}
              accessibilityLabel={`${d.title}: ${d.value.toFixed(2)} kilowatt-hours`}
            >
              <View style={[styles.plotBar, { height: `${h}%`, backgroundColor: d.key === lit ? colors.brand : colors.bar }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {data.map((d) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.axis, d.key === lit && { color: colors.text }]} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Meter({ fraction, color = colors.brand }: { fraction: number; color?: string }) {
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${Math.min(100, Math.max(0, fraction * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Empty, offline, loading and error states share one look: a label, an icon and plain words. */
export function StateCard({
  kind,
  title,
  text,
  action,
  onAction,
}: {
  kind: 'empty' | 'offline' | 'loading' | 'error';
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
}) {
  const look = {
    empty: { label: 'EMPTY', tone: 'ok' as Tone, icon: 'bar-chart-outline' as IconName },
    offline: { label: 'OFFLINE', tone: 'warn' as Tone, icon: 'cloud-offline-outline' as IconName },
    loading: { label: 'LOADING', tone: 'info' as Tone, icon: 'sync-outline' as IconName },
    error: { label: 'PROBLEM', tone: 'danger' as Tone, icon: 'alert-circle-outline' as IconName },
  }[kind];
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
      <Pill text={look.label} tone={look.tone} />
      <View style={{ height: 12 }} />
      {kind === 'loading' ? <ActivityIndicator color={colors.cyan} /> : <IconTile icon={look.icon} tone={look.tone} />}
      <Text style={[styles.h3, { marginTop: 12, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[styles.body, { textAlign: 'center', marginTop: 4 }]}>{text}</Text> : null}
      {action && onAction ? (
        <Pressable onPress={onAction} style={{ marginTop: 12 }} hitSlop={8}>
          <Pill text={action} tone={look.tone} />
        </Pressable>
      ) : null}
    </Card>
  );
}

export function Notice({ text, tone: t = 'info', icon = 'information-circle-outline' }: { text: string; tone?: Tone; icon?: IconName }) {
  const look = TONE[t];
  return (
    <View style={[styles.notice, { backgroundColor: look.bg }]}>
      <Ionicons name={icon} size={16} color={look.fg} style={{ marginTop: 1 }} />
      <Text style={[styles.small, { flex: 1, color: t === 'danger' ? colors.danger : colors.sub }]}>{text}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  return children ? <Notice text={children} tone="danger" icon="alert-circle-outline" /> : null;
}

/** Bottom sheet for confirmations. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        {children}
      </SafeAreaView>
    </Modal>
  );
}

/** The ElecTrack mark. */
export function Logo({ size = 52 }: { size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Ionicons name="pulse" size={size * 0.5} color={colors.brand} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Logo size={84} />
      <Text style={[styles.h1, { fontSize: 30, marginTop: 20 }]}>
        Elec<Text style={{ color: colors.brand }}>Track</Text>
      </Text>
      <Text style={[styles.caps, { marginTop: 8 }]}>SEE WHERE YOUR ENERGY GOES</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: 28 }} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  h3: { fontSize: 15, fontWeight: '600', color: colors.text },
  big: { fontSize: 34, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, fontWeight: '500', color: colors.sub },
  body: { fontSize: 14, color: colors.sub, lineHeight: 20 },
  sub: { fontSize: 13, color: colors.sub, marginTop: 2 },
  small: { fontSize: 12, color: colors.sub, lineHeight: 17 },
  tiny: { fontSize: 11, color: colors.muted, marginTop: 2 },
  caps: { fontSize: 11, color: colors.sub, letterSpacing: 0.4, textTransform: 'uppercase' },
  link: { fontSize: 13, fontWeight: '600', color: colors.brand },
  footnote: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardAccent: { backgroundColor: colors.accentCard, borderColor: colors.accentBorder },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 16,
    minHeight: 54,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.sub, marginBottom: 8 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, color: colors.sub, fontWeight: '500' },
  segments: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.cardRaised },
  segmentText: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  tile: {
    width: '31%',
    flexGrow: 1,
    maxWidth: '32%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 8,
  },
  tileOn: { backgroundColor: colors.accentCard, borderColor: colors.brand },
  tileText: { fontSize: 11, color: colors.sub, fontWeight: '600', paddingHorizontal: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start' },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 12, color: colors.muted, maxWidth: '45%' },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 10 },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  plotColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 1 },
  plotBar: { width: '100%', maxWidth: 18, borderRadius: 4 },
  axis: { fontSize: 10, color: colors.muted, width: 40, textAlign: 'center' },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, marginBottom: 12 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.cardRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  logo: { backgroundColor: colors.accentCard, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
});
