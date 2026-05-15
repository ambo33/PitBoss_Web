import { Link } from 'react-router-dom';
import BrandLockup from '../../components/BrandLockup';

const updatedDate = 'May 15, 2026';

const sections = [
  {
    title: '1. What PokerPlanner Is',
    body: [
      'PokerPlanner.bet is a planning and tournament-management tool for poker hosts. It provides features such as blind timers, tournament clocks, seating tools, payout planning, group organization, player check-in, and related administrative tools.',
      'PokerPlanner is not a gambling operator, sportsbook, casino, payment processor, escrow service, money transmitter, or betting platform. The service does not take wagers, hold player funds, settle bets, award prizes, or participate in any gambling activity.',
    ],
  },
  {
    title: '2. No Illegal Gambling or Illegal Activity',
    body: [
      'By using PokerPlanner, you agree that you will not use the service to organize, facilitate, promote, manage, advertise, or participate in illegal gambling or any other illegal activity.',
      'You are solely responsible for understanding and complying with all laws, rules, regulations, licensing requirements, venue rules, tax obligations, and private-event restrictions that may apply to your location, event, players, prizes, payments, or conduct.',
      'You may not use PokerPlanner to collect unlawful wagers, operate an unlicensed gambling business, evade gaming regulations, launder money, defraud participants, or coordinate any activity prohibited by applicable law.',
    ],
  },
  {
    title: '3. User Responsibility',
    body: [
      'PokerPlanner provides organizational tools only. Any decisions about whether to host an event, invite players, charge entry fees, offer prizes, allow rebuys or add-ons, or structure payouts are made by you and are your responsibility.',
      'If you are unsure whether your planned event is legal, you should consult a qualified attorney or relevant authority before using the service for that event. Nothing on PokerPlanner is legal advice.',
    ],
  },
  {
    title: '4. Account and Content Rules',
    body: [
      'You agree to provide accurate account information and to keep your login credentials secure. You are responsible for activity that occurs under your account.',
      'PokerPlanner protects account credentials and email addresses using secure hashing and encryption practices. Passwords are stored as salted password hashes and are not stored in plaintext. Email addresses are hashed for lookup and encrypted at rest for account display and email delivery, so account emails are not intentionally stored as open text in the primary account record.',
      'You may not upload, share, or create content that is unlawful, harassing, abusive, deceptive, infringing, obscene, or otherwise harmful. Uploaded avatars, audio clips, names, notes, and group content must be yours to use and appropriate for a poker group.',
    ],
  },
  {
    title: '5. Suspension or Removal',
    body: [
      'We may suspend, limit, or remove access to PokerPlanner if we believe the service is being misused, if account activity creates risk for the product or other users, or if use appears to involve illegal activity, fraud, abuse, security threats, or violations of these Terms.',
      'We may also remove content or disable features when needed to protect users, comply with law, or maintain the reliability of the service.',
    ],
  },
  {
    title: '6. Beta Service and Availability',
    body: [
      'PokerPlanner is currently offered as a beta product. Features may change, break, be limited, or be removed. All features are free during the beta, and a free model will always be available, but paid plans or limits may be introduced later.',
      'We aim to keep the service useful and reliable, but we do not guarantee uninterrupted availability, error-free operation, or that the service will meet every tournament or compliance need.',
    ],
  },
  {
    title: '7. No Warranties',
    body: [
      'PokerPlanner is provided on an "as is" and "as available" basis. To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and any warranties arising from course of dealing or usage of trade.',
      'You use PokerPlanner at your own risk, including any reliance on tournament settings, timers, payout calculations, player records, messages, or other outputs.',
    ],
  },
  {
    title: '8. Limitation of Liability',
    body: [
      'To the fullest extent permitted by law, PokerPlanner and its owners, operators, contributors, and affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, event disputes, prize disputes, regulatory consequences, or claims arising from your use of the service.',
      'Our total liability for any claim related to the service will be limited to the amount you paid to use PokerPlanner during the three months before the claim, or $100 if you paid nothing.',
    ],
  },
  {
    title: '9. Changes to These Terms',
    body: [
      'We may update these Terms as PokerPlanner evolves. When we make material changes, we will update the date on this page and may provide additional notice inside the service.',
      'Your continued use of PokerPlanner after changes become effective means you accept the updated Terms.',
    ],
  },
  {
    title: '10. Contact',
    body: [
      'Questions about these Terms can be sent to hello@pokerplanner.bet.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-pit-bg text-white">
      <header className="border-b border-pit-border bg-pit-surface/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <Link to="/" aria-label="PokerPlanner.bet home">
            <BrandLockup compact />
          </Link>
          <nav className="flex items-center gap-2">
            <Link className="btn-ghost px-3 py-2 text-xs sm:text-sm" to="/login">Sign in</Link>
            <Link className="btn-primary px-3 py-2 text-xs sm:text-sm" to="/login?mode=register">Create account</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <p className="mb-3 inline-flex rounded-full border border-pit-teal/30 bg-pit-teal/10 px-3 py-1 text-xs font-semibold uppercase text-pit-teal">
          Legal
        </p>
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">Terms of Service</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-pit-text">
          Last updated: {updatedDate}. These Terms govern your access to and use of PokerPlanner.bet.
        </p>

        <section className="mt-8 rounded-xl border border-red-400/25 bg-red-400/10 p-5">
          <h2 className="text-xl font-bold text-white">No Illegal Gambling</h2>
          <p className="mt-2 text-sm leading-6 text-red-100">
            PokerPlanner does not facilitate, process, promote, or operate gambling. By using this service, you agree not to use it to facilitate illegal gambling, unlawful wagering, unlicensed gaming operations, fraud, money laundering, or any other illegal activity.
          </p>
        </section>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={section.title} className="rounded-xl border border-pit-border bg-pit-surface p-5">
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-pit-text">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
