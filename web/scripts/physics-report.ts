// Prints the key numbers from the physics engine next to the hand-worked values in our notes,
// as a Markdown table. Run with: npm run report
import {
  inlbToLbft, jointTorqueFromHangingLoad, loadToMatchLevel, plateRise, pullAcross, strapMomentArm,
  strapTension, twistTorque,
} from '../src/physics';

type Row = [string, string, number, number, string];
const rows: Row[] = [
  ['Start position, forearm level', '50 lb, 0.75 in', 37.5, twistTorque(50, 0.75), 'in·lb'],
  ['Same, in lb·ft', '', 3.1, inlbToLbft(twistTorque(50, 0.75)), 'lb·ft'],
  ['Forearm tilted 15°', '50 lb, 0.75 in', 36.2, twistTorque(50, 0.75, 15), 'in·lb'],
  ['Forearm tilted 30°', '50 lb, 0.75 in', 32.5, twistTorque(50, 0.75, 30), 'in·lb'],
  ['Forearm tilted 45°', '50 lb, 0.75 in', 26.5, twistTorque(50, 0.75, 45), 'in·lb'],
  ['Forearm tilted 60°', '50 lb, 0.75 in', 18.75, twistTorque(50, 0.75, 60), 'in·lb'],
  ['Pull across forearm at 30°', '50 lb', 43.3, pullAcross(50, 30), 'lb'],
  ['Load to match level at 30°', '50 lb', 57.7, loadToMatchLevel(50, 30), 'lb'],
  ['Fixed ring 3 in, level with axis', '50 lb', 150, twistTorque(50, strapMomentArm({ kind: 'ring', offsetIn: 3 }, 0)), 'in·lb'],
  ['Fixed ring 3 in, turned 45°', '50 lb', 106.1, twistTorque(50, strapMomentArm({ kind: 'ring', offsetIn: 3 }, 45)), 'in·lb'],
  ['Fixed ring 3 in, under the axis', '50 lb', 0, twistTorque(50, strapMomentArm({ kind: 'ring', offsetIn: 3 }, 90)), 'in·lb'],
  ['Plate rise, 80° turn', '0.75 in arm', 1.05, plateRise(80, 0.75), 'in'],
  ['Strap tension, jerk at 0.5 g', '50 lb', 75, strapTension(50, 0.5), 'lb'],
  ['Elbow in a hammer curl', '50 lb at 13 in', 54.2, inlbToLbft(jointTorqueFromHangingLoad(50, 13)), 'lb·ft'],
  ['The ~10 lb plate in the photo', '10 lb, 0.75 in', 7.5, twistTorque(10, 0.75), 'in·lb'],
];

const fmt = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(n >= 100 ? 1 : 2).replace(/\.?0+$/, ''));
const lines = [
  '| Case | Setup | Our notes | Engine | Unit | Match |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(([name, setup, want, got, unit]) => {
    const ok = Math.abs(got - want) <= Math.max(0.05, Math.abs(want) * 0.01);
    return `| ${name} | ${setup} | ${fmt(want)} | ${fmt(got)} | ${unit} | ${ok ? 'yes' : 'NO'} |`;
  }),
];
console.log(lines.join('\n'));
if (lines.some((l) => l.endsWith('| NO |'))) process.exitCode = 1;
