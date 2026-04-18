import { Router } from 'express';
import { prisma } from '../../db.js';

const router = Router();

/**
 * Produces a JSON export of all app data (excluding secrets).
 *
 * For a production backup you'd also want `pg_dump` at the DB level — this
 * endpoint is the *application-level* backup: a deterministic snapshot of
 * the data the admin sees, suitable for diffing, seeding a dev env, or
 * restoring selectively into another install.
 */
router.get('/export', async (_req, res) => {
  const [
    users, categories, products, productImages, productOptions, productOptionValues, variants,
    orders, orderItems, payments, shippingZones, shippingRates, taxRates, coupons,
    seoAnalyses, seoKeywords,
    emailTemplates, emailSubscribers, emailLists, emailListMembers, emailCampaigns,
    emailAttachments, emailSends,
    blockedIPs, suspiciousActivity, settings,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true } }),
    prisma.category.findMany(),
    prisma.product.findMany(),
    prisma.productImage.findMany(),
    prisma.productOption.findMany(),
    prisma.productOptionValue.findMany(),
    prisma.productVariant.findMany(),
    prisma.order.findMany(),
    prisma.orderItem.findMany(),
    prisma.payment.findMany({ select: { id: true, orderId: true, provider: true, providerRef: true, amountCents: true, status: true, createdAt: true } }),
    prisma.shippingZone.findMany(),
    prisma.shippingRate.findMany(),
    prisma.taxRate.findMany(),
    prisma.coupon.findMany(),
    prisma.seoAnalysis.findMany(),
    prisma.seoKeyword.findMany(),
    prisma.emailTemplate.findMany(),
    prisma.emailSubscriber.findMany(),
    prisma.emailList.findMany(),
    prisma.emailListMember.findMany(),
    prisma.emailCampaign.findMany(),
    prisma.emailAttachment.findMany(),
    prisma.emailSend.findMany(),
    prisma.blockedIP.findMany(),
    prisma.suspiciousActivity.findMany({ take: 1000, orderBy: { createdAt: 'desc' } }),
    // Include non-secret settings; mask secrets.
    prisma.setting.findMany({ where: { encrypted: false } }),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    data: {
      users, categories, products, productImages, productOptions, productOptionValues, variants,
      orders, orderItems, payments,
      shippingZones, shippingRates, taxRates, coupons,
      seoAnalyses, seoKeywords,
      emailTemplates, emailSubscribers, emailLists, emailListMembers, emailCampaigns,
      emailAttachments, emailSends,
      blockedIPs, suspiciousActivity,
      settings,
    },
  };

  const filename = `printingcomics-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(payload);
});

/** Quick stats so the admin can see what would be included in a backup. */
router.get('/stats', async (_req, res) => {
  const [products, orders, users, subscribers, templates, campaigns, sends] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.user.count(),
    prisma.emailSubscriber.count(),
    prisma.emailTemplate.count(),
    prisma.emailCampaign.count(),
    prisma.emailSend.count(),
  ]);
  res.json({ products, orders, users, subscribers, templates, campaigns, sends });
});

export default router;
