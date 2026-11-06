import { describe, expect, it } from "vitest";
import { BOT_MIN_FILL_MS, botReason, formBotReason } from "../src/bot-check";

describe("bot sign-ups", () => {
  it("catch the ones that reached the leads list", () => {
    expect(botReason({ name: "🔥Masadaki 15k TL bonus senin", company: "Google" })).not.toBeNull();
    expect(botReason({ name: "Xgmjndcy Dfwtwno", company: "Iwdlhvbab LLC" })).toBe("gibberish");
  });

  it("catch links, spam words and emoji", () => {
    expect(botReason({ name: "Win big", company: "www.spam.example" })).toBe("link");
    expect(botReason({ name: "Jo", company: "visit casino-win.com today" })).toBe("link");
    expect(botReason({ name: "Free crypto", company: "Pools" })).toBe("spam_words");
    expect(botReason({ name: "Sam 💰", company: "Pools" })).toBe("symbols");
  });

  it("let real people and shops through", () => {
    for (const [name, company] of [
      ["David Rudd", "David's Shop 3"],
      ["Cole Izhaky", "coles pool care"],
      ["María José Núñez", "Aguas Claras Pool Service"],
      ["Mark Schwartz", "Hirschfeld Leak Detection"],
      ["Nguyen Thi", "Blue Wave Pools & Spas, LLC"],
      ["Bob Angstrom", "Betty's Pool Co"],
      ["Jeff Bettis", "Slot Canyon Pools"],
    ]) {
      expect(botReason({ name, company }), `${name} / ${company}`).toBeNull();
    }
  });

  it("read the form's hidden checks", () => {
    const now = 1_000_000;
    expect(formBotReason("http://x", String(now - 60_000), now)).toBe("trap");
    expect(formBotReason("", String(now - 500), now)).toBe("too_fast");
    expect(formBotReason("", "", now)).toBe("too_fast");
    expect(formBotReason("", String(now - BOT_MIN_FILL_MS), now)).toBeNull();
  });
});
