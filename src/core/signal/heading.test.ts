import { circularMeanDeg, createHeadingSmoother, normalizeDeg } from './heading';

describe('normalizeDeg', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(-370)).toBe(350);
  });
});

describe('circularMeanDeg', () => {
  it('averages nearby angles normally', () => {
    expect(circularMeanDeg([10, 20, 30])).toBeCloseTo(20, 4);
    expect(circularMeanDeg([90, 90, 90])).toBeCloseTo(90, 4);
  });

  it('handles the 0/360 wraparound (359 & 1 -> 0, not 180)', () => {
    expect(circularMeanDeg([359, 1])).toBeCloseTo(0, 4);
    expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 4);
  });

  it('returns 0 for empty or fully-opposed input', () => {
    expect(circularMeanDeg([])).toBe(0);
    expect(circularMeanDeg([0, 180])).toBe(0);
  });
});

describe('createHeadingSmoother', () => {
  it('returns the first sample verbatim and null before any sample', () => {
    const s = createHeadingSmoother(0.2);
    expect(s.value()).toBeNull();
    expect(s.push(42)).toBeCloseTo(42, 4);
    expect(s.value()).toBeCloseTo(42, 4);
  });

  it('converges toward a steady input', () => {
    const s = createHeadingSmoother(0.3);
    s.push(0);
    let out = 0;
    for (let i = 0; i < 50; i++) out = s.push(90);
    expect(out).toBeCloseTo(90, 1);
  });

  it('smooths across the wraparound without spiking to ~180', () => {
    const s = createHeadingSmoother(0.5);
    s.push(359);
    const out = s.push(1); // halfway-ish between 359 and 1 is ~0, never ~180
    const dist = Math.min(normalizeDeg(out), 360 - normalizeDeg(out));
    expect(dist).toBeLessThan(5);
  });

  it('lags a step change (smoothing, not snapping)', () => {
    const s = createHeadingSmoother(0.2);
    s.push(0);
    const out = s.push(100); // one step toward 100, should be well short of it
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(40);
  });

  it('reset clears history', () => {
    const s = createHeadingSmoother(0.2);
    s.push(123);
    s.reset();
    expect(s.value()).toBeNull();
  });

  it('rejects an out-of-range alpha', () => {
    expect(() => createHeadingSmoother(0)).toThrow();
    expect(() => createHeadingSmoother(1.5)).toThrow();
  });
});
