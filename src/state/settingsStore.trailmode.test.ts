// src/state/settingsStore.trailmode.test.ts
import { useSettingsStore } from './settingsStore';
jest.mock('@data/storage', () => ({ writeJson: jest.fn(), readJson: async () => null }));

it('defaults trailViewMode to 3d and persists changes', () => {
  expect(useSettingsStore.getState().trailViewMode).toBe('3d');
  useSettingsStore.getState().set('trailViewMode', '2d');
  expect(useSettingsStore.getState().trailViewMode).toBe('2d');
});
