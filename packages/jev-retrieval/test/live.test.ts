import {expect,test} from "bun:test";
// Deliberately opt-in. The SDK binding must be completed against current official docs before enabling.
test.skipIf(process.env.TYPESAFE_LIVE_TEST!=="1")("live TypeSafe SDK",()=>{expect(process.env.TYPESAFE_API_KEY).toBeTruthy();throw new Error("Live SDK binding unavailable: current docs/package were blocked during implementation")});
