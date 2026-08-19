import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://dwbldhlbnrvdlfxodkju.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xyEyTmKzOjH_waeHNucCiQ__GTghIVJ'

export const supabase = createClient(url, key)
