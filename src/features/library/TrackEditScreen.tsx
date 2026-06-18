import { parseGpx } from '@core/geo/gpx';
import { interpolateTrackAtDistance, type TrackPointAt } from '@core/geo/track';
import { orderNotes } from '@core/library/notes';
import type { TrackNote, TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { formatDistance, formatElevation, formatSpeed } from '@lib/format';
import { useLibraryStore } from '@state/libraryStore';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  Divider,
  IconButton,
  List,
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ElevationProfile } from './components/ElevationProfile';
import { exportTrailPdf } from './exportTrailPdf';

interface Props {
  trackId: string;
}

type Editing = { mode: 'add'; distanceM: number } | { mode: 'edit'; noteId: string };

/**
 * GPX editor: scrub along a trail's elevation profile to pick a point, then
 * anchor a text note (with an optional photo) there. Notes are numbered by their
 * distance along the trail and shown both as pins on the profile and as a list.
 */
export function TrackEditScreen({ trackId }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const track = useLibraryStore((s) => s.tracks.find((t) => t.id === trackId));
  const addTrackNote = useLibraryStore((s) => s.addTrackNote);
  const updateTrackNote = useLibraryStore((s) => s.updateTrackNote);
  const removeTrackNote = useLibraryStore((s) => s.removeTrackNote);

  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<TrackPointAt | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const fileUri = track?.fileUri;
  useEffect(() => {
    let alive = true;
    if (!fileUri) return;
    void (async () => {
      try {
        const gpx = await storage.readFileText(fileUri);
        if (alive) setPoints(parseGpx(gpx).points);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileUri]);

  const notes = track?.notes;
  const ordered = useMemo(() => orderNotes(notes ?? []), [notes]);
  const markers = useMemo(
    () => ordered.map((n, i) => ({ distanceM: n.distanceM, label: String(i + 1) })),
    [ordered],
  );
  const noteById = (id: string) => ordered.find((n) => n.id === id);

  const openAdd = () => {
    if (selected == null) return;
    setDraft('');
    setDraftPhoto(null);
    setEditing({ mode: 'add', distanceM: selected.distanceM });
  };
  const openEdit = (note: TrackNote) => {
    setDraft(note.text);
    setDraftPhoto(note.photoUri ?? null);
    setEditing({ mode: 'edit', noteId: note.id });
  };

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setSnack('Camera permission denied');
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!result.canceled && result.assets[0]) setDraftPhoto(result.assets[0].uri);
    } catch {
      setSnack('Could not attach photo');
    }
  };

  const commit = async () => {
    const text = draft.trim();
    if (!editing || !text) {
      setEditing(null);
      return;
    }
    try {
      if (editing.mode === 'add') {
        const photo = draftPhoto
          ? await storage.importPhoto(draftPhoto, storage.newId())
          : undefined;
        addTrackNote(trackId, editing.distanceM, text, photo);
      } else {
        const existing = noteById(editing.noteId)?.photoUri;
        let photo: string | null | undefined;
        if (draftPhoto === existing)
          photo = undefined; // unchanged → keep
        else if (!draftPhoto)
          photo = null; // removed
        else photo = await storage.importPhoto(draftPhoto, storage.newId()); // new pick
        updateTrackNote(trackId, editing.noteId, text, photo);
      }
    } catch {
      setSnack('Could not save the photo');
    }
    setEditing(null);
    setDraft('');
    setDraftPhoto(null);
  };

  const onExportPdf = async () => {
    if (!track || !points) return;
    setExporting(true);
    try {
      await exportTrailPdf(track, points);
    } catch {
      setSnack('Could not export PDF');
    }
    setExporting(false);
  };

  if (!track) {
    return (
      <View style={styles.fill}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Trail" />
        </Appbar.Header>
        <Text style={styles.pad}>This trail is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={track.name} subtitle="Edit notes" />
        <Appbar.Action
          icon="video-3d"
          onPress={() => router.navigate(`/trail3d/${trackId}`)}
          accessibilityLabel="View in 3D"
        />
        <Appbar.Action
          icon="file-pdf-box"
          onPress={onExportPdf}
          disabled={points == null || exporting}
          accessibilityLabel="Export PDF"
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {points == null && !failed && <ActivityIndicator style={styles.loader} />}
        {failed && <Text style={styles.pad}>Could not load this trail&apos;s track.</Text>}

        {points != null && (
          <>
            <ElevationProfile
              points={points}
              ascentM={track.stats.ascentM}
              descentM={track.stats.descentM}
              markers={markers}
              selectedDistanceM={selected?.distanceM ?? null}
              onScrub={(at) => {
                if (at) setSelected(at);
              }}
            />

            <View style={styles.actionRow}>
              <View style={styles.flex}>
                {selected ? (
                  <Text variant="bodySmall">
                    {formatDistance(selected.distanceM)}
                    {selected.elevation !== undefined
                      ? ` · ${formatElevation(selected.elevation)}`
                      : ''}
                    {selected.speed !== undefined ? ` · ${formatSpeed(selected.speed)}` : ''}
                  </Text>
                ) : (
                  <Text variant="bodySmall" style={styles.hint}>
                    Touch the profile to pick a point, then add a note.
                  </Text>
                )}
              </View>
              <Button
                mode="contained-tonal"
                icon="map-marker-plus"
                disabled={!selected}
                onPress={openAdd}
              >
                Add note
              </Button>
            </View>

            <Divider />

            <List.Subheader>Notes ({ordered.length})</List.Subheader>
            {ordered.length === 0 ? (
              <List.Item
                title="No notes yet"
                description="Scrub the profile to a spot and tap “Add note”."
              />
            ) : (
              ordered.map((n, i) => (
                <View key={n.id} style={styles.noteRow}>
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>{i + 1}</Text>
                  </View>
                  <Pressable
                    style={styles.noteBody}
                    onPress={() => setSelected(interpolateTrackAtDistance(points, n.distanceM))}
                  >
                    <Text variant="bodyMedium">{n.text}</Text>
                    <Text variant="bodySmall" style={styles.hint}>
                      {formatDistance(n.distanceM)}
                    </Text>
                    {n.photoUri && (
                      <Pressable onPress={() => setViewingPhoto(n.photoUri ?? null)}>
                        <Image source={{ uri: n.photoUri }} style={styles.noteThumb} />
                      </Pressable>
                    )}
                  </Pressable>
                  <IconButton icon="pencil-outline" onPress={() => openEdit(n)} />
                  <IconButton
                    icon="trash-can-outline"
                    onPress={() => {
                      removeTrackNote(trackId, n.id);
                      setSnack('Note deleted');
                    }}
                  />
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={editing !== null} onDismiss={() => setEditing(null)}>
          <Dialog.Title>{editing?.mode === 'edit' ? 'Edit note' : 'New note'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Note"
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              mode="outlined"
            />
            {draftPhoto ? (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: draftPhoto }} style={styles.photoPreview} />
                <Button
                  compact
                  icon="image-remove"
                  onPress={() => setDraftPhoto(null)}
                  style={styles.photoRemove}
                >
                  Remove photo
                </Button>
              </View>
            ) : (
              <View style={styles.photoButtons}>
                <Button compact icon="image-outline" onPress={() => pickPhoto(false)}>
                  Photo
                </Button>
                <Button compact icon="camera-outline" onPress={() => pickPhoto(true)}>
                  Camera
                </Button>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditing(null)}>Cancel</Button>
            <Button onPress={commit} disabled={!draft.trim()}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={viewingPhoto !== null} onDismiss={() => setViewingPhoto(null)}>
          <Dialog.Content>
            {viewingPhoto && (
              <Image source={{ uri: viewingPhoto }} style={styles.photoFull} resizeMode="contain" />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setViewingPhoto(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={snack !== null} onDismiss={() => setSnack(null)} duration={2500}>
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  pad: { padding: 16 },
  loader: { paddingVertical: 48 },
  hint: { opacity: 0.7 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 },
  noteBody: { flex: 1, paddingVertical: 8 },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#4F7A3A',
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  noteThumb: { width: 120, height: 90, borderRadius: 8, marginTop: 6 },
  photoButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  photoPreviewWrap: { marginTop: 10, alignItems: 'flex-start' },
  photoPreview: { width: '100%', height: 160, borderRadius: 8 },
  photoRemove: { marginTop: 4 },
  photoFull: { width: '100%', height: 360 },
});
