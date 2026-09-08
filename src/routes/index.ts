import express from 'express';
import authRoutes from '../core/auth/auth.routes';
import schoolRoutes from '../core/schools/school.routes';
import studentRoutes from '../core/students/student.routes';
import parentRoutes from '../core/parents/parent.routes';
import classRoutes from '../core/classes/class.routes';
import feeRoutes from '../core/fees/fee.routes';
import invoiceRoutes from '../core/invoices/invoice.routes';
import paymentRoutes from '../core/payments/payment.routes';
import subscriptionRoutes from '../core/subscriptions/subscription.routes';
import resultRoutes from '../core/results/result.routes';
import attendanceRoutes from '../core/attendance/attendance.routes';
import reportCardRoutes from '../core/reportCards/reportCard.routes';
import automationRoutes from '../core/automations/automation.routes';
import platformRoutes from '../core/platform/platform.routes';
import webhookRoutes from './webhook.routes';
import communicationRoutes from '../core/communications/communication.routes';
import notificationRoutes from '../core/notifications/notification.routes';
import documentRoutes from '../core/documents/document.routes';
import academicRoutes from '../core/academics/academic.routes';
import analyticsRoutes from '../core/analytics/analytics.routes';
import supportRoutes from '../core/support/support.routes';
import exportRoutes from '../core/export/export.routes';
import staffRoutes from '../core/staff/staff.routes';
import { authMiddleware, requireSchoolMembership, requireSchoolContext } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/subscription.middleware';
import { checkEntitlement } from '../middleware/entitlement.middleware';
import { requirePermission } from '../middleware/permission.middleware';

const router = express.Router();

// Public
router.use('/auth', authRoutes);
router.use('/webhooks', webhookRoutes);

// Protected
router.use(authMiddleware);

// Platform routes (no school context)
router.use('/platform', platformRoutes);

// Routes requiring school context
router.use(requireSchoolMembership);
router.use(requireSchoolContext);
router.use(requireActiveSubscription);

// Mount all school routes
router.use('/schools', schoolRoutes);
router.use('/students', checkEntitlement('students'), studentRoutes); // entitlement on all student routes (but we apply at route level in student.routes too)
router.use('/parents', parentRoutes);
router.use('/classes', classRoutes);
router.use('/fees', feeRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/results', resultRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/report-cards', reportCardRoutes);
router.use('/automations', automationRoutes);
router.use('/communications', communicationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/documents', documentRoutes);
router.use('/academics', academicRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/support', supportRoutes);
router.use('/export', exportRoutes);

// Staff routes – entitlement will be applied on POST inside staff.routes
router.use('/staff', staffRoutes);

export default router;
