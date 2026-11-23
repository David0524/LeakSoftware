"use client";

import { useState } from "react";
import { START_FROM_COPY, usesHome, type RouteStartLabel } from "@leakbook/core";
import { saveStartFrom } from "@/app/actions/start-from";
import { AddressField } from "./address-field";
import { NotOnMapRow } from "./not-on-map";
import { Segmented } from "./segmented";
import { SettingsFields, SettingsForm } from "./settings-forms";

/**
 * Start My Day From and End My Day At (owner, 2026-10-21 and 2026-11-23;
 * docs/design/2026-10-21-start-from-home.md): The Shop or Home for each, and with Home for
 * either, the home address with the same suggestions as a pool's. Until the address is found on
 * the map the day uses the shop, and the warning says so. The same words on every platform
 * (START_FROM_COPY).
 */
export function StartFromForm({
  user,
  startFrom,
  endAt,
  homeAddress,
  missing,
  id,
  submit,
}: {
  /** Someone else's (Team › their profile); left out for your own. */
  user?: string;
  startFrom: RouteStartLabel;
  endAt: RouteStartLabel;
  homeAddress: string;
  /** Starts or ends at Home, but the address isn't found on the map (homeMapStatus "missing"). */
  missing: boolean;
  /** Unique on the page (Team has one per person). */
  id: string;
  /** The button's words; Team's sheet names each section's ("Save Start and End", like "Save Role"). */
  submit?: string;
}) {
  const [from, setFrom] = useState<RouteStartLabel>(startFrom);
  const [to, setTo] = useState<RouteStartLabel>(endAt);
  const places = [
    { value: "shop" as const, label: START_FROM_COPY.shop },
    { value: "home" as const, label: START_FROM_COPY.home },
  ];
  return (
    <div data-testid="start-from">
      <SettingsForm action={saveStartFrom} submit={submit} full>
        {user ? <input type="hidden" name="user" value={user} /> : null}
        <div className="space-y-4 px-4 sm:px-0">
          <Segmented
            label={user ? START_FROM_COPY.othersField : START_FROM_COPY.field}
            name="start_from"
            value={from}
            onChange={setFrom}
            options={places}
            segmentClassName="min-h-11"
          />
          <Segmented
            label={user ? START_FROM_COPY.othersEndField : START_FROM_COPY.endField}
            name="end_at"
            value={to}
            onChange={setTo}
            options={places}
            segmentClassName="min-h-11"
          />
        </div>
        {usesHome(from, to) ? (
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
            {missing && usesHome(startFrom, endAt) ? (
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
