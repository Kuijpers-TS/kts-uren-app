// Supabase Edge Function: send-weekstaat
// Verstuurt weekstaat PDF via Resend naar uren@kuijpers-ts.nl

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      to,
      subject,
      userName,
      projectCode,
      projectName,
      weekLabel,
      totalHours,
      totalKm,
      hotelNachten,
      weekstaat,      // base64 PDF
      ureFilename,
    } = await req.json()

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#07567F;margin-bottom:20px">Weekstaat ontvangen</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f8fafc;width:140px">ZZP'er</td><td style="padding:8px 12px;border:1px solid #ddd">${userName}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f8fafc">Project</td><td style="padding:8px 12px;border:1px solid #ddd">${projectCode} — ${projectName}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f8fafc">Periode</td><td style="padding:8px 12px;border:1px solid #ddd">${weekLabel}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f8fafc">Uren</td><td style="padding:8px 12px;border:1px solid #ddd">${totalHours}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f8fafc">Kilometers</td><td style="padding:8px 12px;border:1px solid #ddd">${totalKm}</td></tr>
          ${hotelNachten > 0 ? `<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f8fafc">Hotelnachten</td><td style="padding:8px 12px;border:1px solid #ddd">${hotelNachten}</td></tr>` : ''}
        </table>
        <p style="margin-top:16px;color:#555">📄 De weekstaat PDF zit als bijlage bij deze mail.</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
        <p style="font-size:11px;color:#999">Automatisch verstuurd vanuit KTS Uren App</p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'KTS Uren App <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: html,
        attachments: [
          {
            filename: ureFilename,
            content: weekstaat,
          },
        ],
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Resend error:', result)
      return new Response(JSON.stringify({ error: result }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
