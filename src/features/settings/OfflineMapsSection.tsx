import { formatBytes } from '@lib/format';
import { useOfflineStore } from '@state/offlineStore';
import { useEffect } from 'react';
import { IconButton, List } from 'react-native-paper';

export function OfflineMapsSection() {
  const regions = useOfflineStore((s) => s.regions);
  const remove = useOfflineStore((s) => s.remove);

  useEffect(() => {
    void useOfflineStore.getState().hydrate();
  }, []);

  const totalBytes = regions.reduce((sum, r) => sum + r.sizeBytes, 0);

  return (
    <List.Section>
      <List.Subheader>Offline maps</List.Subheader>
      {regions.length === 0 ? (
        <List.Item
          title="No offline maps yet"
          description="Draw an area on the map to download one."
        />
      ) : (
        <>
          {regions.map((region) => (
            <List.Item
              key={region.id}
              title={region.label}
              description={`${region.basemap} · ${formatBytes(region.sizeBytes)}`}
              right={(p) => (
                <IconButton
                  {...p}
                  icon="trash-can-outline"
                  onPress={() => void remove(region.id)}
                />
              )}
            />
          ))}
          <List.Item title="Total" description={formatBytes(totalBytes)} />
        </>
      )}
    </List.Section>
  );
}
