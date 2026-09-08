import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: "docs",
  base: "/ktor-batterypack-docs/",
  appearance: "force-dark",

  title: "Ktor/ Batterypack",
  description: "Ktor Batterypack Docs",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/icon-x.webp",

    nav: [
      { text: "Home", link: "/" },
      { text: "Table of Contents", link: "/table-of-contents" },
      {
        text: "0.0.13-alpha",
        link: "https://github.com/kamil-perczynski/ktor-batterypack/releases/tag/0.0.13-alpha",
      },
    ],

    search: {
      provider: "local",
    },

    sidebar: [
      {
        text: "Overview",
        items: [{ text: "Table of Contents", link: "/table-of-contents" }],
      },
      {
        text: "Modules",
        items: [
          { text: "Core", link: "/table-of-contents" },
          { text: "Database", link: "/table-of-contents" },
          { text: "Metrics", link: "/table-of-contents" },
          { text: "Redis", link: "/table-of-contents" },
          { text: "Validation", link: "/table-of-contents" },
          { text: "Annotations", link: "/table-of-contents" },
          { text: "Gradle Plugin", link: "/table-of-contents" },
          { text: "Example", link: "/table-of-contents" },
        ],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/kamil-perczynski/ktor-batterypack",
      },
    ],
  },
});
