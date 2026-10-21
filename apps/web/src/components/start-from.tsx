"use client";

import { useState } from "react";
import { START_FROM_COPY, type RouteStartLabel } from "@leakbook/core";
import { saveStartFrom } from "@/app/actions/start-from";
import { AddressField } from "./address-field";
import { NotOnMapRow } from "./not-on-map";
import { Segmented } from "./segmented";
import { SettingsFields, SettingsForm } from "./settings-forms";

/**
 * Start My Day From (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md): The Shop or
 * Home, and with Home, the home address with the same suggestions as a pool's. Until the address
 * is found on the map the day starts at the shop, and the warning says so. The same words on
 * every platform (START_FROM_COPY).
 */
export function StartFromForm({
  user,
  startFrom,
  homeAddress,
  missing,
  id,
}: {
  /** Someone else's (Team › their profile); left out for your own. */
  user?: string;
  startFrom: RouteStartLabel;
  homeAddress: string;
  /** Set to Home, but the address isn't found on the map (homeMapStatus "missing"). */
  missing: boolean;
  /** Unique on the page (Team has one per person). */
  id: string;
}) {
  const [from, setFrom] = useState<RouteStartLabel>(startFrom);
  return (
    <div data-testid="start-from">
      <SettingsForm action={saveStartFrom} full>
        {user ? <input type="hidden" name="user" value={user} /> : null}
        <div className="px-4 sm:px-0">
          <Segmented
            label={START_FROM_COPY.field}
            name="start_from"
            value={from}
            onChange={setFrom}
            options={[
              { value: "shop", label: START_FROM_COPY.shop },
              { value: "home", label: START_FROM_COPY.home },
            ]}
            segmentClassName="min-h-11"
          />
        </div>
        {from === "home" ? (
          <div className="mt-4 space-y-3">
            <SettingsFields labelWidth="7.5rem">
              <AddressField
                oneLine
                label={START_FROM_COPY.homeAddress}
                name="home_address"
                id={`home-address-${id}`}
                defaultValue={homeAddress}
                maxLength={400}
                required
              />
            </SettingsFields>
            {missing && startFrom === "home" ? (
              <ul className="grouped">
                <NotOnMapRow detail={START_FROM_COPY.pending} />
              </ul>
            ) : null}
          </div>
        ) : (
          // The Shop keeps the address, so switching back to Home needs no typing.
          <input type="hidden" name="home_address" value={homeAddress} />
        )}
        <p className="mt-2 px-4 text-[0.8125rem] text-text-muted sm:px-0">
          {START_FROM_COPY.footer}
        </p>
      </SettingsForm>
    </div>
  );
}
