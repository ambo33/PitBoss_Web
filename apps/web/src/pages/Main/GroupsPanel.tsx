import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Trophy, Hash, Crown, ExternalLink, LogOut, Mail, MessageSquare, Save, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, Group, GroupMember, Tournament } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuthStore } from '../../store/auth';

export default function GroupsPanel() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selected, setSelected] = useState<Group | null>(null);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });
  const { data: groups = [], isLoading } = useQuery({ queryKey: ['groups'], queryFn: api.getGroups });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; approvalneeded: boolean }) => api.createGroup(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setShowCreate(false); },
  });
  const joinMutation = useMutation({
    mutationFn: (code: string) => api.joinGroup(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setShowJoin(false); },
  });
  const hostedGroupCount = groups.filter((group) => group.isadmin).length;
  const hostedGroupLimitReached = !me?.issuperadmin && me?.tierid !== 2 && me?.tierid !== 3 && hostedGroupCount >= 1;

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-white">My Groups</h2>
        <div className="flex gap-2">
          <button className="btn-ghost gap-1.5 px-3 py-2 text-xs" onClick={() => setShowJoin(true)}>
            <Hash size={13} /> Join
          </button>
          <button
            className="btn-primary gap-1.5 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowCreate(true)}
            disabled={hostedGroupLimitReached}
            title={hostedGroupLimitReached ? 'Host tier can host 1 group.' : undefined}
          >
            <Users size={13} /> New group
          </button>
        </div>
      </div>

      {hostedGroupLimitReached && (
        <p className="mb-4 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-200">
          Host tier can host 1 group at a time. Upgrade to Club or Pro to create more hosted groups.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(g => (
          <GroupCard key={g.groupid} group={g} onClick={() => setSelected(g)} />
        ))}
        {groups.length === 0 && <GroupEmptyState onJoin={() => setShowJoin(true)} onCreate={() => setShowCreate(true)} />}
      </div>

      <CreateGroupModal open={showCreate} onClose={() => setShowCreate(false)}
        onSubmit={(d) => createMutation.mutate(d)}
        loading={createMutation.isPending} error={createMutation.error?.message} />

      <JoinGroupModal open={showJoin} onClose={() => setShowJoin(false)}
        onSubmit={(code) => joinMutation.mutate(code)}
        loading={joinMutation.isPending} error={joinMutation.error?.message} />

      {selected && (
        <GroupDetailModal group={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function GroupCard({ group: g, onClick }: { group: Group; onClick: () => void }) {
  return (
    <div onClick={onClick} className="card-hover">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-pit-teal/10 border border-pit-teal/20 flex items-center justify-center shrink-0">
            <Users size={16} className="text-pit-teal" />
          </div>
          <p className="font-bold text-white leading-tight">{g.name}</p>
        </div>
        {g.isadmin && (
          <span className="badge bg-pit-gold/10 border border-pit-gold/20 text-pit-gold">
            <Crown size={9} className="mr-0.5" /> Admin
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-pit-border/60">
        <span className="chip">
          <Users size={10} />
          {g.membercount ?? 0} members
        </span>
        <span className="font-mono text-[11px] text-pit-muted tracking-widest">{g.invitecode}</span>
      </div>
    </div>
  );
}

function GroupEmptyState({ onJoin, onCreate }: { onJoin: () => void; onCreate: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-pit-surface border border-pit-border flex items-center justify-center">
        <Users size={24} className="text-pit-muted" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">No groups yet</p>
        <p className="text-pit-muted text-sm mt-1">Create or join a group to play with friends</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost text-sm" onClick={onJoin}>Join with code</button>
        <button className="btn-primary text-sm" onClick={onCreate}>Create group</button>
      </div>
    </div>
  );
}

function CreateGroupModal({ open, onClose, onSubmit, loading, error }: {
  open: boolean; onClose: () => void;
  onSubmit: (d: { name: string; approvalneeded: boolean }) => void;
  loading: boolean; error?: string;
}) {
  const [name, setName] = useState('');
  const [approvalneeded, setApprovalneeded] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, approvalneeded });
  }

  return (
    <Modal title="Create Group" open={open} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" form="create-group" disabled={loading}>
          {loading ? 'Creating…' : 'Create'}
        </button>
      </>}
    >
      <form id="create-group" onSubmit={submit} className="space-y-4">
        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
        <input className="input" placeholder="Group name *" value={name} onChange={e => setName(e.target.value)} required />
        <label className="flex items-center gap-3 cursor-pointer group/check">
          <div className={`w-9 h-5 rounded-full transition-colors duration-150 flex items-center px-0.5 ${approvalneeded ? 'bg-pit-teal' : 'bg-pit-border'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${approvalneeded ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <input type="checkbox" className="sr-only" checked={approvalneeded} onChange={e => setApprovalneeded(e.target.checked)} />
          <span className="text-sm text-pit-text group-hover/check:text-white transition-colors">Require approval to join</span>
        </label>
      </form>
    </Modal>
  );
}

function JoinGroupModal({ open, onClose, onSubmit, loading, error }: {
  open: boolean; onClose: () => void;
  onSubmit: (code: string) => void;
  loading: boolean; error?: string;
}) {
  const [code, setCode] = useState('');

  return (
    <Modal title="Join Group" open={open} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={() => onSubmit(code)} disabled={loading || !code}>
          {loading ? 'Joining…' : 'Join group'}
        </button>
      </>}
    >
      <div className="space-y-3">
        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
        <input className="input text-center font-mono text-lg uppercase tracking-[0.3em] py-3"
          placeholder="XXXXXX" value={code}
          onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} />
        <p className="text-pit-muted text-xs text-center">Enter the invite code shared by your group admin</p>
      </div>
    </Modal>
  );
}

type DetailTab = 'members' | 'tournaments' | 'structures';

function GroupDetailModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [detailTab, setDetailTab] = useState<DetailTab>('members');
  const [inviteCode, setInviteCode] = useState(group.invitecode);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [defaultTrackingMode, setDefaultTrackingMode] = useState(group.defaulttrackingmode ?? 'standard');
  const [tvSeatingMessage, setTvSeatingMessage] = useState(group.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!');
  const [smsStatus, setSmsStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const { data } = useQuery({
    queryKey: ['group', group.groupid],
    queryFn: () => api.getGroup(group.groupid),
  });

  const effectiveGroup = data ?? group;

  const { data: groupTournaments = [], isLoading: loadingTourneys } = useQuery({
    queryKey: ['group', group.groupid, 'tournaments'],
    queryFn: () => api.getGroupTournaments(group.groupid),
    enabled: detailTab === 'tournaments',
  });
  const { data: savedStructures = [], isLoading: loadingStructures } = useQuery({
    queryKey: ['group', group.groupid, 'blind-structures'],
    queryFn: () => api.getGroupBlindStructures(group.groupid),
    enabled: detailTab === 'structures',
  });

  const approveMutation = useMutation({
    mutationFn: (uid: string) => api.approveMember(group.groupid, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid] }),
  });
  const removeMutation = useMutation({
    mutationFn: (uid: string) => api.removeMember(group.groupid, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', group.groupid] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const leaveMutation = useMutation({
    mutationFn: () => api.leaveGroup(group.groupid, user!.guid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); onClose(); },
  });
  const registerMutation = useMutation({
    mutationFn: (tid: string) => api.groupRegister(tid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'tournaments'] }),
  });
  const updateGroupMutation = useMutation({
    mutationFn: (payload: { invitecode?: string; defaulttrackingmode?: 'standard' | 'player'; tvseatingwelcomemessage?: string }) => api.updateGroup(group.groupid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', group.groupid] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const deleteStructureMutation = useMutation({
    mutationFn: (structureId: string) => api.deleteGroupBlindStructure(group.groupid, structureId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'blind-structures'] }),
  });
  const inviteMutation = useMutation({
    mutationFn: (payload: { email?: string; phone?: string; note?: string }) => api.sendGroupInvite(group.groupid, payload),
    onSuccess: (result) => {
      if (invitePhone.trim()) {
        setSmsStatus('Text invite is ready.');
        window.location.href = result.smsLink;
      } else {
        setSmsStatus('');
      }
      setInviteEmail('');
      setInvitePhone('');
      setInviteNote('');
    },
  });

  const members: GroupMember[] = data?.members ?? [];
  const pending = members.filter(m => !m.approved);
  const approved = members.filter(m => m.approved);
  const joinLink = `${window.location.origin}/join/${encodeURIComponent(effectiveGroup.invitecode)}`;
  const canUseClubFeatures = Boolean(user?.issuperadmin || user?.canuseclubfeatures || user?.tierid === 2 || user?.tierid === 3);

  useEffect(() => {
    setDefaultTrackingMode(effectiveGroup.defaulttrackingmode ?? 'standard');
    setTvSeatingMessage(effectiveGroup.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!');
  }, [effectiveGroup.defaulttrackingmode, effectiveGroup.tvseatingwelcomemessage]);

  return (
    <Modal title={effectiveGroup.name} open onClose={onClose}
      footer={
        !group.isadmin
          ? <button
              className="flex items-center gap-1.5 text-sm text-pit-muted hover:text-red-400 transition-colors"
              onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}>
              <LogOut size={14} />
              {leaveMutation.isPending ? 'Leaving…' : 'Leave group'}
            </button>
          : <div />
      }
    >
      <div className="space-y-4">
        {/* Invite code */}
        <div className="flex items-center justify-between rounded-xl bg-pit-bg border border-pit-border px-4 py-3">
          <span className="text-xs text-pit-muted">Invite code</span>
          <span className="font-mono font-bold text-white tracking-[0.2em]">{effectiveGroup.invitecode}</span>
        </div>

        {group.isadmin && (
          <div className="space-y-4 rounded-xl border border-pit-border bg-pit-bg px-4 py-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Join link</p>
              <div className="rounded-xl border border-pit-border bg-pit-surface px-3 py-3">
                <p className="break-all font-mono text-xs text-pit-text">{joinLink}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(joinLink);
                    setCopyStatus('Join link copied.');
                    setTimeout(() => setCopyStatus(''), 2000);
                  }}
                >
                  Copy Link
                </button>
              </div>
              {copyStatus && <p className="text-sm text-pit-teal">{copyStatus}</p>}
              <div className="inline-block rounded-xl bg-white p-3">
                <QRCodeSVG value={joinLink} size={150} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Group settings</p>
              <div className="flex gap-2">
                <input
                  className="input font-mono uppercase"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={12}
                />
                <button
                  className="btn-primary shrink-0"
                  onClick={() => updateGroupMutation.mutate({ invitecode: inviteCode })}
                  disabled={updateGroupMutation.isPending || !inviteCode.trim()}
                >
                  <Save size={14} />
                  {updateGroupMutation.isPending ? 'Saving...' : 'Save Code'}
                </button>
              </div>
              {updateGroupMutation.error && <p className="text-sm text-red-400">{updateGroupMutation.error.message}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Tournament defaults</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className="input"
                  value={canUseClubFeatures ? defaultTrackingMode : 'standard'}
                  onChange={(event) => setDefaultTrackingMode(event.target.value as 'standard' | 'player')}
                  disabled={!canUseClubFeatures}
                >
                  <option value="standard">Standard tracking</option>
                  <option value="player">Player tracked stats</option>
                </select>
                <button
                  className="btn-primary shrink-0"
                  onClick={() => updateGroupMutation.mutate({ defaulttrackingmode: canUseClubFeatures ? defaultTrackingMode : 'standard' })}
                  disabled={updateGroupMutation.isPending || !canUseClubFeatures}
                >
                  <Save size={14} />
                  Save Default
                </button>
              </div>
              <p className="text-xs text-pit-muted">
                {canUseClubFeatures
                  ? 'New tournaments for this group use this stats tracking mode by default.'
                  : 'Host accounts use standard tracking. Player-tracked stats unlock with Club or Pro.'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">TV seating message</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  value={canUseClubFeatures ? tvSeatingMessage : (effectiveGroup.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!')}
                  onChange={(event) => setTvSeatingMessage(event.target.value)}
                  disabled={!canUseClubFeatures}
                  maxLength={180}
                />
                <button
                  className="btn-primary shrink-0"
                  onClick={() => updateGroupMutation.mutate({ tvseatingwelcomemessage: tvSeatingMessage })}
                  disabled={updateGroupMutation.isPending || !canUseClubFeatures}
                >
                  <Save size={14} />
                  Save Message
                </button>
              </div>
              <p className="text-xs text-pit-muted">
                {canUseClubFeatures
                  ? 'Shown on the TV seating view before seats are assigned.'
                  : 'Host accounts use the default TV seating message. Custom wording unlocks with Club or Pro.'}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Invite people</p>
              <input
                className="input"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <input
                className="input"
                placeholder="Phone number for text"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
              />
              <input
                className="input"
                placeholder="Optional note"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  onClick={() => {
                    setSmsStatus('');
                    inviteMutation.mutate({ email: inviteEmail || undefined, note: inviteNote || undefined });
                  }}
                  disabled={inviteMutation.isPending || !inviteEmail.trim()}
                >
                  <Mail size={14} />
                  Send Email
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setSmsStatus('');
                    inviteMutation.mutate({ phone: invitePhone || undefined, note: inviteNote || undefined });
                  }}
                  disabled={inviteMutation.isPending || !invitePhone.trim()}
                >
                  <MessageSquare size={14} />
                  Send Text
                </button>
              </div>
              {inviteMutation.error && <p className="text-sm text-red-400">{inviteMutation.error.message}</p>}
              {smsStatus && <p className="text-sm text-pit-teal">{smsStatus}</p>}
            </div>
          </div>
        )}

        {/* Sub-tabs */}
        <div className="flex border-b border-pit-border">
          {(['members', 'tournaments', 'structures'] as DetailTab[]).map(t => (
            <button key={t} onClick={() => setDetailTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors duration-150 ${
                detailTab === t
                  ? 'border-pit-teal text-white'
                  : 'border-transparent text-pit-muted hover:text-pit-text'
              }`}>
              {t === 'members' ? <Users size={13} /> : <Trophy size={13} />}
              {t === 'members' ? `Members (${approved.length})` : t === 'tournaments' ? 'Tournaments' : 'Structures'}
            </button>
          ))}
        </div>

        {/* Members tab */}
        {detailTab === 'members' && (
          <div className="space-y-3">
            {pending.length > 0 && group.isadmin && (
              <div>
                <p className="eyebrow mb-2">Pending Approval</p>
                <div className="space-y-1">
                  {pending.map(m => (
                    <div key={m.userid} className="flex items-center justify-between py-2 px-3 rounded-lg bg-pit-bg border border-pit-border">
                      <span className="text-sm">{m.displayname ?? m.emailaddress}</span>
                      <button className="btn-primary text-xs px-3 py-1"
                        onClick={() => approveMutation.mutate(m.userid)}>Approve</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              {approved.map(m => (
                <div key={m.userid} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-pit-bg/60 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-pit-surface border border-pit-border flex items-center justify-center text-[10px] font-bold text-pit-muted">
                      {(m.displayname ?? m.emailaddress).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm text-white">{m.displayname ?? m.emailaddress}</span>
                      {m.isadmin && (
                        <span className="ml-2 badge bg-pit-gold/10 border border-pit-gold/20 text-pit-gold text-[10px]">
                          <Crown size={8} className="mr-0.5" /> Admin
                        </span>
                      )}
                    </div>
                  </div>
                  {group.isadmin && !m.isadmin && (
                    <button className="text-xs text-pit-muted hover:text-red-400 transition-colors px-2 py-1"
                      onClick={() => removeMutation.mutate(m.userid)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tournaments tab */}
        {detailTab === 'tournaments' && (
          <div>
            {loadingTourneys
              ? <LoadingSpinner className="py-8" />
              : groupTournaments.length === 0
                ? (
                  <div className="flex flex-col items-center py-10 gap-3 text-center">
                    <Trophy size={28} className="text-pit-muted" />
                    <p className="text-pit-muted text-sm">No tournaments for this group yet.</p>
                  </div>
                )
                : (
                  <div className="space-y-2">
                    {groupTournaments.map((t: Tournament & { isregistered: boolean }) => (
                      <div key={t.tournamentid}
                        className="flex items-center justify-between p-3 rounded-xl bg-pit-bg border border-pit-border gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                          <p className="text-xs text-pit-muted mt-0.5">
                            {t.tourneydate ?? 'No date'} · {t.playercount ?? 0} players
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.isregistered
                            ? <span className="chip text-pit-teal border-pit-teal/30">Registered</span>
                            : <button className="btn-primary text-xs px-2.5 py-1"
                                onClick={() => registerMutation.mutate(t.tournamentid)}
                                disabled={registerMutation.isPending}>
                                Register
                              </button>
                          }
                          <button
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-pit-muted hover:text-white hover:bg-pit-surface transition-all"
                            onClick={() => { onClose(); navigate(`/tournament/${t.tournamentid}`); }}>
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
            }
          </div>
        )}

        {detailTab === 'structures' && (
          <div>
            {loadingStructures
              ? <LoadingSpinner className="py-8" />
              : savedStructures.length === 0
                ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Trophy size={28} className="text-pit-muted" />
                    <div>
                      <p className="text-sm font-semibold text-white">No saved structures yet</p>
                      <p className="mt-1 text-xs text-pit-muted">Save one from a tournament's Blind Structure tab.</p>
                    </div>
                  </div>
                )
                : (
                  <div className="space-y-2">
                    {savedStructures.map((structure) => (
                      <div key={structure.id} className="flex items-center justify-between gap-3 rounded-xl border border-pit-border bg-pit-bg p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{structure.name}</p>
                          <p className="mt-0.5 text-xs text-pit-muted">{structure.levels.length} levels</p>
                        </div>
                        {group.isadmin && (
                          <button
                            className="btn-ghost px-2 py-1.5 text-xs text-red-300"
                            onClick={() => deleteStructureMutation.mutate(structure.id)}
                            disabled={deleteStructureMutation.isPending}
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
          </div>
        )}
      </div>
    </Modal>
  );
}
