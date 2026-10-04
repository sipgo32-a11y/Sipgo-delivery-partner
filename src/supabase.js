import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tmvmvpxyqkcduewzjkkb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_q4ApvHNr28EnPcgeyTnvYA_Rcuyd_iu'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)
