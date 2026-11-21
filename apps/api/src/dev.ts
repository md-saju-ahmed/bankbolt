import app from "./app.ts";
import { parsePort } from "./config.ts";

const port = parsePort(process.env.PORT);

app.listen(port, (error) => {
  if (error) {
    console.error("Could not start the BankBolt API.", error);
    process.exitCode = 1;
    return;
  }

  console.log(`BankBolt API listening at http://localhost:${port}`);
});
