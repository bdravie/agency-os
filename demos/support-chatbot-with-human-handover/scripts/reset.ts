// npm run reset: back to the 12 sample articles, no tickets and no unanswered questions. Run before each Loom take.
import { resetDemo } from "../lib/store.ts";

resetDemo();
console.log("Demo reset: 12 sample articles, no tickets, no gaps. (Rows already in the Google Sheet stay there: clear them in the sheet.)");
