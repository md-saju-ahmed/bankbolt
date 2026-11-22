"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { TransferReversal } from "./transfer-reversal";
import { TransactionFlagsPanel } from "./transaction-flags";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTaka } from "@/features/accounts/account-display";
import { errorCode } from "@/features/auth/auth-api";
import {
  ErrorMessage,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaFullTimestamp } from "@/lib/dhaka-date";
import {
  directions,
  historyLink,
  TransactionStatus,
} from "./transaction-display";
import {
  transactionTypes,
  useTransactionDetailQuery,
  type Transaction,
} from "./transactions-api";

function RecordFields({
  transaction,
  root,
}: {
  transaction: Transaction;
  root: string;
}) {
  const fields = [
    ["Reference", transaction.reference],
    ["Date and time", formatDhakaFullTimestamp(transaction.createdAt)],
    ["Type", transactionTypes[transaction.type]],
    ["Sender account", transaction.senderNumber],
    ["Receiver account", transaction.receiverNumber],
    ["Amount", formatTaka(transaction.amountPoisha)],
    ["Transaction fee", formatTaka(transaction.feePoisha)],
  ];
  if (
    transaction.type === "TRANSFER_REVERSAL" &&
    transaction.direction !== "OUTGOING"
  ) {
    fields.push([
      "Original fee refunded",
      formatTaka(transaction.refundedFeePoisha),
    ]);
    fields.push([
      "Total credit",
      formatTaka(
        (
          BigInt(transaction.amountPoisha) +
          BigInt(transaction.refundedFeePoisha)
        ).toString(),
      ),
    ]);
  }
  if (transaction.reversalReason)
    fields.push(["Reversal reason", transaction.reversalReason]);
  if (transaction.direction)
    fields.push(["Direction", directions[transaction.direction]]);
  if (transaction.senderNumber && transaction.direction !== "INCOMING") {
    fields.push([
      "Total debit",
      formatTaka(
        (
          BigInt(transaction.amountPoisha) + BigInt(transaction.feePoisha)
        ).toString(),
      ),
    ]);
  }
  return (
    <dl className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
            {value ?? "—"}
          </dd>
        </div>
      ))}
      {(transaction.originalReference || transaction.reversalReference) && (
        <div>
          <dt className="text-sm text-muted-foreground">Related transaction</dt>
          <dd>
            <Link
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
              href={`${root}/${transaction.originalReference ?? transaction.reversalReference}`}
            >
              {transaction.originalReference
                ? "View original transfer"
                : "View reversal"}
            </Link>
          </dd>
        </div>
      )}
      <div className="sm:col-span-2 print:col-span-2">
        <dt className="text-sm text-muted-foreground">Description</dt>
        <dd className="mt-1 break-words text-sm font-medium">
          {transaction.description}
        </dd>
      </div>
    </dl>
  );
}

export function TransactionDetail({
  root,
  reference,
  receipt = false,
}: {
  root: string;
  reference: string;
  receipt?: boolean;
}) {
  const query = useTransactionDetailQuery(
    { reference, receipt },
    { refetchOnMountOrArgChange: true },
  );
  const back = receipt ? `${root}/${reference}` : root;
  const transaction = query.currentData?.transaction;
  const title = receipt ? "Transaction receipt" : "Transaction details";
  const flagRole =
    root === "/staff/transactions"
      ? "STAFF"
      : root === "/admin/transactions"
        ? "ADMIN"
        : null;
  return (
    <section className="max-w-3xl space-y-5 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={back} className={`${historyLink} ${secondaryStyle}`}>
          <ArrowLeft aria-hidden size={16} />
          {receipt ? "Back to transaction" : "All transactions"}
        </Link>
        {transaction &&
          (receipt ? (
            <Button className={primaryStyle} onClick={() => window.print()}>
              <Printer aria-hidden size={17} />
              Print receipt
            </Button>
          ) : (
            (transaction.status === "COMPLETED" ||
              transaction.reversalReference) && (
              <Link
                className={`${historyLink} ${primaryStyle}`}
                href={`${root}/${reference}/receipt`}
              >
                View receipt
              </Link>
            )
          ))}
      </div>
      {query.isFetching && !transaction && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading {receipt ? "receipt" : "transaction"}…
        </p>
      )}
      {query.isError ? (
        <Card className="space-y-3 p-5">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <ErrorMessage
            message={
              errorCode(query.error) === "NOT_FOUND"
                ? `This ${receipt ? "receipt" : "transaction"} is unavailable.`
                : `Could not load this ${receipt ? "receipt" : "transaction"}.`
            }
          />
          <Button
            className={secondaryStyle}
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </Card>
      ) : (
        transaction && (
          <Card className="space-y-6 p-5 sm:p-7 print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                {receipt && (
                  <p className="mb-2 text-lg font-semibold tracking-tight">
                    BankBolt
                  </p>
                )}
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {title}
                </h1>
                {receipt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Simulated banking transaction
                  </p>
                )}
              </div>
              <TransactionStatus status={transaction.status} />
            </header>
            <RecordFields transaction={transaction} root={root} />
            {!receipt &&
              flagRole === "ADMIN" &&
              transaction.type === "FUND_TRANSFER" &&
              transaction.status === "COMPLETED" && (
                <TransferReversal transaction={transaction} />
              )}
          </Card>
        )
      )}
      {!receipt && !query.isError && transaction && flagRole && (
        <div id="transaction-flags">
          <TransactionFlagsPanel
            key={reference}
            reference={reference}
            role={flagRole}
          />
        </div>
      )}
    </section>
  );
}
