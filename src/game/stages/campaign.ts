import { hashString } from '../rng';
import type { ChapterDefinition, Objective, ObjectiveKind, StageDefinition, StageTheme } from './types';

interface StageSeed {
  name: string;
  code: string;
  generator: StageDefinition['generator'];
  objective: ObjectiveKind;
  shots: number;
  stars: number;
  coreHp: number;
  brief: string;
  intel: string;
  reward: string;
  suggestedAmmo: string[];
}

interface ChapterSeed {
  id: string;
  name: string;
  subtitle: string;
  theme: StageTheme;
  accent: string;
  identity: string;
  stages: StageSeed[];
}

function objective(kind: ObjectiveKind): Objective {
  if (kind === 'destroy-core') {
    return {
      kind,
      label: 'DESTROY CORE',
      description: 'Break the glowing core out of its housing. Structure damage alone is not a clear.',
    };
  }
  if (kind === 'expose-core') {
    return {
      kind,
      label: 'EXPOSE CORE',
      description: 'Strip the protective shell from the live core. Keep the core itself intact.',
      threshold: 0.3,
    };
  }
  return {
    kind,
    label: 'DESTROY RELAY',
    description: 'Shatter every marked relay cell. The relay is the objective; the core is not.',
  };
}

const chaptersSeed: ChapterSeed[] = [
  {
    id: 'ash-harbor',
    name: 'ASH HARBOR',
    subtitle: 'Tidebreak salvage line',
    theme: 'harbor',
    accent: '#d9773f',
    identity: 'Salt-eaten timber, brick quays and a lighthouse gone dark.',
    stages: [
      {
        name: 'First Tide',
        code: 'AH-01',
        generator: 'tower',
        objective: 'destroy-core',
        shots: 5,
        stars: 3,
        coreHp: 210,
        brief: 'A survey core is bolted inside the old tide tower. Open the tower and break the core before the next swell.',
        intel: 'The upper rooms are brick over timber. Heavy rounds will move the frame; precise rounds will make a door.',
        reward: 'Tideglass Pin',
        suggestedAmmo: ['aphe-hybrid', 'he-blast', 'drillhead'],
      },
      {
        name: 'Salt Store',
        code: 'AH-02',
        generator: 'bunker',
        objective: 'expose-core',
        shots: 4,
        stars: 2,
        coreHp: 275,
        brief: 'The core is intact and transmitting. Peel away its concrete shell without destroying the core itself.',
        intel: 'Petal rounds open strips; pressure blasts move the roof. The objective is exposure, not annihilation.',
        reward: 'Harbor Seal',
        suggestedAmmo: ['petal', 'pressure-hammer', 'crownburst'],
      },
      {
        name: 'Long Pier',
        code: 'AH-03',
        generator: 'arch',
        objective: 'destroy-core',
        shots: 5,
        stars: 3,
        coreHp: 260,
        brief: 'A relay core hangs under the pier deck. Bank a shot through the seaward arch and finish it.',
        intel: 'The arch is a real opening. Low, flat shots and banked rounds can reach the underside.',
        reward: 'Pier Chit',
        suggestedAmmo: ['bankshot', 'wide-jet', 'finned-dart'],
      },
      {
        name: 'Tin Yard',
        code: 'AH-04',
        generator: 'layered',
        objective: 'destroy-relay',
        shots: 4,
        stars: 3,
        coreHp: 300,
        brief: 'A marked relay is feeding false coordinates from the tin yard. Break every relay cell.',
        intel: 'The relay sits behind a light curtain. Delayed internal charges and tall jets are useful.',
        reward: 'Tin Whistle',
        suggestedAmmo: ['switchfuse', 'double-strike', 'sabot-heat'],
      },
      {
        name: 'Low Tide',
        code: 'AH-05',
        generator: 'fort',
        objective: 'destroy-core',
        shots: 6,
        stars: 4,
        coreHp: 330,
        brief: 'The harbor battery has one last core under the stepped wall. Crack the citadel and end the signal.',
        intel: 'The stepped front rewards arcing shots. Use the lower courses to undermine the heavy crown.',
        reward: 'Breakwater Crest',
        suggestedAmmo: ['heavy-soft-shot', 'quake', 'chain-blast'],
      },
    ],
  },
  {
    id: 'cinderworks',
    name: 'CINDERWORKS',
    subtitle: 'Slag furnace and ore vault',
    theme: 'foundry',
    accent: '#e15d33',
    identity: 'Black chimneys, hot steel and concrete bunkers built over old fire.',
    stages: [
      {
        name: 'Slag Row',
        code: 'CW-01',
        generator: 'tower',
        objective: 'destroy-core',
        shots: 5,
        stars: 3,
        coreHp: 295,
        brief: 'A furnace core is still live beneath the slag tower. Bring the upper floors down on it.',
        intel: 'Steel beams resist broad blasts. Bend the frame and let gravity do the work.',
        reward: 'Slag Token',
        suggestedAmmo: ['heavy-soft-shot', 'shock', 'foundation-breaker'],
      },
      {
        name: 'Boilerline',
        code: 'CW-02',
        generator: 'bunker',
        objective: 'destroy-relay',
        shots: 5,
        stars: 3,
        coreHp: 330,
        brief: 'The boilerline relay is buried in a thick concrete casemate. Marked cells only.',
        intel: 'The roof is thinner than the face. High arcs and downward jets are the clean way in.',
        reward: 'Boiler Stamp',
        suggestedAmmo: ['roofbreaker', 'rainmaker', 'needle-jet'],
      },
      {
        name: 'Ore Vault',
        code: 'CW-03',
        generator: 'layered',
        objective: 'destroy-core',
        shots: 6,
        stars: 4,
        coreHp: 355,
        brief: 'A shielded core rests behind a curtain wall, an air gap and a steel backing box.',
        intel: 'Layer order matters. Cut the curtain, then place a jet through the gap.',
        reward: 'Ore Vault Key',
        suggestedAmmo: ['double-strike', 'chain-blast', 'bonded-mushroom'],
      },
      {
        name: 'Dead Stack',
        code: 'CW-04',
        generator: 'arch',
        objective: 'expose-core',
        shots: 4,
        stars: 2,
        coreHp: 370,
        brief: 'The stack is cold but the core is still sealed under its deck. Expose it before the heat returns.',
        intel: 'Quake rounds loosen the deck supports. Avoid wasting shots on the base.',
        reward: 'Stack Badge',
        suggestedAmmo: ['quake', 'ribbon-hesh', 'pancake'],
      },
      {
        name: 'Furnace Gate',
        code: 'CW-05',
        generator: 'tank',
        objective: 'destroy-core',
        shots: 6,
        stars: 4,
        coreHp: 390,
        brief: 'The furnace gate is armored and tilted against you. Break the core behind its teeth.',
        intel: 'Capped shells hold onto angled plate. Soft pads fold the backing when the face is gone.',
        reward: 'Embergate Medal',
        suggestedAmmo: ['apcbc-combined-caps', 'soft-nose', 'meltdown'],
      },
    ],
  },
  {
    id: 'glass-citadel',
    name: 'THE GLASS CITADEL',
    subtitle: 'Last tower above the fog',
    theme: 'citadel',
    accent: '#b8a6d9',
    identity: 'Pale armor, cold lights and a core suspended above a sleeping city.',
    stages: [
      {
        name: 'First Light',
        code: 'GC-01',
        generator: 'tower',
        objective: 'destroy-core',
        shots: 5,
        stars: 3,
        coreHp: 375,
        brief: 'A signal core wakes in the eastern spire. Climb the light and break its housing.',
        intel: 'Armor resists everything. Aim for the seams and let a second charge finish the wound.',
        reward: 'Pale Light',
        suggestedAmmo: ['apds-sabot', 'finned-dart', 'echo-hesh'],
      },
      {
        name: 'Pale Curtain',
        code: 'GC-02',
        generator: 'layered',
        objective: 'destroy-relay',
        shots: 5,
        stars: 3,
        coreHp: 405,
        brief: 'A relay is hiding behind the citadel’s pale curtain. Marked cells are the only mission target.',
        intel: 'The relay is offset to the rear. Corner and fork jets reach around the plate.',
        reward: 'Curtain Thread',
        suggestedAmmo: ['cornerjet', 'forkjet', 'sideburst'],
      },
      {
        name: 'Needle Court',
        code: 'GC-03',
        generator: 'arch',
        objective: 'expose-core',
        shots: 4,
        stars: 2,
        coreHp: 425,
        brief: 'The court core is nested under a thin, high deck. Open the cage without killing the light.',
        intel: 'Wide, shallow charges strip a shell efficiently. Keep clear of the core face.',
        reward: 'Needle Court Seal',
        suggestedAmmo: ['broadhead', 'wide-jet', 'splitter'],
      },
      {
        name: 'Hush Battery',
        code: 'GC-04',
        generator: 'fort',
        objective: 'destroy-core',
        shots: 6,
        stars: 4,
        coreHp: 455,
        brief: 'The battery is quiet. The core is not. Push through the armored tooth and finish the campaign.',
        intel: 'The lower seams are softer. Undermine the stepped wall before striking the crown.',
        reward: 'Hush Battery Mark',
        suggestedAmmo: ['drillhead', 'popcorn-burst', 'adaptive-shell'],
      },
      {
        name: 'Last Ember',
        code: 'GC-05',
        generator: 'layered',
        objective: 'destroy-core',
        shots: 7,
        stars: 5,
        coreHp: 495,
        brief: 'The final core sits behind every defense the citadel has left. Break it and let the fog close.',
        intel: 'You have seven shots and every round in the armory. Layer your damage; nothing single-handed will finish this.',
        reward: 'Ember Crown',
        suggestedAmmo: ['chain-blast', 'meltdown', 'sabot-heat'],
      },
    ],
  },
];

function createStage(chapter: ChapterSeed, chapterIndex: number, stage: StageSeed, stageIndex: number): StageDefinition {
  const id = `${chapter.id}-${String(stageIndex + 1).padStart(2, '0')}`;
  return {
    id,
    chapterId: chapter.id,
    chapterIndex,
    chapterName: chapter.name,
    stageIndex,
    globalIndex: chapterIndex * 5 + stageIndex,
    name: stage.name,
    code: stage.code,
    seed: hashString(`${id}|breakwater|v1`),
    theme: chapter.theme,
    generator: stage.generator,
    objective: objective(stage.objective),
    shots: stage.shots,
    starShots: stage.stars,
    coreHp: stage.coreHp,
    brief: stage.brief,
    intel: stage.intel,
    firstClearReward: stage.reward,
    suggestedAmmo: stage.suggestedAmmo,
  };
}

export const CHAPTERS: ChapterDefinition[] = chaptersSeed.map((chapter, chapterIndex) => ({
  id: chapter.id,
  index: chapterIndex,
  name: chapter.name,
  subtitle: chapter.subtitle,
  theme: chapter.theme,
  accent: chapter.accent,
  stages: chapter.stages.map((stage, stageIndex) => createStage(chapter, chapterIndex, stage, stageIndex)),
}));

export const ALL_STAGES: StageDefinition[] = CHAPTERS.flatMap((chapter) => chapter.stages);

export const STAGES_BY_ID: ReadonlyMap<string, StageDefinition> = new Map(ALL_STAGES.map((stage) => [stage.id, stage]));

export function getStage(id: string): StageDefinition | undefined {
  return STAGES_BY_ID.get(id);
}

export function getChapter(id: string): ChapterDefinition | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id);
}

export function nextStageId(id: string): string | null {
  const index = ALL_STAGES.findIndex((stage) => stage.id === id);
  if (index < 0 || index >= ALL_STAGES.length - 1) return null;
  return ALL_STAGES[index + 1]?.id ?? null;
}

export function previousStageId(id: string): string | null {
  const index = ALL_STAGES.findIndex((stage) => stage.id === id);
  if (index <= 0) return null;
  return ALL_STAGES[index - 1]?.id ?? null;
}

export const CAMPAIGN_TITLE = 'THE BROKEN COAST';
export const CAMPAIGN_COPY =
  'Three fortified signals still burn along the coast. You have one cannon, a field workshop of strange ammunition, and a finite number of shots.';
