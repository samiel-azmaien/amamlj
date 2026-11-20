# AMAMLJ site

Static site for **AMAMLJ** (Agent Memory, Audit, Meaning, Lineage & Judgment), Totem's protocol for agent-to-agent security: a trust layer, an auth and permissions layer, and a runtime message security pipeline.

## Pages

- `index.html`: overview (three layers, lifecycle diagram, permissions and risk classes, runtime pipeline, tiers)
- `spec/`: version 0.3 specification
- `start/`: getting started — how the running system is put together
- `examples/`: field schemas for `amamlj.json`, receipt, policy, grant, and trust-decision documents (types only, no instance values)

All links are relative, so the site works at the root or under a subpath such as GitHub Pages `/<repo>/`.

Rebuild the search index after content changes:

```bash
python3 scripts/build-search-index.py
```

## Preview locally

```bash
python3 -m http.server 8080
```

Then open http://127.0.0.1:8080/
