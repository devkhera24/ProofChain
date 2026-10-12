Every prompt module exports:
- `system`: string
- `build(input)`: returns the user prompt string. Items are always given with IDs, e.g. `[P-14] text…`
- `schema`: Zod schema of the expected JSON
- `mock(input)`: returns a valid object (used when AI_MOCK=true)
- optional `check(input)`: returns (data) => error string | null for semantic checks such as "every passageId must be one I was given"

Rules baked into every system prompt:
- Use only the items provided. Never invent titles, authors, IDs, quotes or numbers.
- Quotes must be copied exactly from the given text.
- If unsure, say so with the "inconclusive"/empty option instead of guessing.
- Reply with JSON only.
