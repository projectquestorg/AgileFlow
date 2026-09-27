# ops-dashboard

A small, dependency-free internal dashboard (ESM) plus the cron jobs that keep
its data fresh.

```sh
npm test   # node --test
```

## Layout

| Path                    | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `public/theme.css`      | Design tokens (CSS custom properties) used by the UI.          |
| `public/charts.css`     | Chart styles.                                                  |
| `src/settings.js`       | Per-user settings, stored server-side (density, locale).       |
| `src/mailer.js`         | Outgoing email (a stub that records messages).                 |
| `jobs/*.js`             | Cron jobs, scheduled by `crontab` on the single app host.      |
| `jobs/lock.js`          | Prevents a job from overlapping with its previous run.         |
