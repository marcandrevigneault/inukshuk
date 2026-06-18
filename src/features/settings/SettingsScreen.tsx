import { DEFAULT_TILE_URL, useSettingsStore } from '@state/settingsStore';
import Constants from 'expo-constants';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Divider, List, SegmentedButtons, Switch, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DISPLACEMENT_OPTIONS = [
  { value: '2', label: '2 m' },
  { value: '5', label: '5 m' },
  { value: '10', label: '10 m' },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tileUrl = useSettingsStore((s) => s.tileUrl);
  const keepAwake = useSettingsStore((s) => s.keepAwakeWhileRecording);
  const rotateMap = useSettingsStore((s) => s.rotateMapWithHeading);
  const minDisplacement = useSettingsStore((s) => s.minDisplacementM);
  const set = useSettingsStore((s) => s.set);
  const reset = useSettingsStore((s) => s.reset);

  return (
    <View style={styles.fill}>
      <Appbar.Header>
        <Appbar.Content title="Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <List.Section>
          <List.Subheader>Recording</List.Subheader>
          <List.Item
            title="Keep screen awake"
            description="Prevents the device sleeping while recording"
            right={() => (
              <Switch value={keepAwake} onValueChange={(v) => set('keepAwakeWhileRecording', v)} />
            )}
          />
          <List.Item
            title="GPS point spacing"
            description="Minimum distance between recorded fixes"
          />
          <View style={styles.segment}>
            <SegmentedButtons
              value={String(minDisplacement)}
              onValueChange={(v) => set('minDisplacementM', Number(v))}
              buttons={DISPLACEMENT_OPTIONS}
            />
          </View>
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>Map</List.Subheader>
          <List.Item
            title="Rotate map with compass"
            description="Turn the map to match your heading"
            right={() => (
              <Switch value={rotateMap} onValueChange={(v) => set('rotateMapWithHeading', v)} />
            )}
          />
          <List.Item
            title="Base map tiles"
            description={tileUrl === DEFAULT_TILE_URL ? 'OpenStreetMap (default)' : tileUrl}
          />
          <View style={styles.note}>
            <Text variant="bodySmall">
              Inukshuk uses free OpenStreetMap raster tiles. For heavy public use, point this at
              your own tile cache or a free provider to respect the OSM tile usage policy.
            </Text>
          </View>
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>About</List.Subheader>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text variant="titleMedium" style={styles.logoName}>
              Inukshuk
            </Text>
            <Text variant="bodySmall" style={styles.logoTag}>
              Offline trail navigation
            </Text>
          </View>
          <List.Item title="Version" description={`${Constants.expoConfig?.version ?? '1.0.0'}`} />
          <List.Item title="Maps & data" description="© OpenStreetMap contributors" />
          <View style={styles.note}>
            <Button mode="outlined" icon="restore" onPress={reset}>
              Reset settings
            </Button>
          </View>
        </List.Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  segment: { paddingHorizontal: 16, paddingBottom: 8 },
  note: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  logoWrap: { alignItems: 'center', paddingVertical: 12, gap: 2 },
  logo: { width: 84, height: 84, borderRadius: 18 },
  logoName: { fontWeight: '700', marginTop: 6 },
  logoTag: { opacity: 0.7 },
});
