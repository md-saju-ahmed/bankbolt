"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { DetailSkeleton } from "@/components/ui/skeleton";
import {
  accountStatuses,
  accountTypes,
  customerStatuses,
  formatTaka,
  parseTakaInput,
  takaInput,
  verificationStatuses,
} from "@/features/accounts/account-display";
import {
  ErrorMessage,
  Field,
  onboardingError,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { TransactionResults } from "@/features/transactions/history";
import { Activity, ConfirmAction, DetailFields, Status } from "./management-ui";
import {
  useChangeAccountMutation,
  useChangeCustomerAccessMutation,
  useManagedAccountQuery,
  useManagedCustomerQuery,
  type AccessAction,
  type AccountAction,
  type AccountDetail,
} from "./management-api";

function DetailLoading({
  fetching,
  error,
  retry,
}: {
  fetching: boolean;
  error: unknown;
  retry: () => void;
}) {
  if (fetching) return <DetailSkeleton label="Loading details" />;
  return (
    <div className="space-y-3">
      <ErrorMessage
        message={onboardingError(error, "Unable to load details.")}
      />
      <Button className={secondaryStyle} onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

const accessActions: Record<
  AccessAction,
  { title: string; description: string }
> = {
  ACTIVATE: {
    title: "Restore customer access",
    description:
      "Allow this customer to sign in again. The customer will need to start a new session.",
  },
  DEACTIVATE: {
    title: "Deactivate customer access",
    description:
      "End this customer's sessions and prevent sign-in until access is restored.",
  },
  BLOCK: {
    title: "Block customer",
    description:
      "End all sessions and prevent this customer from accessing BankBolt.",
  },
};

export function CustomerDetails({ id, admin }: { id: string; admin: boolean }) {
  const [page, setPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const query = useManagedCustomerQuery({ id, page });
  const [update] = useChangeCustomerAccessMutation();
  const data = query.currentData;
  if (!data || query.isError)
    return (
      <DetailLoading
        fetching={query.isFetching}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const { customer, history } = data;
  const status = customer.blocked
    ? "BLOCKED"
    : customer.accessActive
      ? "ACTIVE"
      : "INACTIVE";
  const options: AccessAction[] =
    status === "ACTIVE"
      ? ["DEACTIVATE", "BLOCK"]
      : status === "INACTIVE"
        ? ["ACTIVATE", "BLOCK"]
        : ["ACTIVATE"];

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={customer.fullName}
            photoUrl={customer.photoUrl}
            className="size-10"
          />
          <h2 className="min-w-0 break-words text-xl font-semibold">
            {customer.fullName}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Status
            value={customer.verificationStatus}
            labels={verificationStatuses}
          />
          <Status value={status} labels={customerStatuses} />
        </div>
      </div>
      <DetailFields
        fields={[
          ["Email", customer.email],
          ["Phone", customer.phone],
          ["Date of birth", customer.dateOfBirth],
          ["Address", customer.address],
          ["Simulated identity reference", customer.identityReference],
          ["Occupation", customer.occupation],
        ]}
      />
      {admin && (
        <div className="flex flex-wrap gap-2">
          {options.map((action) => (
            <ConfirmAction
              key={action}
              {...accessActions[action]}
              dangerous={action !== "ACTIVATE"}
              onConfirm={async (form) => {
                await update({
                  id,
                  action,
                  reason: String(form.get("reason") ?? ""),
                }).unwrap();
              }}
            />
          ))}
        </div>
      )}
      <Activity history={history} page={page} onPage={setPage} />
      {admin && (
        <section
          className="space-y-3 border-t pt-5"
          aria-labelledby="customer-transactions"
        >
          <h3 id="customer-transactions" className="text-base font-semibold">
            Customer transaction history
          </h3>
          <TransactionResults
            root="/admin/transactions"
            filters={{ page: transactionPage, customerId: id }}
            onPage={setTransactionPage}
          />
        </section>
      )}
    </Card>
  );
}

const accountActions: Record<AccountAction, string> = {
  FREEZE: "Freeze account",
  UNFREEZE: "Unfreeze account",
  DEACTIVATE: "Deactivate account",
  REACTIVATE: "Reactivate account",
};
const accountConsequences: Record<AccountAction, string> = {
  FREEZE: "Stop incoming and outgoing money movement on",
  UNFREEZE: "Restore money movement on",
  DEACTIVATE: "Deactivate",
  REACTIVATE: "Reactivate",
};
const availableActions: Record<AccountDetail["status"], AccountAction[]> = {
  PENDING: [],
  ACTIVE: ["FREEZE", "DEACTIVATE"],
  FROZEN: ["UNFREEZE"],
  DEACTIVATED: ["REACTIVATE"],
};

export function AccountDetails({ id, admin }: { id: string; admin: boolean }) {
  const [page, setPage] = useState(1);
  const query = useManagedAccountQuery({ id, page });
  const [update] = useChangeAccountMutation();
  const data = query.currentData;
  if (!data || query.isError)
    return (
      <DetailLoading
        fetching={query.isFetching}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const { account, history } = data;
  const reason = (form: FormData) => String(form.get("reason") ?? "");
  const masked = `the ${accountTypes[account.type]} account ending in ${account.accountNumber.slice(-4)}`;
  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {accountTypes[account.type]} account
        </h2>
        <Status value={account.status} labels={accountStatuses} />
      </div>
      <DetailFields
        fields={[
          ["Account number", account.accountNumber],
          ["Customer", account.ownerName],
          ["Customer email", account.ownerEmail],
          ["Available balance", formatTaka(account.availableBalancePoisha)],
          ["Maximum per transfer", formatTaka(account.transferLimitPoisha)],
          [
            "Daily outgoing limit",
            formatTaka(account.dailyTransferLimitPoisha),
          ],
          ...(account.type === "BUSINESS"
            ? [
                ["Business name", account.businessName] as [
                  string,
                  string | null,
                ],
                [
                  "Business registration",
                  account.businessRegistrationReference,
                ] as [string, string | null],
              ]
            : []),
        ]}
      />
      {admin && (
        <div className="flex flex-wrap gap-2">
          {availableActions[account.status].map((action) => (
            <ConfirmAction
              key={action}
              title={accountActions[action]}
              description={`${accountConsequences[action]} ${masked}.`}
              dangerous={action === "FREEZE" || action === "DEACTIVATE"}
              onConfirm={async (form) => {
                await update({
                  id,
                  kind: "status",
                  action,
                  reason: reason(form),
                }).unwrap();
              }}
            />
          ))}
          <ConfirmAction
            title="Change transfer limits"
            description={`Set the transfer limits for ${masked}.`}
            onConfirm={async (form) => {
              await update({
                id,
                kind: "limits",
                reason: reason(form),
                transferLimitPoisha: parseTakaInput(
                  String(form.get("transfer") ?? ""),
                ),
                dailyTransferLimitPoisha: parseTakaInput(
                  String(form.get("daily") ?? ""),
                ),
              }).unwrap();
            }}
          >
            <Field
              name="transfer"
              label="Maximum per transfer (BDT)"
              inputMode="decimal"
              defaultValue={takaInput(account.transferLimitPoisha)}
              required
            />
            <Field
              name="daily"
              label="Daily outgoing limit (BDT)"
              inputMode="decimal"
              defaultValue={takaInput(account.dailyTransferLimitPoisha)}
              required
            />
          </ConfirmAction>
          {account.type === "BUSINESS" && (
            <ConfirmAction
              title="Edit business details"
              description={`Update the fictional details for ${masked}.`}
              onConfirm={async (form) => {
                await update({
                  id,
                  kind: "metadata",
                  reason: reason(form),
                  businessName: String(form.get("name") ?? "").trim() || null,
                  businessRegistrationReference:
                    String(form.get("registration") ?? "").trim() || null,
                }).unwrap();
              }}
            >
              <Field
                name="name"
                label="Business name (optional)"
                defaultValue={account.businessName ?? ""}
                maxLength={120}
              />
              <Field
                name="registration"
                label="Simulated business registration (optional)"
                defaultValue={account.businessRegistrationReference ?? ""}
                maxLength={80}
              />
            </ConfirmAction>
          )}
        </div>
      )}
      <Activity history={history} page={page} onPage={setPage} />
    </Card>
  );
}
