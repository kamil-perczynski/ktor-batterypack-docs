<template>
  <footer class="custom-footer">
    <div class="footer-grid">
      <div class="footer-brand">
        <img :src="withBase('/icon-x.webp')" alt="Ktor Batterypack icon" width="48" height="48" />
        <span class="footer-title">Ktor/ Batterypack</span>
        <div class="footer-social">
          <a href="https://x.com/" target="_blank" rel="noopener noreferrer" aria-label="X">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a href="https://youtube.com/" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </a>
        </div>
      </div>

      <div class="footer-column">
        <h4>Core & Build</h4>
        <a
          v-for="module in groups.core"
          :key="module"
          :href="`https://github.com/kamil-perczynski/ktor-batterypack/tree/main/${module}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ module }}
        </a>
      </div>

      <div class="footer-column">
        <h4>Database</h4>
        <a
          v-for="module in groups.database"
          :key="module"
          :href="`https://github.com/kamil-perczynski/ktor-batterypack/tree/main/${module}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ module }}
        </a>
      </div>

      <div class="footer-column">
        <h4>Redis</h4>
        <a
          v-for="module in groups.redis"
          :key="module"
          :href="`https://github.com/kamil-perczynski/ktor-batterypack/tree/main/${module}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ module }}
        </a>
      </div>

      <div class="footer-column">
        <h4>Validation</h4>
        <a
          v-for="module in groups.validation"
          :key="module"
          :href="`https://github.com/kamil-perczynski/ktor-batterypack/tree/main/${module}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ module }}
        </a>
      </div>

      <div class="footer-column">
        <h4>Metrics</h4>
        <a
          v-for="module in groups.metrics"
          :key="module"
          :href="`https://github.com/kamil-perczynski/ktor-batterypack/tree/main/${module}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ module }}
        </a>
      </div>
    </div>

    <div class="footer-bottom">
      <p>© {{ new Date().getFullYear() }} Ktor/ Batterypack. Open source under the MIT License.</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { withBase } from 'vitepress'

const groups = {
  core: [
    'ktor-batterypack-core',
    'ktor-batterypack-annotations',
    'ktor-batterypack-example',
    'ktor-batterypack-gradle-plugin',
  ],
  database: ['ktor-batterypack-database', 'ktor-batterypack-database-testing'],
  redis: ['ktor-batterypack-redis', 'ktor-batterypack-redis-testing'],
  validation: ['ktor-batterypack-validation', 'ktor-batterypack-validation-ksp'],
  metrics: ['ktor-batterypack-metrics'],
}
</script>

<style scoped>
.custom-footer {
  max-width: var(--vp-layout-max-width);
  margin: 0 auto;
  padding: 3rem 24px 2rem;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.footer-grid {
  display: grid;
  grid-template-columns: 1.5fr repeat(5, 1fr);
  gap: 2rem;
  align-items: start;
}

.footer-brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.footer-brand img {
  border-radius: 10px;
}

.footer-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--vp-c-text-1);
}

.footer-social {
  display: flex;
  gap: 0.75rem;
}

.footer-social a {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  transition: color 0.2s, background 0.2s;
}

.footer-social a:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-default-soft);
}

.footer-column {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.footer-column h4 {
  margin: 0 0 0.25rem;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-1);
}

.custom-footer a {
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-column a:hover {
  color: var(--vp-c-brand-1);
}

.footer-bottom {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.footer-bottom p {
  margin: 0;
}

@media (max-width: 960px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 2rem 1.5rem;
  }

  .footer-brand {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}
</style>
