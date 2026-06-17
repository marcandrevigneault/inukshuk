import { parseGpx } from '@core/geo/gpx';
import { interpolateTrackAtDistance, type TrackPointAt } from '@core/geo/track';
import { orderNotes } from '@core/library/notes';
import type { TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { formatDistance, formatElevation, formatSpeed } from '@lib/format';
import { useLibraryStore } from '@state/libraryStore';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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

interface Props {
  trackId: string;
}

type Editing = { mode: 'add'; distanceM: number } | { mode: 'edit'; noteId: string };

/**
 * GPX editor: scrub along a trail's elevation profile to pick a point, then
 * anchor a text note there. Notes are numbered by their distance along the
 * trail and shown both as pins on the profile and as an ordered list.
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

  const ordered = useMemo(() => orderNotes(track?.notes ?? []), [track?.notes]);
  const markers = useMemo(
    () => ordered.map((n, i) => ({ distanceM: n.distanceM, label: String(i + 1) })),
    [ordered],
  );

  const openAdd = () => {
    if (selected == null) return;
    setDraft('');
    setEditing({ mode: 'add', distanceM: selected.distanceM });
  };
  const openEdit = (noteId: string, text: string) => {
    setDraft(text);
    setEditing({ mode: 'edit', noteId });
  };
  const commit = () => {
    const text = draft.trim();
    if (editing && text) {
      if (editing.mode === 'add') addTrackNote(trackId, editing.distanceM, text);
      else updateTrackNote(trackId, editing.noteId, text);
    }
    setEditing(null);
    setDraft('');
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
                <List.Item
                  key={n.id}
                  title={n.text}
                  titleNumberOfLines={3}
                  description={formatDistance(n.distanceM)}
                  onPress={() => setSelected(interpolateTrackAtDistance(points, n.distanceM))}
                  left={(p) => (
                    <View {...p} style={styles.numberBadge}>
                      <Text style={styles.numberText}>{i + 1}</Text>
                    </View>
                  )}
                  right={(p) => (
                    <View style={styles.rowEnd}>
                      <IconButton
                        {...p}
                        icon="pencil-outline"
                        onPress={() => openEdit(n.id, n.text)}
                      />
                      <IconButton
                        {...p}
                        icon="trash-can-outline"
                        onPress={() => {
                          removeTrackNote(trackId, n.id);
                          setSnack('Note deleted');
                        }}
                      />
                    </View>
                  )}
                />
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
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditing(null)}>Cancel</Button>
            <Button onPress={commit} disabled={!draft.trim()}>
              Save
            </Button>
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
  rowEnd: { flexDirection: 'row', alignItems: 'center' },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 8,
    backgroundColor: '#4F7A3A',
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
