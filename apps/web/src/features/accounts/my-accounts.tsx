"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/store/provider";
import { useOwnedAccountsQuery } from "@/features/management/management-api";
import {
  DetailFields,
  Pager,
  Status,
} from "@/features/management/management-ui";
import {
  ErrorMessage,
  fieldStyle,
  onboardingError,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { accountStatuses, accountTypes, formatTaka } from "./account-display";
import { AccountStatement } from "./account-statement";
import { accountsSlice } from "./accounts-slice";

export function MyAccounts() {
  const [page, setPage] = useState(1);
  const query = useOwnedAccountsQuery(page, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
  const selectedId = useAppSelector(
    (state) => state.accounts.selectedAccountId,
  );
  const dispatch = useDispatch();
  const data = query.currentData;
  const account =
    data?.accounts.find(({ id }) => id === selectedId) ?? data?.accounts[0];

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">My accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check your balance and status for each account.
        </p>
      </header>
      <Card className="space-y-5 p-5 sm:p-6">
        {query.isFetching && !query.isError && !data && (
          <LoadingRegion label="Checking accounts">
            <div className="space-y-5">
              <div className="max-w-md space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-11 w-full" />
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/50 p-4 sm:p-5">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-5 w-2/3 max-w-64" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10 w-3/4 max-w-40" />
                <Skeleton className="h-10 w-3/4 max-w-40" />
              </div>
            </div>
          </LoadingRegion>
        )}
        {query.isError && (
          <div className="space-y-2">
            <ErrorMessage
              message={onboardingError(
                query.error,
                "Unable to load your accounts.",
              )}
            />
            <Button
              className={secondaryStyle}
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {!query.isError && data && !account && (
          <p className="text-sm text-muted-foreground">
            No accounts on this page.
          </p>
        )}
        {!query.isError && account && (
          <>
            <label className="flex max-w-md flex-col gap-2 text-sm font-medium">
              Select account
              <select
                className={fieldStyle}
                value={account.id}
                onChange={(event) =>
                  dispatch(
                    accountsSlice.actions.selectAccount(event.target.value),
                  )
                }
              >
                {data?.accounts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {accountTypes[entry.type]} ••••{" "}
                    {entry.accountNumber.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border bg-muted p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Available balance</p>
              <p className="mt-1 break-all text-3xl font-semibold tabular-nums">
                {formatTaka(account.availableBalancePoisha)}
              </p>
              <p className="text-sm text-muted-foreground">
                Posted {formatTaka(account.balancePoisha)} ? Held{" "}
                {formatTaka(account.heldBalancePoisha)}
              </p>
              <div className="mt-3">
                <Status value={account.status} labels={accountStatuses} />
              </div>
              {account.restriction && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {account.restriction}
                </p>
              )}
            </div>
            <DetailFields
              fields={[
                ["Account number", account.accountNumber],
                ["Account type", accountTypes[account.type]],
              ]}
            />
          </>
        )}
        {!query.isError && (
          <Pager page={page} next={!!data?.hasNextPage} onPage={setPage} />
        )}
      </Card>
      {!query.isError && account && (
        <AccountStatement
          key={account.id}
          accountId={account.id}
          accountNumber={account.accountNumber}
        />
      )}
    </section>
  );
}
