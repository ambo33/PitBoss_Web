import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_PRIMARY_NAVIGATION,
  resolvePrimaryDestination,
} from "./appNavigation";

test("four canonical primary destinations resolve to themselves", () => {
  assert.deepEqual(
    APP_PRIMARY_NAVIGATION.map((item) => item.label),
    ["Home", "Games", "Leagues", "Groups"],
  );
  for (const item of APP_PRIMARY_NAVIGATION) {
    const url = new URL(item.to, "https://example.test");
    assert.equal(resolvePrimaryDestination(url.pathname, url.search), item.id);
  }
});

test("Home and Games legacy schedule links retain one deterministic owner", () => {
  assert.equal(resolvePrimaryDestination("/"), "home");
  assert.equal(resolvePrimaryDestination("/", "?section=upcoming"), "home");
  assert.equal(
    resolvePrimaryDestination("/", "?section=upcoming&schedule=home"),
    "home",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?section=upcoming&schedule=games"),
    "games",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?section=history&schedule=home"),
    "games",
  );
  assert.equal(resolvePrimaryDestination("/", "?section=past"), "games");
  assert.equal(
    resolvePrimaryDestination(
      "/",
      "?section=upcoming&schedule=home&league=stale",
    ),
    "home",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?section=groups&view=unknown"),
    "groups",
  );
});

test("entity routes and local context retain their owning primary destination", () => {
  assert.equal(
    resolvePrimaryDestination(
      "/",
      "?section=leagues&league=abc&season=s&event=e&leagueTab=events",
    ),
    "leagues",
  );
  assert.equal(
    resolvePrimaryDestination(
      "/",
      "?section=groups&group=g&groupTab=structures",
    ),
    "groups",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?section=communities"),
    "groups",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?league=abc&season=s"),
    "leagues",
  );
  assert.equal(resolvePrimaryDestination("/", "?group=g"), "groups");
  assert.equal(
    resolvePrimaryDestination("/", "?league=l&schedule=games"),
    "leagues",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?group=g&schedule=games"),
    "groups",
  );
  assert.equal(
    resolvePrimaryDestination(
      "/",
      "?section=upcoming&schedule=games&league=stale",
    ),
    "games",
  );
  assert.equal(
    resolvePrimaryDestination(
      "/",
      "?section=upcoming&schedule=home&group=stale",
    ),
    "home",
  );
  assert.equal(
    resolvePrimaryDestination("/", "?league=l&schedule=past"),
    "games",
  );
  assert.equal(resolvePrimaryDestination("/league/l/event/e"), "leagues");
  assert.equal(resolvePrimaryDestination("/league-guest-claim"), "leagues");
  assert.equal(
    resolvePrimaryDestination("/", "?section=groups&league=stale"),
    "groups",
  );
});

test("game operations, auth utilities and public joins resolve consistently", () => {
  for (const path of [
    "/tournament/t",
    "/cash-games/c/admin",
    "/pay/t",
    "/pocket-admin/t",
    "/lobby/t",
  ])
    assert.equal(resolvePrimaryDestination(path), "games");
  assert.equal(
    resolvePrimaryDestination("/", "?view=profile&league=stale"),
    "home",
  );
  assert.equal(resolvePrimaryDestination("/admin/voice-lab"), "home");
  assert.equal(resolvePrimaryDestination("/join/league/a"), "leagues");
  assert.equal(resolvePrimaryDestination("/join/group/a"), "groups");
});
