import { dayMapPins, decodePins, encodePins, MAP_PIN_LIMIT, type MapPin } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// day-map.ts (a day's map on Schedule and Today, owner 2026-10-20).

const SHOP = { lat: 33.4152, lng: -111.8315 };
const at = (i: number) => ({ lat: 33.4 + i * 0.01, lng: -111.9 - i * 0.003 });

export const dayMap: ModuleCases = {
  MAP_PIN_LIMIT: rule(() => MAP_PIN_LIMIT, [[]]),
  dayMapPins: rule(
    (input: Parameters<typeof dayMapPins>[0]) => dayMapPins(input),
    [
      [{ stops: [], depot: null }],
      [{ stops: [], depot: SHOP }],
      // Unlocated stops are counted in the numbers and as missing.
      [
        {
          stops: [
            { id: "a", location: at(1), done: true },
            { id: "b", location: null, done: false },
            { id: "c", location: at(3), done: false },
            { id: "d", location: at(4), done: false },
          ],
          depot: SHOP,
          currentId: "c",
        },
      ],
      // A done stop stays done even when it's the current one; a current id that isn't there.
      [
        {
          stops: [
            { id: "a", location: at(1), done: true },
            { id: "b", location: at(2), done: false },
          ],
          depot: null,
          currentId: "a",
        },
      ],
      [{ stops: [{ id: "a", location: at(1), done: false }], depot: SHOP, currentId: "zz" }],
      [{ stops: [{ id: "a", location: at(1), done: false }], depot: SHOP, currentId: null }],
      // More than the map shows.
      [
        {
          stops: Array.from({ length: 64 }, (_, i) => ({
            id: `s${i}`,
            location: i === 5 ? null : at(i),
            done: i < 10,
          })),
          depot: SHOP,
        },
      ],
    ],
  ),
  encodePins: rule(
    (pins: MapPin[]) => encodePins(pins),
    [
      [[]],
      [
        [
          { label: "", at: SHOP, tone: "shop", id: null },
          { label: "1", at: { lat: 33.123456, lng: -112.000004 }, tone: "done", id: "a" },
          { label: "2", at: { lat: 33.5, lng: -112.1 }, tone: "current", id: "b" },
          { label: "12", at: { lat: -0.000001, lng: 0.000005 }, tone: "todo", id: "c" },
        ],
      ],
    ],
  ),
  decodePins: rule(
    (value: string) => decodePins(value),
    [
      [""],
      ["s:33.41520,-111.83150;d1:33.12346,-112.00000;c2:33.5,-112.1;t12:-0.00000,0.00001"],
      ["t1:33,-112"],
      ["t007:-90,180"],
      ["t1:90.000001,0"],
      ["t1:33.5,-180.5"],
      ["t1:33.5,-112.1;"],
      ["x1:33.5,-112.1"],
      ["t1234:33.5,-112.1"],
      ["t1:33.1234567,-112.1"],
      ["t1:133.5,-112.1"],
      ["t1:33.,-112.1"],
      ["t1: 33.5,-112.1"],
      ["t1:33.5,-112.1\n"],
      ["t١:33.5,-112.1"],
      [Array.from({ length: 60 }, (_, i) => `t${i + 1}:33.5,-112.1`).join(";")],
      [Array.from({ length: 61 }, (_, i) => `t${i + 1}:33.5,-112.1`).join(";")],
      [`t1:33.5,-112.1;${"x".repeat(4000)}`],
    ],
  ),
};
