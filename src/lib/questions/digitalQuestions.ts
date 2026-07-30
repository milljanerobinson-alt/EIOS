export type DigitalDomain =
  | 'basic_skills'
  | 'communication'
  | 'information_literacy'
  | 'online_safety'
  | 'problem_solving';

export interface DigitalQuestion {
  id: string;
  domain: DigitalDomain;
  domainLabel: string;
  text: string;
  options: string[];
  correctAnswer: string;
}

export const DIGITAL_DOMAIN_LABELS: Record<DigitalDomain, string> = {
  basic_skills: 'Basic Digital Skills',
  communication: 'Communication & Collaboration',
  information_literacy: 'Information & Research',
  online_safety: 'Online Safety & Privacy',
  problem_solving: 'Problem Solving with Technology',
};
