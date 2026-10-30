# Blockwise

Blockwise helps a local business explore modeled taste affinities around its address and turn them into ideas for music, partnerships and outreach. It was created for the Qloo Agentic Hackathon.

## How it works

1. The server verifies a street-level address using Esri World Geocoding. A Qloo business record is attached only if its name, address and coordinates match.
2. Qloo `/v2/insights` supplies taste tags and artist, brand, place and media affinities using the address location and optional demographic signals. A city comparison subtracts affinities from two taste-analysis queries; it is not the Qloo compare endpoint.
3. The default Qloo-only mode runs a fixed set of calls in parallel and generates template-based suggestions. An optional Anthropic key enables an experimental tool-use loop. That optional path is not verified as part of the Qloo-only demo.
4. The interface streams the data steps and presents a playbook with text and print-to-PDF export.

Affinities are modeled signals, not evidence of actual customers, purchases, causality or probabilities. Ideas and bilingual posts require review before use. Missing data is not evidence of zero interest. Estimates for interpolated addresses can be imprecise. Geocoding sends the entered address to Esri; the returned location is sent to Qloo. Qloo responses are cached only in server memory. Geographic and demographic coverage may vary.

## Run locally

Requires Node.js 20.9 or newer and npm.

```bash
npm ci
cp .env.example .env.local
# Add QLOO_API_KEY to .env.local; never commit it.
npm run dev
```

Open http://localhost:3000. Without a Qloo key, the app uses invented offline fixtures for the three example addresses and labels them as demo data. Set `QLOO_MOCK=1` to force fixture mode. `ANTHROPIC_API_KEY` and `LLM_MODEL` are optional; leave the Anthropic key unset for the tested Qloo-only flow.

`npm run qloo:check` tests live response shapes at a verified address. `npm run test:location` runs synthetic address verification tests. `npm run lint` and `npm run build` check the application. A live key is needed to verify actual Qloo coverage.

## Deployment

Deploy the Next.js project to a compatible hosting service such as Vercel. Add `QLOO_API_KEY` as a server-side environment variable, leave `QLOO_MOCK` unset, and test the deployed flow with a real address. The streaming endpoint declares a maximum duration of 300 seconds; actual limits depend on the hosting plan. Configure usage controls before operating a public demo. Do not commit keys or live Qloo response data.

## Known limitations

- The default flow is deterministic, not an autonomous LLM agent. Do not describe it as model-driven without testing and configuring the optional model path.
- In thin-coverage areas nearby places may be empty. The default 4 km radius expands to 10 km, then 25 km, only when no places are returned; a coverage note records the radius.
- The business-type templates are starting points, not validated marketing advice or translations certified by a professional.
- The address verifier is deliberately conservative; some valid addresses or non-US formats may fail verification.
- `QLOO_MOCK=1` supplies invented example data; it is not evidence of live API coverage.
- Public deployment and phone-over-cellular testing have not yet been verified.

## License

MIT; see `LICENSE`.
