import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { ThemeMenu } from "@/components/theme-menu";
import { LandingMobileNav } from "./landing-mobile-nav";
import styles from "./landing.module.css";

const title = "BankBolt | Digital banking demo";
const description =
  "Explore BankBolt, a simulated digital bank with customer, bank staff, and admin workspaces.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
};

const navigation = [
  { label: "Features", href: "#features" },
  { label: "Workspaces", href: "#workspaces" },
  { label: "Loans", href: "#loans" },
  { label: "Safeguards", href: "#safeguards" },
];

const repositoryUrl = "https://github.com/md-saju-ahmed/bankbolt";
const shareUrl = encodeURIComponent(repositoryUrl);

/*
 * Brand icons from Bootstrap Icons (https://icons.getbootstrap.com/).
 * Copyright (c) 2019-2024 The Bootstrap Authors. MIT License.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
const socialLinks = [
  {
    label: "BankBolt on GitHub",
    href: repositoryUrl,
    path: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8",
  },
  {
    label: "Share BankBolt on X",
    href: `https://x.com/intent/tweet?url=${shareUrl}`,
    path: "M12.6.75h2.454L9.694 6.88 16 15.25h-4.937L7.198 10.2l-4.425 5.05H.316l5.733-6.554L0 .75h5.063l3.495 4.624L12.6.75Zm-.86 13.028h1.36L4.323 2.145H2.865z",
  },
  {
    label: "Share BankBolt on LinkedIn",
    href: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`,
    path: "M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248s-1.359.54-1.359 1.248c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016q.008-.013.016-.025V6.169H6.25c.03.678 0 7.225 0 7.225z",
  },
];

const features = [
  {
    title: "Transfers in BDT",
    description:
      "Move money between accounts and review any fee before you confirm a transfer.",
    Icon: ArrowLeftRight,
  },
  {
    title: "Deposits and withdrawals",
    description:
      "Request a deposit or withdrawal and follow it from review to transaction history.",
    Icon: Banknote,
  },
  {
    title: "Loan applications and repayments",
    description:
      "Apply for a personal, education, or business loan and manage your repayments.",
    Icon: Landmark,
  },
  {
    title: "Receipts and statements",
    description:
      "Find past transactions, print receipts, and export account statements as CSV.",
    Icon: ReceiptText,
  },
];

const workspaces = [
  {
    id: "customer",
    name: "Customer",
    heading: "Manage your accounts",
    description:
      "Switch accounts, send transfers, and track your spending and loan repayments.",
    Icon: Wallet,
  },
  {
    id: "staff",
    name: "Bank Staff",
    heading: "Run daily operations",
    description:
      "Verify customers, open accounts, review requests, and flag transactions for Admin review.",
    Icon: BriefcaseBusiness,
  },
  {
    id: "admin",
    name: "Admin",
    heading: "Oversee the bank",
    description:
      "Manage account access and transfer limits, decide on loans, and track activity across the bank.",
    Icon: ShieldCheck,
  },
];

const loanSteps = [
  {
    role: "Customer",
    title: "Apply for a loan",
    description:
      "Choose a loan type, amount, term, and the account that would receive the funds.",
    Icon: FileText,
  },
  {
    role: "Bank Staff",
    title: "Review and forward",
    description:
      "Review the application and customer information, then send it to an admin for a decision.",
    Icon: ClipboardCheck,
  },
  {
    role: "Admin",
    title: "Approve or reject",
    description:
      "Record a decision. Approval credits the selected account and activates the repayment schedule.",
    Icon: ShieldCheck,
  },
];

const safeguards = [
  {
    title: "PIN-confirmed transfers",
    description: "Customers confirm transfers with a separate transaction PIN.",
    Icon: LockKeyhole,
  },
  {
    title: "Role-based access",
    description: "The server checks who can view records or approve requests.",
    Icon: ShieldCheck,
  },
  {
    title: "Traceable transactions",
    description: "Posted transactions have a unique reference and a receipt.",
    Icon: ReceiptText,
  },
];

export default function HomePage() {
  const sectionLinks = navigation.map(({ label, href }) => (
    <a key={href} href={href}>
      {label}
    </a>
  ));

  return (
    <div className={styles.landing} id="top">
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" className={styles.logo} aria-label="BankBolt home">
            <Image
              src="/brand/bankbolt-logo.svg"
              width={146}
              height={41}
              alt=""
              className={styles.lightLogo}
            />
            <span className={styles.darkLogo}>
              <Image
                src="/brand/bankbolt-icon.svg"
                width={32}
                height={32}
                alt=""
              />
              BankBolt
            </span>
          </Link>
          <nav className={styles.headerNav} aria-label="Main navigation">
            {sectionLinks}
          </nav>
          <div className={styles.headerActions}>
            <ThemeMenu />
            <Link className={styles.secondaryLink} href="/login">
              Sign in
            </Link>
            <LandingMobileNav links={navigation} />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.container}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">
                Digital <span className={styles.heroAccent}>banking</span> from
                every side
              </h1>
              <p>
                Move money, review requests, and make lending decisions across
                three workspaces in one simulated bank.
              </p>
              <div className={styles.actions}>
                <Link className={styles.primaryLink} href="/login">
                  Sign in to the demo
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <a className={styles.secondaryLink} href="#workspaces">
                  Explore the workspaces
                </a>
              </div>
            </div>
            <div className={styles.preview}>
              <div className={styles.previewFrame}>
                <Image
                  src="/images/customer-dashboard.webp"
                  alt="BankBolt customer dashboard showing the account balance, transfer options, and recent transactions"
                  fill
                  sizes="(min-width: 1088px) 1024px, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          className={styles.features}
          id="features"
          tabIndex={-1}
          aria-labelledby="features-title"
        >
          <div className={`${styles.container} ${styles.split}`}>
            <div className={styles.sectionIntro}>
              <h2 id="features-title">From transfer to receipt</h2>
              <p>
                Manage everyday banking in Bangladeshi taka, from your first
                transfer to your monthly statement.
              </p>
            </div>
            <ul className={styles.featureList} role="list">
              {features.map(({ title, description, Icon }) => (
                <li key={title}>
                  <span className={styles.featureIcon}>
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className={styles.workspaces}
          id="workspaces"
          tabIndex={-1}
          aria-labelledby="workspaces-title"
        >
          <div className={styles.container}>
            <div className={styles.sectionIntro}>
              <h2 id="workspaces-title">Three ways to use BankBolt</h2>
              <p>
                Follow the same banking activity from the customer’s account to
                the review queue and the bank-wide dashboard.
              </p>
            </div>
            <ul className={styles.roleList} role="list">
              {workspaces.map(({ id, name, heading, description, Icon }) => (
                <li key={id} className={styles.role}>
                  <div className={styles.roleLabel}>
                    <Icon size={20} aria-hidden="true" />
                    {name}
                  </div>
                  <h3>{heading}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className={styles.loans}
          id="loans"
          tabIndex={-1}
          aria-labelledby="loans-title"
        >
          <div className={`${styles.container} ${styles.loanPanel}`}>
            <div className={styles.sectionIntro}>
              <h2 id="loans-title">One loan, from application to decision</h2>
            </div>
            <ol className={styles.steps} role="list">
              {loanSteps.map(({ role, title, description, Icon }) => (
                <li key={role}>
                  <span className={styles.stepIcon}>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <p className={styles.stepRole}>{role}</p>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className={styles.safeguards}
          id="safeguards"
          tabIndex={-1}
          aria-labelledby="safeguards-title"
        >
          <div className={`${styles.container} ${styles.split}`}>
            <div className={styles.sectionIntro}>
              <h2 id="safeguards-title">Built with checks at every step</h2>
              <p>
                Try the workflows with fictional accounts and simulated funds.
              </p>
              <Link className={styles.primaryLink} href="/login">
                Sign in to the demo
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <ul className={styles.safeguardList} role="list">
              {safeguards.map(({ title, description, Icon }) => (
                <li key={title}>
                  <Icon size={20} aria-hidden="true" />
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <div className={styles.footerDetails}>
            <p className={styles.copyright}>
              © {new Date().getUTCFullYear()} BankBolt
            </p>
            <p>Simulated banking. No real money.</p>
          </div>
          <nav aria-label="Social links" className={styles.socialLinks}>
            {socialLinks.map(({ label, href, path }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                title={label}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  viewBox="0 0 16 16"
                  width="17"
                  height="17"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={path} />
                </svg>
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
