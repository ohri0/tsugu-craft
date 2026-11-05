import { describe, expect, it } from "vitest";
import { readGateStatus } from "../src/app/gate";

describe("入口の合言葉", () => {
  it("401 だけが「違う」", () => {
    expect(readGateStatus(401)).toBe("wrong");
    expect(readGateStatus(400)).toBe("ok");
    expect(readGateStatus(429)).toBe("ok");
    expect(readGateStatus(500)).toBe("broken");
  });
});
