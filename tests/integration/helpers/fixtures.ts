import type { CvAnalysis } from "../../../src/shared/schemas/analysis";
import type { AnswerEvaluation } from "../../../src/shared/schemas/evaluation";
import type { InterviewState } from "../../../src/shared/schemas/interviewState";
import type { Report } from "../../../src/shared/schemas/report";

export const sampleCvAnalysis: CvAnalysis = {
  estimatedSeniority: "senior",
  yearsExperienceEstimate: 9,
  primaryStack: ["Java", "Spring Boot", "Kafka"],
  technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "AWS"],
  projects: [{ name: "Order Platform", description: "Migrated monolith to microservices" }],
  claims: [
    {
      id: "claim-1",
      text: "Led migration of a monolith to microservices",
      sourceExcerpt: "Led migration of a monolith to microservices using Spring Boot and Kafka",
      project: "Order Platform",
      category: "MICROSERVICES",
      riskLevel: "high",
      confidence: 0.8,
      reasoning: "Broad architectural claim, worth probing for personal contribution",
      likelyQuestions: ["What was your specific role in the migration?"],
      requiredDepth: "senior",
    },
  ],
  vagueClaims: ["improved performance"],
};

export const sampleInterviewState: InterviewState = {
  candidateSeniority: "senior",
  testedClaimIds: ["claim-1"],
  activeClaimId: "claim-2",
  topicScores: { MICROSERVICES: 7.5, JAVA: 8 },
  strongAreas: ["Java fundamentals"],
  weakAreas: ["Kafka failure handling"],
  redFlags: [],
  contradictions: [],
  conceptsToProbe: ["idempotency"],
  candidatePatterns: {
    vagueAnswers: 1,
    strongConcreteAnswers: 3,
    excessiveWeLanguage: 0,
    buzzwordAnswers: 1,
  },
  majorQuestionsAsked: 5,
  estimatedCompletion: 0.4,
  highRiskClaimIds: ["claim-1", "claim-3"],
};

export const sampleAnswerEvaluation: AnswerEvaluation = {
  technicalAccuracy: 7,
  depth: 6,
  clarity: 8,
  realWorldEvidence: 5,
  specificity: 6,
  seniority: 7,
  buzzwordRisk: 3,
  strengths: ["Clear explanation of the trade-offs made"],
  weaknesses: ["Didn't mention failure handling"],
  missingConcepts: ["idempotency"],
  redFlag: "Couldn't explain what happens on partial failure",
  interviewerConfidence: "probably_familiar",
};

export const sampleReport: Report = {
  overallReadiness: 62,
  categoryScores: { MICROSERVICES: 6, JAVA: 8 },
  verdict: {
    status: "MOSTLY_READY",
    summary: "Solid Java fundamentals, shaky on distributed-systems failure modes.",
  },
  claimRisk: [
    {
      claimId: "claim-1",
      label: "Led microservices migration",
      status: "NEEDS_PRACTICE",
      explanation: "Could not articulate rollback strategy under follow-up.",
      likelyQuestions: ["How did you handle partial rollout failures?"],
      suggestedCvFraming: {
        current: "Led migration to microservices",
        suggested: "Contributed to migration to microservices, owned the payments service",
      },
    },
  ],
  redFlags: [
    {
      title: "Vague on failure handling",
      description: "Answer relied on generic best-practice language rather than specifics",
      interviewerConclusion: "Likely didn't own production incident response",
      conceptsToRevise: ["circuit breakers", "idempotency"],
    },
  ],
  strongAreas: [
    {
      title: "Java concurrency",
      evidence: ["Explained happens-before relationship correctly"],
      interviewerImpression: "Genuinely strong",
    },
  ],
  betterAnswers: [
    {
      question: "How would you handle a partial rollout failure?",
      candidateAnswer: "We'd just roll back.",
      whyWeak: "No detail on detection or automation",
      strongerAnswerStructure: ["Detection signal", "Automated rollback trigger", "Postmortem"],
      isExample: true,
    },
  ],
  likelyFollowUpQuestions: ["What metrics would trigger an automatic rollback?"],
  studyPriorities: [
    {
      priority: 1,
      topic: "Distributed systems failure modes",
      estimatedMinutes: "45",
      reviewItems: ["Circuit breakers", "Idempotency keys"],
      note: "Focus here first",
    },
  ],
};
