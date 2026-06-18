import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  headingToCardinal,
} from './format';

describe('formatDistance', () => {
  it('uses metres below 1 km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(840)).toBe('840 m');
    expect(formatDistance(999)).toBe('999 m');
  });
  it('uses km at or above 1 km', () => {
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(1234)).toBe('1.23 km');
  });
  it('guards bad input', () => {
    expect(formatDistance(-5)).toBe('0 m');
    expect(formatDistance(NaN)).toBe('0 m');
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
  });
  it('formats hours', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
  it('guards negatives', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });
});

describe('formatElevation', () => {
  it('rounds to whole metres', () => {
    expect(formatElevation(1234.6)).toBe('1235 m');
  });
});

describe('formatSpeed', () => {
  it('converts m/s to km/h', () => {
    expect(formatSpeed(0)).toBe('0.0 km/h');
    expect(formatSpeed(10)).toBe('36.0 km/h');
  });
});

describe('formatPace', () => {
  it('converts m/s to min/km', () => {
    expect(formatPace(1000 / 360)).toBe('6:00/km'); // 360 s/km
    expect(formatPace(10 / 3.6)).toBe('6:00/km'); // 10 km/h
  });
  it('returns a dash for non-positive or implausible speeds', () => {
    expect(formatPace(0)).toBe('—');
    expect(formatPace(-1)).toBe('—');
    expect(formatPace(0.01)).toBe('—');
  });
});

describe('headingToCardinal', () => {
  it('maps degrees to cardinals', () => {
    expect(headingToCardinal(0)).toBe('N');
    expect(headingToCardinal(45)).toBe('NE');
    expect(headingToCardinal(90)).toBe('E');
    expect(headingToCardinal(180)).toBe('S');
    expect(headingToCardinal(270)).toBe('W');
    expect(headingToCardinal(360)).toBe('N');
    expect(headingToCardinal(-90)).toBe('W');
  });
});
