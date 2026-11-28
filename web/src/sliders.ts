// Test sliders (increment 0.5): pose the arm with the same channels and limits as the Blender rig,
// so any pose can be typed into Blender's bone Rotation fields and compared.
import { PoseController, type Euler3 } from './pose';

export interface Joint {
  id: string;
  label: string;
  /** What the Blender rig calls it, shown under the label. */
  channel: string;
  min: number;
  max: number;
  start: number;
  get(p: PoseController): number;
  set(p: PoseController, v: number): void;
}

const axis = (bone: string, i: 0 | 1 | 2) => ({
  get: (p: PoseController) => p.get(bone)[i],
  set: (p: PoseController, v: number) => {
    const e = p.get(bone) as Euler3;
    e[i] = v;
    p.set(bone, e);
  },
});

/** Limits are the Limit Rotation constraints in blender/arm_twist_right.blend (right arm). */
export function rightArmJoints(): Joint[] {
  return [
    { id: 'shoulder-raise', label: 'Shoulder: raise out to the side', channel: 'upper_arm X',
      min: -85, max: 95, start: -85, ...axis('upper_arm', 0) },
    { id: 'shoulder-swing', label: 'Shoulder: swing forward', channel: 'upper_arm Y',
      min: -80, max: 80, start: 0, ...axis('upper_arm', 1) },
    { id: 'shoulder-turn', label: 'Shoulder: turn hand inward', channel: 'upper_arm Z',
      min: -40, max: 100, start: 0, ...axis('upper_arm', 2) },
    { id: 'elbow', label: 'Elbow: bend', channel: 'forearm Z',
      min: 0, max: 150, start: 90, ...axis('forearm', 2) },
    { id: 'pronation', label: 'Forearm: turn palm down', channel: 'hand Y × −1, twist bones follow',
      min: -85, max: 85, start: 0,
      get: (p) => -p.get('hand')[1],
      set: (p, v) => p.setHandTwist(-v) },
  ];
}

export interface SliderPanel {
  /** Re-read every slider from the pose (after something else moved the arm). */
  sync(): void;
  /** Lock the sliders, for example while the lift plays. */
  setDisabled(d: boolean): void;
}

export function buildSliders(host: HTMLElement, pose: PoseController, joints: Joint[], onChange: () => void,
  onReset?: () => void): SliderPanel {
  host.innerHTML = '';
  const rows = joints.map((j) => {
    const row = document.createElement('div');
    row.className = 'joint';
    const id = `j-${j.id}`;
    row.innerHTML = `
      <div class="joint-head">
        <label for="${id}"></label>
        <output for="${id}"></output>
      </div>
      <input id="${id}" type="range" min="${j.min}" max="${j.max}" step="1">
      <p class="channel"></p>`;
    (row.querySelector('label') as HTMLLabelElement).textContent = j.label;
    (row.querySelector('.channel') as HTMLParagraphElement).textContent = `Blender: ${j.channel}`;
    const input = row.querySelector('input') as HTMLInputElement;
    const out = row.querySelector('output') as HTMLOutputElement;
    const show = (v: number) => { out.textContent = `${Math.round(v)}°`; };
    input.value = String(Math.round(j.get(pose)));
    show(Number(input.value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      j.set(pose, v);
      show(v);
      onChange();
    });
    host.appendChild(row);
    return { j, input, show };
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.textContent = 'Back to start pose';
  reset.addEventListener('click', () => {
    onReset?.();
    for (const { j, input, show } of rows) {
      j.set(pose, j.start);
      input.value = String(j.start);
      show(j.start);
    }
    onChange();
  });
  host.appendChild(reset);

  return {
    sync() {
      for (const { j, input, show } of rows) {
        const v = j.get(pose);
        input.value = String(Math.round(v));
        show(v);
      }
    },
    setDisabled(d: boolean) {
      for (const { input } of rows) input.disabled = d;
    },
  };
}
