# Java Interview Griller

Build a production-ready MVP web application called **Java Interview Griller**.

The product prepares experienced Java developers for technical interviews by aggressively questioning them about the technical claims they make on their CV.

The key concept is:

> **Upload/paste your CV. Find out which claims a senior Java interviewer could expose.**

This is NOT a generic Java quiz application.

It should behave like an experienced senior Java engineer conducting a realistic technical interview based specifically on the candidate's own CV, projects, technologies, architecture decisions, and optionally the job description they are applying for.

The experience should feel slightly uncomfortable in a useful way.

The AI should repeatedly ask:

* Why?
* How?
* What did YOU personally do?
* What alternatives did you consider?
* What happened when it failed?
* How did this work in production?
* What tradeoffs were involved?
* How would you implement it differently today?

The product should identify where a candidate genuinely understands something versus where their CV sounds stronger than their actual knowledge.

---

# 1. Primary Product Goal

The MVP should answer one question:

> **Can this person defend the claims on their CV in front of a strong senior Java interviewer?**

The user provides:

1. Their CV
2. Optionally, a job description

The system:

1. analyzes their CV,
2. extracts technical claims,
3. identifies likely interview pressure points,
4. runs an adaptive technical interview,
5. evaluates every answer internally,
6. produces a detailed final report.

The AI interviewer must adapt based on previous answers.

It must NOT simply generate 15 questions upfront and work through them.

---

# 2. Target User

Initial target:

**Mid-level and senior Java backend developers preparing for interviews.**

Typical experience:

* 3–15 years Java
* Spring / Spring Boot
* Microservices
* SQL
* PostgreSQL / Oracle / MySQL
* Kafka / RabbitMQ
* REST
* Docker
* Kubernetes
* AWS/Azure/GCP
* CI/CD
* Testing
* distributed systems
* observability
* Prometheus/Grafana
* system design

Primary audience initially:

* Senior Java Engineer
* Backend Engineer
* Java Contractor
* Spring Boot Developer
* Microservices Engineer

Do NOT try to support every programming language.

This is explicitly a **Java/backend interview product**.

---

# 3. Product Positioning

Main headline:

**Will your Java CV survive a senior engineer?**

Subheadline:

**Paste your CV. We'll find the technical claims an interviewer is most likely to challenge — then grill you on them.**

Primary CTA:

**Grill My CV**

Secondary explanatory copy:

**No trivia. No multiple choice. Real follow-up questions based on your actual experience.**

Possible examples below the CTA:

* "You say you used Kafka. How did you handle duplicate processing?"
* "You migrated a monolith to microservices. How did you choose service boundaries?"
* "You used Prometheus. Which application metrics did you expose?"
* "You worked with PostgreSQL. Tell me about a query you had to optimize."

---

# 4. MVP Scope

Build ONLY the following.

## Required

* Landing page
* CV text input
* Optional job-description text input
* CV analysis
* Technical claim extraction
* Free CV risk scan
* Interactive text interview
* Adaptive follow-up questions
* Internal answer evaluation
* Interview completion logic
* Detailed final report
* Persistent interview URLs
* Basic usage analytics/events
* Payment gating architecture
* Cloudflare deployment compatibility

## Do NOT build yet

Do not build:

* voice interviews
* microphone support
* video
* PDF CV upload
* DOCX upload
* LinkedIn scraping
* OAuth
* Google login
* user accounts
* passwords
* dashboards
* subscription management
* achievements
* gamification
* streaks
* flashcards
* question banks
* admin portal
* mobile apps
* team accounts
* recruiter features
* social features
* multiple programming languages

Keep the MVP small.

---

# 5. Technical Stack

Use:

## Frontend

* React
* TypeScript
* Tailwind CSS
* Cloudflare-compatible framework

Prefer a straightforward Cloudflare Pages / Workers compatible approach.

Avoid framework functionality that requires a Node server if it creates Cloudflare deployment problems.

## Backend

Cloudflare Workers.

## Database

Cloudflare D1.

## AI

Anthropic API.

Use an abstraction so the specific Claude model can be configured through environment variables.

Example:

```env
ANTHROPIC_API_KEY=
INTERVIEW_MODEL=
ANALYSIS_MODEL=
REPORT_MODEL=
```

Do not hard-code model names throughout the application.

## Payments

Prepare integration architecture for Lemon Squeezy.

Payment should be configurable:

```env
PAYMENTS_ENABLED=false
```

When false, developers/test users can complete interviews without paying.

When true, the free limit should apply.

This lets the product launch initially as a free beta.

## Analytics

Use lightweight first-party events and/or Cloudflare Web Analytics.

Do not require an expensive analytics dependency.

---

# 6. Core User Flow

The product flow is:

```text
Landing page
    ↓
Paste CV
    ↓
Optional job description
    ↓
Analyze CV
    ↓
Show CV Risk Scan
    ↓
Start Interview
    ↓
Free questions
    ↓
Payment gate if enabled
    ↓
Continue full interview
    ↓
Interview completes
    ↓
Generate report
    ↓
Show report
```

---

# 7. Screen 1 — Landing Page

Route:

```text
/
```

The landing page should be very simple.

Hero:

# Will your Java CV survive a senior engineer?

Text:

> Paste your CV and get interviewed on the technical claims you've actually made — not random Java trivia.

CTA:

**Grill My CV**

Below the hero show three benefits:

### CV-specific

Questions come directly from your projects and technical claims.

### Adaptive

Weak or vague answers trigger deeper follow-ups.

### Senior-level

Focus on architecture, production problems and tradeoffs — not "What is Java?"

Include a small example interview conversation.

Example:

**Interviewer**

> Your CV says you built event-driven microservices with Kafka. Why did that system need asynchronous communication?

**Candidate**

> It helped decouple the services.

**Interviewer**

> That's the standard answer. What specific coupling problem existed in your system, and what failure mode did Kafka solve?

This demonstrates the personality of the product.

---

# 8. Screen 2 — Candidate Input

Route can remain `/` or use:

```text
/start
```

Fields:

## CV

Large textarea.

Label:

**Paste your CV**

Placeholder:

```text
Paste your CV here...
```

Required.

Minimum reasonable character count to avoid useless input.

## Job description

Large optional textarea.

Label:

**Job description — optional**

Helper:

> Adding the actual role lets the interviewer focus on the areas most likely to come up.

Button:

**Analyze My CV**

On submission:

1. validate input,
2. create interview record,
3. send CV + job description to analysis model,
4. store structured analysis,
5. redirect to risk scan.

---

# 9. CV Analysis Engine

The first AI request analyzes the candidate.

It must return STRUCTURED JSON.

It should identify:

* estimated seniority
* years/level implied by CV
* primary Java stack
* technologies
* projects
* responsibilities
* architecture claims
* performance claims
* DevOps/cloud claims
* database claims
* messaging claims
* testing claims
* observability claims
* leadership claims
* vague claims
* potentially risky claims
* areas likely to attract senior interview follow-ups

If job description is supplied, also determine:

* role match
* required technologies
* strong matches
* partial matches
* gaps
* skills mentioned in CV but potentially not deep enough
* interview priorities

---

# 10. Technical Claim Model

A **claim** is something from the CV that an interviewer could ask the candidate to defend.

Examples:

> "Migrated a monolithic application to microservices."

> "Implemented event-driven communication using Kafka."

> "Built monitoring dashboards with Prometheus and Grafana."

> "Worked with AWS."

> "Improved application performance."

> "Designed REST APIs."

Each claim should have:

```ts
type TechnicalClaim = {
  id: string
  text: string
  sourceExcerpt: string
  project?: string
  category: ClaimCategory
  riskLevel: "low" | "medium" | "high"
  confidence: number
  reasoning: string
  likelyQuestions: string[]
  requiredDepth: "basic" | "intermediate" | "senior"
}
```

Claim categories can include:

```text
JAVA
SPRING
MICROSERVICES
DATABASE
MESSAGING
SYSTEM_DESIGN
CLOUD
DEVOPS
OBSERVABILITY
TESTING
SECURITY
PERFORMANCE
ARCHITECTURE
LEADERSHIP
OTHER
```

---

# 11. CV Risk Scan

Route:

```text
/interview/:id/scan
```

This should be valuable even before the interview.

Display:

# Your CV Risk Scan

Example:

```text
Technical claims found                  21

Likely safe                             12
Worth reviewing                          6
High-risk                                3
```

Then list selected high-impact claims.

Example:

### Kafka / Event-driven architecture

**Risk: HIGH**

> "Designed Kafka-based communication between microservices."

Why this may be challenged:

> Senior interviewers are likely to ask about offset handling, duplicate processing, idempotency, retries, ordering and failure recovery.

Likely follow-ups:

* What happens if processing succeeds but offset commit fails?
* How did you handle duplicate events?
* How did you choose partition keys?
* What delivery semantics did the system require?

Another:

### Prometheus / Grafana

**Risk: MEDIUM**

> "Implemented technical monitoring with Prometheus and Grafana."

Likely follow-ups:

* Which application metrics did you expose?
* What alerts existed?
* How were thresholds chosen?
* What would you investigate if latency increased but CPU remained normal?

Do NOT expose every generated question.

Show enough value to make the interview compelling.

CTA:

**Start My Interview**

---

# 12. Interview Experience

Route:

```text
/interview/:id
```

The interface should look like a clean chat/interview environment.

Do not make it feel like ChatGPT.

Show:

```text
Senior Java Interview

Question 5
Approx. 12 minutes remaining
```

Main area:

**Interviewer**

Question text.

Below:

textarea:

**Your answer**

Button:

**Submit Answer**

Optional button:

**I don't know**

Avoid excessive UI.

---

# 13. Interviewer Personality

The AI interviewer should behave like:

* experienced senior Java/backend engineer
* professional
* concise
* skeptical
* curious
* technically strong
* not rude
* not condescending
* not encouraging after every answer

Do NOT respond with:

> Great answer!

> Excellent!

> That's correct!

> Nice!

It is an interview, not a tutoring chatbot.

The interviewer should sometimes say things like:

> You mentioned idempotency. How exactly did you implement it?

> That's the general explanation. What happened in your particular system?

> You said "we." What part were you personally responsible for?

> Why did you choose that over the alternative?

> What breaks if that database operation succeeds but the message publication fails?

> I'm not convinced that solves the original problem. Walk me through it.

The tone should stay professional.

---

# 14. Adaptive Interview Logic

This is crucial.

After EVERY candidate answer, the backend asks the model to:

1. evaluate the answer internally,
2. update the interview state,
3. decide what happens next.

Possible decisions:

```ts
type NextAction =
  | "FOLLOW_UP"
  | "GO_DEEPER"
  | "CHALLENGE"
  | "NEW_TOPIC"
  | "CLARIFY"
  | "INTERVIEW_COMPLETE"
```

The interview should NOT follow a fixed question list.

The AI should choose follow-ups based on:

* accuracy
* specificity
* confidence
* technical depth
* use of buzzwords
* evidence of genuine experience
* contradictions
* missing details
* seniority expected
* job description
* previous questions
* areas already sufficiently tested

---

# 15. Answer Evaluation

Every answer should be evaluated internally.

Do not show this scoring during the interview.

Store:

```ts
type AnswerEvaluation = {
  technicalAccuracy: number
  depth: number
  clarity: number
  realWorldEvidence: number
  specificity: number
  seniority: number
  buzzwordRisk: number

  strengths: string[]
  weaknesses: string[]
  missingConcepts: string[]

  redFlag?: string

  interviewerConfidence:
    | "likely_genuine_experience"
    | "probably_familiar"
    | "surface_level"
    | "uncertain"

  suggestedNextAction:
    | "FOLLOW_UP"
    | "GO_DEEPER"
    | "CHALLENGE"
    | "NEW_TOPIC"
    | "CLARIFY"
}
```

Scores can internally be 1–10.

---

# 16. Bullshit / Vagueness Detection

This is one of the core differentiators.

The model should detect answers that use technically correct phrases without demonstrating understanding.

Examples:

Candidate:

> We used Kafka to decouple our microservices.

Potential internal reaction:

```text
Buzzword risk: HIGH

Reason:
Candidate gave a generic architectural justification without explaining the actual coupling, failure mode or business requirement.
```

Next question:

> What specific coupling existed before Kafka, and what failure scenario did asynchronous messaging solve?

Candidate:

> Kubernetes gave us scalability.

Follow-up:

> What specifically scaled in your application, what triggered scaling, and what bottleneck remained after adding replicas?

Candidate:

> We followed SOLID principles.

Follow-up:

> Give me an example from that project where applying one of those principles materially changed the design.

The system should reward concrete experience over terminology.

---

# 17. Personal Responsibility Detection

A common interview problem is candidates saying:

> We built...

> We decided...

> We implemented...

The interviewer should occasionally challenge this.

Example:

> You keep saying "we." What part of this design were you personally responsible for?

The system should distinguish:

* team knowledge
* candidate's actual contribution

This should influence the final report.

---

# 18. Java-Specific Interview Intelligence

The interviewer should understand senior-level topics including:

## Java

* Java 17/21+
* collections
* equals/hashCode
* immutability
* concurrency
* CompletableFuture
* threads
* virtual threads where relevant
* JVM
* GC
* memory
* exceptions
* streams
* records
* generics
* performance

## Spring

* dependency injection
* bean lifecycle
* Spring Boot
* configuration
* transactions
* propagation
* isolation
* proxies
* AOP
* Spring Security
* validation
* REST
* exception handling

## Databases

* transactions
* indexes
* query plans
* joins
* locking
* isolation
* optimistic/pessimistic locking
* N+1
* connection pools
* schema design
* migrations
* performance

## Kafka / messaging

* consumer groups
* partitions
* offset handling
* ordering
* retries
* dead-letter topics
* idempotency
* duplicate events
* delivery semantics
* schema evolution
* outbox pattern
* distributed consistency

## Microservices

* boundaries
* synchronous vs asynchronous
* service discovery
* resiliency
* retries
* timeouts
* circuit breakers
* observability
* deployment
* distributed transactions
* eventual consistency

## System design

* scalability
* consistency
* caching
* queues
* database selection
* horizontal scaling
* failure recovery
* availability
* observability
* bottlenecks
* tradeoffs

## Testing

* unit tests
* integration tests
* Testcontainers
* mocking
* contract tests
* end-to-end tests
* test strategy

## Production

* debugging
* logs
* metrics
* traces
* incidents
* performance
* deployment
* rollbacks
* monitoring

Do not force topics that aren't relevant to the candidate.

---

# 19. Interview Length

Default full interview:

approximately **15 questions**, but this is not strict.

A "question" means a major interaction.

Adaptive follow-ups may make it:

```text
12–20 interactions
```

Target duration:

**15–25 minutes**

The system should complete when:

* enough important claims have been tested,
* major high-risk claims have been investigated,
* relevant job requirements have been covered,
* there is sufficient evidence to produce meaningful feedback.

The model should explicitly decide when sufficient evidence exists.

---

# 20. Free Experience

When payments are enabled:

Free user receives:

### CV Risk Scan

plus:

### First 3 interview interactions

After the third candidate answer, show:

# You've survived the first round.

Example:

```text
So far we found:

2 strong areas
3 claims worth deeper testing
1 potential interview red flag
```

Do NOT reveal the complete report.

CTA:

**Continue Full Interview — €9**

The exact price must be configurable.

```env
FULL_INTERVIEW_PRICE_EUR=9
```

---

# 21. Payment Flow

Use Lemon Squeezy hosted checkout.

Do not build custom card handling.

Backend flow:

```text
User starts interview
↓
3 free answers used
↓
Payment gate
↓
Lemon Squeezy hosted checkout
↓
Webhook confirms successful purchase
↓
interview.paid = true
↓
User continues interview
```

Webhook verification must be implemented securely.

Never trust a frontend `paid=true` parameter.

Environment variables:

```env
LEMON_SQUEEZY_API_KEY=
LEMON_SQUEEZY_STORE_ID=
LEMON_SQUEEZY_VARIANT_ID=
LEMON_SQUEEZY_WEBHOOK_SECRET=
PAYMENTS_ENABLED=false
```

When payments are disabled, automatically allow full interview.

---

# 22. Final Report

Route:

```text
/interview/:id/report
```

This is the product users are paying for.

The report must be extremely useful.

Start with:

# Interview Result

Example:

```text
Overall Interview Readiness             74 / 100

Java                                    84
Spring Boot                             81
Microservices                           72
Kafka                                   58
Database                                79
System Design                           69
Observability                           63
Cloud                                   51
```

Only include categories actually tested.

---

# 23. Overall Verdict

Generate a concise verdict.

Example:

> You present as a genuine senior Java developer with strong Spring and backend experience. Your project explanations are credible, but Kafka failure semantics and cloud infrastructure are currently weaker than your CV implies. A strong interviewer would probably discover those gaps.

Possible status:

```text
STRONG
INTERVIEW READY
MOSTLY READY
NEEDS PREPARATION
HIGH-RISK
```

Do not make it childish.

---

# 24. Claim Risk Report

Show CV claims with status.

Example:

```text
Spring Boot                    SAFE

Microservices                  SAFE

PostgreSQL                     SAFE

Kafka                          NEEDS PRACTICE

Prometheus / Grafana           NEEDS PRACTICE

AWS                            HIGH RISK
```

Each should explain WHY.

Example:

## AWS

**HIGH RISK**

Your CV implies cloud experience, but your answers demonstrated primarily application-level familiarity rather than infrastructure ownership.

An interviewer may ask:

* Which AWS services did you personally configure?
* How was the application deployed?
* Where did networking/security configuration live?
* How did you investigate production infrastructure issues?

Suggested CV framing:

> Worked with applications deployed in AWS environments.

instead of:

> Strong AWS experience.

Only suggest changes when justified.

---

# 25. Interview Red Flags

Dedicated section:

# Questions That Could Hurt You

Example:

### Kafka duplicate processing

You correctly explained consumer groups but struggled to explain what happens when database processing succeeds before offset commit.

What interviewer may conclude:

> Candidate has used Kafka but may not have owned production reliability concerns.

What to revise:

* at-least-once delivery
* idempotent consumers
* offset commits
* transactional outbox
* retry handling

---

# 26. Strong Areas

Show what was convincing.

Example:

### Microservice migration

Your explanation contained:

* concrete service boundary reasoning
* migration constraints
* tradeoffs
* production experience

Interviewer impression:

> Likely genuine hands-on experience.

This is important because reports should not only criticize.

---

# 27. Better Answers

For selected weak answers show:

## Question

Original interviewer question.

## Your answer

Candidate's answer.

## Why it was weak

Concise explanation.

## Stronger answer structure

Do NOT fabricate the candidate's experience.

Instead say:

> A stronger answer should cover:

* why the problem existed,
* the actual design,
* alternatives considered,
* production failure modes,
* what you personally implemented.

If generating an example, clearly label it as an EXAMPLE and never invent facts about the candidate's work history.

---

# 28. Follow-Up Predictor

The report should include:

# Questions You're Likely to Get

Generate perhaps **10 high-value questions** based directly on the CV.

Example:

```text
1. Why did you split this functionality into a separate microservice?

2. What did you use Kafka for specifically?

3. How did you handle duplicate messages?

4. Which Prometheus metrics did your application expose?

5. Tell me about a production incident you diagnosed.

6. How were database migrations handled?

7. What happens if one downstream service becomes unavailable?

8. What parts of the AWS environment did you personally work with?

9. How did you test interactions between microservices?

10. What architecture decision would you change today?
```

---

# 29. Study Priorities

Generate a prioritized study list.

Example:

# Before Your Interview

## Priority 1 — Kafka reliability

Estimated revision:

**45–60 minutes**

Review:

* offsets
* delivery semantics
* idempotency
* retries
* ordering
* dead-letter topics

## Priority 2 — AWS

Your issue is not necessarily lack of knowledge.

Your bigger risk is **overstating your involvement**.

Prepare an accurate explanation of:

* what infrastructure you interacted with,
* what your team owned,
* what platform/DevOps teams owned.

## Priority 3 — Transaction boundaries

Review Spring:

* `@Transactional`
* proxies
* propagation
* isolation
* rollback behavior

---

# 30. Job Description Mode

If a job description was supplied, final report includes:

# Fit for This Role

Example:

```text
Estimated technical fit                  78%

Strong match:
Java
Spring Boot
Microservices
PostgreSQL

Partial match:
Kafka
Docker

Potential concerns:
AWS
Kubernetes
Terraform
```

Then:

# What This Company Is Most Likely to Ask You

Generate questions based on overlap between:

* candidate CV,
* job requirements,
* candidate weak areas.

This makes the product much more useful immediately before an actual interview.

---

# 31. Database Schema

Use D1.

Suggested schema.

## interviews

```sql
CREATE TABLE interviews (
    id TEXT PRIMARY KEY,
    email TEXT,
    cv_text TEXT NOT NULL,
    job_description TEXT,
    analysis_json TEXT,
    interview_state_json TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    paid INTEGER NOT NULL DEFAULT 0,
    free_answers_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
```

Statuses:

```text
created
analyzing
ready
in_progress
payment_required
completed
failed
```

## messages

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    evaluation_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
);
```

Roles:

```text
interviewer
candidate
```

## reports

```sql
CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    interview_id TEXT UNIQUE NOT NULL,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
);
```

## payments

```sql
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    interview_id TEXT,
    provider TEXT NOT NULL,
    provider_order_id TEXT,
    amount INTEGER,
    currency TEXT,
    status TEXT,
    created_at TEXT NOT NULL
);
```

Add sensible indexes.

---

# 32. API Routes

Suggested API endpoints:

```text
POST /api/interviews
```

Creates interview from CV + optional JD.

```text
GET /api/interviews/:id
```

Fetch state.

```text
POST /api/interviews/:id/analyze
```

Run CV analysis if needed.

```text
POST /api/interviews/:id/start
```

Generate first question.

```text
POST /api/interviews/:id/answer
```

Submit candidate answer.

Backend:

1. stores answer,
2. evaluates answer,
3. updates state,
4. decides next action,
5. generates next question OR completes interview.

```text
POST /api/interviews/:id/report
```

Generate report.

Should only run after interview completion.

```text
POST /api/payments/checkout
```

Create Lemon Squeezy checkout.

```text
POST /api/webhooks/lemonsqueezy
```

Verify webhook and mark interview paid.

---

# 33. Interview State

Store a compact state summary so the entire transcript doesn't need to be repeatedly injected into every model call.

Example:

```ts
type InterviewState = {
  candidateSeniority: string

  testedClaimIds: string[]

  activeClaimId?: string

  topicScores: Record<string, number>

  strongAreas: string[]

  weakAreas: string[]

  redFlags: string[]

  contradictions: string[]

  conceptsToProbe: string[]

  candidatePatterns: {
    vagueAnswers: number
    strongConcreteAnswers: number
    excessiveWeLanguage: number
    buzzwordAnswers: number
  }

  majorQuestionsAsked: number

  estimatedCompletion: number
}
```

Use transcript selectively.

Avoid sending every token of the entire conversation on every request if unnecessary.

Token efficiency matters.

---

# 34. AI Request Strategy

Do not use one giant system prompt for everything.

Use separate responsibilities.

## Request A — CV Analyzer

Input:

* CV
* optional JD

Returns structured analysis.

## Request B — Interviewer

Input:

* candidate analysis
* interview state
* relevant recent transcript
* active claims

Returns:

```json
{
  "question": "...",
  "targetClaimId": "...",
  "intent": "...",
  "difficulty": "...",
  "expectedConcepts": []
}
```

## Request C — Answer Evaluator

Input:

* question
* candidate answer
* claim
* expected seniority
* context

Returns structured evaluation.

## Request D — Interview Controller

Can potentially be combined with evaluation to save money.

Decides:

```json
{
  "action": "FOLLOW_UP",
  "reason": "...",
  "nextTarget": "...",
  "shouldComplete": false
}
```

## Request E — Final Report

Takes compact structured data + selected transcript and generates report JSON.

---

# 35. Important Prompt Rule

Never let the model invent candidate experience.

System instruction should include:

> You may infer interview risk from the candidate's statements, but you must never invent facts about their employment, project architecture, responsibilities or technologies.

If something is unclear, interview the candidate about it.

Do not silently assume.

---

# 36. Security / Privacy

CVs contain personal data.

Implement basic protections.

Required:

* no CV data in application logs
* no API keys exposed client-side
* server-side Anthropic calls only
* prepared statements for D1
* input length limits
* output validation
* rate limiting where sensible
* secure Lemon Squeezy webhook verification
* unpredictable interview IDs
* no sequential IDs
* escape/render user-generated content safely

Add a clear message near CV input:

> Your CV is used only to generate your interview and report.

For MVP, add an option later to delete interviews, but at minimum architecture should make deletion possible.

Do not send unnecessary identifying information to the AI.

---

# 37. Error Handling

The app must gracefully handle:

* Anthropic API timeout
* invalid model response
* malformed JSON
* D1 errors
* network retries
* duplicate payment webhooks
* user refreshing interview
* duplicate answer submission
* model refusing unexpectedly
* report generation failure

Use structured output validation.

Prefer Zod or equivalent validation.

Do not blindly trust model JSON.

---

# 38. Cost Controls

Since this is an MVP, minimize AI cost.

Implement:

* maximum CV length
* maximum job description length
* answer length limits
* compact interview state
* no unnecessary repeated CV text
* no full transcript on every call
* configurable model per task
* store token usage when API provides it

Create usage fields if practical:

```text
input_tokens
output_tokens
estimated_cost
```

This lets us determine actual cost per interview.

---

# 39. UX Requirements

Design should feel:

* professional
* technical
* minimal
* serious
* modern

Do not make it playful.

Avoid:

* cartoon graphics
* giant gradients
* excessive animations
* gamification
* emojis everywhere
* "AI magic" language

Target user is an experienced developer.

Use whitespace and typography.

Think:

**Linear / Vercel / developer tools**, not Duolingo.

---

# 40. Responsive Design

Must work well on:

* desktop
* laptop
* tablet
* mobile

Interview textarea should be pleasant on mobile.

Do not create complicated split-screen layouts.

---

# 41. Example Interview

Candidate CV claim:

> Designed Spring Boot microservices using Kafka for asynchronous communication.

Possible conversation:

**Interviewer**

You mention Kafka-based communication between your microservices. What problem made you choose asynchronous messaging instead of REST?

**Candidate**

We wanted the services to be loosely coupled and independently scalable.

**Interviewer**

That's the architectural benefit in general. What was happening in your actual system that made synchronous communication problematic?

**Candidate**

One service processed orders and several other systems needed to react to changes.

**Interviewer**

Suppose your consumer successfully updates PostgreSQL and crashes immediately before committing the Kafka offset. What happens when it restarts?

**Candidate**

The message could be received again.

**Interviewer**

Correct. How did your system make processing safe in that situation?

This is the intended experience.

---

# 42. Example Project Grilling

Claim:

> Migrated functionality from a legacy monolith to microservices.

Ask:

> What made that functionality a good candidate for extraction?

Then potentially:

> How did you determine the service boundary?

Then:

> What dependencies still existed on the monolith?

Then:

> How was data ownership handled?

Then:

> Did the new service have its own database?

Then:

> If not, was it actually independently deployable?

Then:

> What was the hardest production problem caused by the migration?

This should feel like a human interviewer following the interesting thread.

---

# 43. MVP Success Metrics

Track these events:

```text
landing_view
cv_submitted
scan_generated
interview_started
question_answered
free_limit_reached
checkout_started
payment_completed
interview_completed
report_viewed
```

Useful metrics:

```text
Landing → CV submission %
CV submission → interview start %
Interview start → 3 answers %
Free limit → checkout %
Checkout → payment %
Paid → completion %
```

Do not build an analytics dashboard yet.

Logging events is enough.

---

# 44. Initial Pricing

Configurable.

Default:

```text
Free:
CV risk scan
3 interview interactions

Paid:
€9
Complete interview
Full report
```

Later possibilities:

```text
€19 interview prep pack
3 interviews

€24/month
unlimited
```

Do NOT implement subscriptions in MVP.

Only one-time payment.

---

# 45. SEO

Basic metadata.

Title:

**Java Interview Griller — Test Your CV Before the Interview**

Description:

**Practice a realistic senior Java interview based on your CV. Get adaptive Spring Boot, microservices, Kafka and backend questions with detailed feedback.**

Do not spend significant development effort on SEO yet.

---

# 46. Development Mode

Implement convenient local development.

Environment:

```env
PAYMENTS_ENABLED=false
```

When disabled:

* no checkout required,
* full interview available,
* visible DEV badge only in development,
* payment routes can still exist.

Add seeded example CV / JD in development so the flow can be tested quickly.

---

# 47. Tests

Do not build enormous test coverage.

Required tests:

## Unit

* claim parsing/schema validation
* answer evaluation schema
* interview state updates
* free-answer limit
* payment status logic

## Integration

* create interview
* analyze CV
* submit answer
* complete interview
* generate report

Mock Anthropic API in automated tests.

Do NOT make real AI calls during regular test runs.

---

# 48. Code Quality

Requirements:

* strict TypeScript
* readable components
* server/client separation
* no massive 1,000-line components
* reusable AI service layer
* reusable D1 repository layer
* Zod validation
* centralized configuration
* proper error types
* meaningful names

Avoid premature abstraction.

This is an MVP, not an enterprise framework.

---

# 49. Suggested Folder Structure

Something similar to:

```text
src/
  components/
  pages-or-routes/
  lib/
    ai/
      client.ts
      analyzer.ts
      interviewer.ts
      evaluator.ts
      report.ts

    db/
      interviews.ts
      messages.ts
      reports.ts
      payments.ts

    interview/
      state.ts
      types.ts
      controller.ts

    payments/
      lemonsqueezy.ts

    config.ts

  schemas/
    analysis.ts
    evaluation.ts
    report.ts

migrations/

tests/
```

Adapt according to framework conventions.

---

# 50. Build Order

Do NOT try to build everything simultaneously.

Build in this order.

## Phase 1 — Interview Engine

No fancy UI.

Implement:

```text
CV
→ analysis
→ first question
→ candidate answer
→ evaluation
→ adaptive follow-up
→ completion
→ report
```

Test manually using a senior Java CV.

The quality of the interview matters more than everything else.

## Phase 2 — Web UI

Build:

```text
/
scan
interview
report
```

## Phase 3 — Persistence

D1.

Refresh should not destroy interview state.

## Phase 4 — Free limit

Three responses.

## Phase 5 — Lemon Squeezy

Only after the interview works well.

## Phase 6 — deployment

Cloudflare.

---

# 51. MOST IMPORTANT PRODUCT REQUIREMENT

The product succeeds or fails based on interview quality.

Before worrying about polish, make sure the AI can repeatedly produce conversations where an experienced Java developer thinks:

> "That's exactly the follow-up a good interviewer would ask."

or:

> "I actually don't have a good answer to that."

Avoid trivia such as:

> What is dependency injection?

unless candidate seniority or previous answers specifically justify testing fundamentals.

Prefer:

> You used Spring dependency injection extensively. Tell me about a situation where bean lifecycle or proxy behavior caused an actual issue.

Avoid:

> What is Kafka?

Prefer:

> Your consumer writes to PostgreSQL before committing its Kafka offset. Walk me through the failure modes.

Avoid:

> What is an index?

Prefer:

> A query that used to return in 50 ms now takes four seconds after the table reaches 50 million rows. How do you investigate it?

This is the product.

---

# 52. First Milestone

The first milestone is NOT deployment.

Build the interview engine and run one complete interview using a realistic senior Java CV.

At completion, verify:

* questions were based on actual CV claims,
* follow-ups reacted meaningfully to answers,
* generic answers were challenged,
* strong answers caused topic progression,
* weak answers caused deeper probing,
* questions were technically correct,
* the final report accurately reflected performance,
* the AI did not invent work experience,
* the experience felt like a senior technical interview rather than an AI tutor.

Only then continue to payments and deployment.

---

# 53. Instructions for Claude Code

Start by creating the project structure and implementing **Phase 1 only**.

Do not implement Lemon Squeezy, authentication, dashboards or advanced UI yet.

First produce:

1. architecture,
2. TypeScript domain types,
3. structured AI response schemas,
4. CV analyzer,
5. interview controller,
6. answer evaluator,
7. adaptive next-question generation,
8. report generator,
9. simple test harness where I can paste a CV and manually run an interview.

After Phase 1 works, continue through the phases sequentially.

Whenever there is a choice between:

**more features**

and

**better interview quality**

choose **better interview quality**.
