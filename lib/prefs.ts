// Small helpers shared by the settings page and anything that shows a time.
// The time zone preference is mirrored into localStorage by PrefsApplier so plain functions can read it.

export const TEAMS = [
  '49ers', 'Bears', 'Bengals', 'Bills', 'Broncos', 'Browns', 'Buccaneers', 'Cardinals', 'Chargers',
  'Chiefs', 'Colts', 'Commanders', 'Cowboys', 'Dolphins', 'Eagles', 'Falcons', 'Giants', 'Jaguars',
  'Jets', 'Lions', 'Packers', 'Panthers', 'Patriots', 'Raiders', 'Rams', 'Ravens', 'Saints',
  'Seahawks', 'Steelers', 'Texans', 'Titans', 'Vikings',
]

export const TIME_ZONES = [
  { value: '', label: 'Automatic (this device)' },
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Central Europe' },
]

export function userTimeZone(): string | undefined {
  try { return localStorage.getItem('tc_tz') || undefined } catch { return undefined }
}

// Use this anywhere a kickoff time is shown, e.g. in the week page's fmt():
//   return fmtKickoff(iso)
export function fmtKickoff(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: userTimeZone(), timeZoneName: 'short',
  })
}