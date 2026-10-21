// Trusted, code-owned SQL expressions used only by schedule read endpoints.
// Keep legacy `completed` semantics separate from the home page's full-field rule.
export function allTournamentPlayersFinishedSql(tournamentId: string): string {
  return `(EXISTS (
    SELECT 1 FROM tournamentplayers home_player
    WHERE home_player.tournamentid = ${tournamentId}
      AND (home_player.checkedin = TRUE OR home_player.placed > 0)
  ) AND NOT EXISTS (
    SELECT 1 FROM tournamentplayers home_player
    WHERE home_player.tournamentid = ${tournamentId}
      AND (home_player.checkedin = TRUE OR home_player.placed > 0)
      AND (home_player.placed IS NULL OR home_player.placed < 1)
  ))`;
}

export function allLeaguePlayersFinishedSql(eventAlias: string): string {
  const field = `FROM leagueeventrsvps home_rsvp
    JOIN leagueseasonparticipants home_participant
      ON home_participant.leagueid = home_rsvp.leagueid
     AND home_participant.userid = home_rsvp.userid
     AND home_participant.seasonid = ${eventAlias}.seasonid
     AND home_participant.participating = TRUE
    JOIN leaguemembers home_member
      ON home_member.leagueid = home_rsvp.leagueid
     AND home_member.userid = home_rsvp.userid
     AND home_member.approved = TRUE`;
  const eligible = `home_rsvp.eventid = ${eventAlias}.eventid
    AND home_rsvp.leagueid = ${eventAlias}.leagueid AND home_rsvp.status = 'going'`;
  return `(EXISTS (SELECT 1 ${field} WHERE ${eligible}) AND NOT EXISTS (
    SELECT 1 ${field}
    LEFT JOIN leagueresults home_result
      ON home_result.eventid = home_rsvp.eventid
     AND home_result.leagueid = home_rsvp.leagueid
     AND home_result.userid = home_rsvp.userid
    WHERE ${eligible}
      AND NOT (COALESCE(home_result.dnf, FALSE) OR COALESCE(home_result.placed, 0) > 0)
  ))`;
}
