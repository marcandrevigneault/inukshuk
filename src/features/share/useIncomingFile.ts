import { classifyIncomingUri } from '@core/share/incomingFile';
import { importGpxFromUri } from '@features/library/importGpx';
import { useImportFeedbackStore } from '@state/importFeedbackStore';
import { useLibraryStore } from '@state/libraryStore';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';

/**
 * Handle a `.gpx` opened via the OS "Open with" flow: read it, import it (with
 * its waypoint notes), add it to the library, jump to Library, and report the
 * result. Handles both cold start (getInitialURL) and warm (url listener).
 */
export function useIncomingFile(): void {
  const addTrack = useLibraryStore((s) => s.addTrack);
  const show = useImportFeedbackStore((s) => s.show);
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const handle = async (uri: string | null) => {
      if (!uri || handled.current.has(uri)) return;
      const { kind, name } = classifyIncomingUri(uri);
      if (kind !== 'gpx') return;
      handled.current.add(uri);
      try {
        const { track, fileUri, notes } = await importGpxFromUri(uri, name);
        if (!active) return;
        addTrack(track, fileUri, notes);
        router.navigate('/(tabs)/library');
        show(`Imported ${track.name}`);
      } catch {
        if (active) show('Could not import that GPX file');
      }
    };

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => void handle(e.url));
    return () => {
      active = false;
      sub.remove();
    };
  }, [addTrack, show]);
}
