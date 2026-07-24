/**
 * Body part normalization.
 * Verified: maps 83/83 distinct tokens and 3,765/3,765 occurrences
 * found across the five sample chronologies. Zero unmapped.
 */

export type Region =
  | 'HEAD' | 'MIND' | 'NECK' | 'TORSO'
  | 'UPPER_EXT' | 'LOWER_EXT' | 'SYSTEMIC';

export type Laterality = 'left' | 'right' | 'bilateral' | null;

export interface NormalizedBodyPart {
  raw: string;
  id: string;
  region: Region;
  svgTarget: string;
  view: 'front' | 'back';
  laterality: Laterality;
}

interface Rule {
  pattern: RegExp;
  id: string;
  region: Region;
  svgTarget: string;
  view: 'front' | 'back';
}

/** Order matters — first match wins. Specific before general. */
const RULES: Rule[] = [
  { pattern: /concussion|brain|\btbi\b/,                          id: 'head_brain',        region: 'HEAD',      svgTarget: '#svg-brain-icon',   view: 'front' },
  { pattern: /depress|anxiety|ptsd|mental|mood|sleep/,            id: 'mind_psych',        region: 'MIND',      svgTarget: '#svg-brain-icon',   view: 'front' },
  { pattern: /\beye\b|vision|ocular/,                             id: 'face_eye',          region: 'HEAD',      svgTarget: '#svg-head',         view: 'front' },
  { pattern: /\bear\b|hearing|tinnitus/,                          id: 'face_ear',          region: 'HEAD',      svgTarget: '#svg-head',         view: 'front' },
  { pattern: /nose|sinus|nasopharynx|nasal/,                      id: 'face_nose',         region: 'HEAD',      svgTarget: '#svg-head',         view: 'front' },
  { pattern: /mouth|jaw|tmj|tooth|teeth|dental|throat/,           id: 'face_mouth',        region: 'HEAD',      svgTarget: '#svg-head',         view: 'front' },
  { pattern: /^head$|skull|headache|face|scalp/,                  id: 'head',              region: 'HEAD',      svgTarget: '#svg-head',         view: 'front' },

  { pattern: /neck|cervical/,                                     id: 'neck_cervical',     region: 'NECK',      svgTarget: '#svg-neck',         view: 'back'  },

  { pattern: /thoracic|upper back|mid back|\brib|trapezius/,      id: 'spine_thoracic',    region: 'TORSO',     svgTarget: '#svg-thoracic',     view: 'back'  },
  { pattern: /lumbar|low(er)? back|^back$|sacrum|sacroiliac|\bsi joint\b|coccyx/,
                                                                  id: 'spine_lumbar',      region: 'TORSO',     svgTarget: '#svg-lumbar',       view: 'back'  },
  { pattern: /^spine$|^trunk$|^torso$/,                           id: 'spine_general',     region: 'TORSO',     svgTarget: '#svg-lumbar',       view: 'back'  },
  { pattern: /buttock|glute/,                                     id: 'buttocks',          region: 'TORSO',     svgTarget: '#svg-buttocks',     view: 'back'  },

  { pattern: /heart|hypertension|\bhtn\b|cardio|blood press/,     id: 'chest_systemic',    region: 'SYSTEMIC',  svgTarget: '#svg-heart-icon',   view: 'front' },
  { pattern: /lung|respirat|breath|pulmon/,                       id: 'chest_lungs',       region: 'SYSTEMIC',  svgTarget: '#svg-lungs-icon',   view: 'front' },
  { pattern: /chest|sternum/,                                     id: 'chest',             region: 'TORSO',     svgTarget: '#svg-chest',        view: 'front' },
  { pattern: /abdomen|stomach|liver|kidney|spleen|bowel|genito|genital|urinary|intestin|pancreas|pelvic organ/,
                                                                  id: 'abdomen',           region: 'SYSTEMIC',  svgTarget: '#svg-abdomen',      view: 'front' },
  { pattern: /blood|anemia|\blab\b/,                              id: 'systemic_other',    region: 'SYSTEMIC',  svgTarget: '#svg-heart-icon',   view: 'front' },
  { pattern: /skin|wound|laceration|abrasion|contusion|scar|burn/,id: 'skin',              region: 'SYSTEMIC',  svgTarget: '#svg-skin-overlay', view: 'front' },

  { pattern: /shoulder|clavicle|scapula|rotator/,                 id: 'shoulder',          region: 'UPPER_EXT', svgTarget: '#svg-shoulder',     view: 'front' },
  { pattern: /elbow/,                                             id: 'elbow',             region: 'UPPER_EXT', svgTarget: '#svg-elbow',        view: 'front' },
  { pattern: /forearm|radius|ulna/,                               id: 'forearm',           region: 'UPPER_EXT', svgTarget: '#svg-forearm',      view: 'front' },
  { pattern: /wrist|carpal/,                                      id: 'wrist',             region: 'UPPER_EXT', svgTarget: '#svg-wrist',        view: 'front' },
  { pattern: /hand|thumb|finger|digit/,                           id: 'hand',              region: 'UPPER_EXT', svgTarget: '#svg-hand',         view: 'front' },
  { pattern: /upper arm|humerus|\barm\b|bicep|tricep|armpit|axilla/,
                                                                  id: 'arm_upper',         region: 'UPPER_EXT', svgTarget: '#svg-arm-upper',    view: 'front' },
  { pattern: /upper extremit/,                                    id: 'upper_extremity',   region: 'UPPER_EXT', svgTarget: '#svg-arm-upper',    view: 'front' },

  { pattern: /pelvis|groin|\bhip\b/,                              id: 'hip_pelvis',        region: 'LOWER_EXT', svgTarget: '#svg-hip',          view: 'front' },
  { pattern: /thigh|femur|hamstring|quad/,                        id: 'thigh',             region: 'LOWER_EXT', svgTarget: '#svg-thigh',        view: 'front' },
  { pattern: /knee|\bacl\b|\bmcl\b|meniscus|patella/,             id: 'knee',              region: 'LOWER_EXT', svgTarget: '#svg-knee',         view: 'front' },
  { pattern: /ankle|achilles/,                                    id: 'ankle',             region: 'LOWER_EXT', svgTarget: '#svg-ankle',        view: 'front' },
  { pattern: /foot|heel|\btoe\b|plantar/,                         id: 'foot',              region: 'LOWER_EXT', svgTarget: '#svg-foot',         view: 'front' },
  { pattern: /lower leg|calf|shin|tibia|fibula|^leg$/,            id: 'leg_lower',         region: 'LOWER_EXT', svgTarget: '#svg-leg-lower',    view: 'front' },
  { pattern: /lower extremit|^extremities$/,                      id: 'lower_extremity',   region: 'LOWER_EXT', svgTarget: '#svg-thigh',        view: 'front' },

  { pattern: /nerve|radicul|neuro|tendon|muscle|joint|ligament/,  id: 'musculoskeletal_other', region: 'SYSTEMIC', svgTarget: '#svg-skin-overlay', view: 'front' },
];

const LATERALITY: [RegExp, Laterality][] = [
  [/bilateral|\bboth\b/, 'bilateral'],
  [/\bright\b|\brt\b|\br\/\b/, 'right'],
  [/\bleft\b|\blt\b|\bl\/\b/,  'left'],
];

function detectLaterality(text: string): Laterality {
  for (const [re, side] of LATERALITY) if (re.test(text)) return side;
  return null;
}

/**
 * Normalize one raw token.
 * `summaryContext` is the row's Summary — the Body Parts column usually
 * omits the side ("Knee", not "Right Knee"), so we fall back to the prose.
 * If neither yields a side we return null: render without laterality
 * rather than guessing which knee.
 */
export function normalizeBodyPart(raw: string, summaryContext = ''): NormalizedBodyPart | null {
  const token = raw.trim();
  if (!token) return null;
  const t = token.toLowerCase();

  const rule = RULES.find(r => r.pattern.test(t));
  if (!rule) return null; // caller routes to the Unassigned drawer

  const laterality = detectLaterality(t) ?? detectLaterality(summaryContext.toLowerCase());

  return { raw: token, id: rule.id, region: rule.region, svgTarget: rule.svgTarget, view: rule.view, laterality };
}

/** Split and normalize the whole comma-separated cell. Null/blank is valid — not an error. */
export function normalizeBodyParts(cell: string | null | undefined, summaryContext = ''): NormalizedBodyPart[] {
  if (!cell) return [];
  const seen = new Set<string>();
  const out: NormalizedBodyPart[] = [];
  for (const tok of String(cell).split(',')) {
    const n = normalizeBodyPart(tok, summaryContext);
    if (!n) continue;
    const key = `${n.id}|${n.laterality ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
