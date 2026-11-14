# Munim review rules

The project's full standards are in `.claude/CLAUDE.md` and `.claude/skills/port-design/SKILL.md`; read them when a finding depends on a project convention. The rules that most often matter in review:

- Components use design tokens only. A raw colour, font name, font size, radius or pixel spacing in a component is a finding. Arbitrary values are allowed only where no token can exist: grid templates, and layout in viewport units or `ch` (`max-h-[70vh]`, `max-w-[62ch]`). Never for a colour, font size, radius or pixel spacing; use a named utility when one exists (`max-w-4/5`, not `max-w-[80%]`).
- Interactive things are real `button`, `a` or `input` elements with an accessible name. A clickable `div` or `span` is a finding.
- No control may look functional when it is not. No copy may claim security properties the app does not have (for example end-to-end encryption).
- Model names and model lists are never hard-coded.
- Secrets (source tokens, AI keys, the passphrase) must not reach the browser, logs, error messages or test fixtures.
- Input is validated at trust boundaries (Pydantic on the server): HTTP input, source API responses, feed XML, AI output that drives UI.
- The front end's API types are generated from the server's OpenAPI document. Hand-written copies of server types are a finding.
- Every endpoint that checks the passphrase must be rate limited on the server. A check that can be retried without limit is a major finding.
- Database migrations must be safe on existing data.
- Prefer less code. An abstraction, option or dependency that nothing uses yet is a finding.
- A changed screenshot baseline must be explained by a change in the same pull request.
