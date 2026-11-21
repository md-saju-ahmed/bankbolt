"use client";

import { setupListeners } from "@reduxjs/toolkit/query";
import { useEffect, useState, type ReactNode } from "react";
import { Provider, useSelector } from "react-redux";
import { makeStore, type RootState } from "./store";

export const useAppSelector = useSelector.withTypes<RootState>();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [appStore] = useState(makeStore);
  useEffect(() => setupListeners(appStore.dispatch), [appStore]);
  return <Provider store={appStore}>{children}</Provider>;
}
