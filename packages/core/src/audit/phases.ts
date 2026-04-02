/**
 * Life audit phase definitions — questions and transitions.
 * Personality: direct, warm, no corporate fluff, never "Great question!"
 */

import type { AuditPhase, AuditPhaseConfig } from './types.js';

export const AUDIT_PHASES: Record<AuditPhase, AuditPhaseConfig> = {
  greeting: {
    phase: 'greeting',
    message:
      "Hey — I'm going to ask you a series of questions across a few life areas. " +
      "There are no right answers, and you can skip anything you don't want to touch. " +
      'The goal is to get a clear picture of where you are right now so we can figure out where you want to go. ' +
      "Ready? Let's start. What's your name, and roughly where are you in life right now — age, location, situation?",
    probe: "Take your time. Even a sentence or two gives me enough to work with. Where are you at?",
    next: 'basics',
  },

  basics: {
    phase: 'basics',
    message:
      'Tell me about your day-to-day setup. Where do you live, who do you live with (if anyone), ' +
      "and what does a typical week look like for you? What's your current financial situation — " +
      'stable, tight, comfortable, building toward something?',
    probe:
      "How are the basics treating you — money, housing, daily rhythm? What's solid and what's shaky?",
    next: 'work',
  },

  work: {
    phase: 'work',
    message:
      "What do you do for work? Tell me what you actually spend your time on — " +
      "not just the job title, but what the work feels like. What's engaging, what's draining? " +
      'Are you where you want to be professionally, or is there a gap between now and where you see yourself?',
    probe:
      "What does your work situation look like — what's going well, what's not, and where do you want it to go?",
    next: 'health',
  },

  health: {
    phase: 'health',
    message:
      "How's your physical and mental health? Sleep, energy, exercise, diet — you don't need to give me a full inventory, " +
      "just the honest version of where things stand. Anything you're managing or ignoring that you know you shouldn't be?",
    probe:
      "How are you doing physically and mentally? What's working and what's slipping?",
    next: 'relationships',
  },

  relationships: {
    phase: 'relationships',
    message:
      "Tell me about the people in your life. Romantic partner, close friends, family — who matters to you, " +
      "and how are those relationships actually going? Any that are thriving, any that need work, any that are missing?",
    probe:
      "Who are the key people in your life right now, and how are those connections feeling?",
    next: 'goals',
  },

  goals: {
    phase: 'goals',
    message:
      "What do you actually want? Not the vague stuff — the real things. " +
      "In the next year, what would make you feel like it was a good year? " +
      "And further out — what are you building toward? What would feel like a life well-lived?",
    probe:
      "What are you trying to build or become? What would make the next 12 months feel like a win?",
    next: 'synthesis',
  },

  synthesis: {
    phase: 'synthesis',
    message:
      "I'm pulling all of this together now. Give me a moment...",
    next: 'delivery',
  },

  delivery: {
    phase: 'delivery',
    message: '', // Populated dynamically with the synthesized output
    next: null,
  },
};

/** Get the ordered list of phases for display or iteration */
export const AUDIT_PHASE_ORDER: AuditPhase[] = [
  'greeting',
  'basics',
  'work',
  'health',
  'relationships',
  'goals',
  'synthesis',
  'delivery',
];

/** Phases that collect user answers (not synthesis/delivery) */
export const COLLECTION_PHASES: AuditPhase[] = [
  'greeting',
  'basics',
  'work',
  'health',
  'relationships',
  'goals',
];
