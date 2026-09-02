# Legacy applications

These are the earlier implementations of the Portfolio Tracker. They are
**not maintained**. The live application is the Streamlit app at the
repository root (`streamlit_app/`).

| Path | What it is |
|------|------------|
| `nextjs/` | Original Next.js 16 + JSON-file version |
| `portfolio-tracker-standalone.html` | Single-file localStorage version |

To run the Next.js app:

```bash
cd legacy/nextjs
npm install
npm run dev
```

Known issue that was fixed here before archival: creating or editing a site
stored the SPV *code* in `spvId` because the form posted the code and the API
looked it up with `getSpvByCode`. The form now posts the SPV id and the API
resolves either an id or a code, then persists both fields consistently.
