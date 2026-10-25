// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import headers from "../security-headers.json";

describe("deploy/nginx.conf", () => {
  const conf = readFileSync(new URL("../../../deploy/nginx.conf", import.meta.url), "utf8");
  it("sends exactly the security headers the e2e tests run under, in every location", () => {
    for (const [name, value] of Object.entries(headers)) {
      const lines = conf.split("\n").filter((l) => l.includes(`add_header ${name} `));
      // server block + 3 locations (nginx does not inherit add_header into locations that set their own).
      expect(lines.length).toBe(4);
      for (const l of lines) expect(l.trim()).toBe(`add_header ${name} "${value}" always;`);
    }
  });
});
