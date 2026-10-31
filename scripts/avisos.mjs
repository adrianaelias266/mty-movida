// Avisos por correo a quienes mandan eventos desde «Agrega tu evento».
// Cada hora revisa las solicitudes y manda (desde hola@mtymovida.com, con Resend):
//   · al recibirla: «Recibimos tu evento»
//   · al aprobarla: «Tu evento ya está en Mty Movida»
//   · al rechazarla: un aviso amable
// Para no repetir, guarda en datos.avisado el último estado que ya se avisó.
const SB_URL = process.env.SUPABASE_URL || 'https://aqakoihxgwxdyrtzjrfh.supabase.co';
const SB_KEY = process.env.SUPABASE_SECRET || '';
const RESEND = process.env.RESEND_KEY || '';
const SOLO_MARCAR = process.env.SOLO_MARCAR === 'true';   // primera vez: marcar las viejas sin mandar correos
const DE = 'Mty Movida <hola@mtymovida.com>', SITIO = 'https://mtymovida.com';
if (!SB_KEY) { console.log('::warning::Falta SUPABASE_SECRET'); process.exit(0); }
if (!RESEND && !SOLO_MARCAR) { console.log('::warning::Falta RESEND_KEY: no se mandan avisos'); process.exit(0); }

const h = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' };
const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados?select=id,datos,estado,fuente&or=(fuente.is.null,fuente.eq.Organizador)&limit=1000`, { headers: h });
if (!r.ok) { console.log(`::error::Supabase respondió ${r.status}: ${await r.text()}`); process.exit(1); }
const filas = await r.json();
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = d => { const m = String(d.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} de ${MES[+m[2] - 1]} de ${m[1]}${d.hora ? ', ' + d.hora : ''}` : ''; };
function correo(estado, d) {
  const nombre = esc(d.nombre || 'tu evento');
  const datos = `<p style="margin:16px 0;padding:14px 16px;background:#F7F3F2;border-radius:12px"><b>${nombre}</b><br>${esc(fecha(d))}${d.lugar ? '<br>' + esc(d.lugar) : ''}</p>`;
  const marco = cuerpo => `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1E1714">
    <img src="${SITIO}/img/icono-192.png" alt="Mty Movida" width="56" height="56" style="border-radius:50%;display:block;margin-bottom:12px">
    ${cuerpo}<p style="font-size:13px;color:#6B605B;margin-top:24px">Adriana y Scarlet · <a href="${SITIO}" style="color:#BF4718">Mty Movida</a></p></div>`;
  if (estado === 'aprobado') return { asunto: `¡${d.nombre || 'Tu evento'} ya está en Mty Movida!`, html: marco(`<h2 style="color:#BF4718;margin:0 0 8px">¡Tu evento ya está publicado!</h2>
    <p>Hola${d.organizador ? ' ' + esc(d.organizador) : ''}, gracias por compartirlo con la comunidad regia. Ya aparece en la agenda de Mty Movida:</p>${datos}
    <p style="margin:24px 0"><a href="${SITIO}/eventos" style="background:#BF4718;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Verlo en Mty Movida</a></p>
    <p>Compártelo con tu público para que más gente se entere. Si necesitas corregir algo, responde a este correo.</p>`) };
  if (estado === 'rechazado') return { asunto: `Sobre tu evento «${d.nombre || ''}» en Mty Movida`, html: marco(`<h2 style="color:#BF4718;margin:0 0 8px">Gracias por escribirnos</h2>
    <p>Hola${d.organizador ? ' ' + esc(d.organizador) : ''}, revisamos tu evento y por ahora no lo pudimos publicar en la agenda:</p>${datos}
    <p>Puede ser porque le faltan datos, porque no es en la zona metropolitana de Monterrey o porque no encaja con la agenda cultural. Si quieres que lo revisemos de nuevo, responde a este correo con más información.</p>`) };
  return { asunto: `Recibimos tu evento «${d.nombre || ''}»`, html: marco(`<h2 style="color:#BF4718;margin:0 0 8px">¡Recibimos tu evento!</h2>
    <p>Hola${d.organizador ? ' ' + esc(d.organizador) : ''}, gracias por mandarlo a Mty Movida. Lo vamos a revisar y te avisaremos por este medio cuando esté publicado.</p>${datos}`) };
}
let enviados = 0, marcados = 0, fallas = 0;
for (const f of filas) {
  const d = f.datos || {}, estado = f.estado;
  if (!['pendiente', 'aprobado', 'rechazado'].includes(estado) || d.avisado === estado) continue;
  if (!SOLO_MARCAR && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo || '')) {
    const c = correo(estado, d);
    const s = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: DE, to: [d.correo], reply_to: 'hola@mtymovida.com', subject: c.asunto, html: c.html }) });
    if (!s.ok) { fallas++; console.log(`::warning::No se pudo mandar a ${d.correo}: ${s.status} ${(await s.text()).slice(0, 200)}`); continue; }
    enviados++;
    await new Promise(r => setTimeout(r, 600));   // Resend permite pocos envíos por segundo
  }
  const p = await fetch(`${SB_URL}/rest/v1/eventos_enviados?id=eq.${f.id}`, { method: 'PATCH', headers: { ...h, prefer: 'return=minimal' }, body: JSON.stringify({ datos: { ...d, avisado: estado } }) });
  if (p.ok) marcados++; else console.log(`::warning::No se pudo marcar la solicitud ${f.id}: ${p.status}`);
}
console.log(`::notice::Avisos: ${filas.length} solicitudes revisadas · ${enviados} correos enviados · ${marcados} marcadas${fallas ? ' · ' + fallas + ' fallas' : ''}${SOLO_MARCAR ? ' (solo marcar, sin enviar)' : ''}`);
