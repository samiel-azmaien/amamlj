# AMAMLJ site (Draft v0.3)

Static site for **AMAMLJ** (Agent Memory, Audit, Meaning, Lineage & Judgment), Totem's draft protocol for agent-to-agent security: a trust layer, an auth and permissions layer, and a runtime message security pipeline.

This is a design draft. It does not claim partners, production deployments, adoption, or endorsements. Partner slots are explicit placeholders; example files use placeholder values.

## Pages

- `index.html`: overview (three layers, lifecycle diagram, permissions and risk classes, runtime pipeline, tiers, FAQ)
- `spec/`: draft v0.3 specification (summary of the engineering handoff)
- `start/`: getting started, the single-session build sequence
- `examples/`: illustrative `amamlj.json`, receipt, policy, grant, and trust-decision documents (placeholder values only)

All links are relative, so the site works at the root or under a subpath such as GitHub Pages `/<repo>/`.

## Preview locally

```bash
python3 -m http.server 8080
```

Then open http://127.0.0.1:8080/
