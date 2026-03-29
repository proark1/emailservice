import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { sendEmailDirect } from "../services/email-sender.js";

export interface EmailSendJobData {
  emailId: string;
  accountId: string;
}

async function processEmailSend(job: Job<EmailSendJobData>) {
  await sendEmailDirect(job.data.emailId, job.data.accountId);
}

export function createEmailSendWorker() {
  const concurrency = Number(process.env.EMAIL_SEND_CONCURRENCY) || 10;
  return new Worker("email.send", processEmailSend, {
    connection: getRedisConnection(),
    concurrency,
  });
}
