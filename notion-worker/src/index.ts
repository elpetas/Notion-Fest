import { Worker, j } from "@notionhq/workers";

const worker = new Worker();
export default worker;

worker.tool("sayHello", {
  title: "Say Hello",
  description: "Returns a friendly greeting from the worker",
  schema: j.object({
    name: j.string(),
  }),
  hints: { readOnlyHint: true },
  execute: (input) => `hello from worker, ${input.name}!`,
});
