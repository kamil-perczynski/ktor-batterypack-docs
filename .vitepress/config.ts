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
      { text: "Get Started", link: "/introduction/get-started" },
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
        text: "Introduction",
        items: [{ text: "Get Started", link: "/introduction/get-started" }],
      },
      {
        text: "Core",
        items: [
          { text: "Overview", link: "/core/" },
          { text: "Configuration", link: "/core/config" },
          { text: "Dependency Injection", link: "/core/dependency-injection" },
          { text: "OpenAPI Generator", link: "/core/openapi-generator" },
          { text: "Controllers", link: "/core/controllers" },
          { text: "Exception Handling", link: "/core/exceptions" },
          { text: "Lifecycle", link: "/core/lifecycle" },
          { text: "Request Binding", link: "/core/request-binding" },
          { text: "Multipart Uploads", link: "/core/multipart" },
          { text: "HTTP Client", link: "/core/http-client" },
          { text: "Health", link: "/core/health" },
          { text: "Gradle Plugin", link: "/core/gradle-plugin" },
        ],
      },
      {
        text: "Data",
        items: [
          { text: "Database", link: "/data/database" },
          { text: "Database Testing", link: "/data/database-testing" },
        ],
      },
      {
        text: "Redis",
        items: [
          { text: "Redis", link: "/redis/" },
          { text: "Redis Testing", link: "/redis/redis-testing" },
        ],
      },
      {
        text: "Observability",
        items: [{ text: "Metrics", link: "/observability/metrics" }],
      },
      {
        text: "Validation",
        items: [
          { text: "Validation", link: "/validation/validation" },
          { text: "Validation Codegen", link: "/validation/validation-codegen" },
          {
            text: "Advanced Validation Codegen",
            link: "/validation/validation-codegen-advanced",
          },
        ],
      },
      {
        text: "Example Application",
        items: [{ text: "Example", link: "/example/" }],
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
