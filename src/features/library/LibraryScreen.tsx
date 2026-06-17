import { parseGpx } from '@core/geo/gpx';
import type { TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { formatDistance, formatElevation, formatTimestamp } from '@lib/format';
import { useLibraryStore } from '@state/libraryStore';
import { useMapStore } from '@state/mapStore';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
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
  Icon,
  IconButton,
  List,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { bundleCounts } from '@core/library/bundles';
import { folderItemCount, groupByFolder } from '@core/library/folders';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ElevationProfile } from './components/ElevationProfile';
import { pickAndImportGpxFiles } from './importGpx';
import { pickAndImportMaps } from './importMap';

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();

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
  const folders = useLibraryStore((s) => s.folders);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const renameFolder = useLibraryStore((s) => s.renameFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const setActiveTrackIds = useMapStore((s) => s.setActiveTrackIds);
  const setFocusBounds = useMapStore((s) => s.setFocusBounds);

  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);
  const [trackPoints, setTrackPoints] = useState<Record<string, TrackPoint[]>>({});
  const [editingBundle, setEditingBundle] = useState<string | null>(null);
  const [newBundleVisible, setNewBundleVisible] = useState(false);
  const [newBundleName, setNewBundleName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const [cardMenu, setCardMenu] = useState<{ kind: 'map' | 'track'; id: string } | null>(null);
  const [newFolderVisible, setNewFolderVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);

  const grouped = groupByFolder(folders, maps, tracks);

  const onImport = async () => {
    setBusy(true);
    const result = await pickAndImportMaps();
    setBusy(false);
    if (result.kind === 'imported') {
      // Add in picked order (addMap prepends, so add last-first to preserve it).
      [...result.docs].reverse().forEach(addMap);
      const n = result.docs.length;
      setSnack(
        `Imported ${n} map${n === 1 ? '' : 's'}${result.failed ? `, ${result.failed} failed` : ''}`,
      );
    } else if (result.kind === 'error') {
      setSnack(`Import failed: ${result.message}`);
    }
  };

  const onImportGpx = async () => {
    setBusy(true);
    const result = await pickAndImportGpxFiles();
    setBusy(false);
    if (result.kind === 'imported') {
      [...result.items].reverse().forEach(({ track, fileUri }) => addTrack(track, fileUri));
      const n = result.items.length;
      setSnack(
        `Imported ${n} trail${n === 1 ? '' : 's'}${result.failed ? `, ${result.failed} failed` : ''}`,
      );
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
    const bbox = tracks.find((t) => t.id === id)?.stats.bbox;
    if (bbox) setFocusBounds(bbox); // center the map on the trail, not the user
    router.navigate('/');
  };

  const createBundle = () => {
    const name = newBundleName.trim();
    setNewBundleVisible(false);
    setNewBundleName('');
    const id = addBundle(name || 'New bundle');
    setEditingBundle(id); // open it so the user can pick members right away
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    setNewFolderVisible(false);
    setNewFolderName('');
    addFolder(name || 'New folder');
  };

  const commitRenameFolder = () => {
    if (renamingFolder) renameFolder(renamingFolder.id, renamingFolder.name);
    setRenamingFolder(null);
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

  const sectionHeader = (key: string, title: string, action?: ReactNode) => (
    <TouchableRipple onPress={() => toggleSection(key)} accessibilityRole="button">
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <Icon
            source={collapsed[key] ? 'chevron-right' : 'chevron-down'}
            size={24}
            color={theme.colors.onSurface}
          />
          <Text variant="titleSmall" style={styles.sectionTitle}>
            {title}
          </Text>
        </View>
        {action}
      </View>
    </TouchableRipple>
  );

  // A per-card overflow menu that handles both organization concerns: moving the
  // item into a folder (exclusive) and toggling its membership in bundles. The
  // menu stays open across taps so several bundles can be picked in one go.
  const itemMenu = (kind: 'map' | 'track', id: string, folderId?: string) => (
    <Menu
      visible={cardMenu?.kind === kind && cardMenu.id === id}
      onDismiss={() => setCardMenu(null)}
      anchor={
        <IconButton
          icon="dots-vertical"
          onPress={() => setCardMenu({ kind, id })}
          accessibilityLabel="Organize"
        />
      }
    >
      <Menu.Item disabled title="Move to folder" />
      {folders.length === 0 ? (
        <Menu.Item disabled title="No folders yet" />
      ) : (
        folders.map((f) => (
          <Menu.Item
            key={f.id}
            leadingIcon={folderId === f.id ? 'folder-check' : 'folder-outline'}
            title={f.name}
            onPress={() => setItemFolder(kind, id, folderId === f.id ? null : f.id)}
          />
        ))
      )}
      {folderId !== undefined && (
        <Menu.Item
          leadingIcon="folder-off-outline"
          title="Remove from folder"
          onPress={() => setItemFolder(kind, id, null)}
        />
      )}
      <Divider />
      <Menu.Item disabled title="Add to bundle" />
      {bundles.length === 0 ? (
        <Menu.Item disabled title="No bundles yet" />
      ) : (
        bundles.map((b) => {
          const inBundle = kind === 'map' ? b.mapIds.includes(id) : b.trackIds.includes(id);
          return (
            <Menu.Item
              key={b.id}
              leadingIcon={inBundle ? 'checkbox-marked' : 'checkbox-blank-outline'}
              title={b.name}
              onPress={() =>
                kind === 'map' ? toggleBundleMap(b.id, id) : toggleBundleTrack(b.id, id)
              }
            />
          );
        })
      )}
    </Menu>
  );

  const renderMapCard = (m: (typeof maps)[number]) => (
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
            {itemMenu('map', m.id, m.folderId)}
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
  );

  const renderTrackCard = (t: (typeof tracks)[number]) => (
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
        {itemMenu('track', t.id, t.folderId)}
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
  );

  // Folder groups (cross-type: each folder shows its maps then its trails).
  const renderFolderGroups = () =>
    grouped.groups.map((g) => {
      const key = `folder:${g.folder.id}`;
      const count = folderItemCount(g);
      return (
        <List.Section key={key}>
          {sectionHeader(
            key,
            `${g.folder.name}${count ? ` (${count})` : ''}`,
            <View style={styles.rowEnd}>
              <IconButton
                icon="pencil-outline"
                size={20}
                onPress={() => setRenamingFolder({ id: g.folder.id, name: g.folder.name })}
                accessibilityLabel="Rename folder"
              />
              <IconButton
                icon="trash-can-outline"
                size={20}
                onPress={() => removeFolder(g.folder.id)}
                accessibilityLabel="Delete folder"
              />
            </View>,
          )}
          {collapsed[key] ? null : count === 0 ? (
            <List.Item
              title="Empty folder"
              description="Use a map or trail's ⋮ menu to move it here"
            />
          ) : (
            [...g.maps.map(renderMapCard), ...g.tracks.map(renderTrackCard)]
          )}
        </List.Section>
      );
    });

  const hasFolders = folders.length > 0;
  const ungroupedCount = grouped.ungroupedMaps.length + grouped.ungroupedTracks.length;

  return (
    <View style={styles.fill}>
      <Appbar.Header>
        <Appbar.Content title="Library" />
        <Appbar.Action
          icon="folder-plus-outline"
          onPress={() => setNewFolderVisible(true)}
          accessibilityLabel="New folder"
        />
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
          {sectionHeader(
            'bundles',
            `Bundles${bundles.length ? ` (${bundles.length})` : ''}`,
            <Button compact icon="plus" onPress={() => setNewBundleVisible(true)}>
              New
            </Button>,
          )}
          {collapsed.bundles ? null : bundles.length === 0 ? (
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

        {renderFolderGroups()}

        {hasFolders
          ? // With folders: one cross-type "Ungrouped" catch-all for leftovers.
            ungroupedCount > 0 && (
              <List.Section>
                {sectionHeader('ungrouped', `Ungrouped (${ungroupedCount})`)}
                {collapsed.ungrouped
                  ? null
                  : [
                      ...grouped.ungroupedMaps.map(renderMapCard),
                      ...grouped.ungroupedTracks.map(renderTrackCard),
                    ]}
              </List.Section>
            )
          : // No folders yet: keep the familiar Maps + Recorded-trails split.
            [
              <List.Section key="maps">
                {sectionHeader('maps', `Maps${maps.length ? ` (${maps.length})` : ''}`)}
                {collapsed.maps ? null : maps.length === 0 ? (
                  <List.Item title="No maps yet" description="Tap the PDF icon to import one" />
                ) : (
                  maps.map(renderMapCard)
                )}
              </List.Section>,
              <Divider key="maps-divider" />,
              <List.Section key="trails">
                {sectionHeader(
                  'trails',
                  `Recorded trails${tracks.length ? ` (${tracks.length})` : ''}`,
                )}
                {collapsed.trails ? null : tracks.length === 0 ? (
                  <List.Item
                    title="No trails yet"
                    description="Record one from the Map tab, or import a GPX file (route icon above)"
                  />
                ) : (
                  tracks.map(renderTrackCard)
                )}
              </List.Section>,
            ]}
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

        <Dialog visible={newFolderVisible} onDismiss={() => setNewFolderVisible(false)}>
          <Dialog.Title>New folder</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Folder name"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              onSubmitEditing={createFolder}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNewFolderVisible(false)}>Cancel</Button>
            <Button onPress={createFolder}>Create</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={renamingFolder !== null} onDismiss={() => setRenamingFolder(null)}>
          <Dialog.Title>Rename folder</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Folder name"
              value={renamingFolder?.name ?? ''}
              onChangeText={(name) => setRenamingFolder((f) => (f ? { ...f, name } : f))}
              autoFocus
              onSubmitEditing={commitRenameFolder}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRenamingFolder(null)}>Cancel</Button>
            <Button onPress={commitRenameFolder}>Rename</Button>
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
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionTitle: { fontWeight: '700', paddingVertical: 12 },
  overlayLabel: { marginBottom: 2, marginTop: 4 },
  checkboxItem: { paddingVertical: 0, paddingHorizontal: 0 },
  trackCard: { marginHorizontal: 12, marginVertical: 6 },
  loader: { paddingVertical: 24 },
  trackStats: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 24 },
  fab: { position: 'absolute', right: 16, borderRadius: 28 },
});
