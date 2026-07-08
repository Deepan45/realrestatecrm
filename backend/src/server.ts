import { createApp } from "./app";
import { env } from "./config/env";
import { startFollowUpReminderJob } from "./jobs/followUpReminders";
import { startLeadRecyclingJob } from "./jobs/leadRecycling";

const app = createApp();

app.listen(env.port, () => {
  console.log(`RealRest CRM API running on http://localhost:${env.port}`);
  console.log(`API docs available at http://localhost:${env.port}/api/docs`);
  startFollowUpReminderJob();
  startLeadRecyclingJob();
});
