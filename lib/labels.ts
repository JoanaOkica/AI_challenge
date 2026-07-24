/** Human-readable labels for normalized body-part ids (bodyMap `id`). */

export const PART_LABELS: Record<string, string> = {
  head_brain: 'Brain / head injury',
  mind_psych: 'Psychological',
  face_eye: 'Eye',
  face_ear: 'Ear',
  face_nose: 'Nose / sinus',
  face_mouth: 'Mouth / jaw',
  head: 'Head',
  neck_cervical: 'Neck (cervical)',
  spine_thoracic: 'Thoracic spine',
  spine_lumbar: 'Lumbar spine',
  spine_general: 'Spine',
  buttocks: 'Buttocks',
  chest_systemic: 'Cardiovascular',
  chest_lungs: 'Respiratory',
  chest: 'Chest',
  abdomen: 'Abdomen',
  systemic_other: 'Systemic (blood / labs)',
  skin: 'Skin / wound',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  forearm: 'Forearm',
  wrist: 'Wrist',
  hand: 'Hand',
  arm_upper: 'Upper arm',
  upper_extremity: 'Upper extremity',
  hip_pelvis: 'Hip / pelvis',
  thigh: 'Thigh',
  knee: 'Knee',
  ankle: 'Ankle',
  foot: 'Foot',
  leg_lower: 'Lower leg',
  lower_extremity: 'Lower extremity',
  musculoskeletal_other: 'Musculoskeletal',
};

export function partLabel(id: string): string {
  return (
    PART_LABELS[id] ??
    id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
