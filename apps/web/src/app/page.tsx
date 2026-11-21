import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6 sm:py-24">
      <Card className="space-y-3 p-5 sm:p-6">
        <h1 className="text-3xl font-semibold tracking-tight">BankBolt</h1>
        <p className="text-muted-foreground">
          Demo banking platform. No real money.
        </p>
      </Card>
    </main>
  );
}
