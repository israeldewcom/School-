 import './sms.worker';
import './email.worker';
import './payment.worker';
import './automation.worker';
import './notification.worker';
import './reconciliation.worker';
import './expiry.worker';
import './timetable.worker';
import { startPdfWorker } from './pdf.worker';
import { startReportWorker } from './report.worker';

// pdf and report workers export a start function instead of starting on import.
startPdfWorker();
startReportWorker();
