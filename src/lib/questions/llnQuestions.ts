export type LLNSection = 'reading' | 'numeracy' | 'writing' | 'oral_communication' | 'learning';

export interface LLNQuestion {
  id: string;
  section: LLNSection;
  level: 1 | 2 | 3 | 4 | 5;
  text: string;
  type: 'multiple_choice';
  options: string[];
  correctAnswer: string;
}

export const LLN_SECTION_LABELS: Record<LLNSection, string> = {
  reading: 'Reading',
  numeracy: 'Numeracy',
  writing: 'Writing',
  oral_communication: 'Oral Communication',
  learning: 'Learning',
};

export const LLN_SECTION_DESCRIPTIONS: Record<LLNSection, string> = {
  reading: 'These questions explore how you understand and interpret written information — from everyday signs to workplace documents.',
  numeracy: 'These questions explore how you work with numbers, measurements and data in everyday and workplace situations.',
  writing: 'These questions look at how you use written language — including grammar, structure and choosing the right words.',
  oral_communication: 'These questions explore how you communicate with others — at work, with customers and in team situations.',
  learning: 'These questions look at how you approach learning new things and how you manage your own development.',
};

export const LLN_SECTION_TIMES: Record<LLNSection, string> = {
  reading: '5–10 minutes',
  numeracy: '5–10 minutes',
  writing: '5–10 minutes',
  oral_communication: '5–8 minutes',
  learning: '4–6 minutes',
};
