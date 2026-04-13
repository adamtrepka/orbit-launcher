/**
 * Physics verification test for Orbit Launcher.
 * Tests all 11 orbit types with known-good slider configurations.
 *
 * Run: npx tsx test-physics.ts
 *
 * Key physics model:
 *   - Thrust ≤50% → full auto-circularization (circular orbits)
 *   - Thrust 50-62% → partial circ (elliptical orbits)
 *   - Thrust ≥62% → no circ (fully elliptical)
 *   - Injection DV computed via binary search (accounts for radial velocity)
 */
import { simulateLaunch } from './src/physics/LaunchSimulator';

const tests = [
  // === EASY ===
  { name: 'LEO 400km', target: 'alt~400, ecc~0, inc~0',
    params: { azimuth: 90, elevation: 40, thrustPercent: 0.44, burnAltitude: 200, targetApogee: 400 } },
  { name: 'LEO 800km', target: 'alt~800, ecc~0, inc~0',
    params: { azimuth: 90, elevation: 40, thrustPercent: 0.47, burnAltitude: 200, targetApogee: 800 } },
  { name: 'Polar 700km', target: 'alt~700, ecc~0, inc~90',
    params: { azimuth: 350, elevation: 40, thrustPercent: 0.47, burnAltitude: 200, targetApogee: 700 } },

  // === MEDIUM ===
  { name: 'SSO 700km', target: 'alt~700, ecc~0, inc~97',
    params: { azimuth: 198, elevation: 40, thrustPercent: 0.47, burnAltitude: 200, targetApogee: 700 } },
  { name: 'MEO 20000km', target: 'alt~20k, ecc~0, inc~55',
    params: { azimuth: 80, elevation: 35, thrustPercent: 0.50, burnAltitude: 300, targetApogee: 20000 } },
  { name: 'GEO', target: 'alt~35786, ecc~0, inc~0',
    params: { azimuth: 90, elevation: 35, thrustPercent: 0.50, burnAltitude: 300, targetApogee: 35786 } },
  { name: 'GSO (inc 15)', target: 'alt~35786, ecc~0, inc~15',
    params: { azimuth: 75, elevation: 35, thrustPercent: 0.50, burnAltitude: 300, targetApogee: 35786 } },

  // === HARD ===
  { name: 'GTO', target: 'per~200-400, apo~36k, ecc~0.73',
    params: { azimuth: 90, elevation: 35, thrustPercent: 0.615, burnAltitude: 300, targetApogee: 36000 } },
  { name: 'HEO', target: 'per~500-2k, apo~40k, ecc~0.7, inc~30',
    params: { azimuth: 60, elevation: 40, thrustPercent: 0.60, burnAltitude: 300, targetApogee: 40000 } },
  { name: 'Molniya', target: 'per~400-600, apo~40k, ecc~0.8, inc~63',
    params: { azimuth: 20, elevation: 40, thrustPercent: 0.61, burnAltitude: 300, targetApogee: 40000 } },
  { name: 'Tundra', target: 'per~800-1200, apo~46k, ecc~0.8, inc~63',
    params: { azimuth: 20, elevation: 40, thrustPercent: 0.61, burnAltitude: 300, targetApogee: 46000 } },

  // === EXPERT ===
  { name: 'Graveyard', target: 'alt~36100, ecc~0, inc~0',
    params: { azimuth: 90, elevation: 35, thrustPercent: 0.50, burnAltitude: 300, targetApogee: 36100 } },
];

console.log('Orbit Launcher - Physics Verification Test');
console.log('='.repeat(100));
console.log('Name'.padEnd(16), 'Altitude'.padStart(8), 'Inc'.padStart(6), 'Ecc'.padStart(8), 'Fuel'.padStart(6), 'Pts'.padStart(6), 'Perigee'.padStart(8), 'Apogee'.padStart(8), '  Target');
console.log('-'.repeat(106));

for (const test of tests) {
  const result = simulateLaunch(test.params);
  const el = result.orbitalElements;
  const fuel = result.finalState.fuel;
  const per = el.perigee !== undefined ? Math.round(el.perigee).toString() : '-';
  const apo = el.apogee !== undefined ? Math.round(el.apogee).toString() : '-';
  console.log(
    test.name.padEnd(16),
    `${Math.round(el.altitude)}`.padStart(8),
    `${el.inclination.toFixed(1)}`.padStart(6),
    `${el.eccentricity.toFixed(4)}`.padStart(8),
    `${(fuel * 100).toFixed(1)}%`.padStart(6),
    `${result.trajectory.length}`.padStart(6),
    per.padStart(8),
    apo.padStart(8),
    `  ${test.target}`,
  );
}
