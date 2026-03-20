# Modern Manners & Mental Fortitude (MMMF)
### Program Resource Repository · readyforreal.life

> *"Transfer, not coverage. Students leave able to apply concepts independently to unfamiliar, high-stakes situations."*
> — Michael R. Terry, Founder

---

## Overview

**Modern Manners & Mental Fortitude (MMMF)** is a real-world life skills curriculum for Grades 7–12 and community programs. It is a 1-term course (16 weeks, 2 sessions per week) built around four core pillars and two student-facing frameworks, designed for transfer — not coverage.

This repository contains all program deliverables, web applications, structured curriculum data, and documentation needed to deploy, teach, and extend the MMMF program.

| | |
|---|---|
| **Founder** | Michael R. Terry · Utah Highway Patrol Sergeant · MAT Candidate |
| **Organization** | Columbia College of Missouri · Kappa Delta Pi |
| **Website** | [readyforreal.life](https://readyforreal.life) |
| **Contact** | mikeyterry44@gmail.com · (435) 840-1896 |
| **Standards** | Utah CASEL & CCA Core Standards |
| **Duration** | 16 weeks · 2 sessions/week · 20–25 students |

---

## Repository Structure

```
mmmf-codex/
├── web/                          # Web applications (open in browser)
│   ├── index.html                # ← START HERE — Program Hub
│   ├── teach-the-teacher-portal.html
│   ├── manners-in-motion-cards.html
│   └── registration-form.html
│
├── docs/                         # All print & document deliverables
│   ├── MMMF_Teach_the_Teacher.pptx
│   ├── MMMF_Facilitator_Handbook.docx
│   ├── MMMF_Participant_Workbook.docx
│   ├── MMMF_Facilitator_Certification_Agreement.docx
│   ├── MMMF_Scenario_Cards.pdf
│   ├── MMMF_Manners_in_Motion_Cards.pdf
│   ├── MMMF_Community_OnePager.pdf
│   └── MMMF_Registration_Form_Printable.pdf
│
├── data/                         # Structured curriculum data
│   └── mmmf-curriculum.json      # Full curriculum as machine-readable JSON
│
└── README.md                     # This file
```

---

## Quick Start

### Run locally
```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/mmmf-codex.git
cd mmmf-codex

# Open the program hub in your browser
open web/index.html
```

### Deploy to the web
The `web/` folder contains three fully self-contained HTML files with no dependencies. Drop any of them directly into your web host, CMS, or readyforreal.life.

```bash
# Example: deploy with any static host (Netlify, Vercel, GitHub Pages)
# Just point the root to the web/ directory
```

### Use curriculum data with Codex / AI tools
The structured JSON in `data/mmmf-curriculum.json` contains the complete curriculum — all pillars, modules, frameworks, learning targets, pacing calendar, rubrics, and assessment tools — in machine-readable format.

```javascript
// Load curriculum data
const curriculum = require('./data/mmmf-curriculum.json');

// Access frameworks
const PLRR = curriculum.student_frameworks.PLRR;
const POCC = curriculum.student_frameworks.POCC;

// Access modules
const modules = curriculum.modules;

// Access rubric
const rubric = curriculum.assessment_framework.summative[0].rubric;
```

---

## All 11 Deliverables

### Web Applications (`web/`)

| File | Description |
|------|-------------|
| `index.html` | Program Hub — central navigation to all resources |
| `teach-the-teacher-portal.html` | 9-tab interactive training portal with readiness checklist |
| `manners-in-motion-cards.html` | 36-card interactive digital deck — filterable & shuffleable |
| `registration-form.html` | 4-step multi-page program registration form (embeddable) |

### Documents & Print Materials (`docs/`)

| File | Format | Description |
|------|--------|-------------|
| `MMMF_Teach_the_Teacher.pptx` | PowerPoint | 15-slide training deck covering all 3 days |
| `MMMF_Facilitator_Handbook.docx` | Word | Complete facilitator guide with speaker notes |
| `MMMF_Participant_Workbook.docx` | Word | Day 1–3 activities, pacing template, 4-week journals |
| `MMMF_Facilitator_Certification_Agreement.docx` | Word | Legal licensing agreement — 8 sections, signature pages |
| `MMMF_Scenario_Cards.pdf` | PDF | 24 scenario cards across 4 implementation tracks |
| `MMMF_Manners_in_Motion_Cards.pdf` | PDF | 36 printable challenge cards across 6 categories |
| `MMMF_Community_OnePager.pdf` | PDF | Print-ready program overview for parents & partners |
| `MMMF_Registration_Form_Printable.pdf` | PDF | 2-page printable intake form |

### Curriculum Data (`data/`)

| File | Description |
|------|-------------|
| `mmmf-curriculum.json` | Full curriculum as structured JSON — frameworks, modules, rubrics, pacing, research foundations, all deliverable metadata |

---

## Curriculum Summary

### Four Core Pillars
1. 🤝 **Respectful Communication** — Tone, body language, active listening, repair
2. 🧘 **Emotional Regulation** — Triggers, PLRR routine, grounding, mindfulness
3. ⚖️ **Decision-Making Under Pressure** — POCC framework, consequence mapping
4. 🔁 **Accountability & Repair** — Own it, fix it, follow through

### Two Student Frameworks

**PLRR — Regulation Routine** *(used before decision-making)*
```
P — Pause      Stop the automatic reaction. Create space.
L — Label      Name the emotion exactly.
R — Reframe    What is actually happening vs. what I assumed?
R — Respond    Choose deliberately, aligned with values.
```

**POCC — Decision-Making Framework** *(structured choice under pressure)*
```
P — Pause         Regulate first. Good decisions require cognitive space.
O — Options       Identify multiple possible responses.
C — Consequences  Evaluate short and long-term outcomes.
C — Choose        Select and justify a response.
```

### Five Modules
| # | Module | Framework Focus |
|---|--------|----------------|
| 01 | 🎩 Modern Manners | PLRR intro |
| 02 | 🧠 Emotional Intelligence | PLRR deep dive |
| 03 | 🕊️ Conflict Navigation | PLRR + POCC |
| 04 | 📱 Digital Citizenship | POCC focus |
| 05 | 🌱 Personal Growth | Both frameworks |

### Four Implementation Tracks
| Track | Context | Complexity |
|-------|---------|------------|
| 🏫 Grades 7–8 | School | Foundational |
| 🎓 Grades 9–12 | School | Levels up annually |
| 👦 Community Youth | After-school, faith orgs | Flexible |
| 👤 Community Adult | Workplace, family | Adult-adapted |

---

## Research Foundation

| Theorist | Year | Application in MMMF |
|----------|------|---------------------|
| Tyler | 1949 | Objectives-based backward design |
| Bruner | 1960 | Spiral curriculum — revisited complexity |
| Dewey | 1938 | Experience + reflection + transfer |
| CASEL | 2020 | SEL competency alignment |
| Stern et al. | 2021 | Anchoring concepts + dissimilar transfer |
| Wiles & Bondi | 2015 | Curriculum Planning Model |
| Lang | 2021 | Small teaching + retrieval cycles |

---

## Licensing & IP

All MMMF curriculum materials are protected intellectual property of **Michael R. Terry**.

- ✅ Licensed facilitators may deliver, use, and distribute materials to enrolled participants
- ✅ Structural and data files in this repository may be used to build tools that support MMMF delivery
- ❌ Unauthorized copying, redistribution, sub-licensing, or derivative works are prohibited
- ❌ MMMF frameworks (PLRR, POCC) may not be presented as original works of any other party

For licensing inquiries: **mikeyterry44@gmail.com**

See `docs/MMMF_Facilitator_Certification_Agreement.docx` for full terms.

---

*© Michael R. Terry · Modern Manners & Mental Fortitude · readyforreal.life*
