type Prompt = {
  verify(code: string): Promise<boolean>;
  finish(verified: boolean): void;
};

let current: Prompt | null = null;
const listeners = new Set<() => void>();

export function subscribeAuthenticator(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const authenticatorPrompt = () => current;
export const noAuthenticatorPrompt = () => null;

export function requestAuthenticator(
  signal: AbortSignal,
  verify: Prompt["verify"],
) {
  if (typeof window === "undefined" || current || signal.aborted)
    return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const finish = (verified: boolean) => {
      if (current?.finish !== finish) return;
      signal.removeEventListener("abort", abort);
      current = null;
      listeners.forEach((listener) => listener());
      resolve(verified);
    };
    const abort = () => finish(false);
    current = { verify, finish };
    signal.addEventListener("abort", abort, { once: true });
    listeners.forEach((listener) => listener());
  });
}
