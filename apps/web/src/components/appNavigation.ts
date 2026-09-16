export type PrimaryDestination = "home" | "games" | "leagues" | "groups";

/** Both responsive presentations use these canonical client-side destinations. */
export const APP_PRIMARY_NAVIGATION: ReadonlyArray<{
  id: PrimaryDestination;
  label: string;
  to: string;
}> = [
  { id: "home", label: "Home", to: "/?section=upcoming&schedule=home" },
  { id: "games", label: "Games", to: "/?section=upcoming&schedule=games" },
  { id: "leagues", label: "Leagues", to: "/?section=leagues" },
  { id: "groups", label: "Groups", to: "/?section=groups" },
];

export function resolvePrimaryDestination(
  pathname: string,
  search = "",
): PrimaryDestination {
  if (/^\/(?:league(?:\/|-guest)|join\/league)/.test(pathname))
    return "leagues";
  if (/^\/join\/group(?:\/|$)/.test(pathname)) return "groups";
  if (
    /^\/(?:tournament|cash-games|pay|pocket-admin|lobby|checkin|bust|addon)(?:\/|$)/.test(
      pathname,
    )
  )
    return "games";
  const params = new URLSearchParams(search);
  // Utility destinations are outside the four product areas and return to Home.
  if (params.get("view") === "profile" || params.get("view") === "admin")
    return "home";
  const section = params.get("section");
  if (section === "leagues") return "leagues";
  if (section === "groups" || section === "communities") return "groups";
  if (
    section === "history" ||
    section === "past" ||
    ((!section || section === "upcoming") && params.get("schedule") === "past")
  )
    return "games";
  if (section === "upcoming")
    return params.get("schedule") === "games" ? "games" : "home";
  // Old event/member links can omit section; entity identity is still authoritative.
  if (params.has("league")) return "leagues";
  if (params.has("group")) return "groups";
  if (params.get("schedule") === "games") return "games";
  return "home";
}
