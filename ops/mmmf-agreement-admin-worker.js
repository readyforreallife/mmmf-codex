const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    "https://readyforreal.life",
    "https://readyforreallife.github.io"
  ];
  const allowedOrigins = new Set([...defaults, ...configured]);
  const allowed = allowedOrigins.has(origin)
    ? origin
    : (configured[0] || defaults[0]);
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function normalizeAgreementNumber(value) {
  const trimmed = String(value || "").trim().toUpperCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("MMMF-")) return trimmed;
  return "MMMF-" + trimmed.replace(/^MMMF-?/i, "");
}

function agreementNumberDigits(value) {
  const match = String(value || "").match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatAgreementNumber(number) {
  return `MMMF-${String(number).padStart(4, "0")}`;
}

function nextAgreementNumber(entries) {
  const highest = entries.reduce(
    (max, entry) => Math.max(max, agreementNumberDigits(entry.agreementNumber)),
    0
  );
  return formatAgreementNumber(Math.max(highest + 1, 1));
}

async function readRegistry(env) {
  const raw = await env.AGREEMENT_REGISTRY.get("entries");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(env, entries) {
  await env.AGREEMENT_REGISTRY.put("entries", JSON.stringify(entries, null, 2));
}

async function createSession(env) {
  const token = crypto.randomUUID();
  await env.AGREEMENT_REGISTRY.put(`session:${token}`, JSON.stringify({ issuedAt: new Date().toISOString() }), {
    expirationTtl: 60 * 60 * 6
  });
  return token;
}

async function requireSession(env, token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    throw new Error("Missing admin session.");
  }
  const session = await env.AGREEMENT_REGISTRY.get(`session:${trimmed}`);
  if (!session) {
    throw new Error("Your admin session expired. Sign in again.");
  }
  await env.AGREEMENT_REGISTRY.put(`session:${trimmed}`, session, {
    expirationTtl: 60 * 60 * 6
  });
}

function buildRegistryResponse(entries) {
  return {
    ok: true,
    entries,
    next_number: nextAgreementNumber(entries),
    summary: {
      total_issued: entries.length,
      total_signed: entries.filter((entry) => entry.status === "Signed").length,
      total_pending: entries.filter((entry) => entry.status === "Pending signature").length,
      highest_number: String(
        entries.reduce((max, entry) => Math.max(max, agreementNumberDigits(entry.agreementNumber)), 0)
      ).padStart(4, "0")
    }
  };
}

async function readRegistrations(env) {
  const raw = await env.AGREEMENT_REGISTRY.get("registrations");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistrations(env, entries) {
  await env.AGREEMENT_REGISTRY.put("registrations", JSON.stringify(entries, null, 2));
}

function buildRegistrationResponse(entries) {
  return {
    ok: true,
    entries,
    summary: {
      total_registrations: entries.length,
      newest_at: entries.length ? entries[0].submittedAt : "",
      newest_name: entries.length ? entries[0].name : ""
    }
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseDetails(detailsJson) {
  try {
    const parsed = JSON.parse(String(detailsJson || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveEmailLogoUrl(env) {
  const fallbackUrl = "https://raw.githubusercontent.com/readyforreallife/readyforreal.life/main/assets/mmmf-email-avatar.png";
  const configured = String(env.EMAIL_LOGO_URL || "").trim();
  if (!configured) return fallbackUrl;

  const legacyLogos = [
    "https://readyforreal.life/assets/logo-square.png",
    "https://readyforreal.life/assets/app-icon.png",
    "https://readyforreal.life/assets/mmmf-site-mark.svg",
    "https://readyforreal.life/assets/mmmf-email-avatar.png",
    "https://readyforreal.life/assets/mmmf-sender-icon.png",
    "https://readyforreal.life/assets/icons/icon-192-v2.png"
  ];

  return legacyLogos.includes(configured) ? fallbackUrl : configured;
}

function resolveFounderPhotoUrls() {
  return {
    michael: "https://readyforreal.life/docs/michael-terry-headshot.jpg",
    mekenzi: "https://readyforreal.life/docs/mekenzi-terry-headshot.png"
  };
}

async function sendRegistrationConfirmation(env, record) {
  if (!record.email) {
    return { configured: false, sent: false, reason: "No recipient email provided." };
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return { configured: false, sent: false, reason: "Email service is not configured yet." };
  }

  const details = parseDetails(record.detailsJson);
  const logoUrl = resolveEmailLogoUrl(env);
  const founderPhotos = resolveFounderPhotoUrls();
  const replyTo = String(env.RESEND_REPLY_TO || "readyforreal.life44@gmail.com").trim();
  const fromName = String(env.RESEND_FROM_NAME || "Modern Manners & Mental Fortitude").trim();
  const trackLine = details.tracks || record.role || "Track to be confirmed";
  const organizationLine = details.organization || record.organization || "Independent Registration";
  const locationLine = details.location || "Location to be confirmed";
  const subject = "Your MMMF registration was received";

  const html = `
    <div style="margin:0;padding:0;background:#f7f2e9;font-family:Arial,sans-serif;color:#1e293b;">
      <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #d9cfbd;border-radius:20px;overflow:hidden;">
          <div style="background:#18304f;padding:28px 28px 20px;border-bottom:4px solid #c89b3c;text-align:center;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto 18px;max-width:420px;">
              <tr>
                <td align="center" valign="middle" style="width:116px;padding-right:10px;">
                  <img src="${escapeHtml(founderPhotos.michael)}" alt="Michael Terry" style="width:84px;height:84px;display:block;margin:0 auto;border-radius:999px;border:3px solid #c89b3c;object-fit:cover;">
                </td>
                <td align="center" valign="middle" style="width:188px;">
                  <img src="${escapeHtml(logoUrl)}" alt="Modern Manners & Mental Fortitude" style="width:116px;height:116px;display:block;margin:0 auto;border-radius:24px;">
                </td>
                <td align="center" valign="middle" style="width:116px;padding-left:10px;">
                  <img src="${escapeHtml(founderPhotos.mekenzi)}" alt="Mekenzi Terry" style="width:84px;height:84px;display:block;margin:0 auto;border-radius:999px;border:3px solid #c89b3c;object-fit:cover;">
                </td>
              </tr>
            </table>
            <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8c778;font-weight:700;">Registration Confirmation</div>
            <h1 style="margin:10px 0 0;color:#ffffff;font-size:32px;line-height:1.2;">Modern Manners & Mental Fortitude</h1>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 16px;font-size:17px;line-height:1.7;">Hi ${escapeHtml(record.name || "there")},</p>
            <p style="margin:0 0 8px;font-size:16px;line-height:1.7;">We&rsquo;re glad you&rsquo;re here. We received your registration for <strong>Modern Manners &amp; Mental Fortitude</strong> and are excited to connect with you.</p>
            <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">&mdash; Mike &amp; Mekenzi</p>
            <div style="background:#fbfaf7;border:1px solid #d9cfbd;border-radius:16px;padding:18px 18px 8px;margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:12px;">Registration Summary</div>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Name:</strong> ${escapeHtml(record.name || "—")}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Email:</strong> ${escapeHtml(record.email || "—")}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Organization:</strong> ${escapeHtml(organizationLine)}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Program / Track:</strong> ${escapeHtml(trackLine)}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Location:</strong> ${escapeHtml(locationLine)}</p>
            </div>
            <div style="margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:12px;">What You Signed Up For</div>
              <p style="margin:0 0 10px;font-size:15px;line-height:1.7;">You registered interest in the MMMF program and its training or implementation pathway. Depending on your role, this may lead to program enrollment, track placement, scheduling, support planning, or Teach the Teacher follow-up.</p>
            </div>
            <div style="margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:12px;">What Happens Next</div>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">We&rsquo;ll take a look at your registration and follow up with the next step that fits your goals. This could include training details, scheduling options, onboarding information, or program placement.</p>
              <p style="margin:0;font-size:15px;line-height:1.7;">If we need anything else from you, we&rsquo;ll reach out using the contact information you provided.</p>
            </div>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">If you have any questions in the meantime, feel free to reach out to us at <a href="mailto:readyforreal.life44@gmail.com" style="color:#18304f;font-weight:700;">readyforreal.life44@gmail.com</a>.</p>
            <p style="margin:0;font-size:15px;line-height:1.7;">We&rsquo;re looking forward to working with you.</p>
            <p style="margin:16px 0 0;font-size:14px;color:#64748b;line-height:1.7;">Mike Terry &amp; Mekenzi Terry<br>Founders · readyforreal.life</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hi ${record.name || "there"},`,
    "",
    "We’re glad you’re here. We received your registration for Modern Manners & Mental Fortitude and are excited to connect with you.",
    "",
    "— Mike & Mekenzi",
    "",
    "Registration summary:",
    `Name: ${record.name || "—"}`,
    `Email: ${record.email || "—"}`,
    `Organization: ${organizationLine}`,
    `Program / Track: ${trackLine}`,
    `Location: ${locationLine}`,
    "",
    "What You Signed Up For:",
    "You registered interest in the MMMF program and its training or implementation pathway. Depending on your role, this may lead to program enrollment, track placement, scheduling, support planning, or Teach the Teacher follow-up.",
    "",
    "What Happens Next:",
    "We’ll take a look at your registration and follow up with the next step that fits your goals. This could include training details, scheduling options, onboarding information, or program placement.",
    "",
    "If we need anything else from you, we’ll reach out using the contact information you provided.",
    "",
    "If you have any questions in the meantime, feel free to reach out to us at readyforreal.life44@gmail.com.",
    "",
    "We’re looking forward to working with you.",
    "",
    "Mike Terry & Mekenzi Terry",
    "Founders · readyforreal.life"
  ].join("\n");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `${fromName} <${env.RESEND_FROM_EMAIL}>`,
      to: [record.email],
      reply_to: replyTo,
      subject,
      html,
      text
    })
  });

  const raw = await resendResponse.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!resendResponse.ok) {
    return {
      configured: true,
      sent: false,
      reason: (parsed && (parsed.message || parsed.error)) || raw || "Email request failed."
    };
  }

  return {
    configured: true,
    sent: true,
    id: parsed && parsed.id ? parsed.id : ""
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed" }, 405, headers);
    }

    if (!env.AGREEMENT_REGISTRY) {
      return json(
        { ok: false, error: "KV binding AGREEMENT_REGISTRY is missing from this Worker." },
        500,
        headers
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON payload." }, 400, headers);
    }

    const action = String(payload.action || "").trim().toLowerCase();

    try {
      if (action === "admin_login") {
        if (!env.ADMIN_CODE) {
          return json({ ok: false, error: "ADMIN_CODE secret is missing from this Worker." }, 500, headers);
        }

        if (String(payload.access_code || "") !== String(env.ADMIN_CODE)) {
          return json({ ok: false, error: "Incorrect access code." }, 401, headers);
        }

        const sessionToken = await createSession(env);
        return json(
          {
            ok: true,
            session_token: sessionToken,
            expires_in_seconds: 60 * 60 * 6
          },
          200,
          headers
        );
      }

      if (action === "agreement_list") {
        await requireSession(env, payload.session_token);
        const entries = await readRegistry(env);
        return json(buildRegistryResponse(entries), 200, headers);
      }

      if (action === "certificate_get") {
        await requireSession(env, payload.session_token);
        const agreementNumber = normalizeAgreementNumber(payload.agreement_number || "");
        const entries = await readRegistry(env);
        const record = entries.find((entry) => entry.agreementNumber === agreementNumber);
        if (!record) {
          return json({ ok: false, error: "Certificate record not found." }, 404, headers);
        }
        return json({ ok: true, record }, 200, headers);
      }

      if (action === "agreement_issue") {
        await requireSession(env, payload.session_token);

        const fullName = String(payload.full_name || "").trim();
        if (!fullName) {
          return json({ ok: false, error: "Full name is required." }, 400, headers);
        }

        const entries = await readRegistry(env);
        const requestedNumber = normalizeAgreementNumber(payload.agreement_number || nextAgreementNumber(entries));
        const email = String(payload.email || "").trim();
        const organization = String(payload.organization || "").trim();
        const certificateType =
          String(payload.certificate_type || "completion").trim().toLowerCase() === "facilitator"
            ? "facilitator"
            : "completion";
        const track = String(payload.track || "").trim();
        const effectiveDate = String(payload.effective_date || "").trim();
        const status = String(payload.status || "Issued").trim();
        const notes = String(payload.notes || "").trim();

        const duplicateNumber = entries.find((entry) => entry.agreementNumber === requestedNumber);
        if (duplicateNumber) {
          return json(
            {
              ok: false,
              error: `Agreement number ${requestedNumber} has already been assigned to ${duplicateNumber.fullName}.`,
              conflict_type: "agreement_number"
            },
            409,
            headers
          );
        }

        const duplicatePerson = entries.find((entry) => {
          const sameName = String(entry.fullName || "").toLowerCase() === fullName.toLowerCase();
          const sameEmail = email && String(entry.email || "").toLowerCase() === email.toLowerCase();
          return sameName && sameEmail;
        });
        if (duplicatePerson) {
          return json(
            {
              ok: false,
              error: `${duplicatePerson.fullName} already has agreement number ${duplicatePerson.agreementNumber}.`,
              conflict_type: "person"
            },
            409,
            headers
          );
        }

        const record = {
          agreementNumber: requestedNumber,
          fullName,
          email,
          organization,
          certificateType,
          track,
          effectiveDate,
          status,
          notes,
          issuedAt: new Date().toISOString()
        };

        entries.push(record);
        await writeRegistry(env, entries);

        return json(
          {
            ok: true,
            record,
            entries,
            next_number: nextAgreementNumber(entries)
          },
          200,
          headers
        );
      }

      if (action === "agreement_delete") {
        await requireSession(env, payload.session_token);
        const agreementNumber = normalizeAgreementNumber(payload.agreement_number || "");
        if (!agreementNumber) {
          return json({ ok: false, error: "Agreement number is required." }, 400, headers);
        }
        const entries = await readRegistry(env);
        const nextEntries = entries.filter((entry) => entry.agreementNumber !== agreementNumber);
        if (nextEntries.length === entries.length) {
          return json({ ok: false, error: "Certificate record not found." }, 404, headers);
        }
        await writeRegistry(env, nextEntries);
        return json(buildRegistryResponse(nextEntries), 200, headers);
      }

      if (action === "registration_submit") {
        const registrations = await readRegistrations(env);
        const name = String(payload.name || "").trim();
        const email = String(payload.email || "").trim();
        const phone = String(payload.phone || "").trim();
        const submittedAt = String(payload.timestamp || new Date().toISOString());
        const registrationId = crypto.randomUUID();

        const record = {
          registrationId,
          name,
          email,
          phone,
          role: String(payload.group || "").trim(),
          organization: String(payload.organization || "").trim(),
          program: String(payload.program || "Modern Manners and Mental Fortitude").trim(),
          notes: String(payload.notes || "").trim(),
          detailsJson: String(payload.details_json || "").trim(),
          submittedAt,
          status: "New"
        };

        registrations.unshift(record);

        await writeRegistrations(env, registrations);
        const emailResult = await sendRegistrationConfirmation(env, record);

        return json(
          {
            ok: true,
            registration_id: registrationId,
            email_sent: !!emailResult.sent,
            email_service_configured: !!emailResult.configured,
            email_error: emailResult.sent ? "" : String(emailResult.reason || ""),
            email_id: String(emailResult.id || "")
          },
          200,
          headers
        );
      }

      if (action === "registration_list") {
        await requireSession(env, payload.session_token);
        const registrations = await readRegistrations(env);
        return json(buildRegistrationResponse(registrations), 200, headers);
      }

      if (action === "registration_delete") {
        await requireSession(env, payload.session_token);
        const registrationId = String(payload.registration_id || "").trim();
        if (!registrationId) {
          return json({ ok: false, error: "Registration ID is required." }, 400, headers);
        }
        const registrations = await readRegistrations(env);
        const nextRegistrations = registrations.filter((entry) => String(entry.registrationId || "") !== registrationId);
        if (nextRegistrations.length === registrations.length) {
          return json({ ok: false, error: "Registration record not found." }, 404, headers);
        }
        await writeRegistrations(env, nextRegistrations);
        return json(buildRegistrationResponse(nextRegistrations), 200, headers);
      }

      return json({ ok: false, error: "Unknown action." }, 400, headers);
    } catch (error) {
      return json({ ok: false, error: error.message || "Worker request failed." }, 500, headers);
    }
  }
};
