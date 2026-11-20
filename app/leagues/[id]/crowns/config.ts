
// What each crown page shows, in tiebreak order. Keys match the columns league_crown_details returns.

export type CrownRow = {
  user_id: string; username: string
  correct: number; total: number; weekly_wins: number; upset_points: number
  best_week: number; second_week: number; third_week: number; longest_streak: number
  hist: number[]; first_places: number; second_places: number; third_places: number; fourth_places: number
  best_bet: number | null; underdog_hits: number; avg_prob: number | null
  rank_correct: number; rank_weekly: number; rank_upset: number
  tie_correct: boolean; tie_weekly: boolean; tie_upset: boolean
  avg_place: number; firsts: number; best_place: number; rank_overall: number; tie_overall: boolean
  survival_points: number
  survival_correct: number
  survival_incorrect: number
  survival_missed: number
  survival_streak: number
  survival_hardest_prob: number | null
  survival_hardest_team: string | null
  survival_recent_correct_at: string | null
  rank_survival: number
  tie_survival: boolean
}

export type Metric = {
  label: string
  help: string
  get: (r: CrownRow) => number
  fmt: (r: CrownRow) => string
  low?: boolean
  crownKey?: string
}

export type CrownPage = {
  slug: string
  nav: string
  title: string
  blurb: string
  rankKey: keyof CrownRow
  tieKey: keyof CrownRow
  main: Metric
  breakers: Metric[]
  extras?: Metric[]
  lastResort: string
}

const pct = (v: number | null) => (v === null || v > 1 ? '-' : `${Math.round(v * 100)}%`)
const n = (v: number) => String(v)
const ord = (k: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = k % 100
  return k + (s[(v - 20) % 10] || s[v] || s[0])
}

export const CROWN_PAGES: CrownPage[] = [
  {
    slug: 'most-wins', nav: 'Most Wins', title: 'Most Correct',
    blurb: 'Who has picked the most winners this season.',
    rankKey: 'rank_correct', tieKey: 'tie_correct',
    main: {
      label: 'Correct picks', get: (r) => r.correct, fmt: (r) => n(r.correct),
      help: 'Total games you picked correctly this season. A game you did not pick counts as a loss.',
    },
    breakers: [
      {
        label: 'Best week', get: (r) => r.best_week, fmt: (r) => n(r.best_week),
        help: 'Your highest number of correct picks in a single week. Only weeks where every game is final count.',
      },
      {
        label: '2nd-best week', get: (r) => r.second_week, fmt: (r) => n(r.second_week),
        help: 'Your second-highest weekly total. Used when best weeks are equal.',
      },
      {
        label: '3rd-best week', get: (r) => r.third_week, fmt: (r) => n(r.third_week),
        help: 'Your third-highest weekly total. Used when the first two are equal.',
      },
      {
        label: 'Longest streak', get: (r) => r.longest_streak, fmt: (r) => n(r.longest_streak),
        help: 'Most correct picks in a row. Games are ordered by kickoff time, then alphabetically by matchup. A game you did not pick breaks the streak.',
      },
    ],
    lastResort: 'If everything above is equal, a logged coin flip at the end of the season.',
  },
  {
    slug: 'weekly-wins', nav: 'Weekly Wins', title: 'Weekly Wins',
    blurb: 'Who has won the most weeks. Ties in a week share the win.',
    rankKey: 'rank_weekly', tieKey: 'tie_weekly',
    main: {
      label: 'Weeks won', get: (r) => r.first_places, fmt: (r) => n(r.first_places),
      help: 'Weeks where you had the most correct picks in the league. If several players tie for the best score, they each get the win. Only weeks where every game is final count.',
    },
    breakers: [
      {
        label: '2nd-place weeks', get: (r) => r.second_places, fmt: (r) => n(r.second_places),
        help: 'Weeks you finished second. Used when weeks won are equal.',
      },
      {
        label: '3rd-place weeks', get: (r) => r.third_places, fmt: (r) => n(r.third_places),
        help: 'Weeks you finished third. Used when the above are equal.',
      },
      {
        label: '4th-place weeks', get: (r) => r.fourth_places, fmt: (r) => n(r.fourth_places),
        help: 'Weeks you finished fourth. If players are still level, the comparison keeps going down through 5th, 6th and so on.',
      },
    ],
    lastResort: 'If every weekly finish is identical, a logged coin flip at the end of the season.',
  },
  {
    slug: 'upset-points', nav: 'Upset Points', title: 'Upset Points',
    blurb: 'Who has been rewarded most for backing the underdog.',
    rankKey: 'rank_upset', tieKey: 'tie_upset',
    main: {
      label: 'Upset points', get: (r) => r.upset_points, fmt: (r) => n(r.upset_points),
      help: 'Every correct pick earns points, and the less likely the team was to win, the more it pays. Favorites pay about 10 to 13 points, longshots much more. Wrong or skipped picks earn nothing.',
    },
    breakers: [
      {
        label: 'Best bet', low: true, get: (r) => r.best_bet ?? 2, fmt: (r) => pct(r.best_bet),
        help: 'The least likely team you picked correctly. Lower is better: a correct 8% longshot beats a correct 30% pick.',
      },
      {
        label: 'Correct underdogs', get: (r) => r.underdog_hits, fmt: (r) => n(r.underdog_hits),
        help: 'How many correct picks were on a team with under a 50% chance to win. Rewards hitting upsets repeatedly, not just once.',
      },
      {
        label: 'Average odds', low: true, get: (r) => r.avg_prob ?? 1, fmt: (r) => pct(r.avg_prob),
        help: 'The average win chance of every team you picked, right or wrong. Lower means bolder picks, so lower wins. A game you skipped counts as 100%.',
      },
    ],
    lastResort: 'If everything above is equal, a logged coin flip at the end of the season.',
  },
  {
    slug: 'survival', nav: 'Survival', title: 'Survival',
    blurb: 'Who has survived the most weeks by correctly picking one team each week.',
    rankKey: 'rank_survival', tieKey: 'tie_survival',
    main: {
      label: 'Survival points',
      get: (r) => r.survival_points,
      fmt: (r) => n(r.survival_points),
      help: 'You earn 1 point for a correct survival pick and lose 1 point for an incorrect or missed week.',
    },
    breakers: [
      {
        label: 'Consecutive correct',
        get: (r) => r.survival_streak,
        fmt: (r) => n(r.survival_streak),
        help: 'Your current streak of consecutive correct survival picks. An incorrect or missed week resets the streak.',
      },
      {
        label: 'Hardest correct pick',
        low: true,
        get: (r) => r.survival_hardest_prob ?? 2,
        fmt: (r) => r.survival_hardest_team
          ? `${r.survival_hardest_team} (${pct(r.survival_hardest_prob)})`
          : '-',
        help: 'Your most unlikely successful survival pick. Lower pregame win probability is better.',
      },
      {
        label: 'Most recent correct',
        get: (r) => r.survival_recent_correct_at
          ? new Date(r.survival_recent_correct_at).getTime()
          : 0,
        fmt: (r) => r.survival_recent_correct_at
          ? new Date(r.survival_recent_correct_at).toLocaleDateString()
          : '-',
        help: 'If all previous tiebreakers are equal, the player with the more recent correct survival pick wins.',
      },
    ],
    lastResort: 'If everything above is equal, a logged coin flip at the end of the season.',
  },
  {
    slug: 'ultimate', nav: 'Ultimate', title: 'Ultimate Winner',
    blurb: 'The overall winner, by average placement across the three crowns selected for this league.',
    rankKey: 'rank_overall', tieKey: 'tie_overall',
    main: {
      label: 'Average placement', low: true, get: (r) => r.avg_place, fmt: (r) => r.avg_place.toFixed(2),
      help: 'Your place in the three crowns selected for this league, added together and divided by three. Lower is better.',
    },
    breakers: [
      {
        label: '1st-place crowns', get: (r) => r.firsts, fmt: (r) => n(r.firsts),
        help: 'How many of the selected crowns you currently lead.',
      },
      {
        label: 'Best single place', low: true, get: (r) => r.best_place, fmt: (r) => ord(r.best_place),
        help: 'Your best finish in any one selected crown. Lower is better.',
      },
    ],
    extras: [
      {
        crownKey: 'most_correct',
        label: 'Most Correct', low: true, get: (r) => r.rank_correct,
        fmt: (r) => `${r.tie_correct ? 'T-' : ''}${ord(r.rank_correct)}`,
        help: 'Your place in Most Correct.',
      },
      {
        crownKey: 'weekly_wins',
        label: 'Weekly Wins', low: true, get: (r) => r.rank_weekly,
        fmt: (r) => `${r.tie_weekly ? 'T-' : ''}${ord(r.rank_weekly)}`,
        help: 'Your place in Weekly Wins.',
      },
      {
        crownKey: 'upset_points',
        label: 'Upset Points', low: true, get: (r) => r.rank_upset,
        fmt: (r) => `${r.tie_upset ? 'T-' : ''}${ord(r.rank_upset)}`,
        help: 'Your place in Upset Points.',
      },
      {
        crownKey: 'survival',
        label: 'Survival', low: true, get: (r) => r.rank_survival,
        fmt: (r) => `${r.tie_survival ? 'T-' : ''}${ord(r.rank_survival)}`,
        help: 'Your place in Survival.',
      },
    ],
    lastResort: 'If everything above is equal, a logged coin flip at the end of the season.',
  },
]

export const CROWN_SLUG = {
  correct: 'most-wins',
  weekly_wins: 'weekly-wins',
  upset_points: 'upset-points',
  survival: 'survival',
} as const

export const ULTIMATE_SLUG = 'ultimate'
