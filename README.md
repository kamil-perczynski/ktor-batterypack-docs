# Ktor Batterypack Docs

Documentation site for [ktor-batterypack](https://github.com/kamil-perczynski/ktor-batterypack), built with [VitePress](https://vitepress.dev/) and [Bun](https://bun.sh/).

**Live site:** https://kamil-perczynski.github.io/ktor-batterypack-docs/

## Getting started

You need [Bun](https://bun.sh/docs/installation) installed.

```bash
bun install
```

## Development

Start the local dev server:

```bash
bun run docs:dev
```

The site is served at VitePress's default address, usually `http://localhost:5173/`.

## Build

Generate the static site:

```bash
bun run docs:build
```

The build output is written to `.vitepress/dist`.

Preview the production build locally:

```bash
bun run docs:preview
```

## Deployment

The site is automatically built and published to GitHub Pages on every push to `main` using the workflow in `.github/workflows/cicd.yaml`.

You can also trigger a deployment manually from the **Actions** tab.

## Project structure

```
.
├── .github/workflows/cicd.yaml   # CI/CD pipeline
├── .vitepress/
│   ├── config.ts                 # VitePress configuration
│   ├── dist/                     # Build output (generated)
│   └── theme/                    # Custom theme assets
├── docs/
│   ├── index.md                  # Homepage
│   └── public/                   # Static assets (icons, images)
├── package.json
├── tsconfig.json
└── README.md
```
