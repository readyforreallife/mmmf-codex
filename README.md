# Modern Manners & Mental Fortitude

Program repository for the MMMF curriculum, facilitator tools, printable resources, and web-based delivery materials.

## Quick Links

- Program hub: `web/index.html`
- Documents browser: `docs/index.html`
- Curriculum data: `data/mmmf-curriculum.json`
- GitHub Pages target: `https://readyforreallife.github.io/mmmf-codex/`

## What This Repository Includes

### Web experience

- `web/index.html` — program hub and launch page
- `web/teach-the-teacher-portal.html` — facilitator-facing training portal
- `web/manners-in-motion-cards.html` — digital card deck
- `web/registration-form.html` — registration and intake experience

### Document deliverables

- `docs/MMMF_Teach_the_Teacher.pptx`
- `docs/MMMF_Facilitator_Handbook.docx`
- `docs/MMMF_Participant_Workbook.docx`
- `docs/MMMF_Facilitator_Certification_Agreement.docx`
- `docs/MMMF_Scenario_Cards.pdf`
- `docs/MMMF_Manners_in_Motion_Cards.pdf`
- `docs/MMMF_Community_OnePager.pdf`
- `docs/MMMF_Registration_Form_Printable.pdf`

### Structured data

- `data/mmmf-curriculum.json` — curriculum content in machine-readable form for tooling, reuse, and future app work

## Program Summary

Modern Manners & Mental Fortitude is a real-world life skills program built around four core pillars:

1. Respectful communication
2. Emotional regulation
3. Decision-making under pressure
4. Accountability and repair

It supports instruction across youth, adult, family, and educator contexts and is designed for transfer into real-life situations rather than simple content coverage.

## Publishing

This repository includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

On pushes to `main`, GitHub Pages will publish a bundled site containing:

- the root landing page
- the `web/` experience
- the `docs/` document browser
- the `data/` folder

If Pages is not already enabled in repository settings, set the source to `GitHub Actions`.

## Suggested Use

- Use the `web/` folder for the interactive experience.
- Use `docs/index.html` as the public-facing browser for handouts and deliverables.
- Use `data/mmmf-curriculum.json` for future automation, search, and curriculum tooling.

## Ownership

All MMMF materials remain the intellectual property of Michael R. Terry unless separately licensed.
