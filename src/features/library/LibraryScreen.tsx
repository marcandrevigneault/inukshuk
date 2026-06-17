import { parseGpx } from '@core/geo/gpx';
import type { TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { formatDistance, formatElevation, formatTimestamp } from '@lib/format';
import { useLibraryStore } from '@state/libraryStore';
import { useMapStore } from '@state/mapStore';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Banner,
  Button,
  Card,
  Checkbox,
  Dialog,
  Divider,
  FAB,
  IconButton,
  List,
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { bundleCounts } from '@core/library/bundles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ElevationProfile } from './components/ElevationProfile';
import { pickAndImportGpx } from './importGpx';
import { pickAndImportMap } from './importMap';

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const maps = useLibraryStore((s) => s.maps);
  const tracks = useLibraryStore((s) => s.tracks);
  const addMap = useLibraryStore((s) => s.addMap);
  const removeMap = useLibraryStore((s) => s.removeMap);
  const setActiveMap = useLibraryStore((s) => s.setActiveMap);
  const toggleMapPage = useLibraryStore((s) => s.toggleMapPage);
  const addTrack = useLibraryStore((s) => s.addTrack);
  const removeTrack = useLibraryStore((s) => s.removeTrack);
  const bundles = useLibraryStore((s) => s.bundles);
  const addBundle = useLibraryStore((s) => s.addBundle);
  const removeBundle = useLibraryStore((s) => s.removeBundle);
  const toggleBundleMap = useLibraryStore((s) => s.toggleBundleMap);
  const toggleBundleTrack = useLibraryStore((s) => s.toggleBundleTrack);
  const activateBundle = useLibraryStore((s) => s.activateBundle);
  const setActiveTrackIds = useMapStore((s) => s.setActiveTrackIds);

  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);
  const [trackPoints, setTrackPoints] = useState<Record<string, TrackPoint[]>>({});
  const [editingBundle, setEditingBundle] = useState<string | null>(null);
  const [newBundleVisible, setNewBundleVisible] = useState(false);
  const [newBundleName, setNewBundleName] = useState('');

  const onImport = async () => {
    setBusy(true);
    const result = await pickAndImportMap();
    setBusy(false);
    if (result.kind === 'imported') {
      addMap(result.doc);
      setSnack(
        result.doc.georeferences.length > 0
          ? `Imported "${result.doc.name}" — ${result.doc.georeferences.length} georeferenced page(s)`
          : `Imported "${result.doc.name}" — no georeferencing found`,
      );
    } else if (result.kind === 'error') {
      setSnack(`Import failed: ${result.message}`);
    }
  };

  const onImportGpx = async () => {
    setBusy(true);
    const result = await pickAndImportGpx();
    setBusy(false);
    if (result.kind === 'imported') {
      addTrack(result.track, result.fileUri);
      setSnack(`Imported trail "${result.track.name}"`);
    } else if (result.kind === 'error') {
      setSnack(`Import failed: ${result.message}`);
    }
  };

  const openMap = (id: string) => {
    setActiveMap(id);
    router.navigate('/');
  };

  const viewTrack = (id: string) => {
    setActiveTrackIds([id]);
    router.navigate('/');
  };

  const createBundle = () => {
    const name = newBundleName.trim();
    setNewBundleVisible(false);
    setNewBundleName('');
    const id = addBundle(name || 'New bundle');
    setEditingBundle(id); // open it so the user can pick members right away
  };

  const onActivateBundle = (id: string, name: string) => {
    const trackIds = activateBundle(id); // turns on member maps' overlays
    setActiveTrackIds(trackIds); // and member trails
    setSnack(`Activated "${name}"`);
    router.navigate('/');
  };

  const toggleElevation = async (id: string, fileUri: string) => {
    if (expandedTrack === id) {
      setExpandedTrack(null);
      return;
    }
    setExpandedTrack(id);
    if (!trackPoints[id]) {
      try {
        const gpx = await storage.readFileText(fileUri);
        const { points } = parseGpx(gpx);
        setTrackPoints((cache) => ({ ...cache, [id]: points }));
      } catch {
        setSnack('Could not load elevation');
        setExpandedTrack(null);
      }
    }
  };

  const shareTrack = async (fileUri: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'application/gpx+xml', UTI: 'public.xml' });
    } else {
      setSnack('Sharing is not available on this device');
    }
  };

  return (
    <View style={styles.fill}>
      <Appbar.Header>
        <Appbar.Content title="Library" />
        <Appbar.Action icon="map-marker-path" onPress={onImportGpx} disabled={busy} />
        <Appbar.Action icon="file-pdf-box" onPress={onImport} disabled={busy} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {maps.length === 0 && tracks.length === 0 && (
          <Banner visible icon="map-search-outline" style={styles.banner}>
            Import a georeferenced PDF map to get started, then record trails from the Map tab.
          </Banner>
        )}

        <List.Section>
          <View style={styles.sectionHeaderRow}>
            <List.Subheader>Bundles</List.Subheader>
            <Button compact icon="plus" onPress={() => setNewBundleVisible(true)}>
              New
            </Button>
          </View>
          {bundles.length === 0 ? (
            <List.Item
              title="No bundles yet"
              description="Group maps & trails to activate a whole set in one tap"
            />
          ) : (
            bundles.map((b) => {
              const counts = bundleCounts(b, maps, tracks);
              const editing = editingBundle === b.id;
              return (
                <Card key={b.id} style={styles.trackCard} mode="contained">
                  <Card.Title
                    title={b.name}
                    subtitle={`${counts.maps} map(s) · ${counts.tracks} trail(s)`}
                    left={(p) => <List.Icon {...p} icon="folder-multiple" />}
                    right={() => (
                      <View style={styles.rowEnd}>
                        <IconButton
                          icon="layers"
                          onPress={() => onActivateBundle(b.id, b.name)}
                          disabled={counts.maps + counts.tracks === 0}
                        />
                        <IconButton
                          icon={editing ? 'chevron-up' : 'pencil-outline'}
                          onPress={() => setEditingBundle(editing ? null : b.id)}
                        />
                        <IconButton icon="trash-can-outline" onPress={() => removeBundle(b.id)} />
                      </View>
                    )}
                  />
                  {editing && (
                    <Card.Content>
                      <Text variant="labelMedium" style={styles.overlayLabel}>
                        Maps in this bundle
                      </Text>
                      {maps.length === 0 && <Text variant="bodySmall">No maps imported yet</Text>}
                      {maps.map((m) => (
                        <Checkbox.Item
                          key={m.id}
                          label={m.name}
                          position="leading"
                          status={b.mapIds.includes(m.id) ? 'checked' : 'unchecked'}
                          onPress={() => toggleBundleMap(b.id, m.id)}
                          style={styles.checkboxItem}
                        />
                      ))}
                      <Text variant="labelMedium" style={styles.overlayLabel}>
                        Trails in this bundle
                      </Text>
                      {tracks.length === 0 && <Text variant="bodySmall">No trails yet</Text>}
                      {tracks.map((t) => (
                        <Checkbox.Item
                          key={t.id}
                          label={t.name}
                          position="leading"
                          status={b.trackIds.includes(t.id) ? 'checked' : 'unchecked'}
                          onPress={() => toggleBundleTrack(b.id, t.id)}
                          style={styles.checkboxItem}
                        />
                      ))}
                    </Card.Content>
                  )}
                </Card>
              );
            })
          )}
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>Maps</List.Subheader>
          {maps.length === 0 ? (
            <List.Item title="No maps yet" description="Tap the PDF icon to import one" />
          ) : (
            maps.map((m) => (
              <Card key={m.id} style={styles.trackCard} mode="contained">
                <Card.Title
                  title={m.name}
                  subtitle={
                    m.georeferences.length > 0
                      ? `${m.pageCount} page(s) · ${m.georeferences.length} georeferenced`
                      : m.georeferenceWarning
                  }
                  left={(p) => <List.Icon {...p} icon="map" />}
                  right={() => (
                    <View style={styles.rowEnd}>
                      <IconButton icon="map-outline" onPress={() => openMap(m.id)} />
                      <IconButton icon="trash-can-outline" onPress={() => removeMap(m.id)} />
                    </View>
                  )}
                />
                {m.georeferences.length > 0 && (
                  <Card.Content>
                    <Text variant="labelMedium" style={styles.overlayLabel}>
                      Show as overlay
                    </Text>
                    {m.georeferences.map((g) => (
                      <Checkbox.Item
                        key={g.pageIndex}
                        label={`Page ${g.pageIndex + 1}`}
                        position="leading"
                        status={m.activePages.includes(g.pageIndex) ? 'checked' : 'unchecked'}
                        onPress={() => toggleMapPage(m.id, g.pageIndex)}
                        style={styles.checkboxItem}
                      />
                    ))}
                  </Card.Content>
                )}
              </Card>
            ))
          )}
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>Recorded trails</List.Subheader>
          {tracks.length === 0 ? (
            <List.Item
              title="No trails yet"
              description="Record one from the Map tab, or import a GPX file (route icon above)"
            />
          ) : (
            tracks.map((t) => (
              <Card key={t.id} style={styles.trackCard} mode="contained">
                <Card.Title
                  title={t.name}
                  subtitle={formatTimestamp(t.startedAt)}
                  left={(p) => <List.Icon {...p} icon="map-marker-path" />}
                />
                <Card.Content style={styles.trackStats}>
                  <Text variant="bodyMedium">{formatDistance(t.stats.distanceM)}</Text>
                  <Text variant="bodyMedium">↑ {formatElevation(t.stats.ascentM)}</Text>
                  <Text variant="bodyMedium">↓ {formatElevation(t.stats.descentM)}</Text>
                </Card.Content>
                <Card.Actions>
                  <IconButton
                    icon={expandedTrack === t.id ? 'chevron-up' : 'chart-areaspline'}
                    onPress={() => toggleElevation(t.id, t.fileUri)}
                  />
                  <IconButton icon="map-outline" onPress={() => viewTrack(t.id)} />
                  <IconButton icon="share-variant" onPress={() => shareTrack(t.fileUri)} />
                  <IconButton icon="trash-can-outline" onPress={() => removeTrack(t.id)} />
                </Card.Actions>
                {expandedTrack === t.id &&
                  (trackPoints[t.id] ? (
                    <ElevationProfile
                      points={trackPoints[t.id]!}
                      ascentM={t.stats.ascentM}
                      descentM={t.stats.descentM}
                    />
                  ) : (
                    <ActivityIndicator style={styles.loader} />
                  ))}
              </Card>
            ))
          )}
        </List.Section>
      </ScrollView>

      <FAB
        icon="plus"
        label="Import map"
        loading={busy}
        onPress={onImport}
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
      />

      <Portal>
        <Dialog visible={newBundleVisible} onDismiss={() => setNewBundleVisible(false)}>
          <Dialog.Title>New bundle</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Bundle name"
              value={newBundleName}
              onChangeText={setNewBundleName}
              autoFocus
              onSubmitEditing={createBundle}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNewBundleVisible(false)}>Cancel</Button>
            <Button onPress={createBundle}>Create</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={snack !== null} onDismiss={() => setSnack(null)} duration={3500}>
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: { marginBottom: 4 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  overlayLabel: { opacity: 0.7, marginBottom: 2, marginTop: 4 },
  checkboxItem: { paddingVertical: 0, paddingHorizontal: 0 },
  trackCard: { marginHorizontal: 12, marginVertical: 6 },
  loader: { paddingVertical: 24 },
  trackStats: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 24 },
  fab: { position: 'absolute', right: 16, borderRadius: 28 },
});
