import { z } from "zod";
import app from "./app.ts";

const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .safeParse(process.env.PORT ?? "4000");

if (!port.success) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

app.listen(port.data, (error) => {
  if (error) {
    console.error("Could not start the BankBolt API.", error);
    process.exitCode = 1;
    return;
  }

  console.log(`BankBolt API listening at http://localhost:${port.data}`);
});
