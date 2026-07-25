/**
 * Pre-generated AI output for the self-contained artifact.
 *
 * The live app produces these two things by calling Claude from server-side
 * routes (`/api/demand-narrative`, `/api/court-presentation`). The artifact is
 * a single static HTML file with no server and no API key, so the same two
 * outputs are captured here and baked in at build time. Everything else on the
 * artifact's pages — timeline, causation table, heatmap counts, slide numbers,
 * defense arguments — is computed by the real engine, not stored.
 *
 * Regenerate by running the app against the sample case and pasting the result.
 */

import type { AttorneyInputs, CaseShape } from '../lib/ai';

/** The intake the sample narrative was generated from. */
export const PRESET_ATTORNEY: AttorneyInputs = {
  clientName: 'Marisol Delgado',
  defendant: 'Ridgeline Freight Systems, Inc.',
  incidentDate: '01/15/24',
  incidentDescription:
    'Rear-end motor vehicle collision; client was the restrained driver, airbag deployed.',
  jurisdiction: 'Superior Court, County of Alameda, California',
  emphasis:
    'Lead with the objective imaging and the meniscal surgery. Address the pre-existing lumbar degeneration honestly as aggravation, not new injury.',
};

/**
 * Medical-narrative section of the demand letter, as returned by the model.
 * Every sentence cites the encounter date it relies on, per the route's system
 * prompt.
 */
export const SAMPLE_NARRATIVE = `On 02/10/23, nearly a year before the collision, Ms. Delgado presented to Dr. Alan Pierce for a routine CDL physical. That examination documents her baseline: chronic low back pain described as longstanding, and blood pressure elevated at 148/94. No cervical complaint, no knee complaint, and no imaging of either region appears anywhere in the pre-incident record.

On 01/15/24, Metro EMS responded to a motor vehicle collision in which Ms. Delgado was the restrained driver and the airbag deployed. The run report records complaints of neck pain, a scalp laceration, and left knee pain at the scene. She was transported the same day to the emergency department, where Dr. Renee Okafor documented cervical strain, repaired the scalp laceration, and noted left knee contusion and chest wall pain, ordering imaging.

On 01/18/24, Dr. Harold Vance performed MRI of the cervical and lumbar spine. The cervical study demonstrates disc herniation at C5-C6 with impingement — an objective finding with no counterpart anywhere in the pre-incident record. The same study describes lumbar degenerative disc disease appearing chronic, consistent with the low back pain Ms. Delgado had reported on 02/10/23. On 01/20/24, CT of the head was negative for acute intracranial findings, ruling out the more serious head injury the scalp laceration raised.

On 02/05/24, Dr. Okafor documented persistent neck and left knee pain on follow-up and continued conservative management. When the knee failed to resolve, Dr. Vance performed MRI of the left knee on 02/20/24, which demonstrates a tear of the medial meniscus and prompted surgical consultation.

On 03/10/24, Dr. Priya Nair performed left knee arthroscopy with partial medial meniscectomy, without complications. Ms. Delgado was discharged on 03/12/24 on post-operative day two, wound clean and neurovascularly intact, with a referral to physical therapy. On 04/01/24, Dr. Nair issued a work restriction limiting her to sedentary duty with no lifting over ten pounds for six weeks.

Ms. Delgado completed physical therapy through 05/15/24, at which point the record documents session eight of twelve with improving range of motion. On 06/20/24, Dr. Nair continued modified duty restrictions and set reassessment at eight weeks — a restriction that had by then been in place for nearly five months.

On 08/10/24, Dr. Marcus Feld conducted an independent medical examination and opined that both the cervical disc injury and the left knee meniscal tear are causally related to the 01/15/24 collision. That opinion comes from the examining physician retained to scrutinize the claim, not from a treating provider. Radiographs of the lumbar spine on 09/05/24 showed multilevel degenerative changes chronic in appearance, corroborating that the lumbar component is aggravation of a pre-existing condition rather than a new injury.

On 11/01/24, Dr. Okafor documented that Ms. Delgado reached maximum medical improvement for the cervical spine and assigned a permanent partial impairment. She was not released to full duty without restriction until 01/20/25 — just over twelve months of continuous treatment, one surgery, and a permanent impairment rating following a collision she did not cause.`;

/** The shape the classifier selected for this record, and why. */
export const SAMPLE_SHAPE: CaseShape = 'escalation_arc';

export const SAMPLE_RATIONALE =
  'The record moves in one direction: neck and knee complaints at the scene on 01/15/24, objective imaging confirming a C5-C6 herniation and a meniscal tear, then arthroscopic surgery on 03/10/24 and a permanent impairment rating. A jury follows a worsening trajectory that ends in an operating room more readily than a side-by-side comparison.';

/**
 * Jury-facing captions, keyed by slide id. Reading age 12, 20 words max, and
 * they say what the numbers mean rather than restating them.
 */
export const SAMPLE_CAPTIONS: Record<string, string> = {
  title:
    'One crash. Twelve months of doctors, one knee surgery, and damage to her neck that never went away.',
  timeline:
    'Each step made things worse. The pain did not fade — it led to an operating room.',
  stat_row:
    'These are visits she had to make and time she could not get back.',
  quote_records:
    'Scans and an outside doctor’s exam. Not her word against theirs — pictures and findings.',
  stat_compare:
    'The left column is her life before. The right column is her life after.',
  region_grid:
    'The crash did not hurt one thing. It hurt her neck, her head, her chest, and her knee.',
};
