// A university course catalog, in the shape a registrar's export would have.
// Nothing here knows about graphs: `graph.ts` is the translation step.

export type Campus = 'north' | 'south' | 'online'
export type Term = 'Autumn' | 'Spring' | 'Summer'
export type RequirementKind = 'prerequisite' | 'corequisite' | 'recommended'

export interface Requirement {
  /** A catalog code, e.g. "MATH 101". May name a course that does not exist. */
  code: string
  kind: RequirementKind
}

export interface Faculty {
  id: string
  name: string
  dean: string
}

export interface Department {
  /** The subject prefix every course code in this department starts with. */
  subject: string
  name: string
  faculty: string
}

export interface Lab {
  code: string
  title: string
  credits: number
  requires?: Requirement[]
}

export interface Course {
  /** Stable catalog id; one course may be cross-listed under several codes. */
  id: string
  title: string
  /** Every code the course is listed under; the subject prefix names its department. */
  listings: string[]
  credits: number
  campus: Campus
  term: Term
  requires?: Requirement[]
  labs?: Lab[]
}

export interface Programme {
  id: string
  name: string
  /** Catalog codes. */
  courses: string[]
}

export interface Catalog {
  faculties: Faculty[]
  departments: Department[]
  courses: Course[]
  programmes: Programme[]
}

const pre = (code: string): Requirement => ({ code, kind: 'prerequisite' })
const co = (code: string): Requirement => ({ code, kind: 'corequisite' })
const rec = (code: string): Requirement => ({ code, kind: 'recommended' })

export const catalog: Catalog = {
  faculties: [
    { id: 'sci', name: 'Faculty of Science', dean: 'Prof. Adaeze Okafor' },
    { id: 'arts', name: 'Faculty of Arts', dean: 'Prof. Marta Lindqvist' },
    { id: 'eng', name: 'Faculty of Engineering', dean: 'Prof. Kenji Arai' },
  ],
  departments: [
    { subject: 'MATH', name: 'Mathematics', faculty: 'sci' },
    { subject: 'CHEM', name: 'Chemistry', faculty: 'sci' },
    { subject: 'BIOL', name: 'Biology', faculty: 'sci' },
    { subject: 'LING', name: 'Linguistics', faculty: 'arts' },
    { subject: 'PHIL', name: 'Philosophy', faculty: 'arts' },
    { subject: 'COMP', name: 'Computer Science', faculty: 'eng' },
  ],
  courses: [
    {
      id: 'calc1',
      title: 'Calculus I',
      listings: ['MATH 101'],
      credits: 4,
      campus: 'north',
      term: 'Autumn',
    },
    {
      id: 'calc2',
      title: 'Calculus II',
      listings: ['MATH 102'],
      credits: 4,
      campus: 'north',
      term: 'Spring',
      requires: [pre('MATH 101')],
    },
    {
      id: 'linalg',
      title: 'Linear Algebra',
      listings: ['MATH 210'],
      credits: 3,
      campus: 'north',
      term: 'Autumn',
      requires: [pre('MATH 101')],
    },
    {
      id: 'prob',
      title: 'Probability',
      listings: ['MATH 220'],
      credits: 3,
      campus: 'online',
      term: 'Spring',
      requires: [pre('MATH 102')],
    },
    {
      id: 'discrete',
      title: 'Discrete Mathematics',
      listings: ['MATH 230'],
      credits: 3,
      campus: 'north',
      term: 'Autumn',
      requires: [rec('MATH 101')],
    },

    {
      id: 'genchem',
      title: 'General Chemistry',
      listings: ['CHEM 101'],
      credits: 4,
      campus: 'north',
      term: 'Autumn',
      labs: [{ code: 'CHEM 101L', title: 'General Chemistry Lab', credits: 1 }],
    },
    {
      id: 'orgchem',
      title: 'Organic Chemistry',
      listings: ['CHEM 201'],
      credits: 4,
      campus: 'north',
      term: 'Spring',
      requires: [pre('CHEM 101')],
      labs: [{
        code: 'CHEM 201L',
        title: 'Organic Synthesis Lab',
        credits: 1,
        requires: [pre('CHEM 101L')],
      }],
    },
    {
      id: 'biochem',
      title: 'Biochemistry',
      listings: ['CHEM 310', 'BIOL 310'],
      credits: 4,
      campus: 'north',
      term: 'Autumn',
      requires: [pre('CHEM 201'), pre('BIOL 110'), co('BIOL 210')],
    },

    {
      id: 'cellbio',
      title: 'Cell Biology',
      listings: ['BIOL 110'],
      credits: 4,
      campus: 'north',
      term: 'Autumn',
      requires: [co('CHEM 101')],
      labs: [{ code: 'BIOL 110L', title: 'Microscopy Lab', credits: 1 }],
    },
    {
      id: 'genetics',
      title: 'Genetics',
      listings: ['BIOL 210'],
      credits: 3,
      campus: 'north',
      term: 'Spring',
      requires: [pre('BIOL 110'), rec('MATH 220')],
    },

    {
      id: 'introling',
      title: 'Introduction to Linguistics',
      listings: ['LING 101'],
      credits: 3,
      campus: 'south',
      term: 'Autumn',
    },
    {
      id: 'phonology',
      title: 'Phonology',
      listings: ['LING 220'],
      credits: 3,
      campus: 'south',
      term: 'Spring',
      requires: [pre('LING 101')],
    },
    {
      id: 'syntax',
      title: 'Syntax',
      listings: ['LING 230'],
      credits: 3,
      campus: 'south',
      term: 'Spring',
      requires: [pre('LING 101'), rec('PHIL 140')],
    },
    {
      id: 'complang',
      title: 'Computational Linguistics',
      listings: ['LING 340', 'COMP 340'],
      credits: 3,
      campus: 'online',
      term: 'Autumn',
      requires: [pre('LING 230'), pre('COMP 120'), rec('MATH 220')],
    },

    {
      id: 'introphil',
      title: 'Introduction to Philosophy',
      listings: ['PHIL 101'],
      credits: 3,
      campus: 'south',
      term: 'Autumn',
    },
    {
      id: 'logic',
      title: 'Formal Logic',
      listings: ['PHIL 140'],
      credits: 3,
      campus: 'south',
      term: 'Spring',
    },
    // PHIL 150 was withdrawn from the catalog; this requirement still names it.
    {
      id: 'mind',
      title: 'Philosophy of Mind',
      listings: ['PHIL 210'],
      credits: 3,
      campus: 'south',
      term: 'Spring',
      requires: [pre('PHIL 101'), pre('PHIL 150')],
    },

    {
      id: 'prog1',
      title: 'Programming I',
      listings: ['COMP 120'],
      credits: 4,
      campus: 'north',
      term: 'Autumn',
      labs: [{ code: 'COMP 120L', title: 'Programming Studio', credits: 1 }],
    },
    {
      id: 'ds',
      title: 'Data Structures',
      listings: ['COMP 220'],
      credits: 4,
      campus: 'north',
      term: 'Spring',
      requires: [pre('COMP 120'), co('MATH 230')],
    },
    {
      id: 'algo',
      title: 'Algorithms',
      listings: ['COMP 240'],
      credits: 3,
      campus: 'north',
      term: 'Autumn',
      requires: [pre('COMP 220'), pre('MATH 230')],
    },
    {
      id: 'ml',
      title: 'Machine Learning',
      listings: ['COMP 350'],
      credits: 3,
      campus: 'online',
      term: 'Spring',
      requires: [pre('COMP 240'), pre('MATH 210'), pre('MATH 220')],
    },

    // Listed under a subject no department owns.
    {
      id: 'ethicsai',
      title: 'Ethics of AI',
      listings: ['IDST 300'],
      credits: 2,
      campus: 'online',
      term: 'Summer',
      requires: [rec('PHIL 101'), rec('COMP 350')],
    },
  ],
  programmes: [
    { id: 'bsc-cs', name: 'BSc Computer Science', courses: ['COMP 120', 'COMP 220', 'COMP 240', 'COMP 350', 'MATH 101', 'MATH 210', 'MATH 220', 'MATH 230'] },
    { id: 'ba-ling', name: 'BA Linguistics', courses: ['LING 101', 'LING 220', 'LING 230', 'LING 340', 'PHIL 140'] },
    { id: 'bsc-biochem', name: 'BSc Biochemistry', courses: ['CHEM 101', 'CHEM 201', 'CHEM 310', 'BIOL 110', 'BIOL 210', 'MATH 101'] },
    { id: 'ba-phil', name: 'BA Philosophy', courses: ['PHIL 101', 'PHIL 140', 'PHIL 210', 'PHIL 320'] },
  ],
}
