import type { ProjectAnalysis } from "@/types/analysis";

export const mockAnalysis: ProjectAnalysis = {
  id: "demo",
  createdAt: "2026-07-17T06:30:00.000Z",
  source: {
    title: "SaaS analytics dashboard",
    platform: "Upwork",
    description: "Build a responsive SaaS platform with authentication, Stripe billing, analytics, settings, and team management.",
    clientBudget: { min: 4000, max: 7000, currency: "USD" }
  },
  verdict: {
    decision: "negotiate",
    confidence: 84,
    summary: "Strong portfolio value and realistic economics, but the analytics scope and permission model must be clarified before agreeing to a fixed price.",
    primaryReason: "Good opportunity after two scope questions are resolved."
  },
  score: { total: 84, profitability: 9, clarity: 8, portfolioValue: 9, complexity: 7, risk: 4 },
  estimate: {
    budgetMin: 4500,
    budgetRecommended: 5500,
    budgetMax: 7000,
    currency: "USD",
    durationMinDays: 30,
    durationMaxDays: 42
  },
  requirements: {
    explicit: ["Responsive SaaS application", "Authentication", "Stripe subscriptions", "Analytics dashboard", "Settings", "Team management"],
    hidden: ["Password reset and email verification", "Stripe webhook handling", "Role-based permissions", "Empty and error states", "Deployment configuration"],
    assumptions: ["Designs are supplied or a simple design system is acceptable", "One billing currency is sufficient", "Analytics data sources are available"]
  },
  risks: [
    { title: "Undefined analytics scope", description: "The brief does not define required metrics, filters, or data sources.", severity: "high", mitigation: "Request a dashboard inventory and example reports before pricing." },
    { title: "Permission complexity", description: "Team management may imply multiple roles and granular access rules.", severity: "medium", mitigation: "Agree on the exact role matrix and invite flow." },
    { title: "Billing edge cases", description: "Trials, failed payments, upgrades, and cancellations are not specified.", severity: "medium", mitigation: "Define supported subscription lifecycle states." }
  ],
  milestones: [
    { title: "Discovery and architecture", description: "Confirm scope, data model, and delivery plan.", durationDays: 4, percentage: 12 },
    { title: "Authentication and core", description: "Implement accounts, sessions, and primary application shell.", durationDays: 9, percentage: 26 },
    { title: "Dashboard and analytics", description: "Implement metrics, filters, and core reporting UI.", durationDays: 12, percentage: 34 },
    { title: "Billing and team access", description: "Integrate Stripe and role management.", durationDays: 7, percentage: 18 },
    { title: "QA and deployment", description: "Polish, test, document, and deploy.", durationDays: 5, percentage: 10 }
  ],
  techStack: [
    {
      name: "Next.js",
      category: "Frontend",
      reason: "Strong routing and server rendering for a SaaS UI.",
      tip: "App Router's server components keep the billing/team pages fast without a separate data-fetching layer."
    },
    {
      name: "FastAPI",
      category: "Backend",
      reason: "Typed Python API with fast schema development.",
      tip: "Pydantic models validate Stripe webhook payloads directly, so malformed events fail loudly instead of silently."
    },
    {
      name: "PostgreSQL",
      category: "Database",
      reason: "Reliable relational model for billing and teams.",
      tip: "Row-level constraints keep team-membership and subscription-state invariants enforced at the DB layer, not just in application code."
    },
    {
      name: "Stripe",
      category: "Payments",
      reason: "Standard subscription lifecycle and webhooks.",
      tip: "Its test-mode clock feature lets you simulate a full billing cycle (trial, renewal, dunning) without waiting real days."
    },
    {
      name: "Tailwind CSS",
      category: "UI",
      reason: "Fast token-driven implementation.",
      tip: "Pairs well with a small design-token file (colors/spacing) so the whole app stays visually consistent without a component library."
    },
    {
      name: "Recharts",
      category: "Charts",
      reason: "Sufficient chart primitives for the dashboard.",
      tip: "Lighter than a full charting suite — worth code-splitting behind next/dynamic since it's only needed on the dashboard route."
    }
  ],
  clientQuestions: [
    "Which analytics metrics and data sources are required for the first release?",
    "How many user roles are needed, and what can each role access?",
    "Are finished designs available, or is UI design part of the scope?",
    "Which subscription states and billing edge cases must be supported?",
    "What is the target launch date and required deployment environment?"
  ],
  // D047: three complete, self-contained variants (neutral base / confident /
  // technical), all shown from this static demo fixture with no network call.
  // Each ends with the literal "[YOUR NAME]" placeholder, substituted live from
  // the Settings name (left as the placeholder when unset).
  proposal: {
    short: "I can build the SaaS dashboard with authentication, billing, analytics, and team access. Before fixing the final scope, I would clarify the analytics inventory and permission model.",
    full: "Hi,\n\nThank you for sharing the brief. I reviewed it in detail and this SaaS build is a strong fit for my experience, so I'd be glad to take it on.\n\nI can deliver the responsive application shell, authentication, the Stripe subscription flow, the analytics dashboard, settings, and team access as a single staged implementation. Before we agree on a fixed price, I'd want to confirm the exact metrics and data sources the analytics dashboard needs, plus the role and permission matrix for team members — those two details shape the backend model and the QA scope more than anything else in the brief.\n\nMy plan is to start with a short discovery and architecture milestone, then build the core product, the dashboard, and billing in reviewable stages, and finish with a full round of testing, polish, and deployment. You'll get regular check-ins and a clear milestone breakdown throughout.\n\nRecommended budget: 5,500 USD, with an estimated timeline of 30 to 42 days. I'm happy to adjust the plan once the two open questions are settled.\n\nBest regards,\n[YOUR NAME]",
    confident: "Hi,\n\nI've reviewed your brief and I'm confident I can deliver exactly what you're describing — a polished, responsive SaaS platform with authentication, Stripe billing, an analytics dashboard, settings, and team access. I've built products like this end to end and I know what it takes to ship something you'll be proud to put in front of your users.\n\nHere's how I'll approach it: a short discovery step to lock the scope, then the core product, dashboard, and billing built in focused milestones, and a final phase for testing, polish, and deployment. You'll always know where things stand, and you'll get a finished result that matches the brief rather than a watered-down version of it.\n\nThe only two things I'd confirm up front are the analytics inventory and the team permission matrix — nail those and the rest is a clear, well-understood build.\n\nI can start as soon as you give the go-ahead. Recommended budget: 5,500 USD; estimated timeline: 30 to 42 days.\n\nBest regards,\n[YOUR NAME]",
    technical: "Hi,\n\nBased on the requirements, here's how I'd approach this technically. I'd build it as a Next.js frontend against a typed Python (FastAPI) API, backed by PostgreSQL, with Stripe handling the subscription lifecycle and Recharts for the dashboard — a stack chosen to keep the build fast to develop and straightforward to maintain.\n\nI'd structure the work with clear separation of concerns, automated tests around the critical paths (auth, billing webhooks, permission checks), and continuous integration from day one so regressions are caught before they ship. Stripe webhook handling and role-based permissions are the parts most likely to hide edge cases, so I'd model those explicitly rather than bolt them on later.\n\nThe sequence would be: a short architecture step to lock the data model and integration points, then the core product, analytics, and billing implemented in reviewable increments, and a documented, maintainable handoff at the end. I'd want to confirm the required analytics metrics/data sources and the exact role matrix before fixing the price, since both drive the backend schema.\n\nRecommended budget: 5,500 USD; estimated timeline: 30 to 42 days. Happy to walk through the architecture in more detail before we start.\n\nBest regards,\n[YOUR NAME]"
  }
};
