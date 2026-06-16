// Supabase Edge Function: send-slip-email
// Sends a single expense slip by email using the Resend API.
// Deploy with: supabase functions deploy send-slip-email
// Set secrets with: supabase secrets set RESEND_API_KEY=re_xxx SLIPSCAN_FROM_EMAIL="SlipScan <onboarding@resend.dev>"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('re_RaztaU6U_N2oXbuaP3mFQCer1BVGwnwgg')
const FROM_EMAIL = Deno.env.get('SLIPSCAN_FROM_EMAIL') || 'SlipScan <onboarding@resend.dev>'
const SUPABASE_URL = Deno.env.get('https://tjevwfmwscscyesbuqhy.supabase.co')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqZXZ3Zm13c2NzY3llc2J1cWh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU0MzkyNCwiZXhwIjoyMDk3MTE5OTI0fQ.NynnuycDbvTIzwdB5cG7Tt3fVyEFeLqbgJmUCQyFXcM')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function buildEmailHtml(e, catName) {
  const dateStr = e.date
    ? new Date(e.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
    <h2 style="font-size:18px;margin-bottom:4px;">Expense Slip</h2>
    <p style="color:#6b7280;font-size:12px;margin-top:0;">Generated ${new Date().toLocaleDateString('en-ZA')}</p>
    ${e.image_url ? `<img src="${e.image_url}" style="width:100%;max-width:480px;border-radius:8px;border:1px solid #eee;margin:12px 0;" />` : ''}
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Merchant</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(e.merchant || '—')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="padding:6px 0;font-weight:700;color:#0F6E56;">R ${Number(e.amount||0).toFixed(2)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;">${dateStr}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Campus</td><td style="padding:6px 0;">${escapeHtml(e.campus || '—')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Submitted by</td><td style="padding:6px 0;">${escapeHtml(e.submitted_by || '—')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Category</td><td style="padding:6px 0;">${escapeHtml(catName || 'Uncategorised')}</td></tr>
      ${e.notes ? `<tr><td style="padding:6px 0;color:#6b7280;">Notes</td><td style="padding:6px 0;">${escapeHtml(e.notes)}</td></tr>` : ''}
    </table>
    ${e.pdf_url ? `<p style="margin-top:16px;"><a href="${e.pdf_url}" style="color:#0F6E56;">View attached PDF slip →</a></p>` : ''}
  </div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')

    const { expenseId, to } = await req.json()
    if (!expenseId) throw new Error('Missing expenseId')
    if (!to) throw new Error('Missing recipient email address')

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: expense, error } = await sb
      .from('expenses')
      .select('*, categories(id,name)')
      .eq('id', expenseId)
      .single()

    if (error) throw error
    if (!expense) throw new Error('Expense not found')

    const catName = expense.categories?.name
    const html = buildEmailHtml(expense, catName)

    const attachments = []
    if (expense.image_url) {
      attachments.push({
        filename: `slip-${expense.id}.jpg`,
        path: expense.image_url,
      })
    }
    if (expense.pdf_url) {
      attachments.push({
        filename: `slip-${expense.id}.pdf`,
        path: expense.pdf_url,
      })
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `Expense Slip — ${expense.merchant || 'Unknown'} — R ${Number(expense.amount||0).toFixed(2)}`,
        html,
        attachments: attachments.length ? attachments : undefined,
      }),
    })

    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      throw new Error(resendData?.message || 'Resend API error')
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
