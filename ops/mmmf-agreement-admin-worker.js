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
  const allowed = (env.ALLOWED_ORIGIN || "").trim();
  return {
    "Access-Control-Allow-Origin": allowed || origin || "*",
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

      if (action === "registration_submit") {
        const registrations = await readRegistrations(env);
        const name = String(payload.name || "").trim();
        const email = String(payload.email || "").trim();
        const phone = String(payload.phone || "").trim();
        const submittedAt = String(payload.timestamp || new Date().toISOString());
        const registrationId = crypto.randomUUID();

        registrations.unshift({
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
        });

        await writeRegistrations(env, registrations);

        return json(
          {
            ok: true,
            registration_id: registrationId
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

      return json({ ok: false, error: "Unknown action." }, 400, headers);
    } catch (error) {
      return json({ ok: false, error: error.message || "Worker request failed." }, 500, headers);
    }
  }
};
