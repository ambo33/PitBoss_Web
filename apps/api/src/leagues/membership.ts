export function shouldJoinCurrentSeason({
  membershipApproved,
  hasSelectedSeason,
  claimablePlayerCount,
  skipClaim,
}: {
  membershipApproved: boolean;
  hasSelectedSeason: boolean;
  claimablePlayerCount: number;
  skipClaim: boolean;
}) {
  return membershipApproved
    && hasSelectedSeason
    && (claimablePlayerCount === 0 || skipClaim);
}
