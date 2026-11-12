import React from 'react';

const Section = ({ title, children }) => (
  <section className="legal-section">
    <h2>{title}</h2>
    {children}
  </section>
);

export function PrivacyPolicy() {
  return (
    <article className="legal-page" aria-labelledby="privacy-title">
      <header className="legal-hero">
        <span>PHILBO DISTRIBUTION LLC</span>
        <h1 id="privacy-title">PRIVACY POLICY</h1>
        <p>Effective September 13, 2026</p>
      </header>

      <div className="legal-content">
        <p className="legal-intro">
          Philbo Distribution LLC (“Philbo,” “we,” “us,” or “our”) provides a comic-book distribution,
          catalog, ordering, print-on-demand, and production-management platform. This policy explains
          what information we collect, why we use it, and the choices available to you.
        </p>

        <Section title="Information we collect">
          <p>Depending on how you use Philbo, we may collect:</p>
          <ul>
            <li>Account and contact details, including names, business names, email addresses, phone numbers, and mailing addresses.</li>
            <li>Publisher, retailer, creator, title, catalog, ordering, invoicing, shipping, and payment-status information.</li>
            <li>Files you submit, such as comic-book interiors, covers, logos, samples, marketing materials, tax or resale documents, and production files.</li>
            <li>Portal activity, approval history, notes, file versions, and basic technical information needed to secure and operate the service.</li>
          </ul>
        </Section>

        <Section title="How we use information">
          <p>We use information to operate the Philbo platform and fulfill the services you request, including to:</p>
          <ul>
            <li>Review applications and manage authorized accounts.</li>
            <li>Build catalogs, process orders, prepare purchase orders, coordinate printing, and support fulfillment.</li>
            <li>Review submitted files, communicate corrections, maintain production history, and provide customer support.</li>
            <li>Protect accounts, enforce role-based access, investigate problems, and improve the reliability of the platform.</li>
            <li>Publish only those catalog and marketing assets that have been approved for public use.</li>
          </ul>
        </Section>

        <Section title="Google Drive data">
          <p>
            Philbo may use Google Drive as protected storage and backup for portal files. The Philbo application
            requests limited, per-file access. It may create, organize, read, update, or delete only the specific
            Drive files and folders selected for, created by, or shared with the Philbo application.
          </p>
          <p>
            Google Drive data is used only to provide Philbo file-storage, production, catalog, and backup functions.
            We do not use Google Drive data for advertising, sell it, or permit unrelated access. Access credentials
            are restricted to authorized server-side systems and are not placed in public website code.
          </p>
          <p>
            Philbo’s use and transfer of information received from Google APIs will adhere to the Google API Services
            User Data Policy, including its Limited Use requirements.
          </p>
        </Section>

        <Section title="Public and private files">
          <p>
            Approved covers, logos, catalog artwork, samples, creator biographies, press kits, and other marketing
            materials may be displayed publicly. Print-ready interiors, working files, proofs, contracts, tax records,
            purchase orders, invoices, customer information, and materials awaiting approval remain private and are
            limited to authorized roles. Uploading a file does not automatically make it public.
          </p>
        </Section>

        <Section title="How information is shared">
          <p>
            We share information only as needed to operate the requested service—for example, with authorized publishers,
            retailers, printers, production personnel, delivery providers, and technology vendors acting on our behalf.
            Each participant receives only the information appropriate to their role. We may also disclose information
            when required by law or when necessary to protect rights, safety, and platform security.
          </p>
        </Section>

        <Section title="Retention, deletion, and security">
          <p>
            We retain records for as long as reasonably necessary to provide services, maintain production and transaction
            history, meet legal or accounting obligations, resolve disputes, and protect the platform. You may request
            access, correction, or deletion of eligible information. Some records may need to be retained where required
            by law or for legitimate business records.
          </p>
          <p>
            We use administrative, technical, and organizational safeguards designed to protect information. No storage
            or transmission system can be guaranteed to be completely secure.
          </p>
        </Section>

        <Section title="Your choices and contact information">
          <p>
            You may ask questions, request an update to your information, request deletion of eligible information, or
            revoke Philbo’s Google Drive access through your Google Account permissions.
          </p>
          <p>
            Contact: <a href="mailto:philbodistribution@gmail.com">philbodistribution@gmail.com</a><br />
            Philbo Distribution LLC, 27 Barrett Avenue, Bayport, New York 11705
          </p>
        </Section>

        <Section title="Updates to this policy">
          <p>
            We may update this policy as the platform and its services develop. The effective date above will be revised
            when material changes are posted.
          </p>
        </Section>
      </div>
    </article>
  );
}

export function TermsOfService() {
  return (
    <article className="legal-page" aria-labelledby="terms-title">
      <header className="legal-hero">
        <span>PHILBO DISTRIBUTION LLC</span>
        <h1 id="terms-title">TERMS OF SERVICE</h1>
        <p>Effective September 13, 2026</p>
      </header>

      <div className="legal-content">
        <p className="legal-intro">
          These Terms govern access to Philbo’s website, portals, catalog, distribution, print-on-demand,
          and production services. By using the platform, you agree to these Terms and any written order,
          quote, production approval, or account agreement that applies to your services.
        </p>

        <Section title="Accounts and authorized use">
          <p>
            You must provide accurate and complete account information, keep login credentials confidential, and promptly
            update changes to your business or contact information. Access is role-based. You may not attempt to view,
            change, download, or disclose information assigned to another user, company, or role.
          </p>
        </Section>

        <Section title="Publisher and creator submissions">
          <p>
            You retain ownership of materials you submit. You represent that you have the rights and permissions needed
            for Philbo to receive, review, reproduce, display, distribute, print, and fulfill those materials as necessary
            to provide the services you request. You grant Philbo a limited license to perform those services and to display
            approved catalog and marketing materials.
          </p>
        </Section>

        <Section title="Catalogs, orders, and production">
          <p>
            Catalog dates, final-order-cutoff dates, availability, pricing, estimates, and production schedules may change.
            Orders and print jobs are not final until accepted under the applicable workflow. Proof approval confirms that
            the customer accepts the approved content and production specifications. Separate quotes, purchase orders,
            invoices, shipping terms, return rules, and written agreements may add service-specific terms.
          </p>
        </Section>

        <Section title="Files and print readiness">
          <p>
            Customers are responsible for supplying complete, lawful, and accurate files that meet the stated specifications.
            Automated or staff preflight review assists with identifying common problems but does not guarantee that every
            content, design, color, trim, pagination, or production issue will be detected. Original files should be retained
            by the customer.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>You may not use Philbo to:</p>
          <ul>
            <li>Upload unlawful, infringing, deceptive, malicious, or unauthorized material.</li>
            <li>Interfere with platform operation, security, or another user’s access.</li>
            <li>Misrepresent identity, ownership, permissions, pricing, orders, or business information.</li>
            <li>Copy, scrape, resell, or misuse nonpublic platform data or another participant’s confidential information.</li>
          </ul>
        </Section>

        <Section title="Third-party services">
          <p>
            Philbo may rely on third-party providers for hosting, database services, file storage, email, shipping,
            accounting, or other operational functions. Their services may be governed by separate terms and policies.
          </p>
        </Section>

        <Section title="Availability and responsibility">
          <p>
            We work to keep the platform accurate and available, but beta features, previews, integrations, and service
            availability may change. To the extent permitted by law, Philbo is not responsible for indirect or consequential
            losses caused by service interruptions, third-party systems, unauthorized activity outside our reasonable control,
            or inaccurate information supplied by a user.
          </p>
        </Section>

        <Section title="Suspension and termination">
          <p>
            We may limit or suspend access when reasonably necessary to address security risks, suspected misuse, unpaid
            obligations, legal requirements, or material violations of these Terms. You may stop using the service and request
            account closure, subject to outstanding orders, record-retention duties, and applicable agreements.
          </p>
        </Section>

        <Section title="Changes and contact information">
          <p>
            We may update these Terms as the platform develops. Continued use after updated Terms are posted constitutes
            acceptance to the extent permitted by law. Questions may be sent to{' '}
            <a href="mailto:philbodistribution@gmail.com">philbodistribution@gmail.com</a> or mailed to Philbo Distribution LLC,
            27 Barrett Avenue, Bayport, New York 11705.
          </p>
        </Section>
      </div>
    </article>
  );
}
