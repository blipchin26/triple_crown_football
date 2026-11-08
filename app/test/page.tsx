import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'

async function SeasonsData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
  const { data, error } = await supabase.from('seasons').select('*')
  return <pre>{JSON.stringify({ data, error }, null, 2)}</pre>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SeasonsData />
    </Suspense>
  )
}